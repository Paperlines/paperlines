mod agent;
mod assistants;
mod citations;
mod library;
#[cfg(unix)]
mod linux;
mod maintenance;
mod platform;
mod updater;

use paperlines_core::db::Db;
use paperlines_core::highlights::{self, Highlight, HighlightPatch, NewHighlight};
use paperlines_core::model::{Item, ItemInput};
use paperlines_core::notes::{self, NewNote, Note, NoteRef};
use paperlines_core::paths::LibraryPaths;
use paperlines_core::platform::{self as os, AppDirs, Os};
use paperlines_core::projects::{self, ProjectInfo};
use paperlines_core::saved_searches::{self, SavedSearch};
use paperlines_core::settings::{self, Settings, SettingsPatch};
use paperlines_core::tags::{self, TagInfo};
use paperlines_core::{items, Error, Result};
use paperlines_import::pipeline::{self, CommitResult, Decision, Preview};
use paperlines_search::SearchResult;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

struct AppState {
    db: Arc<Mutex<Db>>,
    lib: LibraryPaths,
    dirs: AppDirs,
    secrets: Arc<paperlines_core::secrets::Secrets>,
}

impl AppState {
    fn db(&self) -> MutexGuard<'_, Db> {
        self.db.lock().unwrap_or_else(|p| p.into_inner())
    }
}

#[derive(Serialize)]
struct PlatformInfo {
    os: Os,
    dirs: AppDirs,
    library: String,
    credential_store: String,
}

#[derive(Serialize, Clone)]
struct Progress {
    done: usize,
    total: usize,
}

#[tauri::command]
fn platform_info(state: tauri::State<AppState>) -> PlatformInfo {
    PlatformInfo {
        os: os::current_os(),
        dirs: state.dirs.clone(),
        library: state.lib.root.to_string_lossy().into(),
        credential_store: os::credential_store_name().into(),
    }
}

#[tauri::command]
fn list_items(state: tauri::State<AppState>) -> Result<Vec<Item>> {
    items::list_items(&state.db().conn)
}

#[tauri::command]
fn update_item(state: tauri::State<AppState>, id: i64, input: ItemInput) -> Result<Item> {
    let mut db = state.db();
    db.tx(|c| {
        items::update_item(c, id, &input)?;
        // DOI, title or year may have changed: match again in both directions
        paperlines_citations::edges::relink_items(c, &[id]).map(|_| ())
    })?;
    items::get_item(&db.conn, id)?.ok_or_else(|| Error::msg("Item not found"))
}

#[tauri::command]
fn delete_item(state: tauri::State<AppState>, id: i64) -> Result<()> {
    state.db().tx(|c| items::trash(c, &[id]))
}

#[tauri::command]
fn delete_items(state: tauri::State<AppState>, ids: Vec<i64>) -> Result<()> {
    state.db().tx(|c| items::trash(c, &ids))
}

#[tauri::command]
fn set_read_status(state: tauri::State<AppState>, ids: Vec<i64>, status: String) -> Result<()> {
    state.db().tx(|c| items::set_read_status(c, &ids, &status))
}

#[tauri::command]
fn search(state: tauri::State<AppState>, query: String) -> Result<SearchResult> {
    paperlines_search::search(&state.db().conn, &query)
}

#[tauri::command]
fn list_tags(state: tauri::State<AppState>) -> Result<Vec<TagInfo>> {
    tags::list(&state.db().conn)
}

#[tauri::command]
fn tag_items(state: tauri::State<AppState>, ids: Vec<i64>, tags: Vec<String>) -> Result<()> {
    state.db().tx(|c| tags::tag_items(c, &ids, &tags))
}

#[tauri::command]
fn untag_items(state: tauri::State<AppState>, ids: Vec<i64>, tags: Vec<String>) -> Result<()> {
    state.db().tx(|c| tags::untag_items(c, &ids, &tags))
}

