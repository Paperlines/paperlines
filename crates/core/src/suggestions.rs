//! The Suggestions inbox: papers an assistant proposed for a project. Nothing here is in the
//! library; the user adds (through the normal import review) or dismisses each one. A paper is
//! suggested once per project: dismissed ones are kept so they don't come back.
use crate::text::{normalize_arxiv, normalize_doi, normalize_title};
use crate::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSuggestion {
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub title: String,
    pub authors: Option<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    /// Why it fits, in a sentence ("cited by 4 of your project papers").
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub id: i64,
    pub project_id: Option<i64>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub title: String,
    pub authors: Option<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub reason: Option<String>,
    /// new | added | dismissed
    pub status: String,
    pub created_at: String,
}

/// What identifies the paper: its DOI, else its arXiv ID, else its title.
pub fn key_of(s: &NewSuggestion) -> Option<String> {
    if let Some(d) = s.doi.as_deref().and_then(normalize_doi) {
        return Some(format!("doi:{d}"));
    }
    if let Some(a) = s.arxiv_id.as_deref().and_then(normalize_arxiv) {
        return Some(format!("arxiv:{a}"));
    }
    let t = normalize_title(&s.title);
    (!t.is_empty()).then(|| format!("title:{t}"))
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Added {
    pub added: usize,
    /// Already suggested for this project (still waiting, added or dismissed).
    pub skipped: usize,
}

/// Puts papers in a project's inbox (or the library's, `project` None), skipping ones already
/// suggested there and ones without a DOI, arXiv ID or title.
pub fn add_many(conn: &Connection, project: Option<i64>, list: &[NewSuggestion]) -> Result<Added> {
    let mut r = Added::default();
    for s in list {
        let Some(key) = key_of(s) else {
            r.skipped += 1;
            continue;
        };
        if s.title.trim().is_empty() {
            r.skipped += 1;
            continue;
        }
        let n = conn.execute(
            "INSERT OR IGNORE INTO suggestions(project_id, key, doi, arxiv_id, title, authors, year, venue, reason)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                project,
                key,
                s.doi.as_deref().and_then(normalize_doi),
                s.arxiv_id.as_deref().and_then(normalize_arxiv),
                s.title.trim(),
                s.authors.as_deref().map(str::trim).filter(|a| !a.is_empty()),
                s.year,
                s.venue.as_deref().map(str::trim).filter(|v| !v.is_empty()),
                s.reason.as_deref().map(str::trim).filter(|v| !v.is_empty()),
            ],
        )?;
        if n == 1 {
            r.added += 1;
        } else {
            r.skipped += 1;
        }
    }
    Ok(r)
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<Suggestion> {
    Ok(Suggestion {
        id: r.get(0)?,
        project_id: r.get(1)?,
        doi: r.get(2)?,
        arxiv_id: r.get(3)?,
        title: r.get(4)?,
        authors: r.get(5)?,
        year: r.get(6)?,
        venue: r.get(7)?,
        reason: r.get(8)?,
        status: r.get(9)?,
        created_at: r.get(10)?,
    })
}

const COLS: &str = "id, project_id, doi, arxiv_id, title, authors, year, venue, reason, status, created_at";

/// A project's suggestions with that status (None: all), newest first.
pub fn list(conn: &Connection, project: Option<i64>, status: Option<&str>) -> Result<Vec<Suggestion>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM suggestions
         WHERE coalesce(project_id, 0) = coalesce(?1, 0) AND (?2 IS NULL OR status = ?2)
         ORDER BY created_at DESC, id DESC"
    ))?;
    let out = stmt
        .query_map(params![project, status], row)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(out)
}

/// Every suggestion (for the dump), oldest first.
pub fn all(conn: &Connection) -> Result<Vec<Suggestion>> {
    let mut stmt = conn.prepare(&format!("SELECT {COLS} FROM suggestions ORDER BY id"))?;
    let out = stmt.query_map([], row)?.collect::<rusqlite::Result<_>>()?;
    Ok(out)
}

pub fn get(conn: &Connection, id: i64) -> Result<Suggestion> {
    conn.query_row(&format!("SELECT {COLS} FROM suggestions WHERE id = ?1"), [id], row)
        .optional()?
        .ok_or_else(|| Error::msg("Suggestion not found"))
}

