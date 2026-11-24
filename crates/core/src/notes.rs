//! Notes: exactly one paper note per item (header generated from the item, body is the user's bullets),
//! plus free notes (optionally attached to an item or highlight) and project notes.
//! Links: `[[citekey]]`, `[[Note title]]`, `[[target|label]]`, and `@citekey`.
use crate::model::Item;
use crate::{Error, Result};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub kind: String,
    pub item_id: Option<i64>,
    pub project_id: Option<i64>,
    pub highlight_id: Option<i64>,
    pub title: Option<String>,
    pub body: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewNote {
    /// "free" or "project".
    pub kind: String,
    pub item_id: Option<i64>,
    pub project_id: Option<i64>,
    pub highlight_id: Option<i64>,
    pub title: Option<String>,
    #[serde(default)]
    pub body: String,
}

/// A note as shown in lists and backlinks: `title` is the note title, the item title for
/// paper notes, or the project name for untitled project notes.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRef {
    pub note_id: i64,
    pub kind: String,
    pub title: String,
    pub item_id: Option<i64>,
    pub project_id: Option<i64>,
    pub updated_at: String,
    /// A line of the body: the linking line for backlinks, the first line otherwise.
    pub snippet: String,
}

fn wikilink_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\[\[([^\[\]|#\n]+)(?:#[^\[\]|\n]*)?(?:\|[^\[\]\n]*)?\]\]").unwrap())
}

fn cite_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?:^|[^\w@])@([A-Za-z](?:[\w:.\-]*\w)?)").unwrap())
}

/// Rewrites `[[old]]` / `[[old|label]]` / `[[old#heading]]` and `@old` to the new citekey.
/// Returns None when the body doesn't mention the old key.
pub fn replace_citekey(body: &str, old: &str, new: &str) -> Option<String> {
    let mut spans: Vec<(usize, usize)> = wikilink_re()
        .captures_iter(body)
        .filter_map(|c| c.get(1))
        .filter(|m| m.as_str().trim().eq_ignore_ascii_case(old))
        .map(|m| {
            // keep surrounding spaces inside the brackets as they were
            let lead = m.as_str().len() - m.as_str().trim_start().len();
            (m.start() + lead, m.start() + lead + m.as_str().trim().len())
        })
        .chain(
            cite_re()
                .captures_iter(body)
                .filter_map(|c| c.get(1))
                .filter(|m| m.as_str() == old)
                .map(|m| (m.start(), m.end())),
        )
        .collect();
    if spans.is_empty() {
        return None;
    }
    spans.sort_unstable();
    let mut out = String::with_capacity(body.len());
    let mut at = 0;
    for (a, b) in spans {
        out.push_str(&body[at..a]);
        out.push_str(new);
        at = b;
    }
    out.push_str(&body[at..]);
    Some(out)
}

/// After a paper's citekey changed: every note that links to it by the old key follows.
pub fn rename_citekey(conn: &Connection, old: &str, new: &str) -> Result<usize> {
    if old == new {
        return Ok(0);
    }
    let mut stmt = conn.prepare("SELECT id, body FROM notes WHERE instr(lower(body), lower(?1)) > 0")?;
    let hits: Vec<(i64, String)> = stmt
        .query_map([old], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    let mut n = 0;
    for (id, body) in hits {
        if let Some(b) = replace_citekey(&body, old, new) {
            conn.execute(
                "UPDATE notes SET body = ?2, updated_at = datetime('now') WHERE id = ?1",
                params![id, b],
            )?;
            index_links(conn, id, &b)?;
            n += 1;
        }
    }
    Ok(n)
}

/// Link targets in order of appearance, without duplicates.
pub fn parse_links(body: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut found: Vec<(usize, String)> = wikilink_re()
        .captures_iter(body)
        .map(|c| (c.get(0).map_or(0, |m| m.start()), c[1].trim().to_string()))
        .chain(
            cite_re()
                .captures_iter(body)
                .map(|c| (c.get(1).map_or(0, |m| m.start()), c[1].to_string())),
        )
        .collect();
    found.sort_by_key(|(pos, _)| *pos);
    for (_, t) in found {
        if !t.is_empty() && !out.iter().any(|o| o.eq_ignore_ascii_case(&t)) {
            out.push(t);
        }
    }
    out
}

/// Resolves a target: citekey, then note title, then item title (all case-insensitive).
fn resolve(conn: &Connection, target: &str) -> Result<(Option<i64>, Option<i64>)> {
    let q = |sql: &str| -> Result<Option<i64>> { Ok(conn.query_row(sql, [target], |r| r.get(0)).optional()?) };
    if let Some(i) = q("SELECT id FROM items WHERE lower(citekey) = lower(?1)")? {
        return Ok((Some(i), None));
    }
    if let Some(n) =
        q("SELECT id FROM notes WHERE kind <> 'paper_note' AND lower(title) = lower(?1) ORDER BY id LIMIT 1")?
    {
        return Ok((None, Some(n)));
    }
    Ok((
        q("SELECT id FROM items WHERE lower(title) = lower(?1) ORDER BY id LIMIT 1")?,
        None,
    ))
}

fn index_links(conn: &Connection, note_id: i64, body: &str) -> Result<()> {
    conn.execute("DELETE FROM note_links WHERE note_id = ?1", [note_id])?;
    for target in parse_links(body) {
        let (item, note) = resolve(conn, &target)?;
        conn.execute(
            "INSERT INTO note_links(note_id, target_item_id, target_note_id, raw) VALUES (?1, ?2, ?3, ?4)",
            params![note_id, item, note.filter(|n| *n != note_id), target],
        )?;
    }
    Ok(())
}

const SELECT: &str = "SELECT id, kind, item_id, project_id, highlight_id, title, body, updated_at FROM notes";

fn row(r: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: r.get(0)?,
        kind: r.get(1)?,
        item_id: r.get(2)?,
        project_id: r.get(3)?,
        highlight_id: r.get(4)?,
        title: r.get(5)?,
        body: r.get(6)?,
        updated_at: r.get(7)?,
    })
}

