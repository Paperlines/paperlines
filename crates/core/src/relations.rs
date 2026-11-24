//! Typed connections between papers: "A extends B", "A contradicts B", plus the user's own types.
//! They are separate from citation links: set by hand, with an optional note and a highlight as
//! evidence. Papers in the Trash keep theirs but they are not listed.
use crate::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

const COLORS: &[&str] = &["red", "orange", "yellow", "green", "teal", "blue", "purple", "gray"];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationType {
    pub id: i64,
    pub key: String,
    pub label: String,
    /// How it reads from the other paper ("Extended by"); None: the same both ways.
    pub inverse_label: Option<String>,
    pub color: String,
    pub builtin: bool,
    /// Connections of this type (between papers not in the Trash).
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relation {
    pub id: i64,
    pub from_item_id: i64,
    pub to_item_id: i64,
    pub type_id: i64,
    pub note: Option<String>,
    pub evidence_highlight_id: Option<i64>,
    pub created_at: String,
}

/// A connection seen from one paper: `outgoing` when that paper is the `from` side.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationView {
    #[serde(flatten)]
    pub relation: Relation,
    pub outgoing: bool,
    pub other_item_id: i64,
    /// The type's label as read from this paper ("Extends" or "Extended by").
    pub label: String,
    pub color: String,
    /// The evidence highlight's text and page, when there is one.
    pub evidence_text: Option<String>,
    pub evidence_page: Option<i64>,
    pub evidence_item_id: Option<i64>,
}

