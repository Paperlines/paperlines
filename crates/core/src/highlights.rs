//! Highlights live on a PDF attachment. Rects are normalized to the displayed page: (0,0) top-left, (1,1) bottom-right.
use crate::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

pub const KINDS: &[&str] = &["highlight", "underline", "rect"];
/// Every highlight colour: the five the app starts with, then the ones a user can add
/// (Settings ▸ Notes; see `settings::EXTRA_HIGHLIGHT_COLORS`).
pub const COLORS: &[&str] = &[
    "yellow", "red", "green", "blue", "purple", "orange", "pink", "teal", "lime", "brown", "gray",
];

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Highlight {
    pub id: i64,
    pub item_id: i64,
    pub attachment_id: i64,
    /// 1-based page number.
    pub page: i64,
    pub kind: String,
    pub rects: Vec<Rect>,
    pub text: Option<String>,
    pub color: String,
    pub comment: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewHighlight {
    pub item_id: i64,
    pub page: i64,
    pub kind: String,
    pub rects: Vec<Rect>,
    pub text: Option<String>,
    pub color: String,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightPatch {
    pub color: Option<String>,
    /// Some("") clears the comment.
    pub comment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfAttachment {
    pub id: i64,
    pub hash: String,
    pub page_count: Option<i64>,
    pub filename: Option<String>,
}

pub fn pdf_attachment(conn: &Connection, item_id: i64) -> Result<Option<PdfAttachment>> {
    Ok(conn
        .query_row(
            "SELECT id, content_hash, page_count, filename FROM attachments WHERE item_id = ?1 AND kind = 'pdf' ORDER BY id LIMIT 1",
            [item_id],
            |r| Ok(PdfAttachment { id: r.get(0)?, hash: r.get(1)?, page_count: r.get(2)?, filename: r.get(3)? }),
        )
        .optional()?)
}

fn check_color(c: &str) -> Result<()> {
    if COLORS.contains(&c) {
        Ok(())
    } else {
        Err(Error::msg(format!("Unknown highlight color: {c}")))
    }
}

fn clean_rects(rects: &[Rect]) -> Result<Vec<Rect>> {
    let clamp = |v: f64| if v.is_finite() { v.clamp(0.0, 1.0) } else { 0.0 };
    let out: Vec<Rect> = rects
        .iter()
        .map(|r| {
            let (x, y) = (clamp(r.x), clamp(r.y));
            Rect {
                x,
                y,
                w: clamp(r.w).min(1.0 - x),
                h: clamp(r.h).min(1.0 - y),
            }
        })
        .filter(|r| r.w > 0.0 && r.h > 0.0)
        .collect();
    if out.is_empty() {
        return Err(Error::msg("A highlight needs at least one area"));
    }
    Ok(out)
}

fn row(r: &Row) -> rusqlite::Result<(Highlight, String)> {
    Ok((
        Highlight {
            id: r.get(0)?,
            item_id: r.get(1)?,
            attachment_id: r.get(2)?,
            page: r.get(3)?,
            kind: r.get(4)?,
            rects: Vec::new(),
            text: r.get(6)?,
            color: r.get(7)?,
            comment: r.get(8)?,
            created_at: r.get(9)?,
        },
        r.get(5)?,
    ))
}

const SELECT: &str =
    "SELECT h.id, a.item_id, h.attachment_id, h.page, h.kind, h.rects, h.text, h.color, h.comment, h.created_at
    FROM highlights h JOIN attachments a ON a.id = h.attachment_id";

fn finish((mut h, rects): (Highlight, String)) -> Result<Highlight> {
    h.rects = serde_json::from_str(&rects)?;
    Ok(h)
}

pub fn get(conn: &Connection, id: i64) -> Result<Highlight> {
    let r = conn
        .query_row(&format!("{SELECT} WHERE h.id = ?1"), [id], row)
        .optional()?;
    finish(r.ok_or_else(|| Error::msg("Highlight not found"))?)
}

pub fn create(conn: &Connection, h: &NewHighlight) -> Result<Highlight> {
    if !KINDS.contains(&h.kind.as_str()) {
        return Err(Error::msg(format!("Unknown highlight kind: {}", h.kind)));
    }
    check_color(&h.color)?;
    let att = pdf_attachment(conn, h.item_id)?.ok_or_else(|| Error::msg("This item has no PDF"))?;
    if h.page < 1 || att.page_count.is_some_and(|n| h.page > n) {
        return Err(Error::msg("Page out of range"));
    }
    let rects = serde_json::to_string(&clean_rects(&h.rects)?)?;
    let text = h
        .text
        .as_deref()
        .map(|t| t.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|t| !t.is_empty());
    let comment = h.comment.as_deref().map(str::trim).filter(|c| !c.is_empty());
    conn.execute(
        "INSERT INTO highlights(attachment_id, page, kind, rects, text, color, comment) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![att.id, h.page, h.kind, rects, text, h.color, comment],
    )?;
    get(conn, conn.last_insert_rowid())
}

/// A highlight known by its words, not yet by its place on the page: an assistant quotes a
/// passage (from the PDF's text) and the reader finds and places it the next time the PDF is
/// open (`place`). Until then it has no rects and shows in lists as "not placed yet".
pub fn create_pending(
    conn: &Connection,
    item_id: i64,
    page: i64,
    text: &str,
    color: &str,
    comment: Option<&str>,
) -> Result<Highlight> {
    check_color(color)?;
    let att = pdf_attachment(conn, item_id)?.ok_or_else(|| Error::msg("This paper has no PDF"))?;
    if page < 1 || att.page_count.is_some_and(|n| page > n) {
        return Err(Error::msg("Page out of range"));
    }
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.chars().count() < 3 {
        return Err(Error::msg("Quote the passage to highlight"));
    }
    let comment = comment.map(str::trim).filter(|c| !c.is_empty());
    conn.execute(
        "INSERT INTO highlights(attachment_id, page, kind, rects, text, color, comment) VALUES (?1, ?2, 'highlight', '[]', ?3, ?4, ?5)",
        params![att.id, page, text, color, comment],
    )?;
    get(conn, conn.last_insert_rowid())
}

/// Places a pending highlight where the reader found its words (the page may differ from the
/// one guessed).
pub fn place(conn: &Connection, id: i64, page: i64, rects: &[Rect]) -> Result<Highlight> {
    let rects = serde_json::to_string(&clean_rects(rects)?)?;
    if conn.execute(
        "UPDATE highlights SET page = ?2, rects = ?3 WHERE id = ?1",
        params![id, page, rects],
    )? == 0
    {
        return Err(Error::msg("Highlight not found"));
    }
    get(conn, id)
}

pub fn update(conn: &Connection, id: i64, p: &HighlightPatch) -> Result<Highlight> {
    if let Some(c) = &p.color {
        check_color(c)?;
        conn.execute("UPDATE highlights SET color = ?2 WHERE id = ?1", params![id, c])?;
    }
    if let Some(c) = &p.comment {
        let c = Some(c.trim()).filter(|c| !c.is_empty());
        conn.execute("UPDATE highlights SET comment = ?2 WHERE id = ?1", params![id, c])?;
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM highlights WHERE id = ?1", [id])?;
    Ok(())
}

/// All highlights of an item's PDFs in reading order (page, then top edge).
pub fn list_for_item(conn: &Connection, item_id: i64) -> Result<Vec<Highlight>> {
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE a.item_id = ?1"))?;
    let mut out = stmt
        .query_map([item_id], row)?
        .map(|r| finish(r?))
        .collect::<Result<Vec<_>>>()?;
    let top = |h: &Highlight| h.rects.iter().map(|r| r.y).fold(f64::MAX, f64::min);
    out.sort_by(|a, b| a.page.cmp(&b.page).then(top(a).total_cmp(&top(b))));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::attachments::{add_attachment, StoredFile};
    use crate::db::Db;
    use crate::items::insert_item;
    use crate::model::ItemInput;

    fn setup() -> (Db, i64) {
        let mut db = Db::open_in_memory().unwrap();
        let id = db
            .tx(|c| {
                let id = insert_item(
                    c,
                    &ItemInput {
                        title: "Paper".into(),
                        ..Default::default()
                    },
                )?;
                add_attachment(
                    c,
                    id,
                    &StoredFile {
                        hash: "abc".into(),
                        size: 1,
                        filename: "p.pdf".into(),
                    },
                    Some(10),
                )?;
                Ok(id)
            })
            .unwrap();
        (db, id)
    }

    fn hl(item_id: i64, page: i64, y: f64) -> NewHighlight {
        NewHighlight {
            item_id,
            page,
            kind: "highlight".into(),
            rects: vec![Rect {
                x: 0.1,
                y,
                w: 0.5,
                h: 0.02,
            }],
            text: Some("  self   attention ".into()),
            color: "yellow".into(),
            comment: None,
        }
    }

    #[test]
    fn create_list_update_delete() {
        let (mut db, item) = setup();
        let b = db.tx(|c| create(c, &hl(item, 2, 0.1))).unwrap();
        let a = db.tx(|c| create(c, &hl(item, 1, 0.5))).unwrap();
        assert_eq!(a.text.as_deref(), Some("self attention"));
        let order: Vec<i64> = list_for_item(&db.conn, item).unwrap().iter().map(|h| h.id).collect();
        assert_eq!(order, vec![a.id, b.id]);
        let u = db
            .tx(|c| {
                update(
                    c,
                    a.id,
                    &HighlightPatch {
                        color: Some("red".into()),
                        comment: Some("why?".into()),
                    },
                )
            })
            .unwrap();
        assert_eq!((u.color.as_str(), u.comment.as_deref()), ("red", Some("why?")));
        let u = db
            .tx(|c| {
                update(
                    c,
                    a.id,
                    &HighlightPatch {
                        comment: Some(" ".into()),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert_eq!(u.comment, None);
        db.tx(|c| delete(c, a.id)).unwrap();
        assert_eq!(list_for_item(&db.conn, item).unwrap().len(), 1);
    }

    #[test]
    fn validates_input_and_clamps_rects() {
        let (mut db, item) = setup();
        let mut bad = hl(item, 11, 0.1);
        assert!(db.tx(|c| create(c, &bad)).is_err(), "page beyond page_count");
        bad.page = 1;
        bad.color = "magenta".into();
        assert!(db.tx(|c| create(c, &bad)).is_err());
        bad.color = "green".into();
        bad.rects = vec![Rect {
            x: 0.9,
            y: -0.1,
            w: 0.5,
            h: 0.2,
        }];
        let h = db.tx(|c| create(c, &bad)).unwrap();
        assert!((h.rects[0].w - 0.1).abs() < 1e-9 && h.rects[0].y == 0.0);
        bad.rects = vec![Rect {
            x: 0.5,
            y: 0.5,
            w: 0.0,
            h: 0.1,
        }];
        assert!(db.tx(|c| create(c, &bad)).is_err());
    }

    #[test]
    fn highlight_text_is_searchable() {
        let (mut db, item) = setup();
        db.tx(|c| create(c, &hl(item, 1, 0.1))).unwrap();
        let n: i64 = db
            .conn
            .query_row(
                "SELECT count(*) FROM items_fts WHERE items_fts MATCH 'attention'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }
}
