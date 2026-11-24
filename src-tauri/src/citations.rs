//! Citation commands and the background reference fetcher.
use crate::AppState;
use paperlines_citations::edges::{self, Citations};
use paperlines_citations::fetch::{fetch, Ids, Options};
use paperlines_citations::matcher::LibIndex;
use paperlines_citations::refs;
use paperlines_core::attachments::stored_path;
use paperlines_core::db::Db;
use paperlines_core::highlights::pdf_attachment;
use paperlines_core::secrets::{Backend, Secrets, NAMES};
use paperlines_core::{items, settings, Error, Result};
use serde::Serialize;
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct FetchSummary {
    pub fetched: usize,
    pub skipped: usize,
    pub failed: Vec<String>,
    pub linked: usize,
}

#[derive(Serialize, Clone)]
struct Progress {
    done: usize,
    total: usize,
}

fn lock(db: &Mutex<Db>) -> MutexGuard<'_, Db> {
    db.lock().unwrap_or_else(|p| p.into_inner())
}

/// Fetches and links reference lists one paper at a time. The DB lock is never held during
/// network calls, so the UI stays responsive.
pub fn run_fetch(
    app: &AppHandle,
    db: &Arc<Mutex<Db>>,
    pdfs: &std::path::Path,
    secrets: &Secrets,
    ids: &[i64],
    force: bool,
) -> FetchSummary {
    let mut sum = FetchSummary::default();
    let opts = {
        let conn = &lock(db).conn;
        let Ok(s) = settings::load(conn) else {
            sum.failed.push("Could not read settings".into());
            return sum;
        };
        Options {
            offline: s.offline_mode,
            openalex_key: secrets.get("openalex").ok().flatten(),
            s2_key: secrets.get("semantic_scholar").ok().flatten(),
            grobid_url: s.grobid_url,
        }
    };
    for (n, &id) in ids.iter().enumerate() {
        let job = {
            let g = lock(db);
            let item = items::get_item(&g.conn, id).ok().flatten();
            let cached = refs::has_cache(&g.conn, id).unwrap_or(false);
            match item {
                Some(_) if cached && !force => None,
                Some(i) => {
                    let pdf = pdf_attachment(&g.conn, id)
                        .ok()
                        .flatten()
                        .map(|a| stored_path(pdfs, &a.hash));
                    Some((
                        i.title,
                        Ids {
                            doi: i.doi,
                            arxiv: i.arxiv_id,
                            pdf,
                        },
                    ))
                }
                None => None,
            }
        };
        match job {
            None => sum.skipped += 1,
            Some((title, ids_)) => {
                if ids_.doi.is_none() && ids_.arxiv.is_none() && (opts.grobid_url.is_none() || ids_.pdf.is_none()) {
                    sum.skipped += 1;
                } else {
                    match fetch(&ids_, &opts) {
                        Ok(f) => {
                            let mut g = lock(db);
                            let r = g.tx(|c| {
                                refs::store(c, id, &f.refs, f.source)?;
                                edges::recompute_item(c, &LibIndex::load(c)?, id)
                            });
                            match r {
                                Ok(k) => {
                                    sum.fetched += 1;
                                    sum.linked += k;
                                }
                                Err(e) => sum.failed.push(format!("{title}: {e}")),
                            }
                        }
                        Err(e) => sum.failed.push(format!("{title}: {e}")),
                    }
                    // be polite to the free APIs
                    std::thread::sleep(std::time::Duration::from_millis(150));
                }
            }
        }
        let _ = app.emit(
            "references-progress",
            Progress {
                done: n + 1,
                total: ids.len(),
            },
        );
    }
    let _ = app.emit("references-updated", sum.clone());
    sum
}

/// Called after an import: link new papers from the cache now (offline), fetch theirs in the background.
pub fn after_import(app: &AppHandle, state: &AppState, ids: Vec<i64>) {
    if ids.is_empty() {
        return;
    }
    let (auto, pdfs_too) = {
        let mut g = state.db();
        let _ = g.tx(|c| edges::link_new_items(c, &ids));
        settings::load(&g.conn)
            .map(|s| {
                (
                    s.auto_fetch_references && (!s.offline_mode || s.grobid_url.is_some()),
                    s.auto_find_pdfs && !s.offline_mode,
                )
            })
            .unwrap_or((false, false))
    };
    if pdfs_too {
        find_pdfs_in_background(app, state, ids.clone());
    }
    if !auto {
        let _ = app.emit("references-updated", FetchSummary::default());
        return;
    }
    let (app, db, pdfs, secrets) = (
        app.clone(),
        state.db.clone(),
        state.lib.pdfs.clone(),
        state.secrets.clone(),
    );
    std::thread::spawn(move || {
        run_fetch(&app, &db, &pdfs, &secrets, &ids, false);
    });
}

/// Papers added without a file: download a legal open-access copy when one exists (OpenAlex,
/// arXiv). Uses its own connection, so the UI and the reference fetcher keep going. Reports
/// with `pdfs-found`.
fn find_pdfs_in_background(app: &AppHandle, state: &AppState, ids: Vec<i64>) {
    let needs: Vec<i64> = {
        let g = state.db();
        ids.into_iter()
            .filter(|id| {
                items::get_item(&g.conn, *id)
                    .ok()
                    .flatten()
                    .is_some_and(|i| !i.has_pdf && !i.has_epub && (i.doi.is_some() || i.arxiv_id.is_some()))
            })
            .collect()
    };
    if needs.is_empty() {
        return;
    }
    let (app, root) = (app.clone(), state.lib.root.clone());
    let _ = app.emit("pdfs-searching", needs.len());
    std::thread::spawn(move || {
        let report = paperlines_ops::Library::open(Some(&root))
            .and_then(|mut lib| paperlines_ops::manage::find_pdfs(&mut lib, &needs));
        if let Ok(r) = report {
            let _ = app.emit("pdfs-found", r);
        }
    });
}