fn clean(s: Option<&str>) -> Option<String> {
    s.map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

fn check_color(color: &str) -> Result<()> {
    if COLORS.contains(&color) {
        Ok(())
    } else {
        Err(Error::msg(format!("Unknown color {color}")))
    }
}

/// "Applies method of" → "applies_method_of"; unique among existing keys.
fn slug(conn: &Connection, label: &str) -> Result<String> {
    let base: String = label
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    let base = if base.is_empty() {
        "connection".to_string()
    } else {
        base
    };
    let mut key = base.clone();
    let mut n = 2;
    while conn
        .query_row("SELECT 1 FROM relation_types WHERE key = ?1", [&key], |_| Ok(()))
        .optional()?
        .is_some()
    {
        key = format!("{base}_{n}");
        n += 1;
    }
    Ok(key)
}

pub fn list_types(conn: &Connection) -> Result<Vec<RelationType>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.key, t.label, t.inverse_label, t.color, t.builtin,
           (SELECT count(*) FROM relations r JOIN items a ON a.id = r.from_item_id JOIN items b ON b.id = r.to_item_id
            WHERE r.type_id = t.id AND a.deleted_at IS NULL AND b.deleted_at IS NULL)
         FROM relation_types t ORDER BY t.builtin DESC, t.sort, lower(t.label)",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(RelationType {
            id: r.get(0)?,
            key: r.get(1)?,
            label: r.get(2)?,
            inverse_label: r.get(3)?,
            color: r.get(4)?,
            builtin: r.get(5)?,
            count: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// A type by id, key or label (case-insensitive), as typed in the CLI.
pub fn find_type(conn: &Connection, name: &str) -> Result<RelationType> {
    let n = name.trim().to_lowercase().replace(['-', ' '], "_");
    list_types(conn)?
        .into_iter()
        .find(|t| {
            t.id.to_string() == name.trim()
                || t.key == n
                || t.label.to_lowercase().replace(['-', ' '], "_") == n
                || t.inverse_label
                    .as_deref()
                    .is_some_and(|l| l.to_lowercase().replace(['-', ' '], "_") == n)
        })
        .ok_or_else(|| Error::msg(format!("No connection type called “{}”", name.trim())))
}

pub fn create_type(conn: &Connection, label: &str, inverse_label: Option<&str>, color: &str) -> Result<i64> {
    let label = clean(Some(label)).ok_or_else(|| Error::msg("The type needs a name"))?;
    check_color(color)?;
    let key = slug(conn, &label)?;
    let sort: i64 = conn.query_row("SELECT coalesce(max(sort), 0) + 1 FROM relation_types", [], |r| {
        r.get(0)
    })?;
    conn.execute(
        "INSERT INTO relation_types(key, label, inverse_label, color, builtin, sort) VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        params![key, label, clean(inverse_label), color, sort],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_type(conn: &Connection, id: i64, label: &str, inverse_label: Option<&str>, color: &str) -> Result<()> {
    let label = clean(Some(label)).ok_or_else(|| Error::msg("The type needs a name"))?;
    check_color(color)?;
    let n = conn.execute(
        "UPDATE relation_types SET label = ?2, inverse_label = ?3, color = ?4 WHERE id = ?1",
        params![id, label, clean(inverse_label), color],
    )?;
    if n == 0 {
        return Err(Error::msg("Connection type not found"));
    }
    Ok(())
}

/// Deletes a type the user made, with its connections. Built-in types stay.
pub fn delete_type(conn: &Connection, id: i64) -> Result<()> {
    let builtin: Option<bool> = conn
        .query_row("SELECT builtin FROM relation_types WHERE id = ?1", [id], |r| r.get(0))
        .optional()?;
    match builtin {
        None => Err(Error::msg("Connection type not found")),
        Some(true) => Err(Error::msg("Built-in types can be renamed but not deleted")),
        Some(false) => {
            conn.execute("DELETE FROM relation_types WHERE id = ?1", [id])?;
            Ok(())
        }
    }
}

const COLS: &str = "r.id, r.from_item_id, r.to_item_id, r.type_id, r.note, r.evidence_highlight_id, r.created_at";
const SELECT: &str = "SELECT r.id, r.from_item_id, r.to_item_id, r.type_id, r.note, r.evidence_highlight_id, r.created_at FROM relations r";

fn row(r: &Row) -> rusqlite::Result<Relation> {
    Ok(Relation {
        id: r.get(0)?,
        from_item_id: r.get(1)?,
        to_item_id: r.get(2)?,
        type_id: r.get(3)?,
        note: r.get(4)?,
        evidence_highlight_id: r.get(5)?,
        created_at: r.get(6)?,
    })
}

pub fn get(conn: &Connection, id: i64) -> Result<Relation> {
    conn.query_row(&format!("{SELECT} WHERE r.id = ?1"), [id], row)
        .optional()?
        .ok_or_else(|| Error::msg("Connection not found"))
}

/// The highlight must belong to one of the two papers.
fn check_evidence(conn: &Connection, from: i64, to: i64, evidence: Option<i64>) -> Result<()> {
    let Some(h) = evidence else { return Ok(()) };
    let owner: Option<i64> = conn
        .query_row(
            "SELECT a.item_id FROM highlights h JOIN attachments a ON a.id = h.attachment_id WHERE h.id = ?1",
            [h],
            |r| r.get(0),
        )
        .optional()?;
    match owner {
        Some(o) if o == from || o == to => Ok(()),
        Some(_) => Err(Error::msg("The evidence must be a highlight in one of the two papers")),
        None => Err(Error::msg("Highlight not found")),
    }
}

/// Connects two papers. The same type between the same papers is updated rather than doubled.
pub fn add(
    conn: &Connection,
    from: i64,
    to: i64,
    type_id: i64,
    note: Option<&str>,
    evidence: Option<i64>,
) -> Result<Relation> {
    if from == to {
        return Err(Error::msg("A paper can't be connected to itself"));
    }
    check_evidence(conn, from, to, evidence)?;
    conn.execute(
        "INSERT INTO relations(from_item_id, to_item_id, type_id, note, evidence_highlight_id) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(from_item_id, to_item_id, type_id) DO UPDATE SET note = excluded.note,
           evidence_highlight_id = excluded.evidence_highlight_id",
        params![from, to, type_id, clean(note), evidence],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
            Error::msg("Unknown paper or connection type")
        }
        e => Error::Db(e),
    })?;
    let id: i64 = conn.query_row(
        "SELECT id FROM relations WHERE from_item_id = ?1 AND to_item_id = ?2 AND type_id = ?3",
        params![from, to, type_id],
        |r| r.get(0),
    )?;
    get(conn, id)
}

/// Changes a connection's type, direction (swap), note or evidence.
pub fn update(
    conn: &Connection,
    id: i64,
    type_id: i64,
    swap: bool,
    note: Option<&str>,
    evidence: Option<i64>,
) -> Result<Relation> {
    let r = get(conn, id)?;
    let (from, to) = if swap {
        (r.to_item_id, r.from_item_id)
    } else {
        (r.from_item_id, r.to_item_id)
    };
    check_evidence(conn, from, to, evidence)?;
    conn.execute(
        "UPDATE relations SET from_item_id = ?2, to_item_id = ?3, type_id = ?4, note = ?5, evidence_highlight_id = ?6 WHERE id = ?1",
        params![id, from, to, type_id, clean(note), evidence],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
            Error::msg("These papers already have a connection of that type")
        }
        e => Error::Db(e),
    })?;
    get(conn, id)
}

pub fn remove(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM relations WHERE id = ?1", [id])?;
    Ok(())
}

