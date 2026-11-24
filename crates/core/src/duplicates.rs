//! Duplicates already in the library: find groups, merge them, or mark them as distinct.
use crate::items::{get_item, list_items, to_input, trash, update_item, FUZZY_THRESHOLD};
use crate::text::title_similarity;
use crate::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub ids: Vec<i64>,
    /// "same PDF" | "same title"
    pub reason: String,
}

fn dismissed(conn: &Connection) -> Result<HashSet<(i64, i64)>> {
    let mut stmt = conn.prepare("SELECT a, b FROM dismissed_duplicates")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

fn find(parent: &mut HashMap<i64, i64>, x: i64) -> i64 {
    let p = *parent.get(&x).unwrap_or(&x);
    if p == x {
        return x;
    }
    let r = find(parent, p);
    parent.insert(x, r);
    r
}

/// Groups of papers (not in the Trash) that look like the same work.
pub fn find_groups(conn: &Connection) -> Result<Vec<DuplicateGroup>> {
    let items = list_items(conn)?;
    let skip = dismissed(conn)?;
    let pair = |a: i64, b: i64| if a < b { (a, b) } else { (b, a) };
    let mut edges: Vec<(i64, i64, &str)> = Vec::new();

    // same PDF content
    let mut by_hash: HashMap<String, Vec<i64>> = HashMap::new();
    let mut stmt = conn.prepare(
        "SELECT a.content_hash, a.item_id FROM attachments a JOIN items i ON i.id = a.item_id WHERE i.deleted_at IS NULL",
    )?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
        let (h, id) = row?;
        by_hash.entry(h).or_default().push(id);
    }
    for ids in by_hash.values() {
        for w in ids.windows(2) {
            if w[0] != w[1] {
                edges.push((w[0], w[1], "same PDF"));
            }
        }
    }

    // near-identical titles within a year, via an index on distinctive words
    let norm: Vec<(i64, String, Option<i32>)> = items
        .iter()
        .map(|i| (i.id, crate::text::normalize_title(&i.title), i.year))
        .collect();
    let mut by_word: HashMap<&str, Vec<usize>> = HashMap::new();
    for (n, (_, t, _)) in norm.iter().enumerate() {
        for w in t.split_whitespace().filter(|w| w.len() >= 4) {
            by_word.entry(w).or_default().push(n);
        }
    }
    for (n, (id, t, y)) in norm.iter().enumerate() {
        let Some(cands) = t
            .split_whitespace()
            .filter(|w| w.len() >= 4)
            .filter_map(|w| by_word.get(w))
            .min_by_key(|v| v.len())
        else {
            continue;
        };
        let short = t.split_whitespace().count() < 4;
        for &m in cands.iter().filter(|&&m| m > n) {
            let (oid, ot, oy) = &norm[m];
            if let (Some(a), Some(b)) = (y, oy) {
                if (a - b).abs() > 1 {
                    continue;
                }
            }
            let same = if short {
                t == ot
            } else {
                title_similarity(t, ot) >= FUZZY_THRESHOLD
            };
            if same {
                edges.push((*id, *oid, "same title"));
            }
        }
    }

    let mut parent: HashMap<i64, i64> = HashMap::new();
    let mut reason: HashMap<i64, &str> = HashMap::new();
    for (a, b, why) in edges {
        if skip.contains(&pair(a, b)) {
            continue;
        }
        let (ra, rb) = (find(&mut parent, a), find(&mut parent, b));
        if ra != rb {
            parent.insert(ra, rb);
        }
        reason.insert(a, why);
        reason.insert(b, why);
    }
    let mut groups: HashMap<i64, Vec<i64>> = HashMap::new();
    let members: Vec<i64> = parent
        .keys()
        .copied()
        .collect::<HashSet<_>>()
        .into_iter()
        .chain(parent.values().copied())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    for id in members {
        let r = find(&mut parent, id);
        groups.entry(r).or_default().push(id);
    }
    let mut out: Vec<DuplicateGroup> = groups
        .into_values()
        .filter(|g| g.len() > 1)
        .map(|mut ids| {
            ids.sort();
            let why = if ids.iter().any(|i| reason.get(i) == Some(&"same PDF")) {
                "same PDF"
            } else {
                "same title"
            };
            DuplicateGroup {
                ids,
                reason: why.into(),
            }
        })
        .collect();
    out.sort_by_key(|g| g.ids[0]);
    Ok(out)
}

/// Marks every pair in the group as "not duplicates".
pub fn dismiss(conn: &Connection, ids: &[i64]) -> Result<()> {
    for (n, a) in ids.iter().enumerate() {
        for b in &ids[n + 1..] {
            let (x, y) = if a < b { (*a, *b) } else { (*b, *a) };
            conn.execute(
                "INSERT OR IGNORE INTO dismissed_duplicates(a, b) VALUES (?1, ?2)",
                params![x, y],
            )?;
        }
    }
    Ok(())
}

