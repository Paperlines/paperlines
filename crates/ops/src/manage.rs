//! Library management shared by app and CLI: Zotero and dump import, open-access PDFs, Trash,
//! duplicates, and auto-updating export files.
use crate::{export_items, select, summary, Format, ItemSummary, Library, Scope};
use paperlines_citations::edges;
use paperlines_core::attachments::{add_attachment_of_kind, item_with_hash, store_file, stored_file_path};
use paperlines_core::duplicates::{self, DuplicateGroup};
use paperlines_core::highlights::{self, NewHighlight, Rect};
use paperlines_core::items::{self, find_duplicate, get_item, insert_item};
use paperlines_core::model::{Item, ItemInput};
use paperlines_core::notes::{self, NewNote};
use paperlines_core::rusqlite::{params, Connection, OptionalExtension};
use paperlines_core::{projects, saved_searches, settings, tags, Error, Result};
use paperlines_import::annotate::{from_pdf_rect, page_boxes};
use paperlines_import::{lookup, pdf, zotero};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

fn project_id(conn: &Connection, name: &str) -> Result<i64> {
    match projects::list(conn)?
        .into_iter()
        .find(|p| p.name.eq_ignore_ascii_case(name))
    {
        Some(p) => Ok(p.id),
        None => projects::create(conn, name, None),
    }
}

/// Attaches a file and its highlights (PDF rects in user space) to an item.
fn attach_with_annotations(
    lib: &mut Library,
    item: i64,
    file: &Path,
    kind: &str,
    anns: &[zotero::ZAnnotation],
) -> Result<usize> {
    let stored = store_file(&lib.paths.pdfs, file, kind)?;
    let pages = if kind == "pdf" {
        pdf::extract(file).ok().and_then(|m| m.page_count)
    } else {
        None
    };
    let boxes = if kind == "pdf" && !anns.is_empty() {
        page_boxes(file).unwrap_or_default()
    } else {
        Default::default()
    };
    lib.db.tx(|c| {
        if item_with_hash(c, &stored.hash)? != Some(item) {
            add_attachment_of_kind(c, item, &stored, pages, kind)?;
        }
        let mut n = 0;
        for a in anns {
            let Some((mb, rot)) = boxes.get(&a.page) else { continue };
            let rects: Vec<Rect> = a
                .rects
                .iter()
                .map(|r| {
                    let (x, y, w, h) = from_pdf_rect(*r, *mb, *rot);
                    Rect { x, y, w, h }
                })
                .collect();
            let h = NewHighlight {
                item_id: item,
                page: a.page as i64,
                kind: a.kind.clone(),
                rects,
                text: a.text.clone(),
                color: a.color.clone(),
                comment: a.comment.clone(),
            };
            if highlights::create(c, &h).is_ok() {
                n += 1;
            }
        }
        Ok(n)
    })
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub added: usize,
    pub duplicates: usize,
    pub files: usize,
    pub highlights: usize,
    pub notes: usize,
    pub projects: usize,
    pub warnings: Vec<String>,
}

/// Imports a Zotero library. Papers already in the library are skipped; nothing in Zotero changes.
pub fn import_zotero(lib: &mut Library, data_dir: &Path) -> Result<ImportReport> {
    let z = zotero::read(data_dir).map_err(Error::Msg)?;
    let mut r = ImportReport::default();
    let mut added = Vec::new();
    let before = projects::list(lib.conn())?.len();
    for it in z.items {
        if find_duplicate(lib.conn(), &it.input)?.is_some() {
            r.duplicates += 1;
            continue;
        }
        let id = match lib.db.tx(|c| {
            let id = insert_item(c, &it.input)?;
            tags::tag_items(c, &[id], &it.tags)?;
            for col in &it.collections {
                let p = project_id(c, col)?;
                projects::add_items(c, p, &[id])?;
            }
            for body in &it.notes {
                let title = body
                    .lines()
                    .next()
                    .unwrap_or("Note")
                    .trim_start_matches('#')
                    .trim()
                    .chars()
                    .take(80)
                    .collect::<String>();
                notes::create(
                    c,
                    &NewNote {
                        kind: "free".into(),
                        item_id: Some(id),
                        project_id: None,
                        highlight_id: None,
                        title: Some(title),
                        body: body.clone(),
                    },
                )?;
            }
            Ok(id)
        }) {
            Ok(id) => id,
            Err(e) => {
                r.warnings.push(format!("{}: {e}", it.input.title));
                continue;
            }
        };
        r.added += 1;
        r.notes += it.notes.len();
        added.push(id);
        for a in &it.attachments {
            match attach_with_annotations(lib, id, &a.path, &a.kind, &a.annotations) {
                Ok(n) => {
                    r.files += 1;
                    r.highlights += n;
                }
                Err(e) => r.warnings.push(format!("{}: {e}", a.path.display())),
            }
        }
        for m in &it.missing_files {
            r.warnings.push(format!("{}: file not found ({m})", it.input.title));
        }
    }
    r.projects = projects::list(lib.conn())?.len() - before;
    lib.db.tx(|c| edges::link_new_items(c, &added))?;
    Ok(r)
}