pub fn get(conn: &Connection, id: i64) -> Result<Note> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], row)
        .optional()?
        .ok_or_else(|| Error::msg("Note not found"))
}

/// The item's paper note, created on demand for items that predate the invariant.
pub fn paper_note(conn: &Connection, item_id: i64) -> Result<Note> {
    if let Some(n) = conn
        .query_row(
            &format!("{SELECT} WHERE kind = 'paper_note' AND item_id = ?1"),
            [item_id],
            row,
        )
        .optional()?
    {
        return Ok(n);
    }
    conn.execute("INSERT INTO notes(kind, item_id) VALUES ('paper_note', ?1)", [item_id])?;
    get(conn, conn.last_insert_rowid())
}

pub fn save_body(conn: &Connection, id: i64, body: &str) -> Result<Note> {
    let n = conn.execute(
        "UPDATE notes SET body = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![id, body],
    )?;
    if n == 0 {
        return Err(Error::msg("Note not found"));
    }
    index_links(conn, id, body)?;
    get(conn, id)
}

pub fn create(conn: &Connection, n: &NewNote) -> Result<Note> {
    match n.kind.as_str() {
        "free" => {}
        "project" if n.project_id.is_some() => {}
        "project" => return Err(Error::msg("A project note needs a project")),
        _ => {
            return Err(Error::msg(
                "Only free and project notes can be created; paper notes are automatic",
            ))
        }
    }
    let title = n
        .title
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .unwrap_or("Untitled note");
    conn.execute(
        "INSERT INTO notes(kind, item_id, project_id, highlight_id, title, body) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![n.kind, n.item_id, n.project_id, n.highlight_id, title, n.body],
    )?;
    let id = conn.last_insert_rowid();
    index_links(conn, id, &n.body)?;
    // links elsewhere that named this title before it existed now resolve
    conn.execute(
        "UPDATE note_links SET target_note_id = ?1 WHERE target_note_id IS NULL AND target_item_id IS NULL AND lower(raw) = lower(?2) AND note_id <> ?1",
        params![id, title],
    )?;
    get(conn, id)
}