#[tauri::command]
fn rename_tag(state: tauri::State<AppState>, from: String, to: String) -> Result<()> {
    state.db().tx(|c| tags::rename(c, &from, &to))
}

#[tauri::command]
fn delete_tag(state: tauri::State<AppState>, path: String) -> Result<()> {
    state.db().tx(|c| tags::delete(c, &path))
}

#[tauri::command]
fn set_tag_color(state: tauri::State<AppState>, path: String, color: Option<String>) -> Result<()> {
    state.db().tx(|c| tags::set_color(c, &path, color.as_deref()))
}

#[tauri::command]
fn list_projects(state: tauri::State<AppState>) -> Result<Vec<ProjectInfo>> {
    projects::list(&state.db().conn)
}

#[tauri::command]
fn create_project(state: tauri::State<AppState>, name: String, description: Option<String>) -> Result<i64> {
    state.db().tx(|c| projects::create(c, &name, description.as_deref()))
}

#[tauri::command]
fn set_project_color(state: tauri::State<AppState>, id: i64, color: String) -> Result<()> {
    state.db().tx(|c| projects::set_color(c, id, &color))
}

#[tauri::command]
fn update_project(state: tauri::State<AppState>, id: i64, name: String, description: Option<String>) -> Result<()> {
    state
        .db()
        .tx(|c| projects::update(c, id, &name, description.as_deref()))
}

#[tauri::command]
fn delete_project(state: tauri::State<AppState>, id: i64) -> Result<()> {
    state.db().tx(|c| projects::delete(c, id))
}

#[tauri::command]
fn add_to_project(state: tauri::State<AppState>, project_id: i64, ids: Vec<i64>) -> Result<()> {
    state.db().tx(|c| projects::add_items(c, project_id, &ids))
}

#[tauri::command]
fn remove_from_project(state: tauri::State<AppState>, project_id: i64, ids: Vec<i64>) -> Result<()> {
    state.db().tx(|c| projects::remove_items(c, project_id, &ids))
}

#[tauri::command]
fn list_saved_searches(state: tauri::State<AppState>) -> Result<Vec<SavedSearch>> {
    saved_searches::list(&state.db().conn)
}

#[tauri::command]
fn create_saved_search(state: tauri::State<AppState>, name: String, query: String) -> Result<i64> {
    saved_searches::create(&state.db().conn, &name, &query)
}

#[tauri::command]
fn delete_saved_search(state: tauri::State<AppState>, id: i64) -> Result<()> {
    saved_searches::delete(&state.db().conn, id)
}

fn pdf_path(state: &AppState, item_id: i64) -> Result<PathBuf> {
    let att =
        highlights::pdf_attachment(&state.db().conn, item_id)?.ok_or_else(|| Error::msg("This item has no PDF"))?;
    Ok(paperlines_core::attachments::stored_path(&state.lib.pdfs, &att.hash))
}

/// PDF bytes as a raw binary IPC response (no base64).
#[tauri::command]
fn read_pdf(state: tauri::State<AppState>, item_id: i64) -> Result<tauri::ipc::Response> {
    let path = pdf_path(&state, item_id)?;
    Ok(tauri::ipc::Response::new(std::fs::read(path)?))
}

#[tauri::command]
fn attach_pdf(state: tauri::State<AppState>, item_id: i64, path: String) -> Result<Item> {
    let stored = paperlines_core::attachments::store_pdf(&state.lib.pdfs, std::path::Path::new(&path))?;
    let pages = paperlines_import::pdf::extract(std::path::Path::new(&path))
        .ok()
        .and_then(|m| m.page_count);
    let mut db = state.db();
    db.tx(|c| paperlines_core::attachments::add_attachment(c, item_id, &stored, pages).map(|_| ()))?;
    items::get_item(&db.conn, item_id)?.ok_or_else(|| Error::msg("Item not found"))
}

