//! Trash, duplicates, open-access PDFs, Zotero/dump import, citations, auto-exports,
//! library location and opening attachments.
use crate::AppState;
use paperlines_core::{config, items, settings, suggestions, Error, Result};
use paperlines_ops::cite::{self, Formatted, StyleInfo};
use paperlines_ops::manage::{self, AutoExport, DuplicateGroupView, FindPdfReport, ImportReport};
use paperlines_ops::Library;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

/// Runs `f` with a Library view of the app's open database.
fn with_lib<T>(state: &AppState, f: impl FnOnce(&mut Library) -> Result<T>) -> Result<T> {
    let mut g = state.db();
    let db = std::mem::replace(&mut *g, paperlines_core::db::Db::open_in_memory()?);
    let mut lib = Library {
        db,
        paths: state.lib.clone(),
    };
    let r = f(&mut lib);
    *g = lib.db;
    r
}

#[tauri::command]
pub fn trash_items(state: tauri::State<AppState>, ids: Vec<i64>) -> Result<()> {
    with_lib(&state, |l| manage::trash(l, &ids))
}

#[tauri::command]
pub fn restore_items(state: tauri::State<AppState>, ids: Vec<i64>) -> Result<()> {
    with_lib(&state, |l| manage::restore(l, &ids))
}

#[tauri::command]
pub fn list_trash(state: tauri::State<AppState>) -> Result<Vec<paperlines_core::model::Item>> {
    manage::list_trash(&state.db().conn)
}

/// Permanently deletes the given papers from the Trash (or all of it when `ids` is empty).
#[tauri::command]
pub fn empty_trash(state: tauri::State<AppState>, ids: Vec<i64>) -> Result<usize> {
    if ids.is_empty() {
        return with_lib(&state, |l| manage::empty_trash(l, None));
    }
    let files = state.db().tx(|c| {
        let trashed = items::trash_ids(c, None)?;
        let chosen: Vec<i64> = ids.into_iter().filter(|id| trashed.contains(id)).collect();
        Ok((chosen.len(), items::delete_for_good(c, &chosen)?))
    })?;
    paperlines_core::attachments::remove_stored_files(&state.lib.pdfs, &files.1);
    Ok(files.0)
}

#[tauri::command]
pub fn duplicate_groups(state: tauri::State<AppState>) -> Result<Vec<DuplicateGroupView>> {
    manage::duplicate_groups(&state.db().conn)
}

#[tauri::command]
pub fn merge_duplicates(state: tauri::State<AppState>, master: i64, others: Vec<i64>) -> Result<()> {
    with_lib(&state, |l| manage::merge_duplicates(l, master, &others))
}

#[tauri::command]
pub fn dismiss_duplicates(state: tauri::State<AppState>, ids: Vec<i64>) -> Result<()> {
    with_lib(&state, |l| manage::dismiss_duplicates(l, &ids))
}

/// Network-bound: runs on a worker; opens its own connection so the UI stays responsive.
#[tauri::command]
pub async fn find_pdfs(state: tauri::State<'_, AppState>, ids: Vec<i64>) -> Result<FindPdfReport> {
    let root = state.lib.root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut lib = Library::open(Some(&root))?;
        manage::find_pdfs(&mut lib, &ids)
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))?
}

#[tauri::command]
pub fn zotero_default_dir() -> Option<String> {
    paperlines_import::zotero::default_data_dir().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn import_zotero(state: tauri::State<'_, AppState>, dir: String) -> Result<ImportReport> {
    let root = state.lib.root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut lib = Library::open(Some(&root))?;
        manage::import_zotero(&mut lib, Path::new(&dir))
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))?
}

#[tauri::command]
pub async fn import_dump(state: tauri::State<'_, AppState>, path: String) -> Result<ImportReport> {
    let root = state.lib.root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut lib = Library::open(Some(&root))?;
        manage::import_dump(&mut lib, Path::new(&path))
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))?
}

#[tauri::command]
pub fn citation_styles() -> Vec<StyleInfo> {
    cite::styles()
}