pub fn rename(conn: &Connection, id: i64, title: &str) -> Result<Note> {
    let note = get(conn, id)?;
    if note.kind == "paper_note" {
        return Err(Error::msg("Paper notes are titled by their paper"));
    }
    let title = title.trim();
    if title.is_empty() {
        return Err(Error::msg("Title is empty"));
    }
    conn.execute(
        "UPDATE notes SET title = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![id, title],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    if get(conn, id)?.kind == "paper_note" {
        return Err(Error::msg("A paper note is deleted with its paper"));
    }
    conn.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    Ok(())
}

/// Appends a Markdown bullet to the item's paper note (used by "quote to note").
pub fn append_bullet(conn: &Connection, item_id: i64, bullet: &str) -> Result<Note> {
    let note = paper_note(conn, item_id)?;
    let mut body = note.body.trim_end().to_string();
    if !body.is_empty() {
        body.push('\n');
    }
    body.push_str("- ");
    body.push_str(bullet.trim());
    body.push('\n');
    save_body(conn, note.id, &body)
}

fn first_line(body: &str) -> String {
    body.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .chars()
        .take(160)
        .collect()
}

const REF_SELECT: &str = "SELECT n.id, n.kind,
    coalesce(CASE WHEN n.kind = 'paper_note' THEN i.title END, n.title, p.name, 'Untitled note'),
    n.item_id, n.project_id, n.updated_at, n.body
    FROM notes n LEFT JOIN items i ON i.id = n.item_id LEFT JOIN projects p ON p.id = n.project_id";

fn ref_row(r: &Row) -> rusqlite::Result<(NoteRef, String)> {
    Ok((
        NoteRef {
            note_id: r.get(0)?,
            kind: r.get(1)?,
            title: r.get(2)?,
            item_id: r.get(3)?,
            project_id: r.get(4)?,
            updated_at: r.get(5)?,
            snippet: String::new(),
        },
        r.get(6)?,
    ))
}

/// Free and project notes, newest first. With `item_id`, only that item's free notes.
pub fn list(conn: &Connection, item_id: Option<i64>) -> Result<Vec<NoteRef>> {
    let mut stmt = conn.prepare(&format!(
        "{REF_SELECT} WHERE n.kind <> 'paper_note' AND (?1 IS NULL OR n.item_id = ?1) ORDER BY n.updated_at DESC, n.id DESC"
    ))?;
    let rows = stmt.query_map([item_id], ref_row)?;
    rows.map(|r| {
        let (mut n, body) = r?;
        n.snippet = first_line(&body);
        Ok(n)
    })
    .collect()
}

fn linking_line(body: &str, target: &str) -> String {
    let t = target.to_lowercase();
    body.lines()
        .find(|l| {
            let l = l.to_lowercase();
            l.contains(&format!("[[{t}")) || l.contains(&format!("@{t}"))
        })
        .map(|l| l.trim().chars().take(160).collect())
        .unwrap_or_else(|| first_line(body))
}

/// Notes linking to an item (by id or, for links written before the item existed, by citekey).
pub fn backlinks_to_item(conn: &Connection, item_id: i64) -> Result<Vec<NoteRef>> {
    let citekey: String = conn.query_row("SELECT citekey FROM items WHERE id = ?1", [item_id], |r| r.get(0))?;
    let mut stmt = conn.prepare(&format!(
        "{REF_SELECT} WHERE n.id IN (SELECT note_id FROM note_links WHERE target_item_id = ?1 OR lower(raw) = lower(?2))
         AND NOT (n.kind = 'paper_note' AND n.item_id = ?1) ORDER BY n.updated_at DESC"
    ))?;
    let rows = stmt.query_map(params![item_id, citekey], ref_row)?;
    rows.map(|r| {
        let (mut n, body) = r?;
        n.snippet = linking_line(&body, &citekey);
        Ok(n)
    })
    .collect()
}

