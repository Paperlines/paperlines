//! Library operations shared by the CLI, the MCP server and the desktop app, so all three
//! give identical results.
use paperlines_citations::edges;
use paperlines_citations::fetch::{fetch, Ids, Options};
use paperlines_citations::matcher::LibIndex;
use paperlines_citations::refs;
use paperlines_core::attachments::stored_path;
use paperlines_core::db::Db;
use paperlines_core::highlights;
use paperlines_core::items::{get_item, list_items};
use paperlines_core::model::Item;
use paperlines_core::notes::{self, Note};
use paperlines_core::paths::LibraryPaths;
use paperlines_core::rusqlite::{Connection, OptionalExtension};
use paperlines_core::secrets::Secrets;
use paperlines_core::{branding, export, platform, projects, saved_searches, settings, tags, Error, Result};
use paperlines_import::pipeline::{self, Action, Decision};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub mod assistants;
pub mod browser;
pub mod cite;
pub mod discover;
pub mod manage;
pub mod research;
pub mod suggest;

pub struct Library {
    pub db: Db,
    pub paths: LibraryPaths,
}

/// `<BINARY>_LIBRARY` overrides the library folder (e.g. PAPERLINES_LIBRARY).
pub fn library_env_var() -> String {
    format!("{}_LIBRARY", branding::BINARY_NAME.to_uppercase().replace('-', "_"))
}

/// The library folder: the env var, then the folder chosen in the app's settings, then the default.
pub fn default_root() -> Result<PathBuf> {
    if let Some(v) = std::env::var_os(library_env_var()).filter(|v| !v.is_empty()) {
        return Ok(PathBuf::from(v));
    }
    let dirs = platform::app_dirs().ok_or_else(|| Error::msg("Could not find the home folder"))?;
    Ok(paperlines_core::config::library_root(&dirs))
}

impl Library {
    pub fn open(root: Option<&Path>) -> Result<Library> {
        let root = match root {
            Some(r) => r.to_path_buf(),
            None => default_root()?,
        };
        let paths = LibraryPaths::new(&root);
        paths.ensure()?;
        let db = Db::open_with_backup(&paths.db, Some(&paths.backups))?;
        Ok(Library { db, paths })
    }

