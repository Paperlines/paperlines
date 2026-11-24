//! Daily snapshots (`backups/library-YYYY-MM-DD.sqlite`) and restore.
use crate::db::Db;
use crate::{Error, Result};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const KEEP_DAILY: usize = 14;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    /// daily | pre-migration | pre-restore | manual
    pub kind: String,
}

fn today(conn: &Connection) -> Result<String> {
    Ok(conn.query_row("SELECT date('now', 'localtime')", [], |r| r.get(0))?)
}

fn snapshot(conn: &Connection, dest: &Path) -> Result<()> {
    if dest.exists() {
        return Err(Error::msg(format!("{} already exists", dest.display())));
    }
    if let Some(p) = dest.parent() {
        fs::create_dir_all(p)?;
    }
    conn.execute("VACUUM INTO ?1", [dest.to_string_lossy()])?;
    Ok(())
}

/// Takes today's snapshot unless one exists, then prunes old daily snapshots.
pub fn daily(conn: &Connection, dir: &Path) -> Result<Option<PathBuf>> {
    let dest = dir.join(format!("library-{}.sqlite", today(conn)?));
    let made = if dest.exists() {
        None
    } else {
        snapshot(conn, &dest)?;
        Some(dest)
    };
    prune(dir, KEEP_DAILY)?;
    Ok(made)
}

/// A snapshot now, e.g. before a restore or on request.
pub fn manual(conn: &Connection, dir: &Path, label: &str) -> Result<PathBuf> {
    let stamp: String = conn.query_row("SELECT strftime('%Y-%m-%d-%H%M%S', 'now', 'localtime')", [], |r| {
        r.get(0)
    })?;
    let dest = dir.join(format!("{label}-{stamp}.sqlite"));
    snapshot(conn, &dest)?;
    Ok(dest)
}

/// Keeps the newest `keep` daily snapshots; other kinds are never deleted automatically.
pub fn prune(dir: &Path, keep: usize) -> Result<()> {
    let mut daily: Vec<PathBuf> = list(dir)?
        .into_iter()
        .filter(|b| b.kind == "daily")
        .map(|b| PathBuf::from(b.path))
        .collect();
    daily.sort();
    while daily.len() > keep {
        fs::remove_file(daily.remove(0))?;
    }
    Ok(())
}

pub fn list(dir: &Path) -> Result<Vec<BackupInfo>> {
    let Ok(rd) = fs::read_dir(dir) else {
        return Ok(Vec::new());
    };
    let mut out: Vec<BackupInfo> = rd
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "sqlite"))
        .map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let kind = if name.starts_with("library-") {
                "daily"
            } else if name.starts_with("pre-migration") {
                "pre-migration"
            } else if name.starts_with("pre-restore") {
                "pre-restore"
            } else {
                "manual"
            };
            BackupInfo {
                size: e.metadata().map(|m| m.len()).unwrap_or(0),
                path: e.path().to_string_lossy().into_owned(),
                name,
                kind: kind.into(),
            }
        })
        .collect();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

/// Checks that `path` is an intact library this version can open.
pub fn validate(path: &Path, max_version: usize) -> Result<()> {
    let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| Error::msg(format!("Not a database: {e}")))?;
    let ok: String = c
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| Error::msg(format!("Not a library: {e}")))?;
    if ok != "ok" {
        return Err(Error::msg(format!("Backup is damaged: {ok}")));
    }
    let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if v as usize > max_version {
        return Err(Error::msg("This backup was made by a newer version of the app"));
    }
    let has_items: bool = c.query_row("SELECT count(*) FROM sqlite_master WHERE name = 'items'", [], |r| {
        r.get::<_, i64>(0)
    })? == 1;
    if !has_items {
        return Err(Error::msg("This file is not a library backup"));
    }
    Ok(())
}

