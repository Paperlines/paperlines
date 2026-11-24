use crate::{Error, Result};
use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub count: i64,
    /// One of the tag colors (red, orange, yellow, green, teal, blue, purple, gray).
    pub color: String,
}

/// Project colors in the order new projects get them (gray only when asked for).
pub const PROJECT_COLORS: &[&str] = &["blue", "orange", "teal", "purple", "red", "green", "yellow"];
const ALL_COLORS: &[&str] = &["red", "orange", "yellow", "green", "teal", "blue", "purple", "gray"];

/// The least used color, so projects stay apart.
fn next_color(conn: &Connection) -> Result<&'static str> {
    let mut best = (i64::MAX, PROJECT_COLORS[0]);
    for c in PROJECT_COLORS {
        let n: i64 = conn.query_row("SELECT count(*) FROM projects WHERE color = ?1", [c], |r| r.get(0))?;
        if n < best.0 {
            best = (n, c);
        }
    }
    Ok(best.1)
}

pub fn set_color(conn: &Connection, id: i64, color: &str) -> Result<()> {
    if !ALL_COLORS.contains(&color) {
        return Err(Error::msg(format!("Unknown color {color}")));
    }
    conn.execute("UPDATE projects SET color = ?2 WHERE id = ?1", params![id, color])?;
    Ok(())
}

fn clean_name(name: &str) -> Result<String> {
    let n = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if n.is_empty() {
        return Err(Error::msg("Project name is empty"));
    }
    Ok(n)
}

fn friendly(e: rusqlite::Error) -> Error {
    if let rusqlite::Error::SqliteFailure(f, _) = &e {
        if f.code == rusqlite::ErrorCode::ConstraintViolation {
            return Error::msg("A project with this name already exists");
        }
    }
    Error::Db(e)
}

pub fn create(conn: &Connection, name: &str, description: Option<&str>) -> Result<i64> {
    conn.execute(
        "INSERT INTO projects(name, description, color) VALUES (?1, ?2, ?3)",
        params![
            clean_name(name)?,
            description.map(str::trim).filter(|d| !d.is_empty()),
            next_color(conn)?
        ],
    )
    .map_err(friendly)?;
    Ok(conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, name: &str, description: Option<&str>) -> Result<()> {
    let old: Option<String> = conn
        .query_row("SELECT name FROM projects WHERE id = ?1", [id], |r| r.get(0))
        .ok();
    let n = conn
        .execute(
            "UPDATE projects SET name = ?2, description = ?3 WHERE id = ?1",
            params![
                id,
                clean_name(name)?,
                description.map(str::trim).filter(|d| !d.is_empty())
            ],
        )
        .map_err(friendly)?;
    if n == 0 {
        return Err(Error::msg("Project not found"));
    }
    // auto-updating files follow the project when it is renamed
    if let Some(old) = old {
        conn.execute(
            "UPDATE auto_exports SET scope_value = ?2 WHERE scope_kind = 'project' AND scope_value = ?1",
            params![old, clean_name(name)?],
        )?;
    }
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list(conn: &Connection) -> Result<Vec<ProjectInfo>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, (SELECT count(*) FROM project_items pi JOIN items i ON i.id = pi.item_id WHERE pi.project_id = p.id AND i.deleted_at IS NULL), coalesce(p.color, 'blue')
         FROM projects p ORDER BY lower(p.name)",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(ProjectInfo {
            id: r.get(0)?,
            name: r.get(1)?,
            description: r.get(2)?,
            count: r.get(3)?,
            color: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Appends items to the project's reading order; items already in it keep their place.
pub fn add_items(conn: &Connection, project_id: i64, item_ids: &[i64]) -> Result<()> {
    for id in item_ids {
        conn.execute(
            "INSERT OR IGNORE INTO project_items(project_id, item_id, position)
             VALUES (?1, ?2, (SELECT coalesce(max(position), 0) + 1 FROM project_items WHERE project_id = ?1))",
            params![project_id, id],
        )?;
    }
    Ok(())
}

pub fn remove_items(conn: &Connection, project_id: i64, item_ids: &[i64]) -> Result<()> {
    // papers leaving the project leave its spine too
    crate::spine::forget_items(conn, project_id, item_ids)?;
    for id in item_ids {
        conn.execute(
            "DELETE FROM project_items WHERE project_id = ?1 AND item_id = ?2",
            params![project_id, id],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::items::{get_item, insert_item};
    use crate::model::ItemInput;

    #[test]
    fn projects_get_distinct_colors() {
        let mut db = Db::open_in_memory().unwrap();
        let ids: Vec<i64> = db
            .tx(|c| (0..3).map(|n| create(c, &format!("P{n}"), None)).collect())
            .unwrap();
        let colors: Vec<String> = list(&db.conn).unwrap().into_iter().map(|p| p.color).collect();
        assert_eq!(colors, vec!["blue", "orange", "teal"]);
        set_color(&db.conn, ids[0], "teal").unwrap();
        assert!(set_color(&db.conn, ids[0], "pink").is_err());
        // blue is free again, so the next project gets it
        db.tx(|c| create(c, "P3", None)).unwrap();
        let p3 = list(&db.conn).unwrap().into_iter().find(|p| p.name == "P3").unwrap();
        assert_eq!(p3.color, "blue");
    }

    #[test]
    fn rename_moves_auto_exports() {
        let mut db = Db::open_in_memory().unwrap();
        let id = db.tx(|c| create(c, "Thesis", None)).unwrap();
        db.conn
            .execute(
                "INSERT INTO auto_exports(format, scope_kind, scope_value, path) VALUES ('bibtex', 'project', 'Thesis', '/tmp/t.bib')",
                [],
            )
            .unwrap();
        db.tx(|c| update(c, id, "Thesis ch. 2", None)).unwrap();
        let v: String = db
            .conn
            .query_row("SELECT scope_value FROM auto_exports", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, "Thesis ch. 2");
    }

    #[test]
    fn project_membership() {
        let mut db = Db::open_in_memory().unwrap();
        let a = db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "A".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        let p = db.tx(|c| create(c, "  Thesis  ", Some("chapter 2"))).unwrap();
        assert!(db.tx(|c| create(c, "Thesis", None)).is_err());
        db.tx(|c| add_items(c, p, &[a, a])).unwrap();
        assert_eq!(list(&db.conn).unwrap()[0].count, 1);
        assert_eq!(get_item(&db.conn, a).unwrap().unwrap().project_ids, vec![p]);
        db.tx(|c| remove_items(c, p, &[a])).unwrap();
        assert!(get_item(&db.conn, a).unwrap().unwrap().project_ids.is_empty());
        db.tx(|c| delete(c, p)).unwrap();
        assert!(list(&db.conn).unwrap().is_empty());
    }
}
