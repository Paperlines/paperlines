//! Export, backups, restore, doctor, CLI install, and files opened from the OS.
use crate::AppState;
use paperlines_core::backup::{self, BackupInfo};
use paperlines_core::doctor::{self, Report};
use paperlines_core::{Error, Result};
use paperlines_ops::{Format, Scope};
use serde::Deserialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum ScopeArg {
    All,
    Project(String),
    Query(String),
    Ids(Vec<i64>),
}

impl ScopeArg {
    pub fn into_scope(self) -> Scope {
        match self {
            ScopeArg::All => Scope::All,
            ScopeArg::Project(p) => Scope::Project(p),
            ScopeArg::Query(q) => Scope::Query(q),
            ScopeArg::Ids(ids) => Scope::Ids(ids),
        }
    }
}

#[tauri::command]
pub fn export_items(state: tauri::State<AppState>, format: String, scope: ScopeArg, dest: String) -> Result<String> {
    let scope = scope.into_scope();
    let text = paperlines_ops::export_items(&state.db().conn, Format::parse(&format)?, &scope)?;
    std::fs::write(&dest, text)?;
    Ok(dest)
}

/// The whole library, PDFs included, as a new folder inside `parent`.
#[tauri::command]
pub fn export_library(state: tauri::State<AppState>, parent: String) -> Result<paperlines_ops::LibraryExport> {
    // holding the database while the files are copied: nothing changes in between
    let db = state.db();
    paperlines_ops::export_library(&db.conn, &state.lib.pdfs, std::path::Path::new(&parent))
}

#[tauri::command]
pub fn export_notes(state: tauri::State<AppState>, dir: String) -> Result<usize> {
    paperlines_ops::export_notes_folder(&state.db().conn, std::path::Path::new(&dir))
}

#[tauri::command]
pub fn list_backups(state: tauri::State<AppState>) -> Result<Vec<BackupInfo>> {
    backup::list(&state.lib.backups)
}

#[tauri::command]
pub fn backup_now(state: tauri::State<AppState>) -> Result<String> {
    Ok(backup::manual(&state.db().conn, &state.lib.backups, "manual")?
        .to_string_lossy()
        .into_owned())
}

/// Replaces the library with a backup (the current state is saved first). The UI reloads after.
#[tauri::command]
pub fn restore_backup(state: tauri::State<AppState>, path: String) -> Result<String> {
    let p = std::path::Path::new(&path);
    if p.parent() != Some(state.lib.backups.as_path()) {
        return Err(Error::msg(
            "Only backups from the library's backups folder can be restored here",
        ));
    }
    let mut db = state.db();
    Ok(backup::restore(&mut db, &state.lib.db, &state.lib.backups, p)?
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
pub fn run_doctor(state: tauri::State<AppState>, fix: bool) -> Result<Report> {
    let lib = state.lib.clone();
    state.db().tx(|c| doctor::check(c, &lib, fix))
}

#[tauri::command]
pub fn install_cli() -> Result<crate::platform::CliInstall> {
    crate::platform::install_cli().map_err(Error::Msg)
}

/// Which Chrome-family browsers are installed and know Paperlines (Settings ▸ Browser extension).
#[tauri::command]
pub fn browser_status(state: tauri::State<crate::AppState>) -> Vec<paperlines_ops::browser::BrowserStatus> {
    use paperlines_ops::browser;
    match browser::home() {
        Some(home) => browser::status(&home, browser::os_name(), &state.dirs.config),
        None => Vec::new(),
    }
}

/// Registers the bundled command-line tool as the extension's native messaging host with every
/// installed Chrome-family browser.
#[tauri::command]
pub fn browser_connect(state: tauri::State<crate::AppState>) -> Result<Vec<paperlines_ops::browser::BrowserStatus>> {
    use paperlines_ops::browser;
    let home = browser::home().ok_or_else(|| Error::msg("No home folder"))?;
    let program = crate::platform::mcp_command().map_err(Error::Msg)?;
    browser::install(&home, browser::os_name(), &state.dirs.config, &program)
}

/// Files the OS asked us to open before the UI was listening.
#[derive(Default)]
pub struct PendingOpens(pub Mutex<Vec<String>>);

#[tauri::command]
pub fn take_pending_opens(pending: tauri::State<PendingOpens>) -> Vec<String> {
    std::mem::take(&mut *pending.0.lock().unwrap_or_else(|p| p.into_inner()))
}

/// Queue files for import and tell a running UI about them.
pub fn open_files(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(p) = app.try_state::<PendingOpens>() {
        p.0.lock().unwrap_or_else(|x| x.into_inner()).extend(paths.clone());
    }
    let _ = app.emit("files-opened", ());
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Today's backup now, then a check every hour (a new day gets a new snapshot).
pub fn start_daily_backups(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (db, dir) = (state.db.clone(), state.lib.backups.clone());
    std::thread::spawn(move || loop {
        {
            let g = db.lock().unwrap_or_else(|p| p.into_inner());
            if let Err(e) = backup::daily(&g.conn, &dir) {
                eprintln!("daily backup failed: {e}");
            }
        }
        std::thread::sleep(Duration::from_secs(3600));
    });
}
