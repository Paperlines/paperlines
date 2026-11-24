//! "Find citing papers": works that cite a library paper, from OpenAlex (most cited first) or
//! Semantic Scholar, cached per paper. With OpenAlex, each citing work's reference list also says
//! which *other* library papers it cites ("connected"), the strongest hint that it is relevant.
//!
//! Three steps so the app never holds the database while waiting on the network:
//! [`prepare`] (reads), [`download`] (network only), [`save`] (writes); then [`report`].
//! [`run`] does all four in a row for the CLI and the MCP server.
use crate::fetch::{parse_referenced_works, Ids, Options};
use crate::matcher::LibIndex;
use crate::refs::{self, RefEntry};
use paperlines_core::db::Db;
use paperlines_core::rusqlite::{params, Connection, OptionalExtension};
use paperlines_core::text::{normalize_arxiv, normalize_doi};
use paperlines_core::{Error, Result};
use paperlines_import::lookup::get_json_with;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeSet, HashMap};

/// Very well-known papers have 100,000+ citing works; the most cited ones are kept.
pub const DEFAULT_LIMIT: usize = 2000;
/// Cached results older than this are fetched again (when online).
pub const MAX_AGE_DAYS: f64 = 7.0;
const PAGE: usize = 200;
const AUTHORS_KEPT: usize = 30;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CitingWork {
    pub openalex_id: Option<String>,
    pub s2_id: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub cited_by_count: Option<u64>,
    pub open_access_url: Option<String>,
    /// OpenAlex IDs of the works this one cites (OpenAlex only).
    pub references: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CitingFetch {
    pub works: Vec<CitingWork>,
    /// How many works cite the paper according to the source (may exceed `works.len()`).
    pub total: u64,
    pub source: &'static str,
}

fn s(v: &Value, p: &str) -> Option<String> {
    v.pointer(p)
        .and_then(Value::as_str)
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
}

fn short_id(url: &str) -> String {
    url.rsplit('/').next().unwrap_or(url).to_string()
}

/// Percent-encodes a query value, keeping what OpenAlex filters need literally.
fn enc(v: &str, keep: &str) -> String {
    let mut out = String::new();
    for b in v.bytes() {
        let c = b as char;
        if c.is_ascii_alphanumeric() || "-._~".contains(c) || keep.contains(c) {
            out.push(c);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn arxiv_from_doi(doi: &str) -> Option<String> {
    doi.to_ascii_lowercase()
        .strip_prefix("10.48550/arxiv.")
        .and_then(normalize_arxiv)
}

/// The DOI OpenAlex knows a paper by (arXiv papers have 10.48550/arXiv.<id>).
fn lookup_doi(ids: &Ids) -> Option<String> {
    ids.doi
        .clone()
        .or_else(|| ids.arxiv.as_ref().map(|a| format!("10.48550/arxiv.{a}")))
        .map(|d| d.to_ascii_lowercase())
}

// ---- OpenAlex ----

pub fn parse_openalex_work(w: &Value) -> Option<CitingWork> {
    let title = s(w, "/display_name").or_else(|| s(w, "/title"))?;
    let doi = s(w, "/doi").and_then(|d| normalize_doi(&d));
    Some(CitingWork {
        openalex_id: s(w, "/id").map(|u| short_id(&u)),
        s2_id: None,
        arxiv_id: doi.as_deref().and_then(arxiv_from_doi),
        doi,
        title,
        authors: w
            .get("authorships")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|x| s(x, "/author/display_name"))
                    .take(AUTHORS_KEPT)
                    .collect()
            })
            .unwrap_or_default(),
        year: w.get("publication_year").and_then(Value::as_i64).map(|y| y as i32),
        venue: s(w, "/primary_location/source/display_name"),
        cited_by_count: w.get("cited_by_count").and_then(Value::as_u64),
        open_access_url: s(w, "/open_access/oa_url"),
        references: parse_referenced_works(w),
    })
}

/// One page of `works?filter=cites:W…`: the works, the total count and the next cursor.
pub fn parse_openalex_page(v: &Value) -> (Vec<CitingWork>, u64, Option<String>) {
    let works = v
        .get("results")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(parse_openalex_work).collect())
        .unwrap_or_default();
    let total = v.pointer("/meta/count").and_then(Value::as_u64).unwrap_or(0);
    let next = s(v, "/meta/next_cursor");
    (works, total, next)
}