#[tauri::command]
fn list_highlights(state: tauri::State<AppState>, item_id: i64) -> Result<Vec<Highlight>> {
    highlights::list_for_item(&state.db().conn, item_id)
}

#[tauri::command]
fn create_highlight(state: tauri::State<AppState>, highlight: NewHighlight) -> Result<Highlight> {
    state.db().tx(|c| highlights::create(c, &highlight))
}

#[tauri::command]
fn update_highlight(state: tauri::State<AppState>, id: i64, patch: HighlightPatch) -> Result<Highlight> {
    state.db().tx(|c| highlights::update(c, id, &patch))
}

/// A highlight known by its words, placed where the reader found them.
#[tauri::command]
fn place_highlight(
    state: tauri::State<AppState>,
    id: i64,
    page: i64,
    rects: Vec<highlights::Rect>,
) -> Result<Highlight> {
    state.db().tx(|c| highlights::place(c, id, page, &rects))
}

#[tauri::command]
fn delete_highlight(state: tauri::State<AppState>, id: i64) -> Result<()> {
    state.db().tx(|c| highlights::delete(c, id))
}

#[tauri::command]
fn export_annotated_pdf(state: tauri::State<AppState>, item_id: i64, dest: String) -> Result<usize> {
    use paperlines_import::annotate::{color_rgb, export, Annotation};
    let src = pdf_path(&state, item_id)?;
    let annots: Vec<Annotation> = highlights::list_for_item(&state.db().conn, item_id)?
        .into_iter()
        .map(|h| Annotation {
            page: h.page as u32,
            kind: h.kind,
            rects: h.rects.iter().map(|r| (r.x, r.y, r.w, r.h)).collect(),
            rgb: color_rgb(&h.color),
            contents: h.comment.or(h.text),
        })
        .collect();
    export(&src, std::path::Path::new(&dest), &annots).map_err(Error::Msg)
}

#[tauri::command]
fn get_paper_note(state: tauri::State<AppState>, item_id: i64) -> Result<Note> {
    notes::paper_note(&state.db().conn, item_id)
}

#[tauri::command]
fn get_note(state: tauri::State<AppState>, id: i64) -> Result<Note> {
    notes::get(&state.db().conn, id)
}

#[tauri::command]
fn save_note(state: tauri::State<AppState>, id: i64, body: String) -> Result<Note> {
    state.db().tx(|c| notes::save_body(c, id, &body))
}

#[tauri::command]
fn create_note(state: tauri::State<AppState>, note: NewNote) -> Result<Note> {
    state.db().tx(|c| notes::create(c, &note))
}

#[tauri::command]
fn rename_note(state: tauri::State<AppState>, id: i64, title: String) -> Result<Note> {
    state.db().tx(|c| notes::rename(c, id, &title))
}

#[tauri::command]
fn delete_note(state: tauri::State<AppState>, id: i64) -> Result<()> {
    state.db().tx(|c| notes::delete(c, id))
}

#[tauri::command]
fn list_notes(state: tauri::State<AppState>, item_id: Option<i64>) -> Result<Vec<NoteRef>> {
    notes::list(&state.db().conn, item_id)
}

#[tauri::command]
fn item_backlinks(state: tauri::State<AppState>, item_id: i64) -> Result<Vec<NoteRef>> {
    notes::backlinks_to_item(&state.db().conn, item_id)
}

#[tauri::command]
fn note_backlinks(state: tauri::State<AppState>, note_id: i64) -> Result<Vec<NoteRef>> {
    notes::backlinks_to_note(&state.db().conn, note_id)
}

#[tauri::command]
fn append_to_paper_note(state: tauri::State<AppState>, item_id: i64, bullet: String) -> Result<Note> {
    state.db().tx(|c| notes::append_bullet(c, item_id, &bullet))
}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Result<Settings> {
    settings::load(&state.db().conn)
}

#[tauri::command]
fn update_settings(state: tauri::State<AppState>, patch: SettingsPatch) -> Result<Settings> {
    settings::apply(&state.db().conn, &patch)
}