/// Imports a full JSON dump (from Export → Full library). Papers already present are skipped.
/// PDFs come back when found in this library or in a "pdfs" folder next to the dump.
pub fn import_dump(lib: &mut Library, path: &Path) -> Result<ImportReport> {
    // an exported library folder: library.json with pdfs/ beside it
    let file = if path.is_dir() {
        path.join("library.json")
    } else {
        path.to_path_buf()
    };
    let path = file.as_path();
    if !path.exists() {
        return Err(Error::msg(format!(
            "No library.json in {}",
            path.parent().unwrap_or(path).display()
        )));
    }
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path)?)?;
    if !v["format"].as_str().unwrap_or("").ends_with("-dump") {
        return Err(Error::msg("This is not a library dump"));
    }
    let side_dir = path.parent().map(|p| p.join("pdfs"));
    let mut r = ImportReport::default();
    let mut by_key: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for p in v["papers"].as_array().into_iter().flatten() {
        let Ok(input) = serde_json::from_value::<ItemInput>(p.clone()) else {
            continue;
        };
        let key = p["citekey"].as_str().unwrap_or_default().to_string();
        if let Some(existing) = find_duplicate(lib.conn(), &input)? {
            r.duplicates += 1;
            by_key.insert(key, existing);
            continue;
        }
        let tag_list: Vec<String> = p["tags"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|t| t.as_str().map(String::from))
            .collect();
        let body = p["paperNote"].as_str().unwrap_or_default().to_string();
        let id = lib.db.tx(|c| {
            let id = insert_item(c, &input)?;
            tags::tag_items(c, &[id], &tag_list)?;
            if !body.trim().is_empty() {
                let n = notes::paper_note(c, id)?;
                notes::save_body(c, n.id, &body)?;
            }
            Ok(id)
        })?;
        r.added += 1;
        by_key.insert(key, id);
        for a in p["attachments"].as_array().into_iter().flatten() {
            let (Some(hash), Some(kind)) = (a["hash"].as_str(), a["kind"].as_str()) else {
                continue;
            };
            let here = stored_file_path(&lib.paths.pdfs, hash, kind);
            let src = if here.exists() {
                Some(here)
            } else {
                side_dir
                    .as_ref()
                    .map(|d| stored_file_path(d, hash, kind))
                    .filter(|p| p.exists())
            };
            let Some(src) = src else {
                r.warnings.push(format!("{}: file {hash} not found", input.title));
                continue;
            };
            store_file(&lib.paths.pdfs, &src, kind)?;
            let stored = paperlines_core::attachments::StoredFile {
                hash: hash.to_string(),
                size: std::fs::metadata(&src).map(|m| m.len()).unwrap_or(0),
                filename: a["filename"].as_str().unwrap_or_default().to_string(),
            };
            let pages = if kind == "pdf" {
                pdf::extract(&src).ok().and_then(|m| m.page_count)
            } else {
                None
            };
            lib.db.tx(|c| add_attachment_of_kind(c, id, &stored, pages, kind))?;
            r.files += 1;
        }
        for h in p["highlights"].as_array().into_iter().flatten() {
            let Ok(rects) = serde_json::from_value::<Vec<Rect>>(h["rects"].clone()) else {
                continue;
            };
            // a highlight the reader hasn't placed yet comes back pending
            if rects.is_empty() {
                if let Some(text) = h["text"].as_str() {
                    let (page, color) = (h["page"].as_i64().unwrap_or(1), h["color"].as_str().unwrap_or("yellow"));
                    if lib
                        .db
                        .tx(|c| highlights::create_pending(c, id, page, text, color, h["comment"].as_str()))
                        .is_ok()
                    {
                        r.highlights += 1;
                    }
                }
                continue;
            }
            let nh = NewHighlight {
                item_id: id,
                page: h["page"].as_i64().unwrap_or(1),
                kind: h["kind"].as_str().unwrap_or("highlight").into(),
                rects,
                text: h["text"].as_str().map(String::from),
                color: h["color"].as_str().unwrap_or("yellow").into(),
                comment: h["comment"].as_str().map(String::from),
            };
            if lib.db.tx(|c| highlights::create(c, &nh)).is_ok() {
                r.highlights += 1;
            }
        }
    }
    let ids = |list: &Value| -> Vec<i64> {
        list.as_array()
            .into_iter()
            .flatten()
            .filter_map(|k| k.as_str().and_then(|k| by_key.get(k)).copied())
            .collect()
    };
    let existing = projects::list(lib.conn())?;
    let before = existing.len();
    for p in v["projects"].as_array().into_iter().flatten() {
        let Some(name) = p["name"].as_str() else { continue };
        let members = ids(&p["papers"]);
        // a project this import creates takes its colour; an existing one keeps its own
        let fresh = !existing.iter().any(|x| x.name == name);
        let color = p["color"].as_str().filter(|_| fresh).map(String::from);
        lib.db.tx(|c| {
            let pid = project_id(c, name)?;
            if let Some(color) = &color {
                projects::set_color(c, pid, color)?;
            }
            projects::add_items(c, pid, &members)
        })?;
    }
    r.projects = projects::list(lib.conn())?.len() - before;
    for t in v["tags"].as_array().into_iter().flatten() {
        if let (Some(path), Some(color)) = (t["path"].as_str(), t["color"].as_str()) {
            let _ = lib.db.tx(|c| tags::set_color(c, path, Some(color)));
        }
    }
    for n in v["notes"].as_array().into_iter().flatten() {
        let item = n["paper"].as_str().and_then(|k| by_key.get(k)).copied();
        let nn = NewNote {
            kind: "free".into(),
            item_id: item,
            project_id: None,
            highlight_id: None,
            title: n["title"].as_str().map(String::from),
            body: n["body"].as_str().unwrap_or_default().into(),
        };
        if lib.db.tx(|c| notes::create(c, &nn)).is_ok() {
            r.notes += 1;
        }
    }
    for rc in v["referenceCache"].as_array().into_iter().flatten() {
        let Some(id) = rc["paper"].as_str().and_then(|k| by_key.get(k)).copied() else {
            continue;
        };
        let Ok(list) = serde_json::from_value::<Vec<paperlines_citations::refs::RefEntry>>(rc["references"].clone())
        else {
            continue;
        };
        let source = rc["source"].as_str().unwrap_or("openalex").to_string();
        lib.db.tx(|c| {
            if !paperlines_citations::refs::has_cache(c, id)? {
                paperlines_citations::refs::store(c, id, &list, &source)?;
            }
            Ok(())
        })?;
    }
    // spines, by project name and citekey
    for p in v["projects"].as_array().into_iter().flatten() {
        let Some(name) = p["name"].as_str() else { continue };
        let Some(pid) = projects::list(lib.conn())?
            .into_iter()
            .find(|x| x.name == name)
            .map(|x| x.id)
        else {
            continue;
        };
        if !paperlines_core::spine::get(lib.conn(), pid)?.is_empty() {
            continue;
        }
        for st in p["spine"].as_array().into_iter().flatten() {
            let label = st["label"].as_str();
            let step = lib.db.tx(|c| paperlines_core::spine::add_step(c, pid, label))?;
            for k in st["papers"].as_array().into_iter().flatten().filter_map(Value::as_str) {
                if let Some(&id) = by_key.get(k) {
                    lib.db
                        .tx(|c| paperlines_core::spine::add(c, pid, id, Some(step)).map(|_| ()))?;
                }
            }
        }
    }
    for e in v["citations"].as_array().into_iter().flatten() {
        let (Some(a), Some(b)) = (
            e["citing"].as_str().and_then(|k| by_key.get(k)),
            e["cited"].as_str().and_then(|k| by_key.get(k)),
        ) else {
            continue;
        };
        if e["manual"].as_bool() == Some(true) {
            let (a, b) = (*a, *b);
            let hidden = e["hidden"].as_bool() == Some(true);
            let _ = lib.db.tx(|c| {
                if hidden {
                    edges::remove_manual(c, a, b)
                } else {
                    edges::add_manual(c, a, b)
                }
            });
        }
    }
    // typed connections: the user's own types are created when missing (matched by key)
    for t in v["relationTypes"].as_array().into_iter().flatten() {
        if t["builtin"].as_bool() == Some(true) {
            continue;
        }
        let (Some(key), Some(label)) = (t["key"].as_str(), t["label"].as_str()) else {
            continue;
        };
        if paperlines_core::relations::find_type(lib.conn(), key).is_err() {
            let color = t["color"].as_str().unwrap_or("gray");
            let _ = lib.db.tx(|c| {
                paperlines_core::relations::create_type(c, label, t["inverseLabel"].as_str(), color).map(|_| ())
            });
        }
    }
    for e in v["relations"].as_array().into_iter().flatten() {
        let (Some(a), Some(b), Some(ty)) = (
            e["from"].as_str().and_then(|k| by_key.get(k)),
            e["to"].as_str().and_then(|k| by_key.get(k)),
            e["type"].as_str(),
        ) else {
            continue;
        };
        let Ok(t) = paperlines_core::relations::find_type(lib.conn(), ty) else {
            r.warnings.push(format!("Unknown connection type {ty}"));
            continue;
        };
        let (a, b) = (*a, *b);
        // evidence: the highlight with the same page and text on that paper
        let evidence = (|| {
            let ev = &e["evidence"];
            let paper = *by_key.get(ev["paper"].as_str()?)?;
            let page = ev["page"].as_i64()?;
            let text = ev["text"].as_str();
            highlights::list_for_item(lib.conn(), paper)
                .ok()?
                .into_iter()
                .find(|h| h.page == page && h.text.as_deref() == text)
                .map(|h| h.id)
        })();
        let _ = lib
            .db
            .tx(|c| paperlines_core::relations::add(c, a, b, t.id, e["note"].as_str(), evidence).map(|_| ()));
    }
    // the Suggestions inbox, keeping each one's status
    for s in v["suggestions"].as_array().into_iter().flatten() {
        let Ok(new) = serde_json::from_value::<paperlines_core::suggestions::NewSuggestion>(s.clone()) else {
            continue;
        };
        let project = match s["project"].as_str() {
            Some(name) => match projects::list(lib.conn())?.into_iter().find(|p| p.name == name) {
                Some(p) => Some(p.id),
                None => continue,
            },
            None => None,
        };
        let status = s["status"].as_str().unwrap_or("new").to_string();
        lib.db.tx(|c| {
            if paperlines_core::suggestions::add_many(c, project, std::slice::from_ref(&new))?.added == 1
                && status != "new"
            {
                let key = paperlines_core::suggestions::key_of(&new);
                let id: Option<i64> = c
                    .query_row(
                        "SELECT id FROM suggestions WHERE coalesce(project_id, 0) = coalesce(?1, 0) AND key = ?2",
                        params![project, key],
                        |r| r.get(0),
                    )
                    .optional()?;
                if let Some(id) = id {
                    paperlines_core::suggestions::set_status(c, id, &status)?;
                }
            }
            Ok(())
        })?;
    }
    // saved assistant chats (kept once: a chat that's already here isn't doubled)
    let notes_by_title: std::collections::HashMap<String, i64> = paperlines_core::notes::list(lib.conn(), None)?
        .into_iter()
        .map(|n| (n.title, n.note_id))
        .collect();
    for ch in v["assistantChats"].as_array().into_iter().flatten() {
        let (Some(id), Some(title)) = (ch["id"].as_str(), ch["title"].as_str()) else {
            continue;
        };
        if paperlines_core::chats::get(lib.conn(), id).is_ok() {
            continue;
        }
        let item = ch["paper"].as_str().and_then(|k| by_key.get(k)).copied();
        let note = ch["note"].as_str().and_then(|t| notes_by_title.get(t)).copied();
        let agent = ch["agent"].as_str().unwrap_or("claude");
        let messages = ch.get("messages").cloned().unwrap_or(Value::Array(vec![])).to_string();
        lib.db.tx(|c| {
            paperlines_core::chats::begin(c, id, agent, title, item, note)?;
            paperlines_core::chats::save_messages(c, id, &messages)
        })?;
    }
    for s in v["savedSearches"].as_array().into_iter().flatten() {
        if let (Some(n), Some(q)) = (s["name"].as_str(), s["query"].as_str()) {
            if !saved_searches::list(lib.conn())?.iter().any(|x| x.name == n) {
                saved_searches::create(lib.conn(), n, q)?;
            }
        }
    }
    let all: Vec<i64> = by_key.values().copied().collect();
    lib.db.tx(|c| edges::relink_items(c, &all))?;
    Ok(r)
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindPdfReport {
    pub found: Vec<String>,
    pub not_found: Vec<String>,
    pub skipped: usize,
}

