//! A project's spine: the papers its argument rests on, as ordered steps ("Foundation → Method →
//! Application"), each holding one or more papers. A paper is in at most one step per project,
//! and being on the spine means being in the project.
use crate::{projects, Error, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub id: i64,
    pub position: i64,
    pub label: Option<String>,
    /// Papers in this step, in order (papers in the Trash left out).
    pub items: Vec<i64>,
}

fn clean(s: Option<&str>) -> Option<String> {
    s.map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

fn project_of(conn: &Connection, step: i64) -> Result<i64> {
    conn.query_row("SELECT project_id FROM spine_steps WHERE id = ?1", [step], |r| r.get(0))
        .optional()?
        .ok_or_else(|| Error::msg("Spine step not found"))
}

/// The steps of a project's spine, in order.
pub fn get(conn: &Connection, project: i64) -> Result<Vec<Step>> {
    let mut stmt =
        conn.prepare("SELECT id, position, label FROM spine_steps WHERE project_id = ?1 ORDER BY position, id")?;
    let mut steps: Vec<Step> = stmt
        .query_map([project], |r| {
            Ok(Step {
                id: r.get(0)?,
                position: r.get(1)?,
                label: r.get(2)?,
                items: Vec::new(),
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    let mut items = conn.prepare(
        "SELECT s.item_id FROM spine_items s JOIN items i ON i.id = s.item_id
         WHERE s.step_id = ?1 AND i.deleted_at IS NULL ORDER BY s.position, s.item_id",
    )?;
    for st in &mut steps {
        st.items = items
            .query_map([st.id], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
    }
    Ok(steps)
}

/// Adds a step at the end (or after `after`'s position). Returns its id.
pub fn add_step(conn: &Connection, project: i64, label: Option<&str>) -> Result<i64> {
    let pos: i64 = conn.query_row(
        "SELECT coalesce(max(position), 0) + 1 FROM spine_steps WHERE project_id = ?1",
        [project],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO spine_steps(project_id, position, label) VALUES (?1, ?2, ?3)",
        params![project, pos, clean(label)],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
            Error::msg("Project not found")
        }
        e => Error::Db(e),
    })?;
    Ok(conn.last_insert_rowid())
}

pub fn rename_step(conn: &Connection, step: i64, label: Option<&str>) -> Result<()> {
    project_of(conn, step)?;
    conn.execute(
        "UPDATE spine_steps SET label = ?2 WHERE id = ?1",
        params![step, clean(label)],
    )?;
    Ok(())
}

/// Moves a step one place earlier (-1) or later (+1).
pub fn move_step(conn: &Connection, step: i64, delta: i64) -> Result<()> {
    let project = project_of(conn, step)?;
    let order: Vec<i64> = get(conn, project)?.into_iter().map(|s| s.id).collect();
    let Some(i) = order.iter().position(|&s| s == step) else {
        return Ok(());
    };
    let j = i as i64 + delta.signum();
    if j < 0 || j as usize >= order.len() {
        return Ok(());
    }
    let mut order = order;
    order.swap(i, j as usize);
    for (n, id) in order.iter().enumerate() {
        conn.execute(
            "UPDATE spine_steps SET position = ?2 WHERE id = ?1",
            params![id, n as i64 + 1],
        )?;
    }
    Ok(())
}

/// Puts a step's papers in the given order (drag and drop in the editor). Ids that aren't in
/// the step are ignored; papers of the step missing from `items` keep their place after them.
pub fn reorder_items(conn: &Connection, step: i64, items: &[i64]) -> Result<()> {
    let current: Vec<i64> = conn
        .prepare("SELECT item_id FROM spine_items WHERE step_id = ?1 ORDER BY position, item_id")?
        .query_map([step], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    let mut order: Vec<i64> = Vec::new();
    for i in items.iter().chain(&current) {
        if current.contains(i) && !order.contains(i) {
            order.push(*i);
        }
    }
    for (n, id) in order.iter().enumerate() {
        conn.execute(
            "UPDATE spine_items SET position = ?3 WHERE step_id = ?1 AND item_id = ?2",
            params![step, id, n as i64 + 1],
        )?;
    }
    Ok(())
}

/// Deletes a step; its papers leave the spine (they stay in the project).
pub fn delete_step(conn: &Connection, step: i64) -> Result<()> {
    project_of(conn, step)?;
    conn.execute("DELETE FROM spine_steps WHERE id = ?1", [step])?;
    Ok(())
}

/// Puts a paper on a project's spine, in `step` (None: a new step at the end). It joins the
/// project if needed and leaves any other step of this spine. Returns the step id.
pub fn add(conn: &Connection, project: i64, item: i64, step: Option<i64>) -> Result<i64> {
    let step = match step {
        Some(s) => {
            if project_of(conn, s)? != project {
                return Err(Error::msg("That step belongs to another project"));
            }
            s
        }
        None => add_step(conn, project, None)?,
    };
    projects::add_items(conn, project, &[item])?;
    leave(conn, project, item, Some(step))?;
    conn.execute(
        "INSERT INTO spine_items(step_id, item_id, position)
         VALUES (?1, ?2, (SELECT coalesce(max(position), 0) + 1 FROM spine_items WHERE step_id = ?1))",
        params![step, item],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
            Error::msg("Paper not found")
        }
        e => Error::Db(e),
    })?;
    Ok(step)
}

/// Takes a paper off a project's spine (it stays in the project). A step it leaves empty goes
/// too, unless the user named it.
pub fn remove(conn: &Connection, project: i64, item: i64) -> Result<()> {
    leave(conn, project, item, None)
}

/// Removes `item` from its step on this spine, then drops that step if it is now empty and
/// unnamed (except `keep`, the step it is moving to).
fn leave(conn: &Connection, project: i64, item: i64, keep: Option<i64>) -> Result<()> {
    let left: Vec<i64> = conn
        .prepare(
            "SELECT step_id FROM spine_items WHERE item_id = ?2
             AND step_id IN (SELECT id FROM spine_steps WHERE project_id = ?1)",
        )?
        .query_map(params![project, item], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    conn.execute(
        "DELETE FROM spine_items WHERE item_id = ?2 AND step_id IN (SELECT id FROM spine_steps WHERE project_id = ?1)",
        params![project, item],
    )?;
    for step in left.into_iter().filter(|s| Some(*s) != keep) {
        conn.execute(
            "DELETE FROM spine_steps WHERE id = ?1 AND (label IS NULL OR trim(label) = '')
             AND NOT EXISTS (SELECT 1 FROM spine_items WHERE step_id = ?1)",
            [step],
        )?;
    }
    Ok(())
}

/// Papers leaving a project leave its spine too.
pub fn forget_items(conn: &Connection, project: i64, items: &[i64]) -> Result<()> {
    for i in items {
        remove(conn, project, *i)?;
    }
    Ok(())
}

/// Duplicate merge: the kept paper takes the other's place on every spine.
pub fn move_to(conn: &Connection, master: i64, other: i64) -> Result<()> {
    conn.execute(
        "UPDATE OR IGNORE spine_items SET item_id = ?1 WHERE item_id = ?2
         AND step_id NOT IN (SELECT st.id FROM spine_steps st JOIN spine_items si ON si.step_id = st.id
                             WHERE si.item_id = ?1)",
        params![master, other],
    )?;
    conn.execute("DELETE FROM spine_items WHERE item_id = ?1", [other])?;
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
    fn steps_hold_several_papers_in_order() {
        let mut db = Db::open_in_memory().unwrap();
        let (p, q) = db
            .tx(|c| {
                Ok((
                    projects::create(c, "Thesis", None)?,
                    projects::create(c, "Other", None)?,
                ))
            })
            .unwrap();
        let (smith, garza, chen, patel) = db
            .tx(|c| {
                Ok((
                    paper(c, "Smith"),
                    paper(c, "Garza"),
                    paper(c, "Chen"),
                    paper(c, "Patel"),
                ))
            })
            .unwrap();
        let s1 = add(&db.conn, p, smith, None).unwrap();
        add(&db.conn, p, garza, Some(s1)).unwrap();
        let s2 = add(&db.conn, p, chen, None).unwrap();
        rename_step(&db.conn, s1, Some(" Foundation ")).unwrap();
        let sp = get(&db.conn, p).unwrap();
        assert_eq!(sp.len(), 2);
        assert_eq!(sp[0].label.as_deref(), Some("Foundation"));
        assert_eq!(sp[0].items, vec![smith, garza]);
        assert_eq!(sp[1].items, vec![chen]);
        // dragging Garza before Smith; an id from another step is ignored
        reorder_items(&db.conn, s1, &[garza, chen, smith]).unwrap();
        assert_eq!(get(&db.conn, p).unwrap()[0].items, vec![garza, smith]);
        reorder_items(&db.conn, s1, &[smith]).unwrap();
        assert_eq!(
            get(&db.conn, p).unwrap()[0].items,
            vec![smith, garza],
            "the rest keep their place after"
        );
        // on the spine means in the project
        let mut stmt = db
            .conn
            .prepare("SELECT item_id FROM project_items WHERE project_id = ?1 ORDER BY item_id")
            .unwrap();
        let members: Vec<i64> = stmt.query_map([p], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect();
        drop(stmt);
        assert_eq!(members, vec![smith, garza, chen]);

        // moving a paper to another step takes it out of the first
        add(&db.conn, p, garza, Some(s2)).unwrap();
        assert_eq!(get(&db.conn, p).unwrap()[0].items, vec![smith]);
        assert_eq!(get(&db.conn, p).unwrap()[1].items, vec![chen, garza]);
        // a step of another project is refused
        let other = add(&db.conn, q, patel, None).unwrap();
        assert!(add(&db.conn, p, patel, Some(other)).is_err());

        move_step(&db.conn, s2, -1).unwrap();
        assert_eq!(get(&db.conn, p).unwrap()[0].id, s2);
        move_step(&db.conn, s2, -1).unwrap();
        assert_eq!(get(&db.conn, p).unwrap()[0].id, s2, "already first");

        trash(&db.conn, &[chen]).unwrap();
        assert_eq!(
            get(&db.conn, p).unwrap()[0].items,
            vec![garza],
            "papers in the Trash are hidden"
        );
        remove(&db.conn, p, smith).unwrap();
        assert!(get(&db.conn, p).unwrap()[1].items.is_empty());
        delete_step(&db.conn, s2).unwrap();
        assert_eq!(get(&db.conn, p).unwrap().len(), 1);
        projects::delete(&db.conn, p).unwrap();
        assert!(get(&db.conn, p).unwrap().is_empty());
    }

    #[test]
    fn merging_duplicates_keeps_the_spine_place() {
        let mut db = Db::open_in_memory().unwrap();
        let p = db.tx(|c| projects::create(c, "Thesis", None)).unwrap();
        let (a, copy) = db.tx(|c| Ok((paper(c, "Smith"), paper(c, "Smith copy")))).unwrap();
        let s = add(&db.conn, p, copy, None).unwrap();
        move_to(&db.conn, a, copy).unwrap();
        assert_eq!(get(&db.conn, p).unwrap()[0].id, s);
        assert_eq!(get(&db.conn, p).unwrap()[0].items, vec![a]);
    }

    #[test]
    fn a_step_left_empty_goes_unless_named() {
        let db = Db::open_in_memory().unwrap();
        let c = &db.conn;
        let p = projects::create(c, "P", None).unwrap();
        let (a, b) = (paper(c, "A"), paper(c, "B"));
        let s1 = add(c, p, a, None).unwrap();
        let s2 = add(c, p, b, None).unwrap();
        // moving B into step 1 drops its now-empty, unnamed step
        add(c, p, b, Some(s1)).unwrap();
        let steps = get(c, p).unwrap();
        assert_eq!(steps.len(), 1);
        assert!(steps.iter().all(|s| s.id != s2));
        // re-adding to the same step keeps it; a named step stays when emptied
        add(c, p, a, Some(s1)).unwrap();
        rename_step(c, s1, Some("Origins")).unwrap();
        remove(c, p, a).unwrap();
        remove(c, p, b).unwrap();
        let left = get(c, p).unwrap();
        assert_eq!(left.len(), 1);
        assert!(left[0].items.is_empty());
        // an unnamed step added by hand stays until a paper leaves it
        add_step(c, p, None).unwrap();
        assert_eq!(get(c, p).unwrap().len(), 2);
    }
}
