//! In-app updates from GitHub Releases (tauri-plugin-updater).
//!
//! The release workflow publishes `latest.json` next to the signed bundles, with the release
//! notes and who contributed. The app checks it when it opens and asks the user; nothing is
//! downloaded or installed without their click. Bundles are verified against the public key in
//! `tauri.conf.json` before they are installed.
use crate::AppState;
use paperlines_core::{settings, Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

/// The update the user was last shown, kept so "Update now" installs exactly that one.
#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contributor {
    /// GitHub login, when the commits are linked to an account.
    pub login: Option<String>,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    /// RFC 3339, from `pub_date`.
    pub date: Option<String>,
    /// Markdown: this version's section of docs/CHANGELOG.md.
    pub notes: String,
    pub contributors: Vec<Contributor>,
    /// False where the app can't replace itself (deb/rpm/Nix, a dev build): the UI offers the
    /// download page instead.
    pub can_install: bool,
}

#[derive(Serialize, Clone)]
struct DownloadProgress {
    done: u64,
    total: Option<u64>,
}

/// The app can replace itself as a macOS .app, a Windows install, or a Linux AppImage. Packages
/// (deb, rpm, Nix) are updated by their package manager, and a dev build never replaces itself.
pub fn can_self_update(linux: bool, appimage: bool, debug: bool) -> bool {
    !debug && (!linux || appimage)
}

/// `contributors` from latest.json: entries without a name are dropped, and logins must look like
/// GitHub logins (they become links to github.com).
pub fn contributors(raw: &serde_json::Value) -> Vec<Contributor> {
    let Some(list) = raw.get("contributors").and_then(|c| c.as_array()) else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|c| {
            let login = c
                .get("login")
                .and_then(|l| l.as_str())
                .filter(|l| !l.is_empty() && l.len() <= 39)
                .filter(|l| l.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-'))
                .map(String::from);
            let name = c
                .get("name")
                .and_then(|n| n.as_str())
                .map(str::trim)
                .filter(|n| !n.is_empty())
                .map(String::from)
                .or_else(|| login.clone())?;
            Some(Contributor { login, name })
        })
        .collect()
}

#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    pending: tauri::State<'_, Pending>,
) -> Result<Option<UpdateInfo>> {
    if settings::load(&state.db().conn)?.offline_mode {
        return Err(Error::msg("Offline mode is on, so updates aren't checked."));
    }
    let updater = app
        .updater_builder()
        .header("User-Agent", paperlines_import::lookup::user_agent())
        .and_then(|b| b.timeout(Duration::from_secs(30)).build())
        .map_err(|e| Error::msg(e.to_string()))?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|e| Error::msg(format!("Couldn't check for updates: {e}")))?
    else {
        return Ok(None);
    };
    let info = UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        date: update
            .raw_json
            .get("pub_date")
            .and_then(|d| d.as_str())
            .map(String::from),
        notes: update.body.clone().unwrap_or_default(),
        contributors: contributors(&update.raw_json),
        can_install: can_self_update(
            cfg!(target_os = "linux"),
            std::env::var_os("APPIMAGE").is_some(),
            cfg!(debug_assertions),
        ),
    };
    *pending.0.lock().unwrap_or_else(|p| p.into_inner()) = Some(update);
    Ok(Some(info))
}

/// Downloads and installs the update found by the last check, then restarts the app. On Windows
/// the installer closes the app itself.
#[tauri::command]
pub async fn update_install(app: AppHandle, pending: tauri::State<'_, Pending>) -> Result<()> {
    let update = pending
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .take()
        .ok_or_else(|| Error::msg("Check for updates first."))?;
    let mut done = 0u64;
    let progress = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                done += chunk as u64;
                let _ = progress.emit("update-progress", DownloadProgress { done, total });
            },
            || {},
        )
        .await
        .map_err(|e| Error::msg(format!("The update couldn't be installed: {e}")))?;
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn who_can_update_in_place() {
        assert!(can_self_update(false, false, false)); // macOS, Windows
        assert!(can_self_update(true, true, false)); // AppImage
        assert!(!can_self_update(true, false, false)); // deb, rpm, Nix
        assert!(!can_self_update(false, false, true)); // dev build
    }

    #[test]
    fn contributors_from_latest_json() {
        let raw = json!({
            "contributors": [
                { "login": "ada", "name": "Ada Lovelace" },
                { "login": "bob" },
                { "name": "  Carol  " },
                { "login": "not a login", "name": "Dan" },
                { "login": "" },
                "junk"
            ]
        });
        assert_eq!(
            contributors(&raw),
            vec![
                Contributor {
                    login: Some("ada".into()),
                    name: "Ada Lovelace".into()
                },
                Contributor {
                    login: Some("bob".into()),
                    name: "bob".into()
                },
                Contributor {
                    login: None,
                    name: "Carol".into()
                },
                Contributor {
                    login: None,
                    name: "Dan".into()
                },
            ]
        );
        assert!(contributors(&json!({})).is_empty());
    }
}