/// Looks for a legal open-access PDF (arXiv, OpenAlex) for papers without one and attaches it.
pub fn find_pdfs(lib: &mut Library, ids: &[i64]) -> Result<FindPdfReport> {
    if settings::load(lib.conn())?.offline_mode {
        return Err(Error::msg("Offline mode is on"));
    }
    let mut r = FindPdfReport::default();
    let tmp = lib.paths.root.join(".downloads");
    for &id in ids {
        let Some(item) = get_item(lib.conn(), id)? else {
            continue;
        };
        if item.has_pdf || (item.doi.is_none() && item.arxiv_id.is_none()) {
            r.skipped += 1;
            continue;
        }
        let urls = lookup::open_access_urls(item.doi.as_deref(), item.arxiv_id.as_deref()).unwrap_or_default();
        let mut got = false;
        for url in urls {
            if let Ok(file) = lookup::download_pdf(&url, &tmp) {
                let res = attach_with_annotations(lib, id, &file, "pdf", &[]);
                let _ = std::fs::remove_file(&file);
                if res.is_ok() {
                    got = true;
                    break;
                }
            }
        }
        if got {
            r.found.push(item.citekey)
        } else {
            r.not_found.push(item.citekey)
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }
    let _ = std::fs::remove_dir(&tmp);
    Ok(r)
}

// ---------- Trash ----------

pub fn trash(lib: &mut Library, ids: &[i64]) -> Result<()> {
    lib.db.tx(|c| items::trash(c, ids))
}

pub fn restore(lib: &mut Library, ids: &[i64]) -> Result<()> {
    lib.db.tx(|c| {
        items::restore(c, ids)?;
        edges::relink_items(c, ids).map(|_| ())
    })
}

pub fn list_trash(conn: &Connection) -> Result<Vec<Item>> {
    items::list_trash(conn)
}

/// Permanently deletes papers in the Trash (all, or only those older than `days`).
pub fn empty_trash(lib: &mut Library, older_than_days: Option<i64>) -> Result<usize> {
    let (n, files) = lib.db.tx(|c| {
        let ids = items::trash_ids(c, older_than_days)?;
        Ok((ids.len(), items::delete_for_good(c, &ids)?))
    })?;
    // their PDFs and EPUBs go too, unless another paper uses the same file
    paperlines_core::attachments::remove_stored_files(&lib.paths.pdfs, &files);
    Ok(n)
}

// ---------- Duplicates ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroupView {
    pub ids: Vec<i64>,
    pub reason: String,
    pub papers: Vec<ItemSummary>,
}

