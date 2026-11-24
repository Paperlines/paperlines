//! Hierarchical tags ("ml/nlp"). Matching is case-insensitive; the stored spelling is the first one used.
use crate::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

pub const COLORS: &[&str] = &["red", "orange", "yellow", "green", "teal", "blue", "purple", "gray"];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub id: i64,
    pub path: String,
    pub color: Option<String>,
    /// Items tagged with exactly this tag.
    pub count: i64,
}

/// Trims segments and drops empty ones: " ml / /nlp " -> "ml/nlp".
pub fn normalize_path(p: &str) -> Result<String> {
    let s = p
        .split('/')
        .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("/");
    if s.is_empty() {
        return Err(Error::msg("Tag name is empty"));
    }
    Ok(s)
}

pub fn find(conn: &Connection, path: &str) -> Result<Option<i64>> {
    let p = normalize_path(path)?;
    Ok(conn
        .query_row("SELECT id FROM tags WHERE lower(path) = lower(?1)", [p], |r| r.get(0))
        .optional()?)
}

pub fn get_or_create(conn: &Connection, path: &str) -> Result<i64> {
    if let Some(id) = find(conn, path)? {
        return Ok(id);
    }
    conn.execute("INSERT INTO tags(path) VALUES (?1)", [normalize_path(path)?])?;
    Ok(conn.last_insert_rowid())
}

pub fn list(conn: &Connection) -> Result<Vec<TagInfo>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.path, t.color, (SELECT count(*) FROM item_tags it JOIN items i ON i.id = it.item_id WHERE it.tag_id = t.id AND i.deleted_at IS NULL)
         FROM tags t ORDER BY lower(t.path)",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(TagInfo {
            id: r.get(0)?,
            path: r.get(1)?,
            color: r.get(2)?,
            count: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn tag_items(conn: &Connection, item_ids: &[i64], paths: &[String]) -> Result<()> {
    for p in paths {
        let tag = get_or_create(conn, p)?;
        for id in item_ids {
            conn.execute(
                "INSERT OR IGNORE INTO item_tags(item_id, tag_id) VALUES (?1, ?2)",
                params![id, tag],
            )?;
        }
    }
    Ok(())
}

pub fn untag_items(conn: &Connection, item_ids: &[i64], paths: &[String]) -> Result<()> {
    for p in paths {
        if let Some(tag) = find(conn, p)? {
            for id in item_ids {
                conn.execute(
                    "DELETE FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
                    params![id, tag],
                )?;
            }
        }
    }
    Ok(())
}

/// The tag and all of its descendants, as (id, path).
fn subtree(conn: &Connection, path: &str) -> Result<Vec<(i64, String)>> {
    let p = normalize_path(path)?;
    let mut stmt = conn
        .prepare("SELECT id, path FROM tags WHERE lower(path) = lower(?1) OR lower(path) LIKE lower(?2) ESCAPE '\\'")?;
    let like = format!("{}/%", p.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    let rows = stmt.query_map(params![p, like], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Renames a tag and its descendants. Renaming onto an existing tag merges them.
pub fn rename(conn: &Connection, from: &str, to: &str) -> Result<()> {
    let from = normalize_path(from)?;
    let to = normalize_path(to)?;
    let tree = subtree(conn, &from)?;
    if tree.is_empty() {
        return Err(Error::msg(format!("No tag named {from}")));
    }
    if to.to_lowercase().starts_with(&format!("{}/", from.to_lowercase())) {
        return Err(Error::msg("A tag cannot be moved inside itself"));
    }
    for (id, path) in tree {
        let new_path = format!("{to}{}", &path[from.len()..]);
        match find(conn, &new_path)? {
            Some(target) if target != id => {
                for table in ["item_tags", "highlight_tags", "note_tags"] {
                    let col = match table {
                        "item_tags" => "item_id",
                        "highlight_tags" => "highlight_id",
                        _ => "note_id",
                    };
                    conn.execute(
                        &format!("INSERT OR IGNORE INTO {table}({col}, tag_id) SELECT {col}, ?1 FROM {table} WHERE tag_id = ?2"),
                        params![target, id],
                    )?;
                }
                conn.execute("UPDATE tags SET color = coalesce((SELECT color FROM tags WHERE id = ?1), (SELECT color FROM tags WHERE id = ?2)) WHERE id = ?1", params![target, id])?;
                conn.execute("DELETE FROM tags WHERE id = ?1", [id])?;
            }
            _ => {
                conn.execute("UPDATE tags SET path = ?1 WHERE id = ?2", params![new_path, id])?;
            }
        }
    }
    Ok(())
}

/// Deletes the tag and its descendants; tagged items are untouched.
pub fn delete(conn: &Connection, path: &str) -> Result<()> {
    for (id, _) in subtree(conn, path)? {
        conn.execute("DELETE FROM tags WHERE id = ?1", [id])?;
    }
    Ok(())
}

pub fn set_color(conn: &Connection, path: &str, color: Option<&str>) -> Result<()> {
    if let Some(c) = color {
        if !COLORS.contains(&c) {
            return Err(Error::msg(format!("Unknown color: {c}")));
        }
    }
    let id = find(conn, path)?.ok_or_else(|| Error::msg("Tag not found"))?;
    conn.execute("UPDATE tags SET color = ?1 WHERE id = ?2", params![color, id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::items::{get_item, insert_item};
    use crate::model::ItemInput;

    fn item(db: &mut Db, t: &str) -> i64 {
        db.tx(|c| {
            insert_item(
                c,
                &ItemInput {
                    title: t.into(),
                    ..Default::default()
                },
            )
        })
        .unwrap()
    }

    #[test]
    fn tag_untag_case_insensitive() {
        let mut db = Db::open_in_memory().unwrap();
        let a = item(&mut db, "A");
        db.tx(|c| tag_items(c, &[a], &[" ML / nlp ".into(), "ml/NLP".into()]))
            .unwrap();
        assert_eq!(get_item(&db.conn, a).unwrap().unwrap().tags, vec!["ML/nlp"]);
        db.tx(|c| untag_items(c, &[a], &["ml/nlp".into()])).unwrap();
        assert!(get_item(&db.conn, a).unwrap().unwrap().tags.is_empty());
        assert!(normalize_path(" / ").is_err());
    }

    #[test]
    fn rename_moves_children_and_merges() {
        let mut db = Db::open_in_memory().unwrap();
        let a = item(&mut db, "A");
        let b = item(&mut db, "B");
        db.tx(|c| tag_items(c, &[a], &["ml".into(), "ml/nlp".into()])).unwrap();
        db.tx(|c| tag_items(c, &[b], &["ai/nlp".into()])).unwrap();
        db.tx(|c| set_color(c, "ml", Some("blue"))).unwrap();
        db.tx(|c| rename(c, "ml", "ai")).unwrap();
        let tags: Vec<(String, i64, Option<String>)> = list(&db.conn)
            .unwrap()
            .into_iter()
            .map(|t| (t.path, t.count, t.color))
            .collect();
        assert_eq!(
            tags,
            vec![("ai".into(), 1, Some("blue".into())), ("ai/nlp".into(), 2, None)]
        );
        assert!(db.tx(|c| rename(c, "ai", "ai/x")).is_err());
        db.tx(|c| delete(c, "ai")).unwrap();
        assert!(list(&db.conn).unwrap().is_empty());
        assert_eq!(crate::items::list_items(&db.conn).unwrap().len(), 2);
    }
}
