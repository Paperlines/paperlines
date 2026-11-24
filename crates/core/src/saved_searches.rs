use crate::{Error, Result};
use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SavedSearch {
    pub id: i64,
    pub name: String,
    pub query: String,
}

pub fn list(conn: &Connection) -> Result<Vec<SavedSearch>> {
    let mut stmt = conn.prepare("SELECT id, name, query FROM saved_searches ORDER BY lower(name)")?;
    let rows = stmt.query_map([], |r| {
        Ok(SavedSearch {
            id: r.get(0)?,
            name: r.get(1)?,
            query: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn create(conn: &Connection, name: &str, query: &str) -> Result<i64> {
    let (name, query) = (name.trim(), query.trim());
    if name.is_empty() || query.is_empty() {
        return Err(Error::msg("A saved search needs a name and a query"));
    }
    conn.execute(
        "INSERT INTO saved_searches(name, query) VALUES (?1, ?2)",
        params![name, query],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM saved_searches WHERE id = ?1", [id])?;
    Ok(())
}
