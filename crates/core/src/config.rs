//! Small per-user config outside the library (so it can point at the library): config.json in
//! the config folder. Shared by the app and the CLI.
use crate::{platform, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    /// A library folder chosen by the user; the platform default when absent.
    pub library_path: Option<PathBuf>,
}

pub fn config_file(config_dir: &Path) -> PathBuf {
    config_dir.join("config.json")
}

pub fn load(config_dir: &Path) -> AppConfig {
    std::fs::read_to_string(config_file(config_dir))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save(config_dir: &Path, c: &AppConfig) -> Result<()> {
    std::fs::create_dir_all(config_dir)?;
    let p = config_file(config_dir);
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(c)?)?;
    std::fs::rename(tmp, p)?;
    Ok(())
}

/// The library folder: the configured one, else the platform data folder.
pub fn library_root(dirs: &platform::AppDirs) -> PathBuf {
    load(&dirs.config).library_path.unwrap_or_else(|| dirs.data.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_defaults() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(load(d.path()), AppConfig::default());
        save(
            d.path(),
            &AppConfig {
                library_path: Some("/x/y".into()),
            },
        )
        .unwrap();
        assert_eq!(load(d.path()).library_path, Some(PathBuf::from("/x/y")));
        let dirs = platform::AppDirs {
            data: "/data".into(),
            config: d.path().into(),
            cache: "/c".into(),
        };
        assert_eq!(library_root(&dirs), PathBuf::from("/x/y"));
        std::fs::write(config_file(d.path()), "not json").unwrap();
        assert_eq!(
            load(d.path()),
            AppConfig::default(),
            "a damaged config falls back to defaults"
        );
    }
}