/// Formats the given papers; `mode` is "citation" or "bibliography". Uses the default style when none is given.
#[tauri::command]
pub fn format_citation(
    state: tauri::State<AppState>,
    ids: Vec<i64>,
    style: Option<String>,
    mode: String,
) -> Result<Formatted> {
    let conn = &state.db().conn;
    let style = style.unwrap_or(settings::load(conn)?.citation_style);
    let papers = manage::items_by_ids(conn, &ids)?;
    if mode == "bibliography" {
        cite::bibliography(&papers, &style)
    } else {
        cite::citation(&papers, &style)
    }
}

#[tauri::command]
pub fn list_auto_exports(state: tauri::State<AppState>) -> Result<Vec<AutoExport>> {
    manage::list_auto_exports(&state.db().conn)
}

#[tauri::command]
pub fn add_auto_export(
    state: tauri::State<AppState>,
    format: String,
    scope_kind: String,
    scope_value: Option<String>,
    path: String,
) -> Result<AutoExport> {
    with_lib(&state, |l| {
        manage::add_auto_export(l, &format, &scope_kind, scope_value.as_deref(), &path)
    })
}

#[tauri::command]
pub fn remove_auto_export(state: tauri::State<AppState>, id: i64) -> Result<()> {
    manage::remove_auto_export(&state.db().conn, id)
}

#[tauri::command]
pub fn open_attachment(app: AppHandle, state: tauri::State<AppState>, item_id: i64, kind: String) -> Result<()> {
    let path = paperlines_core::attachments::attachment_path(&state.db().conn, &state.lib.pdfs, item_id, &kind)?
        .ok_or_else(|| Error::msg("No file of that kind"))?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| Error::msg(e.to_string()))
}

