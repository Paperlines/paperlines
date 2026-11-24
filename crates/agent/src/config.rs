//! The assistant panel's settings, kept in `assistant.json` in the config folder.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentConfig {
    /// The agent may change the library too (off: it can only read).
    pub cli_allow_writes: bool,
    /// Which agent the panel uses ("claude", "codex"); None: the first one installed.
    pub agent: Option<String>,
}

pub fn path(config_dir: &Path) -> PathBuf {
    config_dir.join("assistant.json")
}

pub fn load(config_dir: &Path) -> AgentConfig {
    std::fs::read_to_string(path(config_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(config_dir: &Path, cfg: &AgentConfig) -> std::io::Result<()> {
    std::fs::create_dir_all(config_dir)?;
    let tmp = path(config_dir).with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(cfg).unwrap_or_default())?;
    std::fs::rename(tmp, path(config_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_round_trips_and_ignores_old_fields() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), AgentConfig::default());
        let cfg = AgentConfig {
            cli_allow_writes: true,
            agent: None,
        };
        save(dir.path(), &cfg).unwrap();
        assert_eq!(load(dir.path()), cfg);
        std::fs::write(path(dir.path()), r#"{"provider":"x","cliAllowWrites":true}"#).unwrap();
        assert_eq!(load(dir.path()), cfg);
    }
}
