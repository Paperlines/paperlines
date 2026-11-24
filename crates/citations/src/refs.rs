//! The raw reference list of each paper, fetched once and cached (matched or not).
use paperlines_core::rusqlite::{params, Connection, OptionalExtension};
use paperlines_core::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RefEntry {
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub title: Option<String>,
    pub year: Option<i32>,
}

pub struct Cached {
    pub refs: Vec<RefEntry>,
    pub source: String,
    pub fetched_at: String,
}

pub fn store(conn: &Connection, item_id: i64, refs: &[RefEntry], source: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO reference_cache(item_id, refs_json, source, fetched_at) VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(item_id) DO UPDATE SET refs_json = excluded.refs_json, source = excluded.source, fetched_at = excluded.fetched_at",
        params![item_id, serde_json::to_string(refs)?, source],
    )?;
    Ok(())
}

pub fn load(conn: &Connection, item_id: i64) -> Result<Option<Cached>> {
    let row = conn
        .query_row(
            "SELECT refs_json, source, fetched_at FROM reference_cache WHERE item_id = ?1",
            [item_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
        )
        .optional()?;
    Ok(match row {
        Some((json, source, fetched_at)) => Some(Cached {
            refs: serde_json::from_str(&json)?,
            source,
            fetched_at,
        }),
        None => None,
    })
}

/// Every cached list as (citing item, source, refs).
pub fn all(conn: &Connection) -> Result<Vec<(i64, String, Vec<RefEntry>)>> {
    let mut stmt = conn.prepare("SELECT item_id, source, refs_json FROM reference_cache")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, source, json) = row?;
        out.push((id, source, serde_json::from_str(&json)?));
    }
    Ok(out)
}

pub fn has_cache(conn: &Connection, item_id: i64) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM reference_cache WHERE item_id = ?1",
            [item_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}