const STATUS_RANK: [&str; 3] = ["unread", "reading", "read"];

/// Merges `others` into `master`: empty fields are filled, tags, projects, notes, files,
/// highlights and citation links move over, and the others go to the Trash (recoverable).
pub fn merge(conn: &Connection, master: i64, others: &[i64]) -> Result<()> {
    let m = get_item(conn, master)?.ok_or_else(|| Error::msg("Item not found"))?;
    let mut merged = to_input(&m);
    for &o in others.iter().filter(|&&o| o != master) {
        let other = get_item(conn, o)?.ok_or_else(|| Error::msg("Item not found"))?;
        let mut incoming = to_input(&other);
        incoming.citekey = None;
        // identifiers are unique: free them on the other paper before the master takes them
        if merged.doi.is_none() && other.doi.is_some() {
            conn.execute("UPDATE items SET doi = NULL WHERE id = ?1", [o])?;
        } else {
            incoming.doi = None;
        }
        if merged.arxiv_id.is_none() && other.arxiv_id.is_some() {
            conn.execute("UPDATE items SET arxiv_id = NULL WHERE id = ?1", [o])?;
        } else {
            incoming.arxiv_id = None;
        }
        merged.fill_from(&incoming);
        let rank = |s: &str| STATUS_RANK.iter().position(|x| *x == s).unwrap_or(0);
        if rank(&other.read_status) > rank(merged.read_status.as_deref().unwrap_or("unread")) {
            merged.read_status = Some(other.read_status.clone());
        }
        merged.rating = merged.rating.max(other.rating);

        conn.execute(
            "INSERT OR IGNORE INTO item_tags(item_id, tag_id) SELECT ?1, tag_id FROM item_tags WHERE item_id = ?2",
            params![master, o],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO project_items(project_id, item_id, position, status) SELECT project_id, ?1, position, status FROM project_items WHERE item_id = ?2",
            params![master, o],
        )?;
        // paper note: append the other's bullets
        let other_body: String = conn
            .query_row(
                "SELECT body FROM notes WHERE kind = 'paper_note' AND item_id = ?1",
                [o],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or_default();
        if !other_body.trim().is_empty() {
            let mine = crate::notes::paper_note(conn, master)?;
            if !mine.body.contains(other_body.trim()) {
                let body = if mine.body.trim().is_empty() {
                    other_body.clone()
                } else {
                    format!("{}\n{}", mine.body.trim_end(), other_body.trim_end())
                };
                crate::notes::save_body(conn, mine.id, &body)?;
            }
        }
        conn.execute(
            "UPDATE notes SET item_id = ?1 WHERE item_id = ?2 AND kind <> 'paper_note'",
            params![master, o],
        )?;
        // files: move new ones; for the same file, move highlights onto the master's copy
        let mut stmt = conn.prepare("SELECT id, content_hash FROM attachments WHERE item_id = ?1")?;
        let atts: Vec<(i64, String)> = stmt
            .query_map([o], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<_, _>>()?;
        for (aid, hash) in atts {
            let existing: Option<i64> = conn
                .query_row(
                    "SELECT id FROM attachments WHERE item_id = ?1 AND content_hash = ?2",
                    params![master, hash],
                    |r| r.get(0),
                )
                .optional()?;
            match existing {
                Some(keep) => {
                    conn.execute(
                        "UPDATE highlights SET attachment_id = ?1 WHERE attachment_id = ?2",
                        params![keep, aid],
                    )?;
                    conn.execute("DELETE FROM attachments WHERE id = ?1", [aid])?;
                }
                None => {
                    conn.execute(
                        "UPDATE attachments SET item_id = ?1 WHERE id = ?2",
                        params![master, aid],
                    )?;
                }
            }
        }
        // citation links and the reference cache
        conn.execute(
            "INSERT OR IGNORE INTO citation_edges(citing_item_id, cited_item_id, source, is_manual, is_suppressed, created_at)
             SELECT ?1, cited_item_id, source, is_manual, is_suppressed, created_at FROM citation_edges WHERE citing_item_id = ?2 AND cited_item_id <> ?1",
            params![master, o],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO citation_edges(citing_item_id, cited_item_id, source, is_manual, is_suppressed, created_at)
             SELECT citing_item_id, ?1, source, is_manual, is_suppressed, created_at FROM citation_edges WHERE cited_item_id = ?2 AND citing_item_id <> ?1",
            params![master, o],
        )?;
        conn.execute(
            "DELETE FROM citation_edges WHERE citing_item_id = ?1 OR cited_item_id = ?1",
            [o],
        )?;
        // typed connections ("extends", ...) move too
        crate::relations::move_to(conn, master, o)?;
        crate::spine::move_to(conn, master, o)?;
        conn.execute(
            "UPDATE reference_cache SET item_id = ?1 WHERE item_id = ?2 AND NOT EXISTS (SELECT 1 FROM reference_cache WHERE item_id = ?1)",
            params![master, o],
        )?;
        conn.execute(
            "UPDATE note_links SET target_item_id = ?1 WHERE target_item_id = ?2",
            params![master, o],
        )?;
        trash(conn, &[o])?;
    }
    update_item(conn, master, &merged)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::attachments::{add_attachment, StoredFile};
    use crate::db::Db;
    use crate::items::insert_item;
    use crate::model::{Author, ItemInput};

    fn add(db: &mut Db, title: &str, year: i32, doi: Option<&str>) -> i64 {
        db.tx(|c| {
            insert_item(
                c,
                &ItemInput {
                    title: title.into(),
                    year: Some(year),
                    doi: doi.map(Into::into),
                    authors: vec![Author::new("A", "B")],
                    ..Default::default()
                },
            )
        })
        .unwrap()
    }

    #[test]
    fn finds_groups_and_respects_dismissals() {
        let mut db = Db::open_in_memory().unwrap();
        let a = add(&mut db, "Attention Is All You Need", 2017, None);
        let b = add(&mut db, "Attention is all you need.", 2018, Some("10.1/x"));
        let c = add(&mut db, "Deep learning", 2015, None);
        let d = add(&mut db, "Deep learning", 2015, None);
        let e = add(&mut db, "Deep learning", 2001, None);
        let f = add(&mut db, "Graph networks", 2020, None);
        let g = add(&mut db, "A different paper", 2020, None);
        db.tx(|cn| {
            for id in [f, g] {
                add_attachment(
                    cn,
                    id,
                    &StoredFile {
                        hash: "same".into(),
                        size: 1,
                        filename: "x.pdf".into(),
                    },
                    None,
                )?;
            }
            Ok(())
        })
        .unwrap();
        let groups = find_groups(&db.conn).unwrap();
        let ids: Vec<Vec<i64>> = groups.iter().map(|g| g.ids.clone()).collect();
        assert_eq!(ids, vec![vec![a, b], vec![c, d], vec![f, g]]);
        assert_eq!(groups[2].reason, "same PDF");
        assert!(!ids.iter().flatten().any(|x| *x == e), "years too far apart");
        db.tx(|cn| dismiss(cn, &[c, d])).unwrap();
        assert_eq!(find_groups(&db.conn).unwrap().len(), 2);
    }

    #[test]
    fn merge_moves_everything_and_trashes_the_other() {
        let mut db = Db::open_in_memory().unwrap();
        let master = add(&mut db, "Attention Is All You Need", 2017, None);
        let other = add(&mut db, "Attention is all you need", 2017, Some("10.1/attn"));
        let third = add(&mut db, "Cites the other", 2019, None);
        db.tx(|c| {
            crate::tags::tag_items(c, &[other], &["ml".into()])?;
            let p = crate::projects::create(c, "Thesis", None)?;
            crate::projects::add_items(c, p, &[other])?;
            let n = crate::notes::paper_note(c, other)?;
            crate::notes::save_body(c, n.id, "- from the duplicate")?;
            add_attachment(
                c,
                other,
                &StoredFile {
                    hash: "h1".into(),
                    size: 1,
                    filename: "a.pdf".into(),
                },
                None,
            )?;
            c.execute(
                "INSERT INTO citation_edges(citing_item_id, cited_item_id, source) VALUES (?1, ?2, 'openalex')",
                params![third, other],
            )?;
            c.execute(
                "UPDATE items SET read_status = 'read', rating = 4 WHERE id = ?1",
                [other],
            )?;
            Ok(())
        })
        .unwrap();
        db.tx(|c| merge(c, master, &[other])).unwrap();
        let m = get_item(&db.conn, master).unwrap().unwrap();
        assert_eq!(m.doi.as_deref(), Some("10.1/attn"));
        assert_eq!((m.read_status.as_str(), m.rating), ("read", Some(4)));
        assert_eq!(m.tags, vec!["ml"]);
        assert_eq!(m.project_ids.len(), 1);
        assert!(m.has_pdf);
        assert_eq!(
            crate::notes::paper_note(&db.conn, master).unwrap().body,
            "- from the duplicate"
        );
        let edge: i64 = db
            .conn
            .query_row(
                "SELECT count(*) FROM citation_edges WHERE citing_item_id = ?1 AND cited_item_id = ?2",
                params![third, master],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(edge, 1);
        let o = get_item(&db.conn, other).unwrap().unwrap();
        assert!(o.deleted_at.is_some(), "the duplicate is in the Trash, recoverable");
        assert!(find_groups(&db.conn).unwrap().is_empty());
    }
}