/// Replaces the library database with `backup`. The current database is snapshotted first
/// (`pre-restore-…`), and the restored one is migrated if it is older. `db` is reopened in place.
pub fn restore(db: &mut Db, db_path: &Path, backups: &Path, backup: &Path) -> Result<PathBuf> {
    validate(backup, crate::db::latest_version())?;
    let safety = manual(&db.conn, backups, "pre-restore")?;
    // close the current connection (checkpoints the WAL) before touching the files
    let old = std::mem::replace(db, Db::open_in_memory()?);
    drop(old);
    for ext in ["-wal", "-shm"] {
        let _ = fs::remove_file(format!("{}{ext}", db_path.display()));
    }
    let tmp = db_path.with_extension("restoring");
    fs::copy(backup, &tmp)?;
    fs::rename(&tmp, db_path)?;
    *db = Db::open_with_backup(db_path, Some(backups))?;
    Ok(safety)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::items::{insert_item, list_items};
    use crate::model::ItemInput;

    fn add(db: &mut Db, t: &str) {
        db.tx(|c| {
            insert_item(
                c,
                &ItemInput {
                    title: t.into(),
                    ..Default::default()
                },
            )
        })
        .unwrap();
    }

    #[test]
    fn daily_once_per_day_and_prunes() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Db::open(&dir.path().join("lib.sqlite")).unwrap();
        add(&mut db, "A");
        let b = dir.path().join("backups");
        assert!(daily(&db.conn, &b).unwrap().is_some());
        assert!(daily(&db.conn, &b).unwrap().is_none(), "one per day");
        for d in 1..=20 {
            fs::write(b.join(format!("library-2020-01-{d:02}.sqlite")), b"x").unwrap();
        }
        fs::write(b.join("pre-migration-v1-1.sqlite"), b"x").unwrap();
        prune(&b, KEEP_DAILY).unwrap();
        let all = list(&b).unwrap();
        assert_eq!(all.iter().filter(|x| x.kind == "daily").count(), KEEP_DAILY);
        assert!(all.iter().any(|x| x.kind == "pre-migration"), "other kinds are kept");
        assert!(
            all.iter()
                .any(|x| x.kind == "daily" && x.name.as_str() > "library-2020-01-20.sqlite"),
            "today's survives"
        );
    }

    #[test]
    fn restore_round_trip_with_safety_copy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("lib.sqlite");
        let b = dir.path().join("backups");
        let mut db = Db::open(&path).unwrap();
        add(&mut db, "Kept");
        let snap = manual(&db.conn, &b, "manual").unwrap();
        add(&mut db, "Added after the backup");
        assert_eq!(list_items(&db.conn).unwrap().len(), 2);

        let safety = restore(&mut db, &path, &b, &snap).unwrap();
        let titles: Vec<String> = list_items(&db.conn).unwrap().into_iter().map(|i| i.title).collect();
        assert_eq!(titles, vec!["Kept"]);
        // the state before the restore is recoverable
        let c = Connection::open(&safety).unwrap();
        let n: i64 = c.query_row("SELECT count(*) FROM items", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
        // the reopened database is usable
        add(&mut db, "After restore");
        assert_eq!(list_items(&db.conn).unwrap().len(), 2);
    }

    #[test]
    fn rejects_bad_backups() {
        let dir = tempfile::tempdir().unwrap();
        let junk = dir.path().join("junk.sqlite");
        fs::write(&junk, b"definitely not sqlite").unwrap();
        assert!(validate(&junk, 99).is_err());
        let other = dir.path().join("other.sqlite");
        Connection::open(&other)
            .unwrap()
            .execute_batch("CREATE TABLE t(x)")
            .unwrap();
        assert!(validate(&other, 99).unwrap_err().to_string().contains("not a library"));
        let path = dir.path().join("lib.sqlite");
        let mut db = Db::open(&path).unwrap();
        assert!(restore(&mut db, &path, &dir.path().join("b"), &junk).is_err());
        assert!(db.schema_version().is_ok(), "a failed restore leaves the library open");
    }
}
