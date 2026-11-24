use crate::citekey::{base_citekey, unique_citekey};
use crate::model::{Author, Biblio, Item, ItemInput};
use crate::text::{fold, normalize_arxiv, normalize_doi, normalize_title, title_similarity};
use crate::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::collections::HashMap;

const READ_STATUSES: &[&str] = &["unread", "reading", "read"];
/// Minimum word-set similarity for two titles (same year +/- 1) to count as duplicates.
pub const FUZZY_THRESHOLD: f64 = 0.85;

fn clean(s: &Option<String>) -> Option<String> {
    s.as_ref().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

struct Normalized {
    item_type: String,
    title: String,
    doi: Option<String>,
    arxiv: Option<String>,
    read_status: String,
    rating: Option<i32>,
}

fn normalize(input: &ItemInput) -> Result<Normalized> {
    let title = input.title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() {
        return Err(Error::msg("Title is required"));
    }
    let read_status = input.read_status.clone().unwrap_or_else(|| "unread".into());
    if !READ_STATUSES.contains(&read_status.as_str()) {
        return Err(Error::msg(format!("Unknown read status: {read_status}")));
    }
    if let Some(r) = input.rating {
        if !(0..=5).contains(&r) {
            return Err(Error::msg("Rating must be between 0 and 5"));
        }
    }
    Ok(Normalized {
        item_type: if input.item_type.trim().is_empty() {
            "article".into()
        } else {
            input.item_type.trim().into()
        },
        title,
        doi: clean(&input.doi).and_then(|d| normalize_doi(&d)),
        arxiv: clean(&input.arxiv_id).and_then(|a| normalize_arxiv(&a)),
        read_status,
        rating: input.rating,
    })
}

fn friendly(e: rusqlite::Error) -> Error {
    match &e {
        rusqlite::Error::SqliteFailure(f, Some(m)) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
            if m.contains("items.citekey") {
                Error::msg("Another item already uses this citekey")
            } else if m.contains("items.doi") {
                Error::msg("Another item already has this DOI")
            } else if m.contains("items.arxiv_id") {
                Error::msg("Another item already has this arXiv ID")
            } else {
                Error::Db(e)
            }
        }
        _ => Error::Db(e),
    }
}

fn set_authors(conn: &Connection, item_id: i64, authors: &[Author], editors: &[Author]) -> Result<()> {
    conn.execute("DELETE FROM item_authors WHERE item_id = ?1", [item_id])?;
    let people = authors
        .iter()
        .map(|a| (a, "author"))
        .chain(editors.iter().map(|a| (a, "editor")));
    for (pos, (a, role)) in people.filter(|(a, _)| !a.family.trim().is_empty()).enumerate() {
        let a = Author::new(&a.family, &a.given);
        conn.execute(
            "INSERT OR IGNORE INTO authors(family, given, name_norm) VALUES (?1, ?2, ?3)",
            params![a.family, a.given, fold(&format!("{} {}", a.given, a.family))],
        )?;
        let author_id: i64 = conn.query_row(
            "SELECT id FROM authors WHERE family = ?1 AND given = ?2",
            params![a.family, a.given],
            |r| r.get(0),
        )?;
        conn.execute(
            "INSERT INTO item_authors(item_id, author_id, position, role) VALUES (?1, ?2, ?3, ?4)",
            params![item_id, author_id, pos as i64, role],
        )?;
    }
    Ok(())
}

fn write_biblio(conn: &Connection, id: i64, b: &Biblio) -> Result<()> {
    conn.execute(
        "UPDATE items SET volume=?2, issue=?3, pages=?4, publisher=?5, place=?6, isbn=?7, issn=?8, edition=?9,
         language=?10, series=?11, number=?12 WHERE id=?1",
        params![
            id,
            clean(&b.volume),
            clean(&b.issue),
            clean(&b.pages),
            clean(&b.publisher),
            clean(&b.place),
            clean(&b.isbn),
            clean(&b.issn),
            clean(&b.edition),
            clean(&b.language),
            clean(&b.series),
            clean(&b.number)
        ],
    )?;
    Ok(())
}