#[tauri::command]
pub fn get_citations(state: tauri::State<AppState>, item_id: i64) -> Result<Citations> {
    edges::citations(&state.db().conn, item_id)
}

#[tauri::command]
pub async fn fetch_references(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    item_ids: Vec<i64>,
    force: bool,
) -> Result<FetchSummary> {
    let (db, pdfs, secrets) = (state.db.clone(), state.lib.pdfs.clone(), state.secrets.clone());
    tauri::async_runtime::spawn_blocking(move || run_fetch(&app, &db, &pdfs, &secrets, &item_ids, force))
        .await
        .map_err(|e| Error::msg(e.to_string()))
}

#[tauri::command]
pub fn add_citation(state: tauri::State<AppState>, citing: i64, cited: i64) -> Result<()> {
    state.db().tx(|c| edges::add_manual(c, citing, cited))
}

#[tauri::command]
pub fn remove_citation(state: tauri::State<AppState>, citing: i64, cited: i64) -> Result<()> {
    state.db().tx(|c| edges::remove_manual(c, citing, cited))
}

#[tauri::command]
pub fn reset_citation(state: tauri::State<AppState>, citing: i64, cited: i64) -> Result<()> {
    state.db().tx(|c| edges::reset(c, citing, cited))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    name: String,
    location: Option<Backend>,
}

#[tauri::command]
pub fn secret_status(state: tauri::State<AppState>) -> Result<Vec<SecretStatus>> {
    NAMES
        .iter()
        .map(|n| {
            Ok(SecretStatus {
                name: n.to_string(),
                location: state.secrets.location(n)?,
            })
        })
        .collect()
}

/// Write-only from the UI: secrets can be set or cleared, never read back.
#[tauri::command]
pub fn set_secret(state: tauri::State<AppState>, name: String, value: String) -> Result<Backend> {
    state.secrets.set(&name, &value)
}

#[tauri::command]
pub fn delete_secret(state: tauri::State<AppState>, name: String) -> Result<()> {
    state.secrets.delete(&name)
}

pub fn new_secrets(config_dir: &std::path::Path) -> Arc<Secrets> {
    Arc::new(Secrets::new(config_dir, true))
}

/// All visible edges as [citing, cited] pairs, for the graph view.
#[tauri::command]
pub fn graph_edges(state: tauri::State<AppState>) -> Result<Vec<(i64, i64)>> {
    edges::all_edges(&state.db().conn)
}

// ---- papers that cite a library paper ----

use paperlines_citations::citing::{self, CitingReport};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CitingProgress {
    item_id: i64,
    done: usize,
    total: u64,
}

/// The cached citing papers of a paper (no network), matched against the library as it is now.
#[tauri::command]
pub fn cached_citing(state: tauri::State<AppState>, item_id: i64) -> Result<Option<CitingReport>> {
    citing::report(&state.db().conn, item_id)
}

/// Looks up the papers citing a paper (unless a recent copy is cached, or `refresh`). Progress
/// comes as `citing-progress` events; the database is never locked during network calls.
#[tauri::command]
pub async fn find_citing(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    item_id: i64,
    refresh: bool,
) -> Result<CitingReport> {
    let (db, secrets) = (state.db.clone(), state.secrets.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let (prepared, opts) = {
            let g = lock(&db);
            let s = settings::load(&g.conn)?;
            let p = citing::prepare(&g.conn, item_id, refresh, s.offline_mode)?;
            let opts = Options {
                offline: s.offline_mode,
                openalex_key: secrets.get("openalex").ok().flatten(),
                s2_key: secrets.get("semantic_scholar").ok().flatten(),
                grobid_url: None,
            };
            (p, opts)
        };
        let downloaded = citing::download(&prepared, &opts, citing::DEFAULT_LIMIT, &mut |done, total| {
            let _ = app.emit("citing-progress", CitingProgress { item_id, done, total });
        });
        let mut g = lock(&db);
        match downloaded {
            Ok(d) => g.tx(|c| citing::save(c, &prepared, &d))?,
            // keep showing an older copy when the network fails
            Err(_) if citing::load(&g.conn, item_id)?.is_some() => {}
            Err(e) => return Err(Error::msg(e)),
        }
        citing::report(&g.conn, item_id)?.ok_or_else(|| Error::msg("No citing papers found"))
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))?
}

/// The abstract of one citing paper, fetched when its row is opened (null: none available).
#[tauri::command]
pub async fn citing_abstract(
    state: tauri::State<'_, AppState>,
    openalex_id: Option<String>,
    doi: Option<String>,
    arxiv_id: Option<String>,
) -> Result<Option<String>> {
    let opts = {
        let g = state.db();
        let s = settings::load(&g.conn)?;
        Options {
            offline: s.offline_mode,
            openalex_key: state.secrets.get("openalex").ok().flatten(),
            s2_key: state.secrets.get("semantic_scholar").ok().flatten(),
            grobid_url: None,
        }
    };
    tauri::async_runtime::spawn_blocking(move || {
        citing::fetch_abstract(openalex_id.as_deref(), doi.as_deref(), arxiv_id.as_deref(), &opts).map_err(Error::msg)
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))?
}