pub fn duplicate_groups(conn: &Connection) -> Result<Vec<DuplicateGroupView>> {
    duplicates::find_groups(conn)?
        .into_iter()
        .map(|DuplicateGroup { ids, reason }| {
            let papers = ids
                .iter()
                .filter_map(|id| get_item(conn, *id).ok().flatten())
                .map(|i| summary(&i))
                .collect();
            Ok(DuplicateGroupView { ids, reason, papers })
        })
        .collect()
}

pub fn merge_duplicates(lib: &mut Library, master: i64, others: &[i64]) -> Result<()> {
    lib.db.tx(|c| {
        duplicates::merge(c, master, others)?;
        edges::relink_items(c, &[master]).map(|_| ())
    })
}

pub fn dismiss_duplicates(lib: &mut Library, ids: &[i64]) -> Result<()> {
    lib.db.tx(|c| duplicates::dismiss(c, ids))
}

// ---------- Auto-updating exports ----------

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoExport {
    pub id: i64,
    pub format: String,
    pub scope_kind: String,
    pub scope_value: Option<String>,
    pub path: String,
    pub last_written: Option<String>,
    pub last_error: Option<String>,
}

fn scope_of(kind: &str, value: Option<&str>) -> Result<Scope> {
    Ok(match kind {
        "all" => Scope::All,
        "project" => Scope::Project(value.unwrap_or_default().into()),
        "query" => Scope::Query(value.unwrap_or_default().into()),
        other => return Err(Error::msg(format!("Unknown scope {other}"))),
    })
}