/// Inserts an item, its authors and its (empty) paper note. Call inside a transaction.
pub fn insert_item(conn: &Connection, input: &ItemInput) -> Result<i64> {
    let n = normalize(input)?;
    let wanted = clean(&input.citekey).unwrap_or_else(|| base_citekey(input));
    let citekey = unique_citekey(conn, &wanted, None)?;
    conn.execute(
        "INSERT INTO items(item_type, citekey, title, title_norm, year, pub_date, venue, doi, arxiv_id, url, abstract, read_status, rating)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            n.item_type, citekey, n.title, normalize_title(&n.title), input.year, clean(&input.pub_date),
            clean(&input.venue), n.doi, n.arxiv, clean(&input.url), clean(&input.abstract_text),
            n.read_status, n.rating
        ],
    )
    .map_err(friendly)?;
    let id = conn.last_insert_rowid();
    write_biblio(conn, id, &input.biblio)?;
    set_authors(conn, id, &input.authors, &input.biblio.editors)?;
    conn.execute("INSERT INTO notes(kind, item_id) VALUES ('paper_note', ?1)", [id])?;
    Ok(id)
}

/// Replaces all editable fields. An empty citekey keeps the current one.
pub fn update_item(conn: &Connection, id: i64, input: &ItemInput) -> Result<()> {
    let n = normalize(input)?;
    let current: String = conn
        .query_row("SELECT citekey FROM items WHERE id = ?1", [id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| Error::msg("Item not found"))?;
    let citekey = clean(&input.citekey).unwrap_or_else(|| current.clone());
    if citekey.chars().any(char::is_whitespace) {
        return Err(Error::msg("Citekeys cannot contain spaces"));
    }
    conn.execute(
        "UPDATE items SET item_type=?2, citekey=?3, title=?4, title_norm=?5, year=?6, pub_date=?7, venue=?8,
         doi=?9, arxiv_id=?10, url=?11, abstract=?12, read_status=?13, rating=?14, date_modified=datetime('now')
         WHERE id=?1",
        params![
            id,
            n.item_type,
            citekey,
            n.title,
            normalize_title(&n.title),
            input.year,
            clean(&input.pub_date),
            clean(&input.venue),
            n.doi,
            n.arxiv,
            clean(&input.url),
            clean(&input.abstract_text),
            n.read_status,
            n.rating
        ],
    )
    .map_err(friendly)?;
    write_biblio(conn, id, &input.biblio)?;
    set_authors(conn, id, &input.authors, &input.biblio.editors)?;
    // notes link to papers by citekey: a new key carries the links along
    if citekey != current {
        crate::notes::rename_citekey(conn, &current, &citekey)?;
    }
    Ok(())
}

/// Fills empty fields of an existing item from `input`; never overwrites what is there.
pub fn merge_into(conn: &Connection, id: i64, input: &ItemInput) -> Result<()> {
    let existing = get_item(conn, id)?.ok_or_else(|| Error::msg("Item not found"))?;
    let mut merged = to_input(&existing);
    let doi_taken = |d: &Option<String>| -> Result<bool> {
        let Some(d) = d.as_ref().and_then(|d| normalize_doi(d)) else {
            return Ok(false);
        };
        Ok(conn
            .query_row(
                "SELECT 1 FROM items WHERE doi = ?1 AND id <> ?2",
                params![d, id],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
    };
    let mut incoming = input.clone();
    if doi_taken(&incoming.doi)? {
        incoming.doi = None;
    }
    if let Some(a) = incoming.arxiv_id.as_deref().and_then(normalize_arxiv) {
        let taken = conn
            .query_row(
                "SELECT 1 FROM items WHERE arxiv_id = ?1 AND id <> ?2",
                params![a, id],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if taken {
            incoming.arxiv_id = None;
        }
    }
    incoming.citekey = None;
    merged.fill_from(&incoming);
    update_item(conn, id, &merged)?;
    // merging into a paper in the Trash brings it back
    conn.execute("UPDATE items SET deleted_at = NULL WHERE id = ?1", [id])?;
    Ok(())
}

/// Moves papers to the Trash. Everything about them is kept until they are purged.
pub fn trash(conn: &Connection, ids: &[i64]) -> Result<()> {
    for id in ids {
        conn.execute(
            "UPDATE items SET deleted_at = datetime('now') WHERE id = ?1 AND deleted_at IS NULL",
            [id],
        )?;
    }
    Ok(())
}

pub fn restore(conn: &Connection, ids: &[i64]) -> Result<()> {
    for id in ids {
        conn.execute("UPDATE items SET deleted_at = NULL WHERE id = ?1", [id])?;
    }
    Ok(())
}

/// Papers in the Trash, most recently deleted first.
pub fn list_trash(conn: &Connection) -> Result<Vec<Item>> {
    let mut all = load_items(conn, "deleted_at IS NOT NULL", "deleted_at DESC, id DESC")?;
    all.retain(|i| i.deleted_at.is_some());
    Ok(all)
}

/// Papers in the Trash for longer than `days` (all of it with `None`).
pub fn trash_ids(conn: &Connection, older_than_days: Option<i64>) -> Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM items WHERE deleted_at IS NOT NULL AND (?1 IS NULL OR deleted_at < datetime('now', ?1))",
    )?;
    let rows = stmt.query_map([older_than_days.map(|d| format!("-{d} days"))], |r| r.get(0))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

/// Deletes papers for good and returns their stored files that nothing else uses; remove those
/// with `attachments::remove_stored_files` after the transaction commits.
pub fn delete_for_good(conn: &Connection, ids: &[i64]) -> Result<Vec<(String, String)>> {
    let files = crate::attachments::files_only_used_by(conn, ids)?;
    for id in ids {
        conn.execute("DELETE FROM items WHERE id = ?1", [id])?;
    }
    Ok(files)
}

pub fn delete_item(conn: &Connection, id: i64) -> Result<()> {
    let n = conn.execute("DELETE FROM items WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(Error::msg("Item not found"));
    }
    Ok(())
}

pub fn to_input(i: &Item) -> ItemInput {
    ItemInput {
        item_type: i.item_type.clone(),
        citekey: Some(i.citekey.clone()),
        title: i.title.clone(),
        authors: i.authors.clone(),
        year: i.year,
        pub_date: i.pub_date.clone(),
        venue: i.venue.clone(),
        doi: i.doi.clone(),
        arxiv_id: i.arxiv_id.clone(),
        url: i.url.clone(),
        abstract_text: i.abstract_text.clone(),
        read_status: Some(i.read_status.clone()),
        rating: i.rating,
        biblio: i.biblio.clone(),
    }
}

const SELECT: &str = "SELECT id, item_type, citekey, title, year, pub_date, venue, doi, arxiv_id, url, abstract,
    read_status, rating, date_added, date_modified,
    EXISTS(SELECT 1 FROM attachments a WHERE a.item_id = items.id AND a.kind = 'pdf'),
    volume, issue, pages, publisher, place, isbn, issn, edition, language, series, number, deleted_at,
    EXISTS(SELECT 1 FROM attachments a WHERE a.item_id = items.id AND a.kind = 'epub')
    FROM items";

fn row_to_item(r: &Row) -> rusqlite::Result<Item> {
    Ok(Item {
        id: r.get(0)?,
        item_type: r.get(1)?,
        citekey: r.get(2)?,
        title: r.get(3)?,
        authors: Vec::new(),
        year: r.get(4)?,
        pub_date: r.get(5)?,
        venue: r.get(6)?,
        doi: r.get(7)?,
        arxiv_id: r.get(8)?,
        url: r.get(9)?,
        abstract_text: r.get(10)?,
        read_status: r.get(11)?,
        rating: r.get(12)?,
        date_added: r.get(13)?,
        date_modified: r.get(14)?,
        has_pdf: r.get(15)?,
        biblio: Biblio {
            volume: r.get(16)?,
            issue: r.get(17)?,
            pages: r.get(18)?,
            publisher: r.get(19)?,
            place: r.get(20)?,
            isbn: r.get(21)?,
            issn: r.get(22)?,
            edition: r.get(23)?,
            language: r.get(24)?,
            series: r.get(25)?,
            number: r.get(26)?,
            editors: Vec::new(),
        },
        deleted_at: r.get(27)?,
        has_epub: r.get(28)?,
        tags: Vec::new(),
        project_ids: Vec::new(),
    })
}

fn tags_by_item(conn: &Connection, only: Option<i64>) -> Result<HashMap<i64, Vec<String>>> {
    let mut stmt = conn.prepare(
        "SELECT it.item_id, t.path FROM item_tags it JOIN tags t ON t.id = it.tag_id
         WHERE ?1 IS NULL OR it.item_id = ?1 ORDER BY lower(t.path)",
    )?;
    let mut map: HashMap<i64, Vec<String>> = HashMap::new();
    for row in stmt.query_map([only], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
        let (id, t) = row?;
        map.entry(id).or_default().push(t);
    }
    Ok(map)
}

fn projects_by_item(conn: &Connection, only: Option<i64>) -> Result<HashMap<i64, Vec<i64>>> {
    let mut stmt = conn.prepare(
        "SELECT item_id, project_id FROM project_items WHERE ?1 IS NULL OR item_id = ?1 ORDER BY project_id",
    )?;
    let mut map: HashMap<i64, Vec<i64>> = HashMap::new();
    for row in stmt.query_map([only], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))? {
        let (id, p) = row?;
        map.entry(id).or_default().push(p);
    }
    Ok(map)
}

/// Sets the read status of many items at once.
pub fn set_read_status(conn: &Connection, ids: &[i64], status: &str) -> Result<()> {
    if !READ_STATUSES.contains(&status) {
        return Err(Error::msg(format!("Unknown read status: {status}")));
    }
    for id in ids {
        conn.execute(
            "UPDATE items SET read_status = ?2, date_modified = datetime('now') WHERE id = ?1 AND read_status <> ?2",
            params![id, status],
        )?;
    }
    Ok(())
}

fn authors_by_item(conn: &Connection, only: Option<i64>) -> Result<HashMap<i64, Vec<Author>>> {
    people_by_item(conn, only, "author")
}

fn people_by_item(conn: &Connection, only: Option<i64>, role: &str) -> Result<HashMap<i64, Vec<Author>>> {
    let mut stmt = conn.prepare(
        "SELECT ia.item_id, a.family, a.given FROM item_authors ia JOIN authors a ON a.id = ia.author_id
         WHERE (?1 IS NULL OR ia.item_id = ?1) AND ia.role = ?2 ORDER BY ia.item_id, ia.position",
    )?;
    let mut map: HashMap<i64, Vec<Author>> = HashMap::new();
    let rows = stmt.query_map(params![only, role], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            Author {
                family: r.get(1)?,
                given: r.get(2)?,
            },
        ))
    })?;
    for row in rows {
        let (id, a) = row?;
        map.entry(id).or_default().push(a);
    }
    Ok(map)
}

