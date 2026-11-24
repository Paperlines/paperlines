//! The only place in Rust that knows about operating systems.
use crate::branding;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Macos,
    Linux,
    Windows,
}

pub fn current_os() -> Os {
    if cfg!(target_os = "macos") {
        Os::Macos
    } else if cfg!(target_os = "windows") {
        Os::Windows
    } else {
        Os::Linux
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppDirs {
    pub data: PathBuf,
    pub config: PathBuf,
    pub cache: PathBuf,
}

/// Pure resolver: environment and home are injected so every OS is testable anywhere.
pub fn resolve_dirs(os: Os, home: &std::path::Path, env: &HashMap<String, String>) -> AppDirs {
    let xdg = |var: &str, default: &[&str]| -> PathBuf {
        match env.get(var).filter(|v| !v.is_empty()) {
            Some(v) => PathBuf::from(v),
            None => default.iter().fold(home.to_path_buf(), |p, s| p.join(s)),
        }
    };
    match os {
        Os::Macos => {
            let name = branding::DATA_FOLDER;
            let support = home.join("Library").join("Application Support").join(name);
            AppDirs {
                data: support.clone(),
                config: support,
                cache: home.join("Library").join("Caches").join(name),
            }
        }
        // Windows convention: the library and settings in the roaming AppData folder, the cache in
        // the local one (not synced, can be large)
        Os::Windows => {
            let name = branding::DATA_FOLDER;
            let dir = |var: &str, default: &[&str]| -> PathBuf {
                match env.get(var).filter(|v| !v.is_empty()) {
                    Some(v) => PathBuf::from(v),
                    None => default.iter().fold(home.to_path_buf(), |p, s| p.join(s)),
                }
            };
            let roaming = dir("APPDATA", &["AppData", "Roaming"]).join(name);
            AppDirs {
                data: roaming.clone(),
                config: roaming,
                cache: dir("LOCALAPPDATA", &["AppData", "Local"]).join(name).join("cache"),
            }
        }
        Os::Linux => {
            let name = branding::DATA_FOLDER.to_lowercase();
            AppDirs {
                data: xdg("XDG_DATA_HOME", &[".local", "share"]).join(&name),
                config: xdg("XDG_CONFIG_HOME", &[".config"]).join(&name),
                cache: xdg("XDG_CACHE_HOME", &[".cache"]).join(&name),
            }
        }
    }
}

/// Resolves the directories for the running system.
pub fn app_dirs() -> Option<AppDirs> {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    let env: HashMap<String, String> = std::env::vars().collect();
    Some(resolve_dirs(current_os(), std::path::Path::new(&home), &env))
}

/// Human name of the OS credential store used for secrets.
pub fn credential_store_name() -> &'static str {
    match current_os() {
        Os::Macos => "macOS Keychain",
        Os::Linux => "Secret Service",
        Os::Windows => "Windows Credential Manager",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn macos_uses_application_support_and_caches() {
        let d = resolve_dirs(Os::Macos, Path::new("/Users/a"), &HashMap::new());
        assert_eq!(
            d.data,
            Path::new("/Users/a/Library/Application Support").join(branding::DATA_FOLDER)
        );
        assert_eq!(d.config, d.data);
        assert_eq!(
            d.cache,
            Path::new("/Users/a/Library/Caches").join(branding::DATA_FOLDER)
        );
    }

    #[test]
    fn linux_defaults_follow_xdg() {
        let d = resolve_dirs(Os::Linux, Path::new("/home/a"), &HashMap::new());
        let n = branding::DATA_FOLDER.to_lowercase();
        assert_eq!(d.data, Path::new("/home/a/.local/share").join(&n));
        assert_eq!(d.config, Path::new("/home/a/.config").join(&n));
        assert_eq!(d.cache, Path::new("/home/a/.cache").join(&n));
    }

    #[test]
    fn linux_honors_xdg_overrides_and_ignores_empty() {
        let env = HashMap::from([
            ("XDG_DATA_HOME".to_string(), "/mnt/d".to_string()),
            ("XDG_CONFIG_HOME".to_string(), String::new()),
        ]);
        let d = resolve_dirs(Os::Linux, Path::new("/home/a"), &env);
        let n = branding::DATA_FOLDER.to_lowercase();
        assert_eq!(d.data, Path::new("/mnt/d").join(&n));
        assert_eq!(d.config, Path::new("/home/a/.config").join(&n));
    }

    #[test]
    fn windows_uses_appdata() {
        let env = HashMap::from([
            ("APPDATA".to_string(), "C:/Users/a/AppData/Roaming".to_string()),
            ("LOCALAPPDATA".to_string(), "C:/Users/a/AppData/Local".to_string()),
            ("XDG_DATA_HOME".to_string(), "/ignored".to_string()),
        ]);
        let d = resolve_dirs(Os::Windows, Path::new("C:/Users/a"), &env);
        let name = branding::DATA_FOLDER;
        assert_eq!(d.data, Path::new("C:/Users/a/AppData/Roaming").join(name));
        assert_eq!(d.config, d.data);
        assert_eq!(d.cache, Path::new("C:/Users/a/AppData/Local").join(name).join("cache"));
        // without the variables, the usual folders under the home folder
        let d = resolve_dirs(Os::Windows, Path::new("C:/Users/a"), &HashMap::new());
        assert_eq!(
            d.data,
            Path::new("C:/Users/a").join("AppData").join("Roaming").join(name)
        );
    }

    #[test]
    fn macos_ignores_xdg() {
        let env = HashMap::from([("XDG_DATA_HOME".to_string(), "/x".to_string())]);
        let d = resolve_dirs(Os::Macos, Path::new("/Users/a"), &env);
        assert!(d.data.starts_with("/Users/a/Library"));
    }
}