pub fn set_status(conn: &Connection, id: i64, status: &str) -> Result<()> {
    if !matches!(status, "new" | "added" | "dismissed") {
        return Err(Error::msg(format!("Unknown status: {status}")));
    }
    if conn.execute("UPDATE suggestions SET status = ?2 WHERE id = ?1", params![id, status])? == 0 {
        return Err(Error::msg("Suggestion not found"));
    }
    Ok(())
}

/// Suggestions whose paper has since been imported count as added.
pub fn mark_imported(conn: &Connection) -> Result<usize> {
    Ok(conn.execute(
        "UPDATE suggestions SET status = 'added' WHERE status = 'new' AND (
           (doi IS NOT NULL AND doi IN (SELECT lower(doi) FROM items WHERE deleted_at IS NULL AND doi IS NOT NULL))
           OR (arxiv_id IS NOT NULL AND arxiv_id IN (SELECT arxiv_id FROM items WHERE deleted_at IS NULL AND arxiv_id IS NOT NULL)))",
        [],
    )?)
}

/// Waiting suggestions per project (project id → count; library-wide under 0).
pub fn count_new(conn: &Connection) -> Result<Vec<(i64, i64)>> {
    let mut stmt =
        conn.prepare("SELECT coalesce(project_id, 0), count(*) FROM suggestions WHERE status = 'new' GROUP BY 1")?;
    let out = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(out)
}

/// Keys already suggested for a project, whatever their status: a recommender skips these.
pub fn known_keys(conn: &Connection, project: Option<i64>) -> Result<std::collections::HashSet<String>> {
    let mut stmt = conn.prepare("SELECT key FROM suggestions WHERE coalesce(project_id, 0) = coalesce(?1, 0)")?;
    let out = stmt
        .query_map(params![project], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::projects;

    fn s(doi: Option<&str>, title: &str) -> NewSuggestion {
        NewSuggestion {
            doi: doi.map(String::from),
            title: title.into(),
            reason: Some("cited by 3 of your papers".into()),
            ..Default::default()
        }
    }

    #[test]
    fn an_inbox_per_project_that_never_repeats_itself() {
        let db = Db::open_in_memory().unwrap();
        let c = &db.conn;
        let p = projects::create(c, "Thesis", None).unwrap();
        let r = add_many(
            c,
            Some(p),
            &[
                s(Some("10.1/A"), "Paper A"),
                s(Some("https://doi.org/10.1/a"), "Paper A again"),
                s(None, "Paper B"),
                s(None, "  "),
            ],
        )
        .unwrap();
        assert_eq!(
            r,
            Added { added: 2, skipped: 2 },
            "same DOI once; an empty title is no paper"
        );
        let new = list(c, Some(p), Some("new")).unwrap();
        assert_eq!(new.len(), 2);
        assert_eq!(count_new(c).unwrap(), vec![(p, 2)]);
        // dismissed stays dismissed: suggesting it again does nothing
        let a = new.iter().find(|x| x.doi.as_deref() == Some("10.1/a")).unwrap();
        set_status(c, a.id, "dismissed").unwrap();
        assert_eq!(add_many(c, Some(p), &[s(Some("10.1/A"), "Paper A")]).unwrap().added, 0);
        assert!(known_keys(c, Some(p)).unwrap().contains("doi:10.1/a"));
        assert_eq!(list(c, Some(p), Some("new")).unwrap().len(), 1);
        // another project, or the library as a whole, has its own inbox
        assert_eq!(add_many(c, None, &[s(Some("10.1/A"), "Paper A")]).unwrap().added, 1);
        assert_eq!(list(c, None, None).unwrap().len(), 1);
        assert!(set_status(c, a.id, "maybe").is_err());
        // importing a suggested paper marks it added
        crate::items::insert_item(
            c,
            &crate::model::ItemInput {
                title: "Paper B".into(),
                doi: Some("10.1/NEW".into()),
                ..Default::default()
            },
        )
        .unwrap();
        add_many(c, Some(p), &[s(Some("10.1/new"), "Paper B")]).unwrap();
        assert_eq!(mark_imported(c).unwrap(), 1);
        assert!(list(c, Some(p), Some("new"))
            .unwrap()
            .iter()
            .all(|x| x.doi.as_deref() != Some("10.1/new")));
        // deleting the project empties its inbox
        projects::delete(c, p).unwrap();
        assert!(list(c, Some(p), None).unwrap().is_empty());
    }
}