pub fn backlinks_to_note(conn: &Connection, note_id: i64) -> Result<Vec<NoteRef>> {
    let title = get(conn, note_id)?.title.unwrap_or_default();
    let mut stmt = conn.prepare(&format!(
        "{REF_SELECT} WHERE n.id <> ?1 AND n.id IN (SELECT note_id FROM note_links WHERE target_note_id = ?1 OR (?2 <> '' AND lower(raw) = lower(?2)))
         ORDER BY n.updated_at DESC"
    ))?;
    let rows = stmt.query_map(params![note_id, title], ref_row)?;
    rows.map(|r| {
        let (mut n, body) = r?;
        n.snippet = linking_line(&body, &title);
        Ok(n)
    })
    .collect()
}

fn yaml_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// One paper note as Markdown: the generated header as YAML front matter, the bullets as body.
pub fn paper_note_markdown(item: &Item, body: &str) -> String {
    let mut fm = vec![
        "---".to_string(),
        format!("title: {}", yaml_str(&item.title)),
        format!("citekey: {}", item.citekey),
        "authors:".to_string(),
    ];
    for a in &item.authors {
        let name = if a.given.is_empty() {
            a.family.clone()
        } else {
            format!("{} {}", a.given, a.family)
        };
        fm.push(format!("  - {}", yaml_str(&name)));
    }
    if item.authors.is_empty() {
        fm.pop();
        fm.push("authors: []".into());
    }
    if let Some(y) = item.year {
        fm.push(format!("year: {y}"));
    }
    if let Some(d) = &item.pub_date {
        fm.push(format!("published: {}", yaml_str(d)));
    }
    fm.push(format!("added: {}", yaml_str(&item.date_added)));
    if let Some(d) = &item.doi {
        fm.push(format!("doi: {}", yaml_str(d)));
    }
    if !item.tags.is_empty() {
        fm.push(format!(
            "tags: [{}]",
            item.tags.iter().map(|t| yaml_str(t)).collect::<Vec<_>>().join(", ")
        ));
    }
    fm.push("---".into());
    format!("{}\n\n{}\n", fm.join("\n"), body.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn citekey_renames_rewrite_links() {
        let body = "See [[vaswani2017attention]], [[ vaswani2017attention |the Transformer]] and \
                    @vaswani2017attention. Not @vaswani2017attentions or [[vaswani2017attention-v2]].";
        let out = replace_citekey(body, "vaswani2017attention", "fischer2013three").unwrap();
        assert_eq!(
            out,
            "See [[fischer2013three]], [[ fischer2013three |the Transformer]] and \
                    @fischer2013three. Not @vaswani2017attentions or [[vaswani2017attention-v2]]."
        );
        assert!(replace_citekey("nothing here", "a2020b", "c").is_none());
    }
    use crate::db::Db;
    use crate::items::{get_item, insert_item};
    use crate::model::{Author, ItemInput};

    fn paper(db: &mut Db, title: &str, fam: &str, year: i32) -> i64 {
        db.tx(|c| {
            insert_item(
                c,
                &ItemInput {
                    title: title.into(),
                    authors: vec![Author::new(fam, "A")],
                    year: Some(year),
                    ..Default::default()
                },
            )
        })
        .unwrap()
    }

    #[test]
    fn parses_wikilinks_and_citations() {
        let body = "See [[vaswani2017attention]] and [[Reading plan|plan]], also @he2016deep, @he2016deep.\nmail a@b.com, [[x#sec]] @ alone";
        assert_eq!(
            parse_links(body),
            vec!["vaswani2017attention", "Reading plan", "he2016deep", "x"]
        );
    }

    #[test]
    fn paper_note_exists_and_saves() {
        let mut db = Db::open_in_memory().unwrap();
        let a = paper(&mut db, "Attention", "Vaswani", 2017);
        let n = paper_note(&db.conn, a).unwrap();
        assert_eq!((n.kind.as_str(), n.body.as_str()), ("paper_note", ""));
        let n = db.tx(|c| save_body(c, n.id, "- Key idea: attention only")).unwrap();
        assert_eq!(paper_note(&db.conn, a).unwrap().body, n.body);
        assert!(db.tx(|c| delete(c, n.id)).is_err());
        let n = db.tx(|c| append_bullet(c, a, "> \"quoted\" [p. 3](#hl-7)")).unwrap();
        assert_eq!(n.body, "- Key idea: attention only\n- > \"quoted\" [p. 3](#hl-7)\n");
    }

    #[test]
    fn backlinks_resolve_now_and_later() {
        let mut db = Db::open_in_memory().unwrap();
        let a = paper(&mut db, "Attention", "Vaswani", 2017);
        let b = paper(&mut db, "BERT", "Devlin", 2019);
        let bert_note = paper_note(&db.conn, b).unwrap();
        db.tx(|c| {
            save_body(
                c,
                bert_note.id,
                "- builds on [[vaswani2017attention]]\n- see [[Reading plan]] and @he2016deep",
            )
        })
        .unwrap();
        let back = backlinks_to_item(&db.conn, a).unwrap();
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].title, "BERT");
        assert_eq!(back[0].snippet, "- builds on [[vaswani2017attention]]");

        // a note created after the link was written picks it up
        let plan = db
            .tx(|c| {
                create(
                    c,
                    &NewNote {
                        kind: "free".into(),
                        item_id: None,
                        project_id: None,
                        highlight_id: None,
                        title: Some("Reading plan".into()),
                        body: String::new(),
                    },
                )
            })
            .unwrap();
        assert_eq!(backlinks_to_note(&db.conn, plan.id).unwrap()[0].note_id, bert_note.id);
        // so does an item imported later, by citekey
        let he = paper(&mut db, "Deep Residual Learning", "He", 2016);
        assert_eq!(get_item(&db.conn, he).unwrap().unwrap().citekey, "he2016deep");
        assert_eq!(backlinks_to_item(&db.conn, he).unwrap().len(), 1);
    }

    #[test]
    fn free_and_project_notes() {
        let mut db = Db::open_in_memory().unwrap();
        let a = paper(&mut db, "Attention", "Vaswani", 2017);
        let p = db.tx(|c| crate::projects::create(c, "Thesis", None)).unwrap();
        let mk = |kind: &str, item: Option<i64>, project: Option<i64>| NewNote {
            kind: kind.into(),
            item_id: item,
            project_id: project,
            highlight_id: None,
            title: None,
            body: "first line\nsecond".into(),
        };
        let f = db.tx(|c| create(c, &mk("free", Some(a), None))).unwrap();
        assert_eq!(f.title.as_deref(), Some("Untitled note"));
        assert!(db.tx(|c| create(c, &mk("project", None, None))).is_err());
        assert!(db.tx(|c| create(c, &mk("paper_note", Some(a), None))).is_err());
        db.tx(|c| create(c, &mk("project", None, Some(p)))).unwrap();
        assert_eq!(list(&db.conn, None).unwrap().len(), 2);
        let mine = list(&db.conn, Some(a)).unwrap();
        assert_eq!((mine.len(), mine[0].snippet.as_str()), (1, "first line"));
        db.tx(|c| rename(c, f.id, "Ideas")).unwrap();
        db.tx(|c| delete(c, f.id)).unwrap();
        assert_eq!(list(&db.conn, Some(a)).unwrap().len(), 0);
    }

    #[test]
    fn exports_front_matter() {
        let mut db = Db::open_in_memory().unwrap();
        let a = paper(&mut db, "Say \"hi\"", "Vaswani", 2017);
        let item = get_item(&db.conn, a).unwrap().unwrap();
        let md = paper_note_markdown(&item, "- one\n");
        assert!(
            md.starts_with(
                "---\ntitle: \"Say \\\"hi\\\"\"\ncitekey: vaswani2017say\nauthors:\n  - \"A Vaswani\"\nyear: 2017\n"
            ),
            "{md}"
        );
        assert!(md.ends_with("---\n\n- one\n"));
    }
}