/// A paper's connections, both directions, worded from its side; papers in the Trash left out.
pub fn for_item(conn: &Connection, item_id: i64) -> Result<Vec<RelationView>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS}, t.label, t.inverse_label, t.color, h.text, h.page, ha.item_id
         FROM relations r
         JOIN relation_types t ON t.id = r.type_id
         JOIN items a ON a.id = r.from_item_id JOIN items b ON b.id = r.to_item_id
         LEFT JOIN highlights h ON h.id = r.evidence_highlight_id
         LEFT JOIN attachments ha ON ha.id = h.attachment_id
         WHERE (r.from_item_id = ?1 OR r.to_item_id = ?1) AND a.deleted_at IS NULL AND b.deleted_at IS NULL
         ORDER BY t.builtin DESC, t.sort, r.created_at"
    ))?;
    let rows = stmt.query_map([item_id], |r| {
        let relation = row(r)?;
        let outgoing = relation.from_item_id == item_id;
        let label: String = r.get(7)?;
        let inverse: Option<String> = r.get(8)?;
        Ok(RelationView {
            outgoing,
            other_item_id: if outgoing {
                relation.to_item_id
            } else {
                relation.from_item_id
            },
            label: if outgoing { label } else { inverse.unwrap_or(label) },
            color: r.get(9)?,
            evidence_text: r.get(10)?,
            evidence_page: r.get(11)?,
            evidence_item_id: r.get(12)?,
            relation,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Every connection between papers not in the Trash (for the graph and exports).
pub fn all(conn: &Connection) -> Result<Vec<Relation>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} JOIN items a ON a.id = r.from_item_id JOIN items b ON b.id = r.to_item_id
         WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY r.id"
    ))?;
    let rows = stmt.query_map([], row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Duplicate merge: the other paper's connections move to the kept one (doubles dropped).
pub fn move_to(conn: &Connection, master: i64, other: i64) -> Result<()> {
    conn.execute(
        "UPDATE OR IGNORE relations SET from_item_id = ?1 WHERE from_item_id = ?2 AND to_item_id <> ?1",
        params![master, other],
    )?;
    conn.execute(
        "UPDATE OR IGNORE relations SET to_item_id = ?1 WHERE to_item_id = ?2 AND from_item_id <> ?1",
        params![master, other],
    )?;
    conn.execute(
        "DELETE FROM relations WHERE from_item_id = ?1 OR to_item_id = ?1",
        [other],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::items::{insert_item, trash};
    use crate::model::ItemInput;

    fn paper(c: &Connection, t: &str) -> i64 {
        insert_item(
            c,
            &ItemInput {
                title: t.into(),
                year: Some(2020),
                ..Default::default()
            },
        )
        .unwrap()
    }

    #[test]
    fn built_in_and_own_types() {
        let mut db = Db::open_in_memory().unwrap();
        let t = list_types(&db.conn).unwrap();
        assert_eq!(
            t.iter().map(|x| x.key.as_str()).collect::<Vec<_>>(),
            ["extends", "contradicts", "replicates", "applies_method"]
        );
        assert_eq!(find_type(&db.conn, "extended by").unwrap().key, "extends");
        assert_eq!(find_type(&db.conn, "applies-method").unwrap().key, "applies_method");
        let own = db
            .tx(|c| create_type(c, "Supports", Some("Supported by"), "teal"))
            .unwrap();
        assert_eq!(find_type(&db.conn, "supports").unwrap().id, own);
        let again = db.tx(|c| create_type(c, "Supports", None, "teal")).unwrap();
        assert_eq!(
            list_types(&db.conn)
                .unwrap()
                .iter()
                .find(|x| x.id == again)
                .unwrap()
                .key,
            "supports_2"
        );
        assert!(create_type(&db.conn, "x", None, "pink").is_err());
        let extends = find_type(&db.conn, "extends").unwrap().id;
        assert!(delete_type(&db.conn, extends)
            .unwrap_err()
            .to_string()
            .contains("Built-in"));
        update_type(&db.conn, extends, "Builds on", Some("Built on by"), "orange").unwrap();
        assert_eq!(find_type(&db.conn, "builds on").unwrap().id, extends);
        delete_type(&db.conn, again).unwrap();
    }

    #[test]
    fn connections_read_from_both_sides() {
        let mut db = Db::open_in_memory().unwrap();
        let (a, b, c) = db
            .tx(|c| Ok((paper(c, "Smith"), paper(c, "Chen"), paper(c, "Patel"))))
            .unwrap();
        let ext = find_type(&db.conn, "extends").unwrap().id;
        let con = find_type(&db.conn, "contradicts").unwrap().id;
        let r = db
            .tx(|x| add(x, b, a, ext, Some(" builds on the method "), None))
            .unwrap();
        assert_eq!(r.note.as_deref(), Some("builds on the method"));
        // the same type again updates the note instead of adding a second one
        db.tx(|x| add(x, b, a, ext, Some("v2"), None)).unwrap();
        db.tx(|x| add(x, c, a, con, None, None)).unwrap();
        assert!(add(&db.conn, a, a, ext, None, None).is_err());

        let from_a = for_item(&db.conn, a).unwrap();
        assert_eq!(from_a.len(), 2);
        assert!(from_a.iter().all(|v| !v.outgoing));
        assert_eq!(from_a[0].label, "Extended by");
        assert_eq!(from_a[0].other_item_id, b);
        assert_eq!(from_a[0].relation.note.as_deref(), Some("v2"));
        assert_eq!(from_a[1].label, "Contradicted by");
        let from_b = for_item(&db.conn, b).unwrap();
        assert_eq!((from_b[0].label.as_str(), from_b[0].outgoing), ("Extends", true));

        // flip the direction and the type
        let swapped = update(&db.conn, r.id, con, true, None, None).unwrap();
        assert_eq!((swapped.from_item_id, swapped.to_item_id), (a, b));
        // in the Trash: not listed, back when restored
        trash(&db.conn, &[c]).unwrap();
        assert_eq!(for_item(&db.conn, a).unwrap().len(), 1);
        assert_eq!(all(&db.conn).unwrap().len(), 1);
        assert_eq!(
            list_types(&db.conn)
                .unwrap()
                .iter()
                .find(|t| t.id == con)
                .unwrap()
                .count,
            1
        );
        remove(&db.conn, r.id).unwrap();
        assert!(for_item(&db.conn, b).unwrap().is_empty());
    }

    #[test]
    fn evidence_must_come_from_one_of_the_papers() {
        let mut db = Db::open_in_memory().unwrap();
        let (a, b, c) = db
            .tx(|c| Ok((paper(c, "Smith"), paper(c, "Chen"), paper(c, "Patel"))))
            .unwrap();
        for (item, hash) in [(a, "ha"), (c, "hc")] {
            db.conn
                .execute(
                    "INSERT INTO attachments(item_id, kind, content_hash) VALUES (?1, 'pdf', ?2)",
                    params![item, hash],
                )
                .unwrap();
        }
        let att = |item: i64| -> i64 {
            db.conn
                .query_row("SELECT id FROM attachments WHERE item_id = ?1", [item], |r| r.get(0))
                .unwrap()
        };
        let (aa, ca) = (att(a), att(c));
        for att in [aa, ca] {
            db.conn
                .execute(
                    "INSERT INTO highlights(attachment_id, page, kind, rects, text, color) VALUES (?1, 3, 'highlight', '[]', 'we extend their loss', 'yellow')",
                    [att],
                )
                .unwrap();
        }
        let h = |item: i64| -> i64 {
            db.conn
                .query_row(
                    "SELECT h.id FROM highlights h JOIN attachments a ON a.id = h.attachment_id WHERE a.item_id = ?1",
                    [item],
                    |r| r.get(0),
                )
                .unwrap()
        };
        let ext = find_type(&db.conn, "extends").unwrap().id;
        assert!(
            add(&db.conn, b, a, ext, None, Some(h(c))).is_err(),
            "not from these papers"
        );
        let r = add(&db.conn, b, a, ext, None, Some(h(a))).unwrap();
        let v = &for_item(&db.conn, b).unwrap()[0];
        assert_eq!(v.evidence_text.as_deref(), Some("we extend their loss"));
        assert_eq!(v.evidence_page, Some(3));
        // deleting the highlight keeps the connection
        db.conn.execute("DELETE FROM highlights WHERE id = ?1", [h(a)]).unwrap();
        assert_eq!(get(&db.conn, r.id).unwrap().evidence_highlight_id, None);
    }

    #[test]
    fn merging_duplicates_moves_connections() {
        let mut db = Db::open_in_memory().unwrap();
        let (a, a2, b) = db
            .tx(|c| Ok((paper(c, "Smith"), paper(c, "Smith copy"), paper(c, "Chen"))))
            .unwrap();
        let ext = find_type(&db.conn, "extends").unwrap().id;
        add(&db.conn, b, a, ext, None, None).unwrap();
        add(&db.conn, b, a2, ext, Some("from the copy"), None).unwrap();
        add(&db.conn, a2, a, ext, None, None).unwrap();
        db.tx(|c| move_to(c, a, a2)).unwrap();
        let rels = all(&db.conn).unwrap();
        assert_eq!(rels.len(), 1, "the double and the self-link are dropped");
        assert_eq!((rels[0].from_item_id, rels[0].to_item_id), (b, a));
    }
}
