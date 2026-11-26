use crate::Result;
use rusqlite::{Connection, TransactionBehavior};
use std::path::Path;

/// Ordered migrations. Never edit a shipped one; append a new file instead.
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/0001_init.sql"),
    include_str!("../migrations/0002_search_index.sql"),
    include_str!("../migrations/0003_highlights_in_search.sql"),
    include_str!("../migrations/0004_fields_trash_exports.sql"),
    include_str!("../migrations/0005_citing.sql"),
    include_str!("../migrations/0006_project_colors.sql"),
    include_str!("../migrations/0007_relations.sql"),
    include_str!("../migrations/0008_spine.sql"),
    include_str!("../migrations/0009_suggestions.sql"),
    include_str!("../migrations/0010_assistant_chats.sql"),
];

pub struct Db {
    pub conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> Result<Db> {
        Self::open_with_backup(path, None)
    }

    /// Opens a library database. If an existing database needs migrating, it is first
    /// copied to `backups/pre-migration-v<old>-<unix time>.sqlite`.
    pub fn open_with_backup(path: &Path, backups: Option<&Path>) -> Result<Db> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        let db = Self::configure(conn)?;
        let current = db.schema_version()?;
        if let Some(dir) = backups {
            if current > 0 && current < MIGRATIONS.len() {
                std::fs::create_dir_all(dir)?;
                let secs = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let dest = dir.join(format!("pre-migration-v{current}-{secs}.sqlite"));
                db.conn.execute("VACUUM INTO ?1", [dest.to_string_lossy()])?;
            }
        }
        Self::finish(db)
    }

    pub fn open_in_memory() -> Result<Db> {
        Self::finish(Self::configure(Connection::open_in_memory()?)?)
    }

    fn configure(conn: Connection) -> Result<Db> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;
        Ok(Db { conn })
    }

    fn finish(mut db: Db) -> Result<Db> {
        db.migrate()?;
        Ok(db)
    }

    pub fn schema_version(&self) -> Result<usize> {
        Ok(self
            .conn
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))? as usize)
    }

    fn migrate(&mut self) -> Result<()> {
        if self.schema_version()? >= MIGRATIONS.len() {
            return Ok(());
        }
        for (i, sql) in MIGRATIONS.iter().enumerate() {
            // IMMEDIATE takes the write lock before reading the version, so two processes opening
            // the same new library at once (the app and the browser extension's host, say) run
            // each migration once: the second waits, sees the version the first wrote, and skips
            let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let done: i64 = tx.pragma_query_value(None, "user_version", |r| r.get(0))?;
            if done as usize > i {
                continue;
            }
            tx.execute_batch(sql)?;
            tx.pragma_update(None, "user_version", (i + 1) as i64)?;
            tx.commit()?;
        }
        Ok(())
    }

    /// Runs `f` in a transaction that commits only if `f` succeeds.
    pub fn tx<T>(&mut self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let tx = self.conn.transaction()?;
        let out = f(&tx)?;
        tx.commit()?;
        Ok(out)
    }
}

/// The schema version this build migrates to.
pub fn latest_version() -> usize {
    MIGRATIONS.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_opens_of_a_new_library_migrate_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.sqlite");
        let handles: Vec<_> = (0..4)
            .map(|_| {
                let p = path.clone();
                std::thread::spawn(move || Db::open(&p).map(|d| d.schema_version().unwrap()))
            })
            .collect();
        for h in handles {
            assert_eq!(h.join().unwrap().unwrap(), latest_version());
        }
    }

    #[test]
    fn migrates_to_latest_and_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("lib.sqlite");
        let db = Db::open(&p).unwrap();
        assert_eq!(db.schema_version().unwrap(), MIGRATIONS.len());
        drop(db);
        let db = Db::open(&p).unwrap();
        assert_eq!(db.schema_version().unwrap(), MIGRATIONS.len());
        let fk: i64 = db.conn.pragma_query_value(None, "foreign_keys", |r| r.get(0)).unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn backs_up_before_migrating_an_older_library() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("lib.sqlite");
        {
            let c = Connection::open(&p).unwrap();
            c.execute_batch(MIGRATIONS[0]).unwrap();
            c.pragma_update(None, "user_version", 1).unwrap();
            c.execute("INSERT INTO settings(key, value) VALUES ('k', 'v')", [])
                .unwrap();
        }
        let backups = dir.path().join("backups");
        let db = Db::open_with_backup(&p, Some(&backups)).unwrap();
        assert_eq!(db.schema_version().unwrap(), MIGRATIONS.len());
        let files: Vec<_> = std::fs::read_dir(&backups).unwrap().flatten().collect();
        assert_eq!(files.len(), 1);
        let name = files[0].file_name().to_string_lossy().into_owned();
        assert!(name.starts_with("pre-migration-v1-"), "{name}");
        let old = Connection::open(files[0].path()).unwrap();
        let v: String = old.query_row("SELECT value FROM settings", [], |r| r.get(0)).unwrap();
        assert_eq!(v, "v");
        drop(db);
        Db::open_with_backup(&p, Some(&backups)).unwrap();
        assert_eq!(
            std::fs::read_dir(&backups).unwrap().count(),
            1,
            "no backup when already current"
        );
    }

    #[test]
    fn failed_transaction_rolls_back() {
        let mut db = Db::open_in_memory().unwrap();
        let r: Result<()> = db.tx(|c| {
            c.execute("INSERT INTO settings(key,value) VALUES('a','1')", [])?;
            Err(crate::Error::msg("boom"))
        });
        assert!(r.is_err());
        let n: i64 = db
            .conn
            .query_row("SELECT count(*) FROM settings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }
}
