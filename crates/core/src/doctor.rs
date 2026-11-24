//! `doctor`: integrity checks with safe repairs. Repairs never delete user data: orphaned PDFs
//! are moved to `pdfs/orphaned/`, not removed.
use crate::attachments::stored_file_path;
use crate::paths::LibraryPaths;
use crate::Result;
use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    /// integrity | foreign-keys | missing-pdf | orphaned-pdf | dangling-edge | search-index | paper-note
    pub kind: String,
    pub detail: String,
    pub fixable: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub items: i64,
    pub pdfs: i64,
    pub edges: i64,
    pub issues: Vec<Issue>,
    pub fixed: Vec<String>,
}

impl Report {
    pub fn ok(&self) -> bool {
        self.issues.is_empty()
    }
}

fn count(conn: &Connection, sql: &str) -> Result<i64> {
    Ok(conn.query_row(sql, [], |r| r.get(0))?)
}

fn issue(kind: &str, detail: String, fixable: bool) -> Issue {
    Issue {
        kind: kind.into(),
        detail,
        fixable,
    }
}

pub fn check(conn: &Connection, lib: &LibraryPaths, fix: bool) -> Result<Report> {
    let mut r = Report {
        items: count(conn, "SELECT count(*) FROM items")?,
        pdfs: count(conn, "SELECT count(*) FROM attachments WHERE kind = 'pdf'")?,
        edges: count(conn, "SELECT count(*) FROM citation_edges WHERE is_suppressed = 0")?,
        ..Default::default()
    };

    let integrity: Vec<String> = conn
        .prepare("PRAGMA integrity_check")?
        .query_map([], |x| x.get(0))?
        .collect::<std::result::Result<_, _>>()?;
    if integrity != ["ok"] {
        r.issues.push(issue(
            "integrity",
            format!("SQLite reports: {}. Restore a backup.", integrity.join("; ")),
            false,
        ));
    }
    let fk: i64 = conn
        .prepare("PRAGMA foreign_key_check")?
        .query_map([], |_| Ok(()))?
        .count() as i64;
    if fk > 0 {
        r.issues
            .push(issue("foreign-keys", format!("{fk} rows point at missing rows"), false));
    }

    // attachments (PDF and EPUB) vs files on disk
    let mut stmt =
        conn.prepare("SELECT a.content_hash, i.citekey, a.kind FROM attachments a JOIN items i ON i.id = a.item_id")?;
    let referenced: Vec<(String, String, String)> = stmt
        .query_map([], |x| Ok((x.get(0)?, x.get(1)?, x.get(2)?)))?
        .collect::<std::result::Result<_, _>>()?;
    for (hash, key, kind) in &referenced {
        if !stored_file_path(&lib.pdfs, hash, kind).exists() {
            r.issues.push(issue(
                "missing-pdf",
                format!("{key}: {} file {hash} is missing", kind.to_uppercase()),
                false,
            ));
        }
    }
    let known: HashSet<&str> = referenced.iter().map(|(h, _, _)| h.as_str()).collect();
    if let Ok(rd) = fs::read_dir(&lib.pdfs) {
        for e in rd.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            let Some(hash) = name.strip_suffix(".pdf").or_else(|| name.strip_suffix(".epub")) else {
                continue;
            };
            if p.is_file() && !known.contains(hash) {
                if fix {
                    let dest = lib.pdfs.join("orphaned");
                    fs::create_dir_all(&dest)?;
                    fs::rename(&p, dest.join(&name))?;
                    r.fixed.push(format!("moved unreferenced {name} to pdfs/orphaned/"));
                } else {
                    r.issues.push(issue(
                        "orphaned-pdf",
                        format!("{name} is not attached to any paper"),
                        true,
                    ));
                }
            }
        }
    }

    // edges whose ends are gone (foreign keys should prevent this; checked anyway)
    let dangling = count(
        conn,
        "SELECT count(*) FROM citation_edges e WHERE NOT EXISTS (SELECT 1 FROM items WHERE id = e.citing_item_id)
           OR NOT EXISTS (SELECT 1 FROM items WHERE id = e.cited_item_id)",
    )?;
    if dangling > 0 {
        if fix {
            conn.execute(
                "DELETE FROM citation_edges WHERE NOT EXISTS (SELECT 1 FROM items WHERE id = citing_item_id)
                   OR NOT EXISTS (SELECT 1 FROM items WHERE id = cited_item_id)",
                [],
            )?;
            r.fixed.push(format!("removed {dangling} dangling citation edges"));
        } else {
            r.issues.push(issue(
                "dangling-edge",
                format!("{dangling} citation edges point at deleted papers"),
                true,
            ));
        }
    }

    // search index: one row per item
    let fts = count(conn, "SELECT count(*) FROM items_fts")?;
    let fts_ok = conn
        .execute("INSERT INTO items_fts(items_fts) VALUES ('integrity-check')", [])
        .is_ok();
    if fts != r.items || !fts_ok {
        if fix {
            conn.execute_batch(
                "DELETE FROM items_fts;
                 INSERT INTO items_fts(rowid, title, authors, abstract, notes, meta)
                 SELECT id, title, authors, abstract, notes, meta FROM item_search_doc;",
            )?;
            r.fixed.push("rebuilt the search index".into());
        } else {
            r.issues.push(issue(
                "search-index",
                format!("search index has {fts} entries for {} papers", r.items),
                true,
            ));
        }
    }

    let missing_notes = count(conn, "SELECT count(*) FROM items i WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.kind = 'paper_note' AND n.item_id = i.id)")?;
    if missing_notes > 0 {
        if fix {
            conn.execute(
                "INSERT INTO notes(kind, item_id) SELECT 'paper_note', i.id FROM items i
                 WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.kind = 'paper_note' AND n.item_id = i.id)",
                [],
            )?;
            r.fixed.push(format!("created {missing_notes} missing paper notes"));
        } else {
            r.issues.push(issue(
                "paper-note",
                format!("{missing_notes} papers have no paper note"),
                true,
            ));
        }
    }
    Ok(r)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::attachments::{add_attachment, store_pdf};
    use crate::db::Db;
    use crate::items::insert_item;
    use crate::model::ItemInput;

    #[test]
    fn finds_and_fixes_problems_without_deleting_files() {
        let dir = tempfile::tempdir().unwrap();
        let lib = LibraryPaths::new(dir.path());
        lib.ensure().unwrap();
        let mut db = Db::open(&lib.db).unwrap();
        let src = dir.path().join("a.pdf");
        fs::write(&src, b"%PDF-1.4 a").unwrap();
        let id = db
            .tx(|c| {
                let id = insert_item(
                    c,
                    &ItemInput {
                        title: "Paper".into(),
                        ..Default::default()
                    },
                )?;
                add_attachment(c, id, &store_pdf(&lib.pdfs, &src)?, None)?;
                Ok(id)
            })
            .unwrap();
        assert!(check(&db.conn, &lib, false).unwrap().ok());

        fs::write(lib.pdfs.join("deadbeef.pdf"), b"x").unwrap();
        db.conn.execute("DELETE FROM notes WHERE item_id = ?1", [id]).unwrap();
        db.conn.execute("DELETE FROM items_fts", []).unwrap();
        let r = check(&db.conn, &lib, false).unwrap();
        let kinds: Vec<&str> = r.issues.iter().map(|i| i.kind.as_str()).collect();
        assert_eq!(kinds, vec!["orphaned-pdf", "search-index", "paper-note"]);

        let fixed = check(&db.conn, &lib, true).unwrap();
        assert_eq!(fixed.fixed.len(), 3);
        assert!(
            lib.pdfs.join("orphaned").join("deadbeef.pdf").exists(),
            "moved, not deleted"
        );
        assert!(check(&db.conn, &lib, false).unwrap().ok());

        let stored = fs::read_dir(&lib.pdfs)
            .unwrap()
            .flatten()
            .find(|e| e.path().is_file())
            .unwrap()
            .path();
        fs::remove_file(stored).unwrap();
        let r = check(&db.conn, &lib, true).unwrap();
        assert_eq!(r.issues[0].kind, "missing-pdf");
        assert!(!r.issues[0].fixable);
    }
}