/// Shows the stored file in Finder (or the Linux file manager), selected.
#[tauri::command]
pub fn reveal_attachment(app: AppHandle, state: tauri::State<AppState>, item_id: i64, kind: String) -> Result<()> {
    let path = paperlines_core::attachments::attachment_path(&state.db().conn, &state.lib.pdfs, item_id, &kind)?
        .ok_or_else(|| Error::msg("No file of that kind"))?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| Error::msg(e.to_string()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryLocation {
    pub current: String,
    pub is_default: bool,
    pub default: String,
}

#[tauri::command]
pub fn library_location(state: tauri::State<AppState>) -> LibraryLocation {
    LibraryLocation {
        current: state.lib.root.to_string_lossy().into_owned(),
        is_default: state.lib.root == state.dirs.data,
        default: state.dirs.data.to_string_lossy().into_owned(),
    }
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for e in std::fs::read_dir(from)?.flatten() {
        let p = e.path();
        if p.is_dir() {
            copy_dir(&p, &to.join(e.file_name()))?;
        } else if !to.join(e.file_name()).exists() {
            std::fs::copy(&p, to.join(e.file_name()))?;
        }
    }
    Ok(())
}

/// Switches the library folder and restarts. `mode`: "move" copies this library there first
/// (the old copy stays), "open" uses whatever is there (or starts empty), "default" goes back.
#[tauri::command]
pub fn set_library_location(
    app: AppHandle,
    state: tauri::State<AppState>,
    path: Option<String>,
    mode: String,
) -> Result<()> {
    let target = match (&mode[..], path) {
        ("default", _) => None,
        (_, Some(p)) => Some(PathBuf::from(p)),
        _ => return Err(Error::msg("Choose a folder")),
    };
    if let Some(t) = &target {
        if t == &state.lib.root {
            return Ok(());
        }
        if mode == "move" {
            if t.join("library.sqlite").exists() {
                return Err(Error::msg(
                    "That folder already has a library. Choose \u{201c}Open\u{201d} to use it.",
                ));
            }
            std::fs::create_dir_all(t)?;
            state
                .db()
                .conn
                .execute("VACUUM INTO ?1", [t.join("library.sqlite").to_string_lossy()])?;
            copy_dir(&state.lib.pdfs, &t.join("pdfs"))?;
            copy_dir(&state.lib.backups, &t.join("backups"))?;
        }
    }
    let mut c = config::load(&state.dirs.config);
    c.library_path = target;
    config::save(&state.dirs.config, &c)?;
    app.restart();
}

/// Deletes for good the papers that have been in the Trash longer than the setting allows
/// (Settings ▸ Library, 30 days by default; 0 keeps them). Returns how many went.
fn purge_expired_trash(db: &Mutex<paperlines_core::db::Db>, pdfs: &Path) -> usize {
    let mut g = db.lock().unwrap_or_else(|p| p.into_inner());
    let days = match settings::load(&g.conn) {
        Ok(s) if s.trash_days > 0 => s.trash_days,
        _ => return 0,
    };
    let Ok((n, files)) = g.tx(|c| {
        let ids = items::trash_ids(c, Some(days))?;
        Ok((ids.len(), items::delete_for_good(c, &ids)?))
    }) else {
        return 0;
    };
    drop(g);
    paperlines_core::attachments::remove_stored_files(pdfs, &files);
    n
}

/// How often an open app looks for Trash papers past their time.
const TRASH_CHECK: Duration = Duration::from_secs(60 * 60);

/// Startup chores: purge old Trash items (again every hour while the app is open, since it can
/// stay open for weeks), then keep auto-export files current.
pub fn start_background(app: &AppHandle) {
    let state = app.state::<AppState>();
    let pdfs = state.lib.pdfs.clone();
    purge_expired_trash(&state.db, &pdfs);
    let db: Arc<Mutex<paperlines_core::db::Db>> = state.db.clone();
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last = u64::MAX;
        let mut checked = std::time::Instant::now();
        loop {
            if checked.elapsed() >= TRASH_CHECK {
                checked = std::time::Instant::now();
                let n = purge_expired_trash(&db, &pdfs);
                if n > 0 {
                    let _ = app.emit("trash-purged", n);
                }
            }
            {
                let g = db.lock().unwrap_or_else(|p| p.into_inner());
                let now = g.conn.total_changes();
                if now != last {
                    last = now;
                    if let Ok(n) = manage::refresh_auto_exports(&g.conn) {
                        if n > 0 {
                            let _ = app.emit("auto-exports-written", n);
                        }
                    }
                    last = g.conn.total_changes().max(last);
                }
            }
            std::thread::sleep(Duration::from_secs(3));
        }
    });
}

/// Formats and puts the result on the clipboard as HTML (rich paste in Word/Docs) and plain text.
/// Done in Rust: WebKit only allows page clipboard writes during the click itself.
#[tauri::command]
pub fn copy_citation(
    app: AppHandle,
    state: tauri::State<AppState>,
    ids: Vec<i64>,
    style: Option<String>,
    mode: String,
) -> Result<Formatted> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let f = format_citation(state, ids, style, mode)?;
    app.clipboard()
        .write_html(&f.html, Some(&f.text))
        .map_err(|e| Error::msg(e.to_string()))?;
    Ok(f)
}

/// Writes a formatted bibliography to `dest` (.html keeps italics; anything else is plain text).
#[tauri::command]
pub fn export_formatted(
    state: tauri::State<AppState>,
    scope: crate::maintenance::ScopeArg,
    style: Option<String>,
    dest: String,
) -> Result<String> {
    let conn = &state.db().conn;
    let style = style.unwrap_or(settings::load(conn)?.citation_style);
    let papers = paperlines_ops::select(conn, &scope.into_scope())?;
    let f = cite::bibliography(&papers, &style)?;
    let html = dest.to_lowercase().ends_with(".html") || dest.to_lowercase().ends_with(".htm");
    let body = if html {
        format!("<!doctype html>\n<meta charset=\"utf-8\">\n<title>References</title>\n<style>.csl-entry{{margin:0 0 .6em 2em;text-indent:-2em}}</style>\n{}\n", f.html)
    } else {
        format!("{}\n", f.text)
    };
    std::fs::write(&dest, body)?;
    Ok(dest)
}

