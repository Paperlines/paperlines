use crate::Result;
use std::path::{Path, PathBuf};

/// Everything that lives inside a library folder.
#[derive(Debug, Clone)]
pub struct LibraryPaths {
    pub root: PathBuf,
    pub db: PathBuf,
    pub pdfs: PathBuf,
    pub backups: PathBuf,
}

impl LibraryPaths {
    pub fn new(root: &Path) -> Self {
        LibraryPaths {
            root: root.to_path_buf(),
            db: root.join("library.sqlite"),
            pdfs: root.join("pdfs"),
            backups: root.join("backups"),
        }
    }

    pub fn ensure(&self) -> Result<()> {
        std::fs::create_dir_all(&self.pdfs)?;
        std::fs::create_dir_all(&self.backups)?;
        Ok(())
    }
}