pub fn list_auto_exports(conn: &Connection) -> Result<Vec<AutoExport>> {
    let mut stmt = conn.prepare(
        "SELECT id, format, scope_kind, scope_value, path, last_written, last_error FROM auto_exports ORDER BY id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(AutoExport {
            id: r.get(0)?,
            format: r.get(1)?,
            scope_kind: r.get(2)?,
            scope_value: r.get(3)?,
            path: r.get(4)?,
            last_written: r.get(5)?,
            last_error: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

/// Adds a file that is rewritten whenever the library changes, and writes it now.
pub fn add_auto_export(
    lib: &mut Library,
    format: &str,
    scope_kind: &str,
    scope_value: Option<&str>,
    path: &str,
) -> Result<AutoExport> {
    let f = Format::parse(format)?;
    if !matches!(f, Format::Bibtex | Format::CslJson | Format::Ris | Format::Markdown) {
        return Err(Error::msg("Auto-export supports bibtex, csl-json, ris and markdown"));
    }
    scope_of(scope_kind, scope_value)?;
    lib.db.tx(|c| {
        c.execute(
            "INSERT INTO auto_exports(format, scope_kind, scope_value, path) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(path) DO UPDATE SET format = excluded.format, scope_kind = excluded.scope_kind, scope_value = excluded.scope_value",
            params![format, scope_kind, scope_value, path],
        )?;
        Ok(())
    })?;
    refresh_auto_exports(lib.conn())?;
    list_auto_exports(lib.conn())?
        .into_iter()
        .find(|a| a.path == path)
        .ok_or_else(|| Error::msg("Auto-export not saved"))
}

pub fn remove_auto_export(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM auto_exports WHERE id = ?1", [id])?;
    Ok(())
}

/// Rewrites every auto-export whose content changed. Returns how many files were written.
pub fn refresh_auto_exports(conn: &Connection) -> Result<usize> {
    let mut written = 0;
    for a in list_auto_exports(conn)? {
        let res = (|| -> Result<bool> {
            let text = export_items(
                conn,
                Format::parse(&a.format)?,
                &scope_of(&a.scope_kind, a.scope_value.as_deref())?,
            )?;
            let path = PathBuf::from(&a.path);
            if std::fs::read_to_string(&path).ok().as_deref() == Some(text.as_str()) {
                return Ok(false);
            }
            let tmp = path.with_extension("tmp-export");
            std::fs::write(&tmp, &text)?;
            std::fs::rename(&tmp, &path)?;
            Ok(true)
        })();
        match res {
            Ok(changed) => {
                if changed {
                    written += 1;
                    conn.execute(
                        "UPDATE auto_exports SET last_written = datetime('now'), last_error = NULL WHERE id = ?1",
                        [a.id],
                    )?;
                }
            }
            Err(e) => {
                conn.execute(
                    "UPDATE auto_exports SET last_error = ?2 WHERE id = ?1",
                    params![a.id, e.to_string()],
                )?;
            }
        }
    }
    Ok(written)
}

/// Items for citation formatting by id (keeps the given order).
pub fn items_by_ids(conn: &Connection, ids: &[i64]) -> Result<Vec<Item>> {
    select(conn, &Scope::Ids(ids.to_vec()))
}

/// Whether any paper (including the Trash) uses this DOI.
pub fn doi_in_library(conn: &Connection, doi: &str) -> Result<bool> {
    Ok(conn
        .query_row("SELECT 1 FROM items WHERE doi = ?1", [doi], |_| Ok(()))
        .optional()?
        .is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_core::model::Author;

    fn tiny_pdf() -> Vec<u8> {
        // one page, MediaBox 0 0 612 792
        let objs = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] >>",
            "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>",
            "<< /Length 0 >>\nstream\n\nendstream",
        ];
        let mut out = String::from("%PDF-1.4\n");
        let mut offs = Vec::new();
        for (i, o) in objs.iter().enumerate() {
            offs.push(out.len());
            out.push_str(&format!("{} 0 obj\n{o}\nendobj\n", i + 1));
        }
        let x = out.len();
        out.push_str(&format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1));
        for o in offs {
            out.push_str(&format!("{o:010} 00000 n \n"));
        }
        out.push_str(&format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n",
            objs.len() + 1
        ));
        out.into_bytes()
    }

    #[test]
    fn imports_a_zotero_library() {
        let dir = tempfile::tempdir().unwrap();
        let z = dir.path().join("Zotero");
        std::fs::create_dir_all(&z).unwrap();
        zotero::write_test_library(&z, &tiny_pdf());
        let mut lib = Library::open(Some(&dir.path().join("lib"))).unwrap();
        let r = import_zotero(&mut lib, &z).unwrap();
        assert_eq!(
            (r.added, r.files, r.highlights, r.notes, r.projects),
            (2, 1, 1, 1, 2),
            "{r:?}"
        );
        let a = crate::resolve(lib.conn(), "vaswani2017attention").unwrap();
        assert!(a.has_pdf);
        assert_eq!(a.tags, vec!["nlp", "transformers"]);
        let h = &highlights::list_for_item(lib.conn(), a.id).unwrap()[0];
        // [72,700,300,712] on a 612x792 page
        assert!(
            (h.rects[0].x - 72.0 / 612.0).abs() < 1e-6 && (h.rects[0].y - 80.0 / 792.0).abs() < 1e-6,
            "{:?}",
            h.rects
        );
        assert_eq!(h.comment.as_deref(), Some("key claim"));
        let names: Vec<String> = projects::list(lib.conn())
            .unwrap()
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert_eq!(names, vec!["Thesis", "Thesis / Chapter 2"]);
        // second import: everything is a duplicate
        let again = import_zotero(&mut lib, &z).unwrap();
        assert_eq!((again.added, again.duplicates), (0, 2));
    }

    #[test]
    fn exported_library_folder_carries_files_colours_and_evidence() {
        use paperlines_core::attachments::{add_attachment_of_kind, store_file};
        use paperlines_core::relations;
        let dir = tempfile::tempdir().unwrap();
        let mut src = Library::open(Some(&dir.path().join("a"))).unwrap();
        let file = dir.path().join("paper.pdf");
        std::fs::write(&file, b"%PDF-1.4 not really a pdf, but bytes to carry").unwrap();
        let stored = store_file(&src.paths.pdfs, &file, "pdf").unwrap();
        src.db
            .tx(|c| {
                let a = insert_item(
                    c,
                    &ItemInput {
                        title: "Attention Is All You Need".into(),
                        authors: vec![Author::new("Vaswani", "A")],
                        year: Some(2017),
                        ..Default::default()
                    },
                )?;
                let b = insert_item(
                    c,
                    &ItemInput {
                        title: "BERT".into(),
                        authors: vec![Author::new("Devlin", "J")],
                        year: Some(2019),
                        ..Default::default()
                    },
                )?;
                add_attachment_of_kind(c, a, &stored, Some(3), "pdf")?;
                let h = highlights::create(
                    c,
                    &NewHighlight {
                        item_id: a,
                        page: 2,
                        kind: "highlight".into(),
                        rects: vec![Rect {
                            x: 0.1,
                            y: 0.1,
                            w: 0.5,
                            h: 0.02,
                        }],
                        text: Some("self-attention".into()),
                        color: "yellow".into(),
                        comment: None,
                    },
                )?;
                let p = projects::create(c, "Thesis", None)?;
                projects::set_color(c, p, "purple")?;
                projects::add_items(c, p, &[a, b])?;
                let extends = relations::find_type(c, "extends")?;
                relations::add(c, b, a, extends.id, Some("builds the encoder"), Some(h.id))?;
                let sug = paperlines_core::suggestions::NewSuggestion {
                    doi: Some("10.9/dismissed".into()),
                    title: "Not for me".into(),
                    reason: Some("cited by 2".into()),
                    ..Default::default()
                };
                paperlines_core::suggestions::add_many(c, Some(p), &[sug])?;
                let id = paperlines_core::suggestions::list(c, Some(p), None)?[0].id;
                paperlines_core::suggestions::set_status(c, id, "dismissed")?;
                paperlines_core::chats::begin(c, "chat-a", "claude", "Summarize this", Some(a), None)?;
                paperlines_core::chats::set_session(c, "chat-a", "claude", Some("local-only"))?;
                paperlines_core::chats::save_messages(c, "chat-a", r#"[{"role":"user","text":"Summarize this"}]"#)?;
                Ok(())
            })
            .unwrap();

        let out = crate::export_library_to(src.conn(), &src.paths.pdfs, &dir.path().join("export")).unwrap();
        assert_eq!((out.papers, out.files), (2, 1));
        assert!(out.missing.is_empty());
        assert!(dir.path().join("export/library.json").is_file());
        assert!(dir.path().join(format!("export/pdfs/{}.pdf", stored.hash)).is_file());
        assert!(
            crate::export_library_to(src.conn(), &src.paths.pdfs, &dir.path().join("export")).is_err(),
            "never overwrites"
        );

        // a fresh library on another machine: the folder is all it gets
        let mut dst = Library::open(Some(&dir.path().join("b"))).unwrap();
        let r = import_dump(&mut dst, &dir.path().join("export")).unwrap();
        assert_eq!((r.added, r.files, r.highlights), (2, 1, 1));
        assert!(r.warnings.is_empty(), "{:?}", r.warnings);
        let a = crate::resolve(dst.conn(), "vaswani2017attention").unwrap();
        assert!(a.has_pdf);
        let p = projects::list(dst.conn()).unwrap();
        assert_eq!((p[0].name.as_str(), p[0].color.as_str()), ("Thesis", "purple"));
        let inbox = paperlines_core::suggestions::list(dst.conn(), Some(p[0].id), None).unwrap();
        assert_eq!(
            (inbox.len(), inbox[0].status.as_str()),
            (1, "dismissed"),
            "a dismissed suggestion stays dismissed"
        );
        // the saved chat comes along, about the same paper, without the machine-local session
        let chat = paperlines_core::chats::get(dst.conn(), "chat-a").unwrap();
        assert_eq!(chat.summary.title, "Summarize this");
        assert_eq!(chat.summary.item_id, Some(a.id));
        assert!(chat.messages.contains("Summarize this"));
        assert_eq!(chat.session, None);
        // importing again doesn't double it
        import_dump(&mut dst, &dir.path().join("export")).unwrap();
        assert_eq!(paperlines_core::chats::list(dst.conn()).unwrap().len(), 1);
        let rel = &relations::all(dst.conn()).unwrap()[0];
        let ev = highlights::get(dst.conn(), rel.evidence_highlight_id.expect("evidence kept")).unwrap();
        assert_eq!(
            (ev.item_id, ev.page, ev.text.as_deref()),
            (a.id, 2, Some("self-attention"))
        );
    }

    #[test]
    fn dump_round_trip_into_an_empty_library() {
        let dir = tempfile::tempdir().unwrap();
        let mut src = Library::open(Some(&dir.path().join("a"))).unwrap();
        let ids = src
            .db
            .tx(|c| {
                let a = insert_item(
                    c,
                    &ItemInput {
                        title: "Attention Is All You Need".into(),
                        authors: vec![Author::new("Vaswani", "A")],
                        year: Some(2017),
                        ..Default::default()
                    },
                )?;
                let b = insert_item(
                    c,
                    &ItemInput {
                        title: "BERT".into(),
                        year: Some(2019),
                        ..Default::default()
                    },
                )?;
                tags::tag_items(c, &[a], &["ml/nlp".into()])?;
                tags::set_color(c, "ml/nlp", Some("blue"))?;
                let p = projects::create(c, "Thesis", None)?;
                projects::add_items(c, p, &[b])?;
                let n = notes::paper_note(c, a)?;
                notes::save_body(c, n.id, "- key idea")?;
                edges::add_manual(c, b, a)?;
                saved_searches::create(c, "NLP", "tag:ml/nlp")?;
                Ok((a, b))
            })
            .unwrap();
        let _ = ids;
        let dump = dir.path().join("dump.json");
        std::fs::write(&dump, export_items(src.conn(), Format::Json, &Scope::All).unwrap()).unwrap();

        let mut dst = Library::open(Some(&dir.path().join("b"))).unwrap();
        let r = import_dump(&mut dst, &dump).unwrap();
        assert_eq!((r.added, r.projects), (2, 1));
        let a = crate::resolve(dst.conn(), "vaswani2017attention").unwrap();
        assert_eq!(a.tags, vec!["ml/nlp"]);
        assert_eq!(notes::paper_note(dst.conn(), a.id).unwrap().body, "- key idea");
        assert_eq!(
            crate::citations(dst.conn(), "vaswani2017attention", crate::Direction::CitedBy)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(saved_searches::list(dst.conn()).unwrap().len(), 1);
        assert_eq!(tags::list(dst.conn()).unwrap()[0].color.as_deref(), Some("blue"));
        assert_eq!(
            import_dump(&mut dst, &dump).unwrap().duplicates,
            2,
            "importing twice adds nothing"
        );
        std::fs::write(dir.path().join("x.json"), "{}").unwrap();
        assert!(import_dump(&mut dst, &dir.path().join("x.json")).is_err());
    }

    #[test]
    fn trash_hides_and_restores() {
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::open(Some(dir.path())).unwrap();
        let (a, b) = lib
            .db
            .tx(|c| {
                let a = insert_item(
                    c,
                    &ItemInput {
                        title: "Attention".into(),
                        doi: Some("10.1/a".into()),
                        ..Default::default()
                    },
                )?;
                let b = insert_item(
                    c,
                    &ItemInput {
                        title: "BERT model".into(),
                        ..Default::default()
                    },
                )?;
                tags::tag_items(c, &[a], &["x".into()])?;
                edges::add_manual(c, b, a)?;
                Ok((a, b))
            })
            .unwrap();
        trash(&mut lib, &[a]).unwrap();
        assert_eq!(items::list_items(lib.conn()).unwrap().len(), 1);
        assert_eq!(crate::search(lib.conn(), "attention", 10).unwrap().total, 0);
        assert_eq!(tags::list(lib.conn()).unwrap()[0].count, 0);
        assert!(edges::all_edges(lib.conn()).unwrap().is_empty());
        assert_eq!(list_trash(lib.conn()).unwrap()[0].id, a);
        // re-importing the same DOI finds it (in the Trash) instead of failing
        assert_eq!(
            find_duplicate(
                lib.conn(),
                &ItemInput {
                    title: "x".into(),
                    doi: Some("10.1/a".into()),
                    ..Default::default()
                }
            )
            .unwrap(),
            Some(a)
        );
        restore(&mut lib, &[a]).unwrap();
        assert_eq!(items::list_items(lib.conn()).unwrap().len(), 2);
        assert_eq!(edges::all_edges(lib.conn()).unwrap(), vec![(b, a)]);
        trash(&mut lib, &[a]).unwrap();
        assert_eq!(empty_trash(&mut lib, Some(30)).unwrap(), 0, "too recent");
        assert_eq!(empty_trash(&mut lib, None).unwrap(), 1);
        assert!(get_item(lib.conn(), a).unwrap().is_none());
    }

    #[test]
    fn auto_exports_rewrite_only_on_change() {
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::open(Some(&dir.path().join("lib"))).unwrap();
        lib.db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "One".into(),
                        ..Default::default()
                    },
                )
                .map(|_| ())
            })
            .unwrap();
        let out = dir.path().join("refs.bib");
        let a = add_auto_export(&mut lib, "bibtex", "all", None, out.to_str().unwrap()).unwrap();
        assert!(a.last_written.is_some());
        assert!(std::fs::read_to_string(&out).unwrap().contains("title = {One}"));
        assert_eq!(
            refresh_auto_exports(lib.conn()).unwrap(),
            0,
            "unchanged library, file untouched"
        );
        lib.db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "Two".into(),
                        ..Default::default()
                    },
                )
                .map(|_| ())
            })
            .unwrap();
        assert_eq!(refresh_auto_exports(lib.conn()).unwrap(), 1);
        assert!(std::fs::read_to_string(&out).unwrap().contains("title = {Two}"));
        assert!(add_auto_export(&mut lib, "json", "all", None, "/tmp/x.json").is_err());
        remove_auto_export(lib.conn(), a.id).unwrap();
        assert!(list_auto_exports(lib.conn()).unwrap().is_empty());
    }
}