/// Fresh details for a paper, read again from its PDF (like Zotero's "Retrieve metadata"): for
/// papers that were identified wrongly. Nothing is saved; the UI shows old and new first.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reidentified {
    pub input: paperlines_core::model::ItemInput,
    pub warnings: Vec<String>,
    /// A citekey for the new details, unique in the library (the paper's own key excepted).
    pub citekey: String,
}

#[tauri::command]
pub async fn reidentify_pdf(state: tauri::State<'_, AppState>, item_id: i64) -> Result<Reidentified> {
    let (path, offline) = {
        let g = state.db();
        let path = paperlines_core::attachments::attachment_path(&g.conn, &state.lib.pdfs, item_id, "pdf")?
            .ok_or_else(|| Error::msg("This paper has no PDF to read details from"))?;
        (path, settings::load(&g.conn)?.offline_mode)
    };
    let c = tauri::async_runtime::spawn_blocking(move || paperlines_import::pipeline::from_pdf(&path, offline))
        .await
        .map_err(|e| Error::msg(e.to_string()))?;
    let citekey = {
        let g = state.db();
        paperlines_core::citekey::unique_citekey(
            &g.conn,
            &paperlines_core::citekey::base_citekey(&c.input),
            Some(item_id),
        )?
    };
    Ok(Reidentified {
        input: c.input,
        warnings: c.warnings,
        citekey,
    })
}

// ---- typed connections between papers ----

use paperlines_core::relations::{self, Relation, RelationType, RelationView};

#[tauri::command]
pub fn relation_types(state: tauri::State<AppState>) -> Result<Vec<RelationType>> {
    relations::list_types(&state.db().conn)
}

#[tauri::command]
pub fn create_relation_type(
    state: tauri::State<AppState>,
    label: String,
    inverse_label: Option<String>,
    color: String,
) -> Result<i64> {
    state
        .db()
        .tx(|c| relations::create_type(c, &label, inverse_label.as_deref(), &color))
}

#[tauri::command]
pub fn update_relation_type(
    state: tauri::State<AppState>,
    id: i64,
    label: String,
    inverse_label: Option<String>,
    color: String,
) -> Result<()> {
    state
        .db()
        .tx(|c| relations::update_type(c, id, &label, inverse_label.as_deref(), &color))
}

#[tauri::command]
pub fn delete_relation_type(state: tauri::State<AppState>, id: i64) -> Result<()> {
    state.db().tx(|c| relations::delete_type(c, id))
}

#[tauri::command]
pub fn item_relations(state: tauri::State<AppState>, item_id: i64) -> Result<Vec<RelationView>> {
    relations::for_item(&state.db().conn, item_id)
}

#[tauri::command]
pub fn all_relations(state: tauri::State<AppState>) -> Result<Vec<Relation>> {
    relations::all(&state.db().conn)
}

#[tauri::command]
pub fn add_relation(
    state: tauri::State<AppState>,
    from: i64,
    to: i64,
    type_id: i64,
    note: Option<String>,
    evidence: Option<i64>,
) -> Result<Relation> {
    state
        .db()
        .tx(|c| relations::add(c, from, to, type_id, note.as_deref(), evidence))
}

#[tauri::command]
pub fn update_relation(
    state: tauri::State<AppState>,
    id: i64,
    type_id: i64,
    swap: bool,
    note: Option<String>,
    evidence: Option<i64>,
) -> Result<Relation> {
    state
        .db()
        .tx(|c| relations::update(c, id, type_id, swap, note.as_deref(), evidence))
}

#[tauri::command]
pub fn remove_relation(state: tauri::State<AppState>, id: i64) -> Result<()> {
    state.db().tx(|c| relations::remove(c, id))
}

// ---- online search ----