enum Source {
    Paths(Vec<PathBuf>),
    Text(String),
}

/// Runs off the UI thread; holds the DB lock only for the short duplicate check.
async fn preview(app: tauri::AppHandle, db: Arc<Mutex<Db>>, src: Source) -> Result<Preview> {
    tauri::async_runtime::spawn_blocking(move || {
        let offline = settings::load(&db.lock().unwrap_or_else(|p| p.into_inner()).conn)?.offline_mode;
        let progress = |done, total| {
            let _ = app.emit("import-progress", Progress { done, total });
        };
        let mut pv = match src {
            Source::Paths(p) => pipeline::preview_paths(&p, offline, &progress),
            Source::Text(t) => pipeline::preview_text(&t, offline, &progress),
        };
        pipeline::mark_duplicates(&db.lock().unwrap_or_else(|p| p.into_inner()).conn, &mut pv.candidates)?;
        Ok(pv)
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))?
}

#[tauri::command]
async fn import_preview_paths(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Preview> {
    let paths = paths.into_iter().map(PathBuf::from).collect();
    preview(app, state.db.clone(), Source::Paths(paths)).await
}

#[tauri::command]
async fn import_preview_text(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    text: String,
) -> Result<Preview> {
    preview(app, state.db.clone(), Source::Text(text)).await
}

#[tauri::command]
fn import_commit(app: tauri::AppHandle, state: tauri::State<AppState>, decisions: Vec<Decision>) -> CommitResult {
    let r = pipeline::commit(&mut state.db(), &state.lib, &decisions);
    let mut ids = r.added.clone();
    ids.extend(&r.merged);
    citations::after_import(&app, &state, ids);
    r
}

fn open_state() -> std::result::Result<AppState, String> {
    let dirs = os::app_dirs().ok_or("Could not find the home folder")?;
    let lib = LibraryPaths::new(&paperlines_core::config::library_root(&dirs));
    lib.ensure().map_err(|e| e.to_string())?;
    let db = Db::open_with_backup(&lib.db, Some(&lib.backups)).map_err(|e| e.to_string())?;
    Ok(AppState {
        db: Arc::new(Mutex::new(db)),
        lib,
        secrets: citations::new_secrets(&dirs.config),
        dirs,
    })
}

/// The desktop's light/dark preference where the webview can't see it (Linux portal); null
/// elsewhere, where `prefers-color-scheme` already works.
#[tauri::command]
fn system_color_scheme() -> Option<&'static str> {
    #[cfg(target_os = "linux")]
    return linux::color_scheme().map(|d| if d { "dark" } else { "light" });
    #[cfg(not(target_os = "linux"))]
    None
}