    pub fn conn(&self) -> &Connection {
        &self.db.conn
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSummary {
    pub id: i64,
    pub citekey: String,
    pub title: String,
    pub authors: String,
    pub year: Option<i32>,
    pub read_status: String,
    pub tags: Vec<String>,
    pub has_pdf: bool,
}

pub fn short_authors(i: &Item) -> String {
    match i.authors.len() {
        0 => String::new(),
        1 => i.authors[0].family.clone(),
        2 => format!("{} & {}", i.authors[0].family, i.authors[1].family),
        _ => format!("{} et al.", i.authors[0].family),
    }
}

pub fn summary(i: &Item) -> ItemSummary {
    ItemSummary {
        id: i.id,
        citekey: i.citekey.clone(),
        title: i.title.clone(),
        authors: short_authors(i),
        year: i.year,
        read_status: i.read_status.clone(),
        tags: i.tags.clone(),
        has_pdf: i.has_pdf,
    }
}

/// Finds a paper by citekey (case-insensitive), numeric id, DOI or arXiv ID.
pub fn resolve(conn: &Connection, key: &str) -> Result<Item> {
    let k = key.trim().trim_start_matches('@');
    let q = |sql: &str, v: &str| -> Result<Option<i64>> { Ok(conn.query_row(sql, [v], |r| r.get(0)).optional()?) };
    let id = q("SELECT id FROM items WHERE lower(citekey) = lower(?1)", k)?
        .or(k.parse::<i64>().ok().filter(|_| k.chars().all(|c| c.is_ascii_digit())))
        .map(Some)
        .unwrap_or(None)
        .or(paperlines_core::text::normalize_doi(k)
            .and_then(|d| q("SELECT id FROM items WHERE doi = ?1", &d).ok().flatten()))
        .or(paperlines_core::text::normalize_arxiv(k)
            .and_then(|a| q("SELECT id FROM items WHERE arxiv_id = ?1", &a).ok().flatten()));
    id.and_then(|id| get_item(conn, id).ok().flatten())
        .ok_or_else(|| Error::msg(format!("No paper matches \u{201c}{key}\u{201d}")))
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchOutput {
    pub results: Vec<ItemSummary>,
    pub total: usize,
    pub warnings: Vec<String>,
}

/// Search with the app's query syntax. An empty query lists the newest papers.
pub fn search(conn: &Connection, query: &str, limit: usize) -> Result<SearchOutput> {
    let all = list_items(conn)?;
    let (ids, warnings): (Vec<i64>, Vec<String>) = if query.trim().is_empty() {
        (all.iter().map(|i| i.id).collect(), Vec::new())
    } else {
        let r = paperlines_search::search(conn, query)?;
        (r.ids, r.warnings)
    };
    let by_id: std::collections::HashMap<i64, &Item> = all.iter().map(|i| (i.id, i)).collect();
    let results: Vec<ItemSummary> = ids
        .iter()
        .filter_map(|id| by_id.get(id))
        .take(limit)
        .map(|i| summary(i))
        .collect();
    Ok(SearchOutput {
        total: ids.len(),
        results,
        warnings,
    })
}

pub fn paper_note(conn: &Connection, key: &str) -> Result<(Item, Note, String)> {
    let item = resolve(conn, key)?;
    let note = notes::paper_note(conn, item.id)?;
    let md = notes::paper_note_markdown(&item, &note.body);
    Ok((item, note, md))
}

/// Everything about one paper: metadata, paper note, highlight count, citation counts.
pub fn item_detail(conn: &Connection, key: &str) -> Result<Value> {
    let item = resolve(conn, key)?;
    let note = notes::paper_note(conn, item.id)?;
    let c = edges::citations(conn, item.id)?;
    let hl = highlights::list_for_item(conn, item.id)?.len();
    let mut v = serde_json::to_value(&item)?;
    let o = v.as_object_mut().expect("object");
    o.insert("paperNote".into(), json!(note.body));
    o.insert("highlights".into(), json!(hl));
    o.insert("cites".into(), json!(c.cites.len()));
    o.insert("citedBy".into(), json!(c.cited_by.len()));
    o.insert(
        "referencesOutsideLibrary".into(),
        json!(c.status.as_ref().map(|s| s.outside)),
    );
    Ok(v)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Cites,
    CitedBy,
}

pub fn citations(conn: &Connection, key: &str, dir: Direction) -> Result<Vec<ItemSummary>> {
    let item = resolve(conn, key)?;
    let c = edges::citations(conn, item.id)?;
    let links = if dir == Direction::Cites { c.cites } else { c.cited_by };
    links
        .iter()
        .map(|l| {
            get_item(conn, l.item_id)?
                .map(|i| summary(&i))
                .ok_or_else(|| Error::msg("Item not found"))
        })
        .collect()
}

/// Appends a bullet to the paper note (what "add bullet" means for CLI and MCP).
pub fn add_bullet(lib: &mut Library, key: &str, text: &str) -> Result<Note> {
    if text.trim().is_empty() {
        return Err(Error::msg("The bullet is empty"));
    }
    let item = resolve(lib.conn(), key)?;
    lib.db.tx(|c| notes::append_bullet(c, item.id, text))
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddReport {
    pub added: Vec<ItemSummary>,
    pub duplicates: Vec<String>,
    pub errors: Vec<String>,
    pub linked: usize,
}

/// Adds papers from files/folders (PDF, BibTeX, RIS, CSL-JSON) and identifiers (DOI, arXiv).
/// Duplicates are skipped, never merged silently.
pub fn add(lib: &mut Library, inputs: &[String], offline: Option<bool>) -> Result<AddReport> {
    let offline = match offline {
        Some(o) => o,
        None => settings::load(lib.conn())?.offline_mode,
    };
    let (paths, texts): (Vec<&String>, Vec<&String>) = inputs.iter().partition(|s| Path::new(s.as_str()).exists());
    let mut pv = pipeline::preview_paths(
        &paths.iter().map(PathBuf::from).collect::<Vec<_>>(),
        offline,
        &|_, _| {},
    );
    if !texts.is_empty() {
        let t = pipeline::preview_text(
            &texts.iter().map(|s| s.as_str()).collect::<Vec<_>>().join("\n"),
            offline,
            &|_, _| {},
        );
        pv.candidates.extend(t.candidates);
        pv.errors.extend(t.errors);
    }
    pipeline::mark_duplicates(lib.conn(), &mut pv.candidates)?;
    let mut report = AddReport {
        errors: pv.errors,
        ..Default::default()
    };
    let decisions: Vec<Decision> = pv
        .candidates
        .into_iter()
        .filter_map(|c| {
            if c.duplicate_of.is_some() {
                report.duplicates.push(format!(
                    "{} (already in library: {})",
                    c.input.title,
                    c.duplicate_title.clone().unwrap_or_default()
                ));
                None
            } else {
                Some(Decision {
                    candidate: c,
                    action: Action::Add,
                })
            }
        })
        .collect();
    let r = pipeline::commit(&mut lib.db, &lib.paths, &decisions);
    report.errors.extend(r.errors);
    report.linked = lib.db.tx(|c| edges::link_new_items(c, &r.added))?;
    for id in r.added {
        if let Some(i) = get_item(lib.conn(), id)? {
            report.added.push(summary(&i));
        }
    }
    Ok(report)
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchReport {
    pub fetched: Vec<String>,
    pub skipped: usize,
    pub failed: Vec<String>,
    pub linked: usize,
}

/// How a citing paper relates to the library, with citekeys for people and tools.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitingPaper {
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub cited_by_count: Option<u64>,
    pub open_access_url: Option<String>,
    /// Citekey of the same paper in the library.
    pub in_library: Option<String>,
    /// Citekeys of other library papers it cites.
    pub connected: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitingOutput {
    pub paper: ItemSummary,
    pub source: String,
    pub total: u64,
    pub fetched_at: String,
    pub connected_available: bool,
    pub papers: Vec<CitingPaper>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CitingSort {
    Cited,
    Newest,
    Connected,
}

/// Papers that cite KEY (OpenAlex, then Semantic Scholar; cached for a week).
pub fn citing_papers(
    lib: &mut Library,
    key: &str,
    refresh: bool,
    sort: CitingSort,
    limit: usize,
    config_dir: &Path,
) -> Result<CitingOutput> {
    use paperlines_citations::citing;
    let item = resolve(lib.conn(), key)?;
    let s = settings::load(lib.conn())?;
    let secrets = Secrets::new(config_dir, true);
    let opts = Options {
        offline: s.offline_mode,
        openalex_key: secrets.get("openalex").ok().flatten(),
        s2_key: secrets.get("semantic_scholar").ok().flatten(),
        grobid_url: None,
    };
    let r = citing::run(
        &mut lib.db,
        item.id,
        refresh,
        &opts,
        citing::DEFAULT_LIMIT,
        &mut |_, _| {},
    )?;
    let keys: std::collections::HashMap<i64, String> =
        list_items(lib.conn())?.into_iter().map(|i| (i.id, i.citekey)).collect();
    let mut papers: Vec<CitingPaper> = r
        .rows
        .into_iter()
        .map(|w| CitingPaper {
            in_library: w.in_library.and_then(|id| keys.get(&id).cloned()),
            connected: w.connected.iter().filter_map(|id| keys.get(id).cloned()).collect(),
            title: w.title,
            authors: w.authors,
            year: w.year,
            venue: w.venue,
            doi: w.doi,
            arxiv_id: w.arxiv_id,
            cited_by_count: w.cited_by_count,
            open_access_url: w.open_access_url,
        })
        .collect();
    sort_citing(&mut papers, sort);
    papers.truncate(limit);
    Ok(CitingOutput {
        paper: summary(&item),
        source: r.source,
        total: r.total,
        fetched_at: r.fetched_at,
        connected_available: r.connected_available,
        papers,
    })
}

/// Stable orders: most cited, newest (then most cited), most connected (then most cited).
pub fn sort_citing(papers: &mut [CitingPaper], sort: CitingSort) {
    let cited = |p: &CitingPaper| std::cmp::Reverse(p.cited_by_count.unwrap_or(0));
    match sort {
        CitingSort::Cited => papers.sort_by_key(cited),
        CitingSort::Newest => papers.sort_by_key(|p| (std::cmp::Reverse(p.year.unwrap_or(0)), cited(p))),
        CitingSort::Connected => papers.sort_by_key(|p| (std::cmp::Reverse(p.connected.len()), cited(p))),
    }
}

/// Fetches reference lists (synchronously) for the given papers, or every paper without one.
pub fn fetch_references(lib: &mut Library, keys: &[String], force: bool, config_dir: &Path) -> Result<FetchReport> {
    let ids: Vec<i64> = if keys.is_empty() {
        list_items(lib.conn())?.into_iter().map(|i| i.id).collect()
    } else {
        keys.iter()
            .map(|k| resolve(lib.conn(), k).map(|i| i.id))
            .collect::<Result<_>>()?
    };
    let s = settings::load(lib.conn())?;
    let secrets = Secrets::new(config_dir, true);
    let opts = Options {
        offline: s.offline_mode,
        openalex_key: secrets.get("openalex").ok().flatten(),
        s2_key: secrets.get("semantic_scholar").ok().flatten(),
        grobid_url: s.grobid_url,
    };
    let mut rep = FetchReport::default();
    for id in ids {
        let Some(item) = get_item(lib.conn(), id)? else {
            continue;
        };
        if !force && refs::has_cache(lib.conn(), id)? {
            rep.skipped += 1;
            continue;
        }
        let pdf = highlights::pdf_attachment(lib.conn(), id)?.map(|a| stored_path(&lib.paths.pdfs, &a.hash));
        let ids_ = Ids {
            doi: item.doi.clone(),
            arxiv: item.arxiv_id.clone(),
            pdf,
        };
        if ids_.doi.is_none() && ids_.arxiv.is_none() && (opts.grobid_url.is_none() || ids_.pdf.is_none()) {
            rep.skipped += 1;
            continue;
        }
        match fetch(&ids_, &opts) {
            Ok(f) => {
                rep.linked += lib.db.tx(|c| {
                    refs::store(c, id, &f.refs, f.source)?;
                    edges::recompute_item(c, &LibIndex::load(c)?, id)
                })?;
                rep.fetched.push(item.citekey);
            }
            Err(e) => rep.failed.push(format!("{}: {e}", item.citekey)),
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }
    Ok(rep)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Bibtex,
    CslJson,
    Ris,
    Markdown,
    Json,
}

impl Format {
    pub fn parse(s: &str) -> Result<Format> {
        Ok(match s.to_lowercase().as_str() {
            "bib" | "bibtex" => Format::Bibtex,
            "csl" | "csl-json" | "csljson" => Format::CslJson,
            "ris" => Format::Ris,
            "md" | "markdown" => Format::Markdown,
            "json" | "dump" => Format::Json,
            other => {
                return Err(Error::msg(format!(
                    "Unknown format {other}: use bibtex, csl-json, ris, markdown or json"
                )))
            }
        })
    }

    pub fn extension(self) -> &'static str {
        match self {
            Format::Bibtex => "bib",
            Format::CslJson => "json",
            Format::Ris => "ris",
            Format::Markdown => "md",
            Format::Json => "json",
        }
    }
}

/// Which papers to export: all, a project, a search query, or explicit keys/ids.
#[derive(Debug, Clone, PartialEq)]
pub enum Scope {
    All,
    Project(String),
    Query(String),
    Keys(Vec<String>),
    Ids(Vec<i64>),
}

pub fn select(conn: &Connection, scope: &Scope) -> Result<Vec<Item>> {
    let all = list_items(conn)?;
    Ok(match scope {
        Scope::All => {
            let mut v = all;
            v.sort_by(|a, b| a.citekey.cmp(&b.citekey));
            v
        }
        Scope::Project(name) => {
            let p = projects::list(conn)?
                .into_iter()
                .find(|p| p.name.eq_ignore_ascii_case(name.trim()))
                .ok_or_else(|| Error::msg(format!("No project named {name}")))?;
            let mut stmt =
                conn.prepare("SELECT item_id FROM project_items WHERE project_id = ?1 ORDER BY position, item_id")?;
            let order: Vec<i64> = stmt
                .query_map([p.id], |r| r.get(0))?
                .collect::<std::result::Result<_, _>>()?;
            order
                .iter()
                .filter_map(|id| all.iter().find(|i| i.id == *id).cloned())
                .collect()
        }
        Scope::Query(q) => {
            let ids = paperlines_search::search(conn, q)?.ids;
            ids.iter()
                .filter_map(|id| all.iter().find(|i| i.id == *id).cloned())
                .collect()
        }
        Scope::Keys(keys) => keys.iter().map(|k| resolve(conn, k)).collect::<Result<_>>()?,
        Scope::Ids(ids) => ids
            .iter()
            .filter_map(|id| all.iter().find(|i| i.id == *id).cloned())
            .collect(),
    })
}

pub fn export_items(conn: &Connection, format: Format, scope: &Scope) -> Result<String> {
    if format == Format::Json {
        return Ok(serde_json::to_string_pretty(&dump(conn)?)?);
    }
    let items = select(conn, scope)?;
    Ok(match format {
        Format::Bibtex => export::bibtex(&items),
        Format::CslJson => export::csl_json(&items),
        Format::Ris => export::ris(&items),
        Format::Markdown => export::markdown_bibliography(&items),
        Format::Json => unreachable!(),
    })
}

fn query_values(
    conn: &Connection,
    sql: &str,
    row: impl Fn(&paperlines_core::rusqlite::Row) -> paperlines_core::rusqlite::Result<Value>,
) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], row)?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

/// The whole library as one JSON document, keyed by citekey so it stays readable.
pub fn dump(conn: &Connection) -> Result<Value> {
    let items = list_items(conn)?;
    let key = |id: i64| items.iter().find(|i| i.id == id).map(|i| i.citekey.clone());
    let mut papers = Vec::new();
    for i in &items {
        let mut v = serde_json::to_value(i)?;
        v.as_object_mut()
            .expect("object")
            .insert("paperNote".into(), json!(notes::paper_note(conn, i.id)?.body));
        let mut stmt =
            conn.prepare("SELECT id, content_hash, kind, filename FROM attachments WHERE item_id = ?1 ORDER BY id")?;
        let atts: Vec<(i64, String, String, Option<String>)> = stmt
            .query_map([i.id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
            .collect::<std::result::Result<_, _>>()?;
        let hash_of = |aid: i64| atts.iter().find(|a| a.0 == aid).map(|a| a.1.clone());
        let hl: Vec<Value> = highlights::list_for_item(conn, i.id)?
            .into_iter()
            .map(|h| json!({"page": h.page, "kind": h.kind, "rects": h.rects, "text": h.text, "color": h.color, "comment": h.comment, "attachmentHash": hash_of(h.attachment_id)}))
            .collect();
        let o = v.as_object_mut().expect("object");
        o.insert("highlights".into(), json!(hl));
        o.insert(
            "attachments".into(),
            json!(atts
                .iter()
                .map(|(_, h, k, f)| json!({"hash": h, "kind": k, "filename": f}))
                .collect::<Vec<_>>()),
        );
        papers.push(v);
    }
    let edges_v = query_values(conn, "SELECT citing_item_id, cited_item_id, source, is_manual, is_suppressed FROM citation_edges", |r| {
        Ok(json!({"citing": r.get::<_, i64>(0)?, "cited": r.get::<_, i64>(1)?, "source": r.get::<_, String>(2)?, "manual": r.get::<_, bool>(3)?, "hidden": r.get::<_, bool>(4)?}))
    })?
    .into_iter()
    .map(|mut e| {
        let (a, b) = (e["citing"].as_i64().unwrap_or(0), e["cited"].as_i64().unwrap_or(0));
        e["citing"] = json!(key(a));
        e["cited"] = json!(key(b));
        e
    })
    .collect::<Vec<_>>();
    let other_notes = notes::list(conn, None)?
        .into_iter()
        .map(|n| -> Result<Value> {
            let full = notes::get(conn, n.note_id)?;
            Ok(json!({"kind": n.kind, "title": full.title, "paper": full.item_id.and_then(key), "projectId": full.project_id, "body": full.body, "updatedAt": full.updated_at}))
        })
        .collect::<Result<Vec<_>>>()?;
    // typed connections: types by key (only the user's own need defining), papers by citekey
    let types = paperlines_core::relations::list_types(conn)?;
    let relation_types_v: Vec<Value> = types
        .iter()
        .map(|t| json!({"key": t.key, "label": t.label, "inverseLabel": t.inverse_label, "color": t.color, "builtin": t.builtin}))
        .collect();
    let type_key: std::collections::HashMap<i64, String> = types.iter().map(|t| (t.id, t.key.clone())).collect();
    let relations_v: Vec<Value> = paperlines_core::relations::all(conn)?
        .into_iter()
        .map(|r| {
            // evidence by paper, page and text: highlight ids don't survive an import
            let evidence = r
                .evidence_highlight_id
                .and_then(|h| highlights::get(conn, h).ok())
                .map(|h| json!({"paper": key(h.item_id), "page": h.page, "text": h.text}));
            json!({"from": key(r.from_item_id), "to": key(r.to_item_id), "type": type_key.get(&r.type_id), "note": r.note, "evidence": evidence})
        })
        .collect();
    let mut refcache = Vec::new();
    for (id, source, list) in refs::all(conn)? {
        refcache.push(json!({"paper": key(id), "source": source, "references": list}));
    }
    let project_list = projects::list(conn)?
        .into_iter()
        .map(|p| -> Result<Value> {
            let members = select(conn, &Scope::Project(p.name.clone()))?
                .into_iter()
                .map(|i| i.citekey)
                .collect::<Vec<_>>();
            let spine = paperlines_core::spine::get(conn, p.id)?
                .into_iter()
                .map(|st| json!({"label": st.label, "papers": st.items.iter().filter_map(|i| key(*i)).collect::<Vec<_>>()}))
                .collect::<Vec<_>>();
            Ok(json!({"id": p.id, "name": p.name, "description": p.description, "color": p.color, "papers": members, "spine": spine}))
        })
        .collect::<Result<Vec<_>>>()?;
    // the Suggestions inbox, by project name (dismissed ones too, so they stay dismissed)
    let project_name: std::collections::HashMap<i64, String> =
        projects::list(conn)?.into_iter().map(|p| (p.id, p.name)).collect();
    let suggestions_v: Vec<Value> = paperlines_core::suggestions::all(conn)?
        .into_iter()
        .map(|s| {
            json!({
                "project": s.project_id.and_then(|p| project_name.get(&p).cloned()),
                "doi": s.doi, "arxivId": s.arxiv_id, "title": s.title, "authors": s.authors,
                "year": s.year, "venue": s.venue, "reason": s.reason, "status": s.status,
            })
        })
        .collect();
    // saved assistant chats: what they were about by citekey or note title, and the transcript
    // (the agent's session id only means something on the computer it ran on, so it's left out)
    let note_title: std::collections::HashMap<i64, String> = paperlines_core::notes::list(conn, None)?
        .into_iter()
        .map(|n| (n.note_id, n.title))
        .collect();
    let chats_v: Vec<Value> = paperlines_core::chats::list(conn)?
        .into_iter()
        .filter_map(|c| {
            let full = paperlines_core::chats::get(conn, &c.id).ok()?;
            Some(json!({
                "id": c.id, "agent": c.agent, "title": c.title,
                "paper": c.item_id.and_then(key),
                "note": c.note_id.and_then(|n| note_title.get(&n).cloned()),
                "messages": serde_json::from_str::<Value>(&full.messages).unwrap_or(Value::Array(vec![])),
                "updatedAt": c.updated_at,
            }))
        })
        .collect();
    Ok(json!({
        "format": format!("{}-dump", branding::BINARY_NAME),
        "schemaVersion": paperlines_core::db::latest_version(),
        "papers": papers,
        "notes": other_notes,
        "projects": project_list,
        "tags": tags::list(conn)?,
        "citations": edges_v,
        "relationTypes": relation_types_v,
        "relations": relations_v,
        "referenceCache": refcache,
        "savedSearches": saved_searches::list(conn)?,
        "suggestions": suggestions_v,
        "assistantChats": chats_v,
    }))
}

/// A whole library in one folder: `library.json` (the dump) and `pdfs/` with every attached file,
/// named by content hash as in the library itself. `import_dump` reads this layout back.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LibraryExport {
    pub path: String,
    pub papers: usize,
    pub files: usize,
    /// Attachments whose file is missing from the library (see `doctor`).
    pub missing: Vec<String>,
}

/// Writes the library into a new folder `Paperlines library YYYY-MM-DD` inside `parent`
/// (with " 2", " 3"… if that exists).
pub fn export_library(conn: &Connection, files: &Path, parent: &Path) -> Result<LibraryExport> {
    let date: String = conn.query_row("SELECT date('now', 'localtime')", [], |r| r.get(0))?;
    let base = format!("{} library {date}", branding::DISPLAY_NAME);
    let mut dir = parent.join(&base);
    let mut n = 2;
    while dir.exists() {
        dir = parent.join(format!("{base} {n}"));
        n += 1;
    }
    export_library_to(conn, files, &dir)
}

/// Writes the library into `dir` (created; it must not hold a library.json already).
/// `files`: the library's files folder (`LibraryPaths::pdfs`).
pub fn export_library_to(conn: &Connection, files: &Path, dir: &Path) -> Result<LibraryExport> {
    if dir.join("library.json").exists() {
        return Err(Error::msg(format!(
            "{} already holds an exported library",
            dir.display()
        )));
    }
    let v = dump(conn)?;
    let files_dir = dir.join("pdfs");
    std::fs::create_dir_all(&files_dir)?;
    let (mut copied, mut missing) = (0, Vec::new());
    let papers = v["papers"].as_array().map(Vec::len).unwrap_or(0);
    for p in v["papers"].as_array().into_iter().flatten() {
        for a in p["attachments"].as_array().into_iter().flatten() {
            let (Some(hash), Some(kind)) = (a["hash"].as_str(), a["kind"].as_str()) else {
                continue;
            };
            let src = paperlines_core::attachments::stored_file_path(files, hash, kind);
            let dest = paperlines_core::attachments::stored_file_path(&files_dir, hash, kind);
            if dest.exists() {
                continue; // the same file attached to two papers
            }
            if src.exists() {
                std::fs::copy(&src, &dest)?;
                copied += 1;
            } else {
                missing.push(format!(
                    "{}: {}",
                    p["citekey"].as_str().unwrap_or("?"),
                    a["filename"].as_str().unwrap_or(hash)
                ));
            }
        }
    }
    let text = serde_json::to_string_pretty(&v)?;
    let tmp = dir.join(".library.json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, dir.join("library.json"))?;
    Ok(LibraryExport {
        path: dir.to_string_lossy().into_owned(),
        papers,
        files: copied,
        missing,
    })
}

/// Writes one Markdown file per paper note (front matter + bullets + highlights) and per free or
/// project note. Returns the number of files written.
pub fn export_notes_folder(conn: &Connection, dir: &Path) -> Result<usize> {
    use std::collections::HashSet;
    let papers = dir.join("papers");
    let other = dir.join("notes");
    std::fs::create_dir_all(&papers)?;
    std::fs::create_dir_all(&other)?;
    let mut n = 0;
    for i in list_items(conn)? {
        let note = notes::paper_note(conn, i.id)?;
        let mut md = notes::paper_note_markdown(&i, &note.body);
        let hls = highlights::list_for_item(conn, i.id)?;
        if !hls.is_empty() {
            md.push_str("\n## Highlights\n\n");
            for h in hls {
                let text = h.text.unwrap_or_else(|| format!("(area on page {})", h.page));
                md.push_str(&format!("> {text} (p. {}, {})\n", h.page, h.color));
                if let Some(c) = h.comment {
                    md.push_str(&format!("\n{c}\n"));
                }
                md.push('\n');
            }
        }
        std::fs::write(papers.join(format!("{}.md", export::safe_filename(&i.citekey))), md)?;
        n += 1;
    }
    let mut used: HashSet<String> = HashSet::new();
    for r in notes::list(conn, None)? {
        let full = notes::get(conn, r.note_id)?;
        let base = export::safe_filename(&r.title);
        let mut name = base.clone();
        let mut k = 2;
        while !used.insert(name.to_lowercase()) {
            name = format!("{base} {k}");
            k += 1;
        }
        let paper = full
            .item_id
            .and_then(|id| get_item(conn, id).ok().flatten())
            .map(|i| i.citekey);
        let mut fm = format!("---\ntitle: \"{}\"\n", r.title.replace('"', "\\\""));
        if let Some(p) = paper {
            fm.push_str(&format!("paper: {p}\n"));
        }
        fm.push_str(&format!("updated: \"{}\"\n---\n\n", full.updated_at));
        std::fs::write(
            other.join(format!("{name}.md")),
            format!("{fm}{}\n", full.body.trim_end()),
        )?;
        n += 1;
    }
    Ok(n)
}

/// Library-only citation graph.
pub fn graph(conn: &Connection) -> Result<Value> {
    let items = list_items(conn)?;
    let edges = edges::all_edges(conn)?;
    let linked: std::collections::HashSet<i64> = edges.iter().flat_map(|(a, b)| [*a, *b]).collect();
    let nodes: Vec<Value> = items
        .iter()
        .filter(|i| linked.contains(&i.id))
        .map(|i| json!({"id": i.id, "citekey": i.citekey, "title": i.title, "year": i.year}))
        .collect();
    Ok(json!({"nodes": nodes, "edges": edges}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_core::items::insert_item;
    use paperlines_core::model::{Author, ItemInput};

    fn lib() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::open(Some(dir.path())).unwrap();
        let a = lib
            .db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "Attention Is All You Need".into(),
                        authors: vec![Author::new("Vaswani", "Ashish")],
                        year: Some(2017),
                        arxiv_id: Some("1706.03762".into()),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        let b = lib
            .db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "BERT".into(),
                        authors: vec![Author::new("Devlin", "Jacob")],
                        year: Some(2019),
                        doi: Some("10.18653/v1/n19-1423".into()),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        lib.db.tx(|c| edges::add_manual(c, b, a)).unwrap();
        let p = lib.db.tx(|c| projects::create(c, "Thesis", None)).unwrap();
        lib.db.tx(|c| projects::add_items(c, p, &[b])).unwrap();
        (dir, lib)
    }

    #[test]
    fn resolves_by_citekey_id_doi_arxiv() {
        let (_d, lib) = lib();
        assert_eq!(resolve(lib.conn(), "@Vaswani2017attention").unwrap().year, Some(2017));
        assert_eq!(resolve(lib.conn(), "2").unwrap().citekey, "devlin2019bert");
        assert_eq!(
            resolve(lib.conn(), "https://doi.org/10.18653/v1/N19-1423")
                .unwrap()
                .citekey,
            "devlin2019bert"
        );
        assert_eq!(
            resolve(lib.conn(), "arXiv:1706.03762").unwrap().citekey,
            "vaswani2017attention"
        );
        assert!(resolve(lib.conn(), "nope").is_err());
    }

    #[test]
    fn search_citations_and_bullets() {
        let (_d, mut lib) = lib();
        let s = search(lib.conn(), "attention", 10).unwrap();
        assert_eq!(s.results[0].citekey, "vaswani2017attention");
        assert_eq!(search(lib.conn(), "", 1).unwrap().total, 2);
        assert_eq!(
            citations(lib.conn(), "devlin2019bert", Direction::Cites).unwrap()[0].citekey,
            "vaswani2017attention"
        );
        assert_eq!(
            citations(lib.conn(), "vaswani2017attention", Direction::CitedBy).unwrap()[0].citekey,
            "devlin2019bert"
        );
        add_bullet(&mut lib, "devlin2019bert", "Masked LM pre-training").unwrap();
        let (_, note, md) = paper_note(lib.conn(), "devlin2019bert").unwrap();
        assert_eq!(note.body, "- Masked LM pre-training\n");
        assert!(md.starts_with("---\ntitle: \"BERT\"") && md.contains("- Masked LM pre-training"));
        assert!(add_bullet(&mut lib, "devlin2019bert", " ").is_err());
        let d = item_detail(lib.conn(), "devlin2019bert").unwrap();
        assert_eq!((d["cites"].as_i64(), d["citedBy"].as_i64()), (Some(1), Some(0)));
    }

    #[test]
    fn exports_by_scope_and_dump() {
        let (dir, lib) = lib();
        let bib = export_items(lib.conn(), Format::Bibtex, &Scope::Project("thesis".into())).unwrap();
        assert!(bib.contains("@article{devlin2019bert,") && !bib.contains("vaswani"));
        let md = export_items(lib.conn(), Format::Markdown, &Scope::Query("year:2017".into())).unwrap();
        assert!(md.contains("Vaswani") && !md.contains("Devlin"));
        let dump: Value = serde_json::from_str(&export_items(lib.conn(), Format::Json, &Scope::All).unwrap()).unwrap();
        assert_eq!(dump["papers"].as_array().unwrap().len(), 2);
        assert_eq!(dump["citations"][0]["citing"], "devlin2019bert");
        assert_eq!(dump["projects"][0]["papers"][0], "devlin2019bert");
        assert!(export_items(lib.conn(), Format::Ris, &Scope::Project("missing".into())).is_err());
        assert_eq!(Format::parse("CSL").unwrap(), Format::CslJson);

        let out = dir.path().join("export");
        assert_eq!(export_notes_folder(lib.conn(), &out).unwrap(), 2);
        assert!(out.join("papers").join("vaswani2017attention.md").exists());
        let g = graph(lib.conn()).unwrap();
        assert_eq!(g["edges"], json!([[2, 1]]));
    }

    #[test]
    fn add_skips_duplicates_and_links_from_cache() {
        let (dir, mut lib) = lib();
        let bib = dir.path().join("x.bib");
        std::fs::write(&bib, "@article{a, title={Attention is all you need}, year=2017}\n@article{he2016deep, title={Deep Residual Learning for Image Recognition}, year=2016}").unwrap();
        // BERT's cached references mention ResNet, which is not in the library yet
        let bert = resolve(lib.conn(), "devlin2019bert").unwrap().id;
        lib.db
            .tx(|c| {
                refs::store(
                    c,
                    bert,
                    &[refs::RefEntry {
                        title: Some("Deep residual learning for image recognition".into()),
                        year: Some(2016),
                        ..Default::default()
                    }],
                    "openalex",
                )
            })
            .unwrap();
        let r = add(
            &mut lib,
            &[bib.to_string_lossy().into(), "not-an-id".into()],
            Some(true),
        )
        .unwrap();
        assert_eq!(
            r.added.iter().map(|s| s.citekey.as_str()).collect::<Vec<_>>(),
            vec!["he2016deep"]
        );
        assert_eq!(r.duplicates.len(), 1);
        assert_eq!(r.errors.len(), 1);
        assert_eq!(r.linked, 1);
        assert_eq!(
            citations(lib.conn(), "he2016deep", Direction::CitedBy).unwrap()[0].citekey,
            "devlin2019bert"
        );
    }
}