fn auth(key: Option<&str>) -> String {
    key.map(|k| format!("&api_key={}", enc(k, ""))).unwrap_or_default()
}

/// The OpenAlex work ID ("W…") for a DOI or arXiv ID.
pub fn resolve_openalex_id(ids: &Ids, key: Option<&str>) -> std::result::Result<String, String> {
    let doi = lookup_doi(ids).ok_or("no DOI or arXiv ID")?;
    let v = get_json_with(
        &format!(
            "https://api.openalex.org/works/doi:{}?select=id{}",
            enc(&doi, "/:"),
            auth(key)
        ),
        &[],
    )?;
    s(&v, "/id")
        .map(|u| short_id(&u))
        .ok_or_else(|| "not in OpenAlex".into())
}

fn openalex_citing(
    work: &str,
    key: Option<&str>,
    limit: usize,
    progress: &mut dyn FnMut(usize, u64),
) -> std::result::Result<CitingFetch, String> {
    let mut works = Vec::new();
    let mut total = 0;
    // page numbers, not cursors: without an API key OpenAlex refuses cursor paging past page 1,
    // and page numbers reach 10,000 results, well past DEFAULT_LIMIT
    for page in 1.. {
        let v = get_json_with(
            &format!(
                "https://api.openalex.org/works?filter=cites:{work}&sort=cited_by_count:desc&per-page={PAGE}&page={page}\
                 &select=id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,open_access,referenced_works{}",
                auth(key)
            ),
            &[],
        )?;
        let (batch, t, _) = parse_openalex_page(&v);
        total = t;
        let last = batch.len() < PAGE;
        works.extend(batch);
        progress(works.len().min(limit), total);
        if last || works.len() >= limit || page * PAGE >= 10_000 {
            break;
        }
        // be polite to the free API
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    works.truncate(limit);
    Ok(CitingFetch {
        works,
        total,
        source: "openalex",
    })
}

/// OpenAlex IDs for many DOIs at once (50 per request). Returns lowercase DOI → "W…".
pub fn lookup_openalex_ids(dois: &[String], key: Option<&str>) -> std::result::Result<HashMap<String, String>, String> {
    let mut out = HashMap::new();
    // '|' separates filter values and ',' separates filters: such DOIs can't be batched
    let usable: Vec<&String> = dois.iter().filter(|d| !d.contains('|') && !d.contains(',')).collect();
    for chunk in usable.chunks(50) {
        let list = chunk.iter().map(|d| enc(d, "/:")).collect::<Vec<_>>().join("|");
        let v = get_json_with(
            &format!(
                "https://api.openalex.org/works?filter=doi:{list}&select=id,doi&per-page=50{}",
                auth(key)
            ),
            &[],
        )?;
        for w in v.get("results").and_then(Value::as_array).into_iter().flatten() {
            if let (Some(id), Some(doi)) = (s(w, "/id"), s(w, "/doi").and_then(|d| normalize_doi(&d))) {
                out.insert(doi.to_ascii_lowercase(), short_id(&id));
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    Ok(out)
}

// ---- Semantic Scholar (fallback; no reference lists, so no "connected") ----

pub fn parse_s2_citations(v: &Value) -> Vec<CitingWork> {
    v.get("data")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.get("citingPaper").filter(|p| !p.is_null()))
                .filter_map(|p| {
                    Some(CitingWork {
                        openalex_id: None,
                        s2_id: s(p, "/paperId"),
                        doi: s(p, "/externalIds/DOI").and_then(|d| normalize_doi(&d)),
                        arxiv_id: s(p, "/externalIds/ArXiv").and_then(|a| normalize_arxiv(&a)),
                        title: s(p, "/title")?,
                        authors: p
                            .get("authors")
                            .and_then(Value::as_array)
                            .map(|a| a.iter().filter_map(|x| s(x, "/name")).take(AUTHORS_KEPT).collect())
                            .unwrap_or_default(),
                        year: p.get("year").and_then(Value::as_i64).map(|y| y as i32),
                        venue: s(p, "/venue"),
                        cited_by_count: p.get("citationCount").and_then(Value::as_u64),
                        open_access_url: s(p, "/openAccessPdf/url"),
                        references: Vec::new(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn s2_citing(
    ids: &Ids,
    key: Option<&str>,
    limit: usize,
    progress: &mut dyn FnMut(usize, u64),
) -> std::result::Result<CitingFetch, String> {
    let id = match (&ids.doi, &ids.arxiv) {
        (Some(d), _) => format!("DOI:{d}"),
        (None, Some(a)) => format!("ARXIV:{a}"),
        _ => return Err("no DOI or arXiv ID".into()),
    };
    let headers: Vec<(&str, &str)> = key.map(|k| vec![("x-api-key", k)]).unwrap_or_default();
    let total = get_json_with(
        &format!("https://api.semanticscholar.org/graph/v1/paper/{id}?fields=citationCount"),
        &headers,
    )
    .ok()
    .and_then(|v| v.get("citationCount").and_then(Value::as_u64));
    let mut works = Vec::new();
    // the API serves at most offset + limit < 10,000
    let cap = limit.min(9_000);
    let mut offset = 0;
    while offset < cap {
        let n = 1000.min(cap - offset);
        let v = get_json_with(
            &format!(
                "https://api.semanticscholar.org/graph/v1/paper/{id}/citations\
                 ?fields=paperId,title,year,authors,citationCount,externalIds,venue,openAccessPdf&limit={n}&offset={offset}"
            ),
            &headers,
        )?;
        let page = parse_s2_citations(&v);
        let more = v.get("next").is_some_and(|x| !x.is_null());
        works.extend(page);
        progress(works.len(), total.unwrap_or(works.len() as u64));
        if !more {
            break;
        }
        offset += n;
        std::thread::sleep(std::time::Duration::from_millis(150));
    }
    // most cited first, as OpenAlex returns them
    works.sort_by_key(|w| std::cmp::Reverse(w.cited_by_count.unwrap_or(0)));
    let total = total.unwrap_or(works.len() as u64).max(works.len() as u64);
    Ok(CitingFetch {
        works,
        total,
        source: "semantic_scholar",
    })
}

// ---- one paper's abstract, on demand (the list itself stays light) ----

/// OpenAlex keeps abstracts as `{word: [positions]}`; this puts the words back in order.
pub fn abstract_from_inverted(v: &Value) -> Option<String> {
    let index = v.get("abstract_inverted_index")?.as_object()?;
    let mut words: Vec<(u64, &str)> = Vec::new();
    for (word, positions) in index {
        for p in positions.as_array().into_iter().flatten().filter_map(Value::as_u64) {
            words.push((p, word.as_str()));
        }
    }
    if words.is_empty() {
        return None;
    }
    words.sort_unstable_by_key(|(p, _)| *p);
    Some(words.into_iter().map(|(_, w)| w).collect::<Vec<_>>().join(" "))
}

/// The abstract of a citing paper: OpenAlex, then Semantic Scholar (abstract, else its TL;DR).
/// Ok(None) when neither has one, which is common for paywalled publishers.
pub fn fetch_abstract(
    openalex_id: Option<&str>,
    doi: Option<&str>,
    arxiv: Option<&str>,
    opts: &Options,
) -> std::result::Result<Option<String>, String> {
    if opts.offline {
        return Err("Offline mode is on".into());
    }
    let key = opts.openalex_key.as_deref();
    let path = match (openalex_id, doi, arxiv) {
        (Some(w), _, _) => Some(enc(w, "")),
        (None, Some(d), _) => Some(format!("doi:{}", enc(&d.to_ascii_lowercase(), "/:"))),
        (None, None, Some(a)) => Some(format!("doi:10.48550/arxiv.{}", enc(a, ""))),
        _ => None,
    };
    let mut err = None;
    let mut found: Option<String> = None;
    if let Some(path) = path {
        match get_json_with(
            &format!(
                "https://api.openalex.org/works/{path}?select=abstract_inverted_index{}",
                auth(key)
            ),
            &[],
        ) {
            Ok(v) => found = abstract_from_inverted(&v),
            Err(e) => err = Some(e),
        }
    }
    // OpenAlex sometimes holds a citation line instead of an abstract: a short text gets a
    // second opinion from Semantic Scholar, and the longer one wins
    if found.as_ref().is_some_and(|t| t.len() >= SHORT_ABSTRACT) {
        return Ok(found);
    }
    let s2 = match (doi, arxiv) {
        (Some(d), _) => Some(format!("DOI:{d}")),
        (None, Some(a)) => Some(format!("ARXIV:{a}")),
        _ => None,
    };
    if let Some(id) = s2 {
        let headers: Vec<(&str, &str)> = opts
            .s2_key
            .as_deref()
            .map(|k| vec![("x-api-key", k)])
            .unwrap_or_default();
        match get_json_with(
            &format!("https://api.semanticscholar.org/graph/v1/paper/{id}?fields=abstract,tldr"),
            &headers,
        ) {
            Ok(v) => {
                let other = s(&v, "/abstract").or_else(|| s(&v, "/tldr/text"));
                return Ok(longer(found, other));
            }
            Err(e) => err = err.or(Some(e)),
        }
    }
    match (found, err) {
        (Some(t), _) => Ok(Some(t)),
        (None, Some(e)) if e != "Not found" => Err(e),
        _ => Ok(None),
    }
}

/// Below this, an OpenAlex "abstract" is likely a citation line rather than the abstract.
const SHORT_ABSTRACT: usize = 300;

fn longer(a: Option<String>, b: Option<String>) -> Option<String> {
    match (a, b) {
        (Some(a), Some(b)) => Some(if b.len() > a.len() { b } else { a }),
        (a, b) => a.or(b),
    }
}

// ---- cache and library OpenAlex IDs ----

pub struct Cached {
    pub fetch: CitingFetch,
    pub fetched_at: String,
    pub age_days: f64,
}

pub fn store(conn: &Connection, item_id: i64, f: &CitingFetch) -> Result<()> {
    conn.execute(
        "INSERT INTO citing_cache(item_id, source, total, works_json, fetched_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(item_id) DO UPDATE SET source = excluded.source, total = excluded.total,
           works_json = excluded.works_json, fetched_at = excluded.fetched_at",
        params![item_id, f.source, f.total as i64, serde_json::to_string(&f.works)?],
    )?;
    Ok(())
}

pub fn load(conn: &Connection, item_id: i64) -> Result<Option<Cached>> {
    let row = conn
        .query_row(
            "SELECT source, total, works_json, fetched_at, julianday('now') - julianday(fetched_at)
             FROM citing_cache WHERE item_id = ?1",
            [item_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, f64>(4)?,
                ))
            },
        )
        .optional()?;
    let Some((source, total, json, fetched_at, age_days)) = row else {
        return Ok(None);
    };
    Ok(Some(Cached {
        fetch: CitingFetch {
            works: serde_json::from_str(&json).unwrap_or_default(),
            total: total.max(0) as u64,
            source: if source == "openalex" {
                "openalex"
            } else {
                "semantic_scholar"
            },
        },
        fetched_at,
        age_days,
    }))
}

/// Library papers with a DOI or arXiv ID whose OpenAlex ID was never looked up: (id, lookup DOI).
pub fn missing_openalex_ids(conn: &Connection) -> Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, doi, arxiv_id FROM items
         WHERE deleted_at IS NULL AND openalex_id IS NULL AND (doi IS NOT NULL OR arxiv_id IS NOT NULL)",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, doi, arxiv) = row?;
        if let Some(d) = lookup_doi(&Ids { doi, arxiv, pdf: None }) {
            out.push((id, d));
        }
    }
    Ok(out)
}

/// Saves looked-up IDs; `None` records "not in OpenAlex" so it isn't asked again.
pub fn store_openalex_ids(conn: &Connection, rows: &[(i64, Option<String>)]) -> Result<()> {
    let mut stmt = conn.prepare("UPDATE items SET openalex_id = ?2 WHERE id = ?1")?;
    for (id, w) in rows {
        stmt.execute(params![id, w.as_deref().unwrap_or("")])?;
    }
    Ok(())
}

fn library_openalex_ids(conn: &Connection) -> Result<HashMap<String, i64>> {
    let mut stmt = conn.prepare(
        "SELECT openalex_id, id FROM items WHERE deleted_at IS NULL AND openalex_id IS NOT NULL AND openalex_id <> ''",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

// ---- the three steps ----

#[derive(Debug, Clone)]
pub struct Prepared {
    pub item_id: i64,
    pub ids: Ids,
    pub openalex_id: Option<String>,
    /// False: the cache is fresh (or offline) and is shown as is.
    pub need_fetch: bool,
    /// Library papers still lacking an OpenAlex ID (looked up with an OpenAlex fetch).
    pub missing: Vec<(i64, String)>,
}

/// Decides whether to go to the network. Errors when there is nothing to show at all.
pub fn prepare(conn: &Connection, item_id: i64, refresh: bool, offline: bool) -> Result<Prepared> {
    let (doi, arxiv, openalex_id) = conn
        .query_row(
            "SELECT doi, arxiv_id, openalex_id FROM items WHERE id = ?1",
            [item_id],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| Error::msg("Paper not found"))?;
    let cached = load(conn, item_id)?;
    let fresh = cached.as_ref().is_some_and(|c| c.age_days < MAX_AGE_DAYS);
    let has_ids = doi.is_some() || arxiv.is_some();
    let want = refresh || !fresh;
    if want && cached.is_none() {
        if offline {
            return Err(Error::msg("Offline mode is on, so citing papers can't be looked up."));
        }
        if !has_ids {
            return Err(Error::msg(
                "This paper has no DOI or arXiv ID, so its citing papers can't be looked up. Add one in Info.",
            ));
        }
    }
    let need_fetch = want && !offline && has_ids;
    Ok(Prepared {
        item_id,
        ids: Ids { doi, arxiv, pdf: None },
        openalex_id: openalex_id.filter(|w| !w.is_empty()),
        need_fetch,
        missing: if need_fetch {
            missing_openalex_ids(conn)?
        } else {
            Vec::new()
        },
    })
}

#[derive(Debug, Clone, Default)]
pub struct Downloaded {
    pub fetch: Option<CitingFetch>,
    /// The paper's own OpenAlex ID, when it was resolved now.
    pub resolved: Option<String>,
    /// Library papers looked up now: Some("W…") or None (not in OpenAlex).
    pub library_ids: Vec<(i64, Option<String>)>,
}

/// The network part: OpenAlex, then Semantic Scholar. Never touches the database.
pub fn download(
    p: &Prepared,
    opts: &Options,
    limit: usize,
    progress: &mut dyn FnMut(usize, u64),
) -> std::result::Result<Downloaded, String> {
    if !p.need_fetch {
        return Ok(Downloaded::default());
    }
    let mut errors = Vec::new();
    let key = opts.openalex_key.as_deref();
    let resolved = match &p.openalex_id {
        Some(w) => Ok(w.clone()),
        None => resolve_openalex_id(&p.ids, key),
    };
    match resolved
        .as_ref()
        .map_err(Clone::clone)
        .and_then(|w| openalex_citing(w, key, limit, progress))
    {
        Ok(f) => {
            // which library papers are which OpenAlex works: needed for "connected"
            let dois: Vec<String> = p.missing.iter().map(|(_, d)| d.clone()).collect();
            let library_ids = match lookup_openalex_ids(&dois, key) {
                Ok(found) => p.missing.iter().map(|(id, d)| (*id, found.get(d).cloned())).collect(),
                // not fatal: those papers are simply asked again next time
                Err(_) => Vec::new(),
            };
            return Ok(Downloaded {
                fetch: Some(f),
                resolved: resolved.ok().filter(|_| p.openalex_id.is_none()),
                library_ids,
            });
        }
        Err(e) => errors.push(format!("OpenAlex: {e}")),
    }
    match s2_citing(&p.ids, opts.s2_key.as_deref(), limit, progress) {
        Ok(f) => Ok(Downloaded {
            fetch: Some(f),
            ..Downloaded::default()
        }),
        Err(e) => {
            errors.push(format!("Semantic Scholar: {e}"));
            Err(errors.join("; "))
        }
    }
}

pub fn save(conn: &Connection, p: &Prepared, d: &Downloaded) -> Result<()> {
    if let Some(f) = &d.fetch {
        store(conn, p.item_id, f)?;
    }
    if let Some(w) = &d.resolved {
        store_openalex_ids(conn, &[(p.item_id, Some(w.clone()))])?;
    }
    store_openalex_ids(conn, &d.library_ids)?;
    Ok(())
}

// ---- report ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitingRow {
    pub openalex_id: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub cited_by_count: Option<u64>,
    pub open_access_url: Option<String>,
    /// The same paper in the library, if any.
    pub in_library: Option<i64>,
    /// Other library papers this one cites (OpenAlex only).
    pub connected: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitingReport {
    pub item_id: i64,
    pub source: String,
    pub total: u64,
    pub fetched_at: String,
    /// Older than a week (shown anyway, e.g. offline).
    pub stale: bool,
    /// "Connected" needs OpenAlex reference lists.
    pub connected_available: bool,
    pub rows: Vec<CitingRow>,
    /// Citing papers already in the library whose own references were never fetched: fetching
    /// them adds the citation links properly.
    pub unfetched_in_library: Vec<i64>,
}

/// The cached citing papers, matched against the library as it is now. Offline.
pub fn report(conn: &Connection, item_id: i64) -> Result<Option<CitingReport>> {
    let Some(c) = load(conn, item_id)? else {
        return Ok(None);
    };
    let by_w = library_openalex_ids(conn)?;
    let idx = LibIndex::load(conn)?;
    let mut unfetched = BTreeSet::new();
    let mut rows = Vec::with_capacity(c.fetch.works.len());
    for w in c.fetch.works {
        let in_library = w
            .openalex_id
            .as_ref()
            .and_then(|x| by_w.get(x).copied())
            .or_else(|| {
                idx.match_ref(&RefEntry {
                    doi: w.doi.clone(),
                    arxiv_id: w.arxiv_id.clone(),
                    title: Some(w.title.clone()),
                    year: w.year,
                })
            })
            .filter(|id| *id != item_id);
        if let Some(id) = in_library {
            if !refs::has_cache(conn, id)? {
                unfetched.insert(id);
            }
        }
        let connected: BTreeSet<i64> = w
            .references
            .iter()
            .filter_map(|r| by_w.get(r).copied())
            .filter(|id| *id != item_id && Some(*id) != in_library)
            .collect();
        rows.push(CitingRow {
            openalex_id: w.openalex_id,
            doi: w.doi,
            arxiv_id: w.arxiv_id,
            title: w.title,
            authors: w.authors,
            year: w.year,
            venue: w.venue,
            cited_by_count: w.cited_by_count,
            open_access_url: w.open_access_url,
            in_library,
            connected: connected.into_iter().collect(),
        });
    }
    Ok(Some(CitingReport {
        item_id,
        connected_available: c.fetch.source == "openalex",
        source: c.fetch.source.to_string(),
        total: c.fetch.total,
        fetched_at: c.fetched_at,
        stale: c.age_days >= MAX_AGE_DAYS,
        rows,
        unfetched_in_library: unfetched.into_iter().collect(),
    }))
}

/// All steps in a row, for callers that may hold the database (CLI, MCP).
pub fn run(
    db: &mut Db,
    item_id: i64,
    refresh: bool,
    opts: &Options,
    limit: usize,
    progress: &mut dyn FnMut(usize, u64),
) -> Result<CitingReport> {
    let p = prepare(&db.conn, item_id, refresh, opts.offline)?;
    match download(&p, opts, limit, progress) {
        Ok(d) => db.tx(|c| save(c, &p, &d))?,
        // an old copy is better than nothing
        Err(e) if load(&db.conn, item_id)?.is_some() => {
            let _ = e;
        }
        Err(e) => return Err(Error::msg(e)),
    }
    report(&db.conn, item_id)?.ok_or_else(|| Error::msg("No citing papers found"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_core::items::insert_item;
    use paperlines_core::model::ItemInput;
    use serde_json::json;

    fn openalex_page() -> Value {
        json!({
            "meta": {"count": 3, "next_cursor": "IlsxMF0i="},
            "results": [
                {
                    "id": "https://openalex.org/W100",
                    "doi": "https://doi.org/10.1/bert",
                    "display_name": "BERT",
                    "publication_year": 2019,
                    "authorships": [{"author": {"display_name": "Jacob Devlin"}}, {"author": {"display_name": "Ming-Wei Chang"}}],
                    "primary_location": {"source": {"display_name": "NAACL"}},
                    "cited_by_count": 90000,
                    "open_access": {"oa_url": "https://arxiv.org/pdf/1810.04805"},
                    "referenced_works": ["https://openalex.org/W1", "https://openalex.org/W2", "https://openalex.org/W9"]
                },
                {
                    "id": "https://openalex.org/W101",
                    "doi": "https://doi.org/10.48550/arXiv.2001.00001",
                    "display_name": "A preprint",
                    "publication_year": 2020,
                    "authorships": [],
                    "cited_by_count": 3,
                    "referenced_works": ["https://openalex.org/W1"]
                },
                {"id": "https://openalex.org/W102", "display_name": null}
            ]
        })
    }

    #[test]
    fn parses_openalex_pages() {
        let (works, total, next) = parse_openalex_page(&openalex_page());
        assert_eq!(total, 3);
        assert_eq!(next.as_deref(), Some("IlsxMF0i="));
        assert_eq!(works.len(), 2, "works without a title are dropped");
        let b = &works[0];
        assert_eq!(b.openalex_id.as_deref(), Some("W100"));
        assert_eq!(b.doi.as_deref(), Some("10.1/bert"));
        assert_eq!(b.authors, vec!["Jacob Devlin", "Ming-Wei Chang"]);
        assert_eq!(b.venue.as_deref(), Some("NAACL"));
        assert_eq!(b.references, vec!["W1", "W2", "W9"]);
        assert_eq!(works[1].arxiv_id.as_deref(), Some("2001.00001"));
    }

    #[test]
    fn parses_s2_citations() {
        let v = json!({"next": null, "data": [
            {"citingPaper": {"paperId": "abc", "title": "GPT-3", "year": 2020, "citationCount": 30000,
                "authors": [{"name": "Tom Brown"}], "externalIds": {"ArXiv": "2005.14165"}, "venue": "NeurIPS",
                "openAccessPdf": {"url": "https://x/y.pdf"}}},
            {"citingPaper": {"paperId": "def", "title": null}},
            {"citingPaper": null}
        ]});
        let works = parse_s2_citations(&v);
        assert_eq!(works.len(), 1);
        assert_eq!(works[0].arxiv_id.as_deref(), Some("2005.14165"));
        assert_eq!(works[0].open_access_url.as_deref(), Some("https://x/y.pdf"));
        assert!(works[0].references.is_empty());
    }

    #[test]
    fn rebuilds_inverted_abstracts() {
        let v = json!({"abstract_inverted_index": {"We": [0], "propose": [1], "a": [2, 5], "new": [3], "model,": [4], "Transformer.": [6]}});
        assert_eq!(
            abstract_from_inverted(&v).as_deref(),
            Some("We propose a new model, a Transformer.")
        );
        assert_eq!(abstract_from_inverted(&json!({"abstract_inverted_index": null})), None);
        assert_eq!(abstract_from_inverted(&json!({})), None);
    }

    #[test]
    fn abstracts_need_the_network() {
        let opts = Options {
            offline: true,
            ..Options::default()
        };
        assert!(fetch_abstract(Some("W1"), None, None, &opts).is_err());
    }

    #[test]
    fn encodes_query_values() {
        assert_eq!(enc("10.1/a(b)<c>", "/:"), "10.1/a%28b%29%3Cc%3E");
        assert_eq!(enc("*", "*"), "*");
        assert_eq!(enc("Ils=+", ""), "Ils%3D%2B");
    }

    fn paper(c: &Connection, title: &str, doi: Option<&str>) -> i64 {
        insert_item(
            c,
            &ItemInput {
                title: title.into(),
                doi: doi.map(String::from),
                year: Some(2019),
                ..Default::default()
            },
        )
        .unwrap()
    }

    #[test]
    fn report_matches_library_and_connected_papers() {
        let mut db = Db::open_in_memory().unwrap();
        let (target, other, bert) = db
            .tx(|c| {
                Ok((
                    paper(c, "Attention Is All You Need", Some("10.1/attn")),
                    paper(c, "Deep Residual Learning", Some("10.1/resnet")),
                    paper(c, "BERT", Some("10.1/bert")),
                ))
            })
            .unwrap();
        // the target is W1 and the other library paper W2; BERT's own refs were never fetched
        store_openalex_ids(&db.conn, &[(target, Some("W1".into())), (other, Some("W2".into()))]).unwrap();
        let (works, total, _) = parse_openalex_page(&openalex_page());
        store(
            &db.conn,
            target,
            &CitingFetch {
                works,
                total,
                source: "openalex",
            },
        )
        .unwrap();

        let r = report(&db.conn, target).unwrap().unwrap();
        assert_eq!(r.total, 3);
        assert!(r.connected_available && !r.stale);
        let b = &r.rows[0];
        assert_eq!(b.in_library, Some(bert), "matched by DOI");
        assert_eq!(
            b.connected,
            vec![other],
            "cites W2 besides the target; W9 isn't in the library"
        );
        assert_eq!(r.rows[1].in_library, None);
        assert!(r.rows[1].connected.is_empty());
        assert_eq!(r.unfetched_in_library, vec![bert]);

        // a changed DOI makes the cache and the OpenAlex ID stale
        db.conn
            .execute("UPDATE items SET doi = '10.1/other' WHERE id = ?1", [target])
            .unwrap();
        assert!(load(&db.conn, target).unwrap().is_none());
        let w: Option<String> = db
            .conn
            .query_row("SELECT openalex_id FROM items WHERE id = ?1", [target], |r| r.get(0))
            .unwrap();
        assert_eq!(w, None);
    }

    #[test]
    fn prepare_offline_and_without_ids() {
        let mut db = Db::open_in_memory().unwrap();
        let (with_doi, no_ids) = db
            .tx(|c| Ok((paper(c, "A", Some("10.1/a")), paper(c, "B", None))))
            .unwrap();
        let e = prepare(&db.conn, with_doi, false, true).unwrap_err().to_string();
        assert!(e.contains("Offline"), "{e}");
        let e = prepare(&db.conn, no_ids, false, false).unwrap_err().to_string();
        assert!(e.contains("no DOI"), "{e}");
        let p = prepare(&db.conn, with_doi, false, false).unwrap();
        assert!(p.need_fetch);
        assert_eq!(p.missing.len(), 1, "the library paper with a DOI needs its OpenAlex ID");

        // with a cache: offline shows it, online uses it while fresh
        store(
            &db.conn,
            with_doi,
            &CitingFetch {
                works: vec![],
                total: 0,
                source: "openalex",
            },
        )
        .unwrap();
        assert!(!prepare(&db.conn, with_doi, true, true).unwrap().need_fetch);
        assert!(!prepare(&db.conn, with_doi, false, false).unwrap().need_fetch);
        assert!(prepare(&db.conn, with_doi, true, false).unwrap().need_fetch);
        db.conn
            .execute("UPDATE citing_cache SET fetched_at = datetime('now', '-8 days')", [])
            .unwrap();
        assert!(prepare(&db.conn, with_doi, false, false).unwrap().need_fetch);
        assert!(report(&db.conn, with_doi).unwrap().unwrap().stale);
    }

    #[test]
    fn offline_run_without_cache_is_a_clear_error() {
        let mut db = Db::open_in_memory().unwrap();
        let id = db.tx(|c| Ok(paper(c, "A", Some("10.1/a")))).unwrap();
        let opts = Options {
            offline: true,
            ..Options::default()
        };
        let e = run(&mut db, id, false, &opts, 10, &mut |_, _| {}).unwrap_err();
        assert!(e.to_string().contains("Offline"));
    }

    /// Live: BERT cites "Attention Is All You Need". Run with `-- --ignored`.
    #[test]
    #[ignore]
    fn live_attention_is_cited_by_bert() {
        let mut db = Db::open_in_memory().unwrap();
        let (attn, _bert) = db
            .tx(|c| {
                Ok((
                    paper(c, "Attention Is All You Need", None),
                    paper(c, "BERT", Some("10.18653/v1/n19-1423")),
                ))
            })
            .unwrap();
        db.conn
            .execute("UPDATE items SET arxiv_id = '1706.03762' WHERE id = ?1", [attn])
            .unwrap();
        let r = run(&mut db, attn, true, &Options::default(), 400, &mut |_, _| {}).unwrap();
        assert!(r.total > 10_000, "{}", r.total);
        assert!(r.rows.iter().any(|w| w.title.to_lowercase().starts_with("bert")));
    }
}