/// Searches OpenAlex, Semantic Scholar, arXiv, PubMed and Crossref (or the chosen ones) and marks
/// papers already in the library. The database is only read, before and after the network.
#[tauri::command]
pub async fn search_online(
    state: tauri::State<'_, AppState>,
    query: String,
    sources: Vec<String>,
) -> Result<paperlines_ops::discover::DiscoverReport> {
    use paperlines_ops::discover::{match_library, DiscoverReport, SourceError};
    let offline = settings::load(&state.db().conn)?.offline_mode;
    if offline {
        return Err(Error::msg("Offline mode is on, so online search is off."));
    }
    let keys = paperlines_ops::discover::keys(&state.dirs.config);
    let has_key = keys.openalex.is_some();
    let out = tauri::async_runtime::spawn_blocking(move || {
        let chosen: Vec<&str> = if sources.is_empty() {
            paperlines_import::discover::SOURCES.to_vec()
        } else {
            sources.iter().map(String::as_str).collect()
        };
        paperlines_import::discover::search(&query, &chosen, keys.openalex.as_deref(), keys.s2.as_deref())
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))?;
    Ok(DiscoverReport {
        hits: match_library(&state.db().conn, out.hits)?,
        errors: out
            .errors
            .into_iter()
            .map(|(source, message)| SourceError { source, message })
            .collect(),
        has_openalex_key: has_key,
    })
}

// ---- a project's spine ----

use paperlines_core::spine::{self, Step};

#[tauri::command]
pub fn spine_get(state: tauri::State<AppState>, project_id: i64) -> Result<Vec<Step>> {
    spine::get(&state.db().conn, project_id)
}

#[tauri::command]
pub fn spine_add(state: tauri::State<AppState>, project_id: i64, item_id: i64, step_id: Option<i64>) -> Result<i64> {
    state.db().tx(|c| spine::add(c, project_id, item_id, step_id))
}

#[tauri::command]
pub fn spine_remove(state: tauri::State<AppState>, project_id: i64, item_id: i64) -> Result<()> {
    state.db().tx(|c| spine::remove(c, project_id, item_id))
}

#[tauri::command]
pub fn spine_add_step(state: tauri::State<AppState>, project_id: i64, label: Option<String>) -> Result<i64> {
    state.db().tx(|c| spine::add_step(c, project_id, label.as_deref()))
}

#[tauri::command]
pub fn spine_rename_step(state: tauri::State<AppState>, step_id: i64, label: Option<String>) -> Result<()> {
    state.db().tx(|c| spine::rename_step(c, step_id, label.as_deref()))
}

#[tauri::command]
pub fn spine_move_step(state: tauri::State<AppState>, step_id: i64, delta: i64) -> Result<()> {
    state.db().tx(|c| spine::move_step(c, step_id, delta))
}

#[tauri::command]
pub fn spine_reorder(state: tauri::State<AppState>, step_id: i64, item_ids: Vec<i64>) -> Result<()> {
    state.db().tx(|c| spine::reorder_items(c, step_id, &item_ids))
}

#[tauri::command]
pub fn spine_delete_step(state: tauri::State<AppState>, step_id: i64) -> Result<()> {
    state.db().tx(|c| spine::delete_step(c, step_id))
}

// ---- the Suggestions inbox (papers an assistant proposed) ----

#[tauri::command]
pub fn suggestions_list(
    state: tauri::State<AppState>,
    project_id: Option<i64>,
) -> Result<Vec<suggestions::Suggestion>> {
    let db = state.db();
    suggestions::mark_imported(&db.conn)?;
    suggestions::list(&db.conn, project_id, Some("new"))
}

#[tauri::command]
pub fn suggestion_set_status(state: tauri::State<AppState>, id: i64, status: String) -> Result<()> {
    state.db().tx(|c| suggestions::set_status(c, id, &status))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionCount {
    /// None: the library's own inbox.
    pub project_id: Option<i64>,
    pub count: i64,
}

#[tauri::command]
pub fn suggestions_counts(state: tauri::State<AppState>) -> Result<Vec<SuggestionCount>> {
    let db = state.db();
    suggestions::mark_imported(&db.conn)?;
    Ok(suggestions::count_new(&db.conn)?
        .into_iter()
        .map(|(p, count)| SuggestionCount {
            project_id: (p != 0).then_some(p),
            count,
        })
        .collect())
}