pub fn get_item(conn: &Connection, id: i64) -> Result<Option<Item>> {
    let item = conn
        .query_row(&format!("{SELECT} WHERE id = ?1"), [id], row_to_item)
        .optional()?;
    Ok(match item {
        Some(mut i) => {
            i.authors = authors_by_item(conn, Some(id))?.remove(&id).unwrap_or_default();
            i.biblio.editors = people_by_item(conn, Some(id), "editor")?
                .remove(&id)
                .unwrap_or_default();
            i.tags = tags_by_item(conn, Some(id))?.remove(&id).unwrap_or_default();
            i.project_ids = projects_by_item(conn, Some(id))?.remove(&id).unwrap_or_default();
            Some(i)
        }
        None => None,
    })
}

fn load_items(conn: &Connection, filter: &str, order: &str) -> Result<Vec<Item>> {
    let mut authors = authors_by_item(conn, None)?;
    let mut editors = people_by_item(conn, None, "editor")?;
    let mut tags = tags_by_item(conn, None)?;
    let mut projects = projects_by_item(conn, None)?;
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE {filter} ORDER BY {order}"))?;
    let items = stmt
        .query_map([], row_to_item)?
        .map(|r| {
            r.map(|mut i| {
                i.authors = authors.remove(&i.id).unwrap_or_default();
                i.biblio.editors = editors.remove(&i.id).unwrap_or_default();
                i.tags = tags.remove(&i.id).unwrap_or_default();
                i.project_ids = projects.remove(&i.id).unwrap_or_default();
                i
            })
        })
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

/// Every paper not in the Trash, newest first.
pub fn list_items(conn: &Connection) -> Result<Vec<Item>> {
    load_items(conn, "deleted_at IS NULL", "date_added DESC, id DESC")
}

/// Duplicate lookup: DOI, then arXiv ID, then fuzzy title within one year.
pub fn find_duplicate(conn: &Connection, input: &ItemInput) -> Result<Option<i64>> {
    if let Some(d) = clean(&input.doi).and_then(|d| normalize_doi(&d)) {
        if let Some(id) = conn
            .query_row("SELECT id FROM items WHERE doi = ?1", [d], |r| r.get(0))
            .optional()?
        {
            return Ok(Some(id));
        }
    }
    if let Some(a) = clean(&input.arxiv_id).and_then(|a| normalize_arxiv(&a)) {
        if let Some(id) = conn
            .query_row("SELECT id FROM items WHERE arxiv_id = ?1", [a], |r| r.get(0))
            .optional()?
        {
            return Ok(Some(id));
        }
    }
    let norm = normalize_title(&input.title);
    if norm.is_empty() {
        return Ok(None);
    }
    let mut stmt =
        conn.prepare("SELECT id, title_norm FROM items WHERE ?1 IS NULL OR year IS NULL OR abs(year - ?1) <= 1")?;
    let mut best: Option<(f64, i64)> = None;
    for row in stmt.query_map([input.year], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
        let (id, t) = row?;
        let s = title_similarity(&norm, &t);
        if s >= FUZZY_THRESHOLD && best.is_none_or(|(b, _)| s > b) {
            best = Some((s, id));
        }
    }
    Ok(best.map(|(_, id)| id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn paper(title: &str, year: i32) -> ItemInput {
        ItemInput {
            title: title.into(),
            year: Some(year),
            authors: vec![Author::new("Vaswani", "Ashish"), Author::new("Shazeer", "Noam")],
            ..Default::default()
        }
    }

    #[test]
    fn changing_a_citekey_keeps_note_links() {
        let mut db = Db::open_in_memory().unwrap();
        let (a, b) = db
            .tx(|c| {
                Ok((
                    insert_item(c, &paper("Attention", 2017))?,
                    insert_item(c, &paper("BERT", 2019))?,
                ))
            })
            .unwrap();
        let old = get_item(&db.conn, a).unwrap().unwrap().citekey;
        let note = crate::notes::paper_note(&db.conn, b).unwrap();
        db.tx(|c| crate::notes::save_body(c, note.id, &format!("- builds on [[{old}]] and @{old}")))
            .unwrap();
        let mut input = to_input(&get_item(&db.conn, a).unwrap().unwrap());
        input.citekey = Some("fischer2013three".into());
        db.tx(|c| update_item(c, a, &input)).unwrap();
        let body = crate::notes::get(&db.conn, note.id).unwrap().body;
        assert_eq!(body, "- builds on [[fischer2013three]] and @fischer2013three");
        let back = crate::notes::backlinks_to_item(&db.conn, a).unwrap();
        assert_eq!(back.len(), 1, "the note still links to the paper");
    }

    #[test]
    fn deleting_for_good_removes_only_files_nobody_else_uses() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Db::open_in_memory().unwrap();
        let (a, b) = db
            .tx(|c| Ok((insert_item(c, &paper("A", 2017))?, insert_item(c, &paper("B", 2018))?)))
            .unwrap();
        // A has its own PDF and shares another with B
        for (id, hash) in [(a, "own"), (a, "shared"), (b, "shared")] {
            db.conn
                .execute(
                    "INSERT INTO attachments(item_id, kind, content_hash) VALUES (?1, 'pdf', ?2)",
                    params![id, hash],
                )
                .unwrap();
            std::fs::write(dir.path().join(format!("{hash}.pdf")), b"%PDF").unwrap();
        }
        trash(&db.conn, &[a]).unwrap();
        let ids = trash_ids(&db.conn, None).unwrap();
        assert_eq!(ids, vec![a]);
        assert!(trash_ids(&db.conn, Some(30)).unwrap().is_empty(), "just trashed");
        let files = db.tx(|c| delete_for_good(c, &ids)).unwrap();
        assert_eq!(files, vec![("own".to_string(), "pdf".to_string())]);
        assert_eq!(crate::attachments::remove_stored_files(dir.path(), &files), 1);
        assert!(!dir.path().join("own.pdf").exists());
        assert!(dir.path().join("shared.pdf").exists(), "B still uses it");
        assert!(get_item(&db.conn, a).unwrap().is_none());
    }

    #[test]
    fn insert_creates_item_authors_and_one_paper_note() {
        let mut db = Db::open_in_memory().unwrap();
        let id = db
            .tx(|c| insert_item(c, &paper("Attention Is All You Need", 2017)))
            .unwrap();
        let item = get_item(&db.conn, id).unwrap().unwrap();
        assert_eq!(item.citekey, "vaswani2017attention");
        assert_eq!(item.authors.len(), 2);
        assert_eq!(item.read_status, "unread");
        let notes: i64 = db
            .conn
            .query_row(
                "SELECT count(*) FROM notes WHERE kind='paper_note' AND item_id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(notes, 1);
        let dup = db
            .conn
            .execute("INSERT INTO notes(kind, item_id) VALUES ('paper_note', ?1)", [id]);
        assert!(dup.is_err(), "a second paper note must be rejected");
    }

    #[test]
    fn citekeys_are_unique() {
        let mut db = Db::open_in_memory().unwrap();
        db.tx(|c| insert_item(c, &paper("Attention Is All You Need", 2017)))
            .unwrap();
        let b = db.tx(|c| insert_item(c, &paper("Attention again", 2017))).unwrap();
        assert_eq!(get_item(&db.conn, b).unwrap().unwrap().citekey, "vaswani2017attentiona");
    }

    #[test]
    fn duplicates_by_doi_arxiv_and_fuzzy_title() {
        let mut db = Db::open_in_memory().unwrap();
        let mut a = paper("Attention Is All You Need", 2017);
        a.doi = Some("https://doi.org/10.5555/3295222".into());
        a.arxiv_id = Some("arXiv:1706.03762v5".into());
        let id = db.tx(|c| insert_item(c, &a)).unwrap();

        let by_doi = ItemInput {
            title: "x".into(),
            doi: Some("10.5555/3295222".into()),
            ..Default::default()
        };
        assert_eq!(find_duplicate(&db.conn, &by_doi).unwrap(), Some(id));
        let by_arxiv = ItemInput {
            title: "x".into(),
            arxiv_id: Some("1706.03762".into()),
            ..Default::default()
        };
        assert_eq!(find_duplicate(&db.conn, &by_arxiv).unwrap(), Some(id));
        assert_eq!(
            find_duplicate(&db.conn, &paper("attention is all you need.", 2018)).unwrap(),
            Some(id)
        );
        assert_eq!(
            find_duplicate(&db.conn, &paper("attention is all you need", 2021)).unwrap(),
            None
        );
        assert_eq!(
            find_duplicate(&db.conn, &paper("Deep residual learning", 2017)).unwrap(),
            None
        );
    }

    #[test]
    fn merge_fills_only_empty_fields() {
        let mut db = Db::open_in_memory().unwrap();
        let id = db
            .tx(|c| insert_item(c, &paper("Attention Is All You Need", 2017)))
            .unwrap();
        let incoming = ItemInput {
            title: "Different title".into(),
            venue: Some("NeurIPS".into()),
            doi: Some("10.1/abc".into()),
            ..Default::default()
        };
        db.tx(|c| merge_into(c, id, &incoming)).unwrap();
        let i = get_item(&db.conn, id).unwrap().unwrap();
        assert_eq!(i.title, "Attention Is All You Need");
        assert_eq!(i.venue.as_deref(), Some("NeurIPS"));
        assert_eq!(i.doi.as_deref(), Some("10.1/abc"));
    }

    #[test]
    fn update_validates_and_reports_conflicts() {
        let mut db = Db::open_in_memory().unwrap();
        let a = db.tx(|c| insert_item(c, &paper("One", 2020))).unwrap();
        let b = db.tx(|c| insert_item(c, &paper("Two", 2020))).unwrap();
        let mut input = to_input(&get_item(&db.conn, b).unwrap().unwrap());
        input.citekey = Some(get_item(&db.conn, a).unwrap().unwrap().citekey);
        let err = db.tx(|c| update_item(c, b, &input)).unwrap_err();
        assert_eq!(err.to_string(), "Another item already uses this citekey");
        input.citekey = None;
        input.read_status = Some("reading".into());
        input.rating = Some(4);
        db.tx(|c| update_item(c, b, &input)).unwrap();
        let i = get_item(&db.conn, b).unwrap().unwrap();
        assert_eq!((i.read_status.as_str(), i.rating), ("reading", Some(4)));
        input.rating = Some(9);
        assert!(db.tx(|c| update_item(c, b, &input)).is_err());
    }

    #[test]
    fn delete_cascades() {
        let mut db = Db::open_in_memory().unwrap();
        let id = db.tx(|c| insert_item(c, &paper("One", 2020))).unwrap();
        db.tx(|c| delete_item(c, id)).unwrap();
        let notes: i64 = db
            .conn
            .query_row("SELECT count(*) FROM notes", [], |r| r.get(0))
            .unwrap();
        assert_eq!(notes, 0);
        assert_eq!(list_items(&db.conn).unwrap().len(), 0);
    }
}