pub fn run() {
    #[cfg(target_os = "linux")]
    linux::webkit_env();
    let state = open_state().expect("could not open the library");
    let app = tauri::Builder::default()
        // a second launch (e.g. "Open with" on Linux) forwards its files to the running window
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            maintenance::open_files(app, platform::file_args(&args));
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::Pending::default())
        .manage(state)
        .manage(agent::Runtime::default())
        .manage(maintenance::PendingOpens(std::sync::Mutex::new(platform::file_args(
            &std::env::args().collect::<Vec<_>>(),
        ))))
        .setup(|app| {
            #[cfg(target_os = "linux")]
            {
                let handle = app.handle().clone();
                let apply = move |dark: linux::Dark| {
                    // GTK draws the title bar: keep it in step with the page
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.set_theme(dark.map(|d| if d { tauri::Theme::Dark } else { tauri::Theme::Light }));
                    }
                    let _ = handle.emit("system-theme", dark.map(|d| if d { "dark" } else { "light" }));
                };
                apply(linux::color_scheme());
                linux::watch_color_scheme(apply);
            }
            maintenance::start_daily_backups(app.handle());
            library::start_background(app.handle());
            Ok(())
        })
        .menu(platform::build_menu)
        .on_menu_event(|app, ev| {
            if ev.id() == platform::SETTINGS_MENU_ID {
                let _ = app.emit("open-settings", ());
            }
        })
        .on_window_event(|w, ev| {
            if let WindowEvent::CloseRequested { api, .. } = ev {
                if platform::keep_alive_on_close() {
                    api.prevent_close();
                    let _ = w.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            platform_info,
            system_color_scheme,
            list_items,
            update_item,
            delete_item,
            delete_items,
            set_read_status,
            search,
            list_tags,
            tag_items,
            untag_items,
            rename_tag,
            delete_tag,
            set_tag_color,
            list_projects,
            create_project,
            update_project,
            set_project_color,
            delete_project,
            add_to_project,
            remove_from_project,
            list_saved_searches,
            create_saved_search,
            delete_saved_search,
            read_pdf,
            attach_pdf,
            list_highlights,
            create_highlight,
            update_highlight,
            delete_highlight,
            place_highlight,
            export_annotated_pdf,
            get_paper_note,
            get_note,
            save_note,
            create_note,
            rename_note,
            delete_note,
            list_notes,
            item_backlinks,
            note_backlinks,
            append_to_paper_note,
            citations::get_citations,
            citations::cached_citing,
            citations::find_citing,
            citations::citing_abstract,
            citations::graph_edges,
            citations::fetch_references,
            citations::add_citation,
            citations::remove_citation,
            citations::reset_citation,
            citations::secret_status,
            citations::set_secret,
            citations::delete_secret,
            maintenance::export_items,
            maintenance::export_library,
            maintenance::export_notes,
            maintenance::list_backups,
            maintenance::backup_now,
            maintenance::restore_backup,
            maintenance::run_doctor,
            maintenance::install_cli,
            agent::agent_info,
            agent::agent_save_config,
            agent::agent_send,
            agent::agent_stop,
            agent::agent_forget,
            agent::agent_chats,
            agent::agent_chat_get,
            agent::agent_chat_save,
            agent::agent_chat_delete,
            assistants::assistants_status,
            assistants::assistant_connect,
            assistants::assistant_skill,
            assistants::assistant_save_skill,
            maintenance::take_pending_opens,
            library::trash_items,
            library::restore_items,
            library::list_trash,
            library::empty_trash,
            library::duplicate_groups,
            library::merge_duplicates,
            library::dismiss_duplicates,
            library::find_pdfs,
            library::zotero_default_dir,
            library::import_zotero,
            library::import_dump,
            library::citation_styles,
            library::format_citation,
            library::list_auto_exports,
            library::add_auto_export,
            library::remove_auto_export,
            library::open_attachment,
            library::reveal_attachment,
            library::reidentify_pdf,
            library::relation_types,
            library::create_relation_type,
            library::update_relation_type,
            library::delete_relation_type,
            library::item_relations,
            library::all_relations,
            library::add_relation,
            library::update_relation,
            library::remove_relation,
            library::search_online,
            library::spine_get,
            library::spine_add,
            library::spine_remove,
            library::spine_add_step,
            library::spine_rename_step,
            library::spine_move_step,
            library::spine_reorder,
            library::spine_delete_step,
            library::suggestions_list,
            library::suggestion_set_status,
            library::suggestions_counts,
            library::library_location,
            library::set_library_location,
            library::copy_citation,
            library::export_formatted,
            updater::update_check,
            updater::update_install,
            get_settings,
            update_settings,
            import_preview_paths,
            import_preview_text,
            import_commit
        ])
        .build(tauri::generate_context!())
        .expect("error while building application");
    app.run(|app, ev| {
        // files dropped on the Dock icon or opened via Finder's "Open With"
        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = &ev {
            let paths = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            maintenance::open_files(app, paths);
        }
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = ev {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        let _ = (app, ev);
    });
}
