//! PDFs are stored as `pdfs/<sha256>.pdf`. Originals are only ever read, never modified.
use crate::text::nfc;
use crate::Result;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredFile {
    pub hash: String,
    pub size: u64,
    pub filename: String,
}

pub fn hash_file(path: &Path) -> Result<(String, u64)> {
    let mut f = fs::File::open(path)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    let mut size = 0u64;
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        size += n as u64;
        h.update(&buf[..n]);
    }
    let hex: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
    Ok((hex, size))
}

pub fn stored_path(pdfs_dir: &Path, hash: &str) -> PathBuf {
    pdfs_dir.join(format!("{hash}.pdf"))
}

/// Attachment kinds the library stores (by content hash) in the files folder.
pub const KINDS: &[&str] = &["pdf", "epub"];

pub fn stored_file_path(dir: &Path, hash: &str, kind: &str) -> PathBuf {
    dir.join(format!("{hash}.{}", if kind == "epub" { "epub" } else { "pdf" }))
}

/// Stored files (hash, kind) of these papers that no other paper uses, so they can be removed
/// once the papers are deleted for good. Call before deleting; remove after the commit.
pub fn files_only_used_by(conn: &Connection, ids: &[i64]) -> Result<Vec<(String, String)>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let list = ids.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(",");
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT content_hash, kind FROM attachments WHERE item_id IN ({list})
         AND content_hash NOT IN (SELECT content_hash FROM attachments WHERE item_id NOT IN ({list}))"
    ))?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

/// Deletes stored files (best effort: a file already gone is fine). Returns how many were removed.
pub fn remove_stored_files(dir: &Path, files: &[(String, String)]) -> usize {
    files
        .iter()
        .filter(|(hash, kind)| std::fs::remove_file(stored_file_path(dir, hash, kind)).is_ok())
        .count()
}

/// Copies a PDF or EPUB into the library by content hash. Idempotent; the original is untouched.
pub fn store_file(dir: &Path, src: &Path, kind: &str) -> Result<StoredFile> {
    let (hash, size) = hash_file(src)?;
    fs::create_dir_all(dir)?;
    let dest = stored_file_path(dir, &hash, kind);
    if !dest.exists() {
        let tmp = dir.join(format!(".{hash}.tmp"));
        fs::copy(src, &tmp)?;
        fs::rename(&tmp, &dest)?;
    }
    let filename = src.file_name().map(|f| nfc(&f.to_string_lossy())).unwrap_or_default();
    Ok(StoredFile { hash, size, filename })
}

pub fn add_attachment_of_kind(
    conn: &Connection,
    item_id: i64,
    f: &StoredFile,
    page_count: Option<u32>,
    kind: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO attachments(item_id, kind, content_hash, filename, size, page_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![item_id, kind, f.hash, f.filename, f.size as i64, page_count],
    )?;
    Ok(conn.last_insert_rowid())
}

/// The first attachment of a kind, as (hash, path).
pub fn attachment_path(conn: &Connection, dir: &Path, item_id: i64, kind: &str) -> Result<Option<PathBuf>> {
    let hash: Option<String> = conn
        .query_row(
            "SELECT content_hash FROM attachments WHERE item_id = ?1 AND kind = ?2 ORDER BY id LIMIT 1",
            params![item_id, kind],
            |r| r.get(0),
        )
        .optional()?;
    Ok(hash.map(|h| stored_file_path(dir, &h, kind)))
}

/// Copies `src` into the library by content hash. Idempotent.
pub fn store_pdf(pdfs_dir: &Path, src: &Path) -> Result<StoredFile> {
    let (hash, size) = hash_file(src)?;
    fs::create_dir_all(pdfs_dir)?;
    let dest = stored_path(pdfs_dir, &hash);
    if !dest.exists() {
        let tmp = pdfs_dir.join(format!(".{hash}.tmp"));
        fs::copy(src, &tmp)?;
        fs::rename(&tmp, &dest)?;
    }
    let filename = src.file_name().map(|f| nfc(&f.to_string_lossy())).unwrap_or_default();
    Ok(StoredFile { hash, size, filename })
}

pub fn add_attachment(conn: &Connection, item_id: i64, f: &StoredFile, page_count: Option<u32>) -> Result<i64> {
    conn.execute(
        "INSERT INTO attachments(item_id, kind, content_hash, filename, size, page_count) VALUES (?1, 'pdf', ?2, ?3, ?4, ?5)",
        params![item_id, f.hash, f.filename, f.size as i64, page_count],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn item_with_hash(conn: &Connection, hash: &str) -> Result<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT item_id FROM attachments WHERE content_hash = ?1 LIMIT 1",
            [hash],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn has_pdf(conn: &Connection, item_id: i64) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM attachments WHERE item_id = ?1 AND kind = 'pdf'",
            [item_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_by_hash_without_touching_original() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("Mu\u{0308}ller 2020.pdf");
        fs::write(&src, b"%PDF-1.4 test").unwrap();
        let before = fs::read(&src).unwrap();
        let pdfs = dir.path().join("pdfs");
        let a = store_pdf(&pdfs, &src).unwrap();
        let b = store_pdf(&pdfs, &src).unwrap();
        assert_eq!(a, b);
        assert_eq!(a.filename, "Müller 2020.pdf");
        assert_eq!(fs::read(&src).unwrap(), before);
        assert_eq!(fs::read(stored_path(&pdfs, &a.hash)).unwrap(), before);
        assert_eq!(fs::read_dir(&pdfs).unwrap().count(), 1);
    }
}
