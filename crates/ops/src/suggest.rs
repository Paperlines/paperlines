//! Paper suggestions for a project, a set of papers or the whole library: what your papers keep
//! citing but you don't have, what builds on several of them, what OpenAlex calls related, and
//! (optionally) what matches a topic. Papers already in the library, or already suggested for that
//! project (including dismissed ones), are left out. Each suggestion says why it was made.
//!
//! The first signal is offline (cached reference lists). The others ask OpenAlex, sending only
//! OpenAlex work ids; they are skipped in offline mode.
use crate::{discover, resolve, select, Library, Scope};
use paperlines_citations::{citing, refs};
use paperlines_core::model::Item;
use paperlines_core::suggestions::{self, NewSuggestion};
use paperlines_core::{projects, settings, Error, Result};
use paperlines_import::lookup::get_json_with;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Whose papers the suggestions start from.
#[derive(Debug, Clone)]
pub enum Seeds {
    Project(String),
    Keys(Vec<String>),
    Library,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedPaper {
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub cited_by_count: Option<u64>,
    pub open_access_url: Option<String>,
    pub score: f64,
    /// Why, in plain words: "Cited by 4 of your project papers".
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestReport {
    pub project: Option<String>,
    /// Citekeys of the papers the suggestions start from.
    pub seeds: Vec<String>,
    pub papers: Vec<SuggestedPaper>,
    /// Things worth knowing: missing reference lists, offline mode, a source that failed.
    pub notes: Vec<String>,
}

/// Evidence gathered for one candidate paper.
#[derive(Debug, Clone, Default)]
struct Candidate {
    paper: SuggestedPaper,
    /// Seed papers that cite it (from reference lists).
    cited_by: HashSet<i64>,
    /// Seed papers it cites (OpenAlex).
    cites: usize,
    /// Seed papers it is "related" to (OpenAlex).
    related: usize,
    /// Rank in the topic search (0 = first).
    topic_rank: Option<usize>,
}

fn key(doi: &Option<String>, arxiv: &Option<String>, title: &str) -> Option<String> {
    suggestions::key_of(&NewSuggestion {
        doi: doi.clone(),
        arxiv_id: arxiv.clone(),
        title: title.to_string(),
        ..Default::default()
    })
}

/// Every key a library paper is known by (DOI, arXiv and title), so a candidate matching any of
/// them counts as "already in the library".
fn library_keys(items: &[Item]) -> HashSet<String> {
    let mut out = HashSet::new();
    for i in items {
        for k in [
            key(&i.doi, &None, ""),
            key(&None, &i.arxiv_id, ""),
            key(&None, &None, &i.title),
        ]
        .into_iter()
        .flatten()
        {
            out.insert(k);
        }
    }
    out
}

fn candidate_keys(p: &SuggestedPaper) -> Vec<String> {
    [
        key(&p.doi, &None, ""),
        key(&None, &p.arxiv_id, ""),
        key(&None, &None, &p.title),
    ]
    .into_iter()
    .flatten()
    .collect()
}

/// Candidates merged by any shared key.
#[derive(Default)]
struct Pool {
    list: Vec<Candidate>,
    index: HashMap<String, usize>,
}

impl Pool {
    fn entry(&mut self, p: SuggestedPaper) -> &mut Candidate {
        let keys = candidate_keys(&p);
        let i = match keys.iter().find_map(|k| self.index.get(k).copied()) {
            Some(i) => {
                let c = &mut self.list[i].paper;
                if c.doi.is_none() {
                    c.doi = p.doi.clone();
                }
                if c.arxiv_id.is_none() {
                    c.arxiv_id = p.arxiv_id.clone();
                }
                if c.authors.is_empty() {
                    c.authors = p.authors.clone();
                }
                c.year = c.year.or(p.year);
                c.venue = c.venue.clone().or(p.venue.clone());
                c.cited_by_count = c.cited_by_count.max(p.cited_by_count);
                c.open_access_url = c.open_access_url.clone().or(p.open_access_url.clone());
                i
            }
            None => {
                self.list.push(Candidate {
                    paper: p.clone(),
                    ..Default::default()
                });
                self.list.len() - 1
            }
        };
        for k in candidate_keys(&p)
            .into_iter()
            .chain(candidate_keys(&self.list[i].paper))
        {
            self.index.entry(k).or_insert(i);
        }
        &mut self.list[i]
    }
}

/// The offline signal: references the seed papers share, from their cached reference lists.
fn add_shared_references(
    pool: &mut Pool,
    conn: &paperlines_core::rusqlite::Connection,
    seeds: &[Item],
) -> Result<usize> {
    let mut without = 0;
    for s in seeds {
        let Some(cached) = refs::load(conn, s.id)? else {
            without += 1;
            continue;
        };
        for r in cached.refs {
            let Some(title) = r
                .title
                .clone()
                .filter(|t| !t.trim().is_empty())
                .or_else(|| r.doi.clone())
            else {
                continue;
            };
            let c = pool.entry(SuggestedPaper {
                doi: r.doi.clone(),
                arxiv_id: r.arxiv_id.clone(),
                title,
                year: r.year,
                ..Default::default()
            });
            c.cited_by.insert(s.id);
        }
    }
    Ok(without)
}

fn from_work(w: &citing::CitingWork) -> SuggestedPaper {
    SuggestedPaper {
        doi: w.doi.clone(),
        arxiv_id: w.arxiv_id.clone(),
        title: w.title.clone(),
        authors: w.authors.clone(),
        year: w.year,
        venue: w.venue.clone(),
        cited_by_count: w.cited_by_count,
        open_access_url: w.open_access_url.clone(),
        ..Default::default()
    }
}

/// Works citing the seeds (most cited first), with how many seeds each cites.
pub fn parse_citing_seeds(v: &Value, seeds: &HashSet<String>) -> Vec<(SuggestedPaper, usize)> {
    citing::parse_openalex_page(v)
        .0
        .iter()
        .map(|w| (from_work(w), w.references.iter().filter(|r| seeds.contains(*r)).count()))
        .filter(|(_, n)| *n > 0)
        .collect()
}

/// How often each work appears among the seeds' `related_works`.
pub fn parse_related(v: &Value) -> HashMap<String, usize> {
    let mut out = HashMap::new();
    for w in v.get("results").and_then(Value::as_array).into_iter().flatten() {
        for r in w.get("related_works").and_then(Value::as_array).into_iter().flatten() {
            if let Some(id) = r.as_str().and_then(|u| u.rsplit('/').next()) {
                *out.entry(id.to_string()).or_insert(0) += 1;
            }
        }
    }
    out
}

const WORK_FIELDS: &str =
    "id,doi,display_name,authorships,publication_year,cited_by_count,primary_location,open_access";

fn auth(key: Option<&str>) -> String {
    key.map(|k| format!("&api_key={k}")).unwrap_or_default()
}

/// OpenAlex ids of the seeds, looking up (and remembering) the ones not known yet.
fn seed_openalex_ids(
    conn: &paperlines_core::rusqlite::Connection,
    seeds: &[Item],
    key: Option<&str>,
) -> std::result::Result<HashMap<String, i64>, String> {
    let ids: HashSet<i64> = seeds.iter().map(|s| s.id).collect();
    let missing: Vec<(i64, String)> = citing::missing_openalex_ids(conn)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|(id, _)| ids.contains(id))
        .collect();
    if !missing.is_empty() {
        let dois: Vec<String> = missing.iter().map(|(_, d)| d.clone()).collect();
        let found = citing::lookup_openalex_ids(&dois, key)?;
        let rows: Vec<(i64, Option<String>)> = missing
            .iter()
            .map(|(id, d)| (*id, found.get(&d.to_ascii_lowercase()).cloned()))
            .collect();
        citing::store_openalex_ids(conn, &rows).map_err(|e| e.to_string())?;
    }
    let mut out = HashMap::new();
    let mut stmt = conn
        .prepare("SELECT id, openalex_id FROM items WHERE openalex_id IS NOT NULL AND openalex_id <> ''")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        if ids.contains(&row.0) {
            out.insert(row.1, row.0);
        }
    }
    Ok(out)
}

/// The OpenAlex signals: works building on the seeds, and works related to them.
fn add_openalex(
    pool: &mut Pool,
    seed_ids: &HashMap<String, i64>,
    key: Option<&str>,
    min: usize,
) -> std::result::Result<(), String> {
    let all: Vec<String> = seed_ids.keys().cloned().collect();
    let set: HashSet<String> = all.iter().cloned().collect();
    let mut related: HashMap<String, usize> = HashMap::new();
    for chunk in all.chunks(40) {
        let list = chunk.join("|");
        let v = get_json_with(
            &format!(
                "https://api.openalex.org/works?filter=cites:{list}&select={WORK_FIELDS},referenced_works&sort=cited_by_count:desc&per-page=100{}",
                auth(key)
            ),
            &[],
        )?;
        for (p, n) in parse_citing_seeds(&v, &set) {
            if n >= min {
                let c = pool.entry(p);
                c.cites = c.cites.max(n);
            }
        }
        let v = get_json_with(
            &format!(
                "https://api.openalex.org/works?filter=openalex:{list}&select=id,related_works&per-page=50{}",
                auth(key)
            ),
            &[],
        )?;
        for (id, n) in parse_related(&v) {
            if !set.contains(&id) {
                *related.entry(id).or_insert(0) += n;
            }
        }
    }
    // the most related works, described in one or two requests
    let mut top: Vec<(String, usize)> = related.into_iter().filter(|(_, n)| *n >= min).collect();
    top.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    top.truncate(60);
    let count: HashMap<String, usize> = top.iter().cloned().collect();
    for chunk in top.chunks(50) {
        let list = chunk.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>().join("|");
        let v = get_json_with(
            &format!(
                "https://api.openalex.org/works?filter=openalex:{list}&select={WORK_FIELDS}&per-page=50{}",
                auth(key)
            ),
            &[],
        )?;
        for w in citing::parse_openalex_page(&v).0 {
            let n = w
                .openalex_id
                .as_ref()
                .and_then(|id| count.get(id))
                .copied()
                .unwrap_or(0);
            let c = pool.entry(from_work(&w));
            c.related = c.related.max(n);
        }
    }
    Ok(())
}

fn add_topic(pool: &mut Pool, lib: &Library, topic: &str, config_dir: &Path) -> Result<()> {
    let r = discover::search(lib, topic, &[], config_dir)?;
    for (rank, h) in r.hits.into_iter().take(25).enumerate() {
        let c = pool.entry(SuggestedPaper {
            doi: h.hit.doi.clone(),
            arxiv_id: h.hit.arxiv_id.clone(),
            title: h.hit.title.clone(),
            authors: h.hit.authors.clone(),
            year: h.hit.year,
            venue: h.hit.venue.clone(),
            cited_by_count: h.hit.cited_by_count,
            open_access_url: h.hit.open_access_url.clone(),
            ..Default::default()
        });
        c.topic_rank = Some(c.topic_rank.map_or(rank, |r| r.min(rank)));
    }
    Ok(())
}

/// Scores and words each candidate; drops ones in the library or already suggested.
fn rank(pool: Pool, exclude: &HashSet<String>, whose: &str, topic: Option<&str>, limit: usize) -> Vec<SuggestedPaper> {
    let mut out: Vec<SuggestedPaper> = pool
        .list
        .into_iter()
        .filter(|c| !candidate_keys(&c.paper).iter().any(|k| exclude.contains(k)))
        .filter_map(|c| {
            let mut p = c.paper;
            let mut score = 0.0;
            let n = c.cited_by.len();
            if n > 0 {
                score += 3.0 * n as f64;
                p.reasons.push(format!("Cited by {n} of {whose}"));
            }
            if c.cites > 0 {
                score += 2.0 * c.cites as f64;
                p.reasons.push(format!("Cites {} of {whose}", c.cites));
            }
            if c.related > 0 {
                score += 1.5 * c.related as f64;
                p.reasons
                    .push(format!("Related to {} of {whose} (OpenAlex)", c.related));
            }
            if let (Some(r), Some(t)) = (c.topic_rank, topic) {
                score += 4.0 / (1.0 + r as f64 / 4.0);
                p.reasons.push(format!("Matches “{t}”"));
            }
            if score == 0.0 {
                return None;
            }
            // well-cited papers edge ahead of equally connected ones
            score += (p.cited_by_count.unwrap_or(0) as f64 + 1.0).log10() * 0.3;
            p.score = (score * 100.0).round() / 100.0;
            Some(p)
        })
        .collect();
    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    out.truncate(limit);
    out
}

/// Suggests papers for a project, some papers or the library, optionally around a topic.
pub fn suggest(
    lib: &mut Library,
    seeds: Seeds,
    topic: Option<&str>,
    limit: usize,
    config_dir: &Path,
) -> Result<SuggestReport> {
    let conn = lib.conn();
    let library = paperlines_core::items::list_items(conn)?;
    let (project, project_id, seed_items) = match &seeds {
        Seeds::Project(name) => {
            let p = projects::list(conn)?
                .into_iter()
                .find(|p| p.name.eq_ignore_ascii_case(name))
                .ok_or_else(|| Error::msg(format!("No project called “{name}”")))?;
            let items = select(conn, &Scope::Project(p.name.clone()))?;
            (Some(p.name), Some(p.id), items)
        }
        Seeds::Keys(keys) => (
            None,
            None,
            keys.iter().map(|k| resolve(conn, k)).collect::<Result<Vec<_>>>()?,
        ),
        Seeds::Library => {
            let mut all = library.clone();
            all.sort_by(|a, b| b.date_added.cmp(&a.date_added));
            all.truncate(100);
            (None, None, all)
        }
    };
    let topic = topic.map(str::trim).filter(|t| !t.is_empty());
    if seed_items.is_empty() && topic.is_none() {
        return Err(Error::msg(
            "No papers to start from: name a project with papers, some papers, or a topic",
        ));
    }
    let whose = match (&seeds, seed_items.len()) {
        (Seeds::Project(_), _) => "your project papers".to_string(),
        (_, 1) => "the paper you gave".to_string(),
        _ => "your papers".to_string(),
    };
    // with three or more papers, a single shared link is noise
    let min = if seed_items.len() >= 3 { 2 } else { 1 };
    let mut report = SuggestReport {
        project: project.clone(),
        seeds: seed_items.iter().map(|i| i.citekey.clone()).collect(),
        ..Default::default()
    };
    let mut pool = Pool::default();
    let without = add_shared_references(&mut pool, conn, &seed_items)?;
    if without > 0 && !seed_items.is_empty() {
        report.notes.push(format!(
            "{without} of {} papers have no reference list yet (Fetch references fills them in).",
            seed_items.len()
        ));
    }
    // a shared reference counts once it is shared enough
    for c in &mut pool.list {
        if c.cited_by.len() < min {
            c.cited_by.clear();
        }
    }
    let offline = settings::load(conn)?.offline_mode;
    if offline {
        report
            .notes
            .push("Offline mode is on: suggestions come from cached reference lists only.".into());
    } else {
        let key = discover::keys(config_dir).openalex;
        if !seed_items.is_empty() {
            match seed_openalex_ids(conn, &seed_items, key.as_deref())
                .and_then(|ids| add_openalex(&mut pool, &ids, key.as_deref(), min))
            {
                Ok(()) => {}
                Err(e) => report
                    .notes
                    .push(format!("OpenAlex didn't answer ({e}); other signals still count.")),
            }
        }
        if let Some(t) = topic {
            if let Err(e) = add_topic(&mut pool, lib, t, config_dir) {
                report.notes.push(format!("Topic search failed: {e}"));
            }
        }
    }
    let mut exclude = library_keys(&library);
    exclude.extend(suggestions::known_keys(lib.conn(), project_id)?);
    report.papers = rank(pool, &exclude, &whose, topic, limit);
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_citations::refs::RefEntry;
    use paperlines_core::items::insert_item;
    use paperlines_core::model::ItemInput;
    use serde_json::json;

    fn paper(lib: &mut Library, title: &str, doi: &str) -> i64 {
        lib.db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: title.into(),
                        doi: Some(doi.into()),
                        year: Some(2020),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
    }

    fn r(doi: &str, title: &str) -> RefEntry {
        RefEntry {
            doi: Some(doi.into()),
            title: Some(title.into()),
            year: Some(2004),
            arxiv_id: None,
        }
    }

    #[test]
    fn shared_references_become_reasoned_suggestions() {
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::open(Some(dir.path())).unwrap();
        // offline: only the cached reference lists count, no network in tests
        lib.db
            .tx(|c| {
                settings::apply(
                    c,
                    &settings::SettingsPatch {
                        offline_mode: Some(true),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        let a = paper(&mut lib, "Voxels in two-photon lithography", "10.1/a");
        let b = paper(&mut lib, "Woodpile photonic crystals", "10.1/b");
        let c = paper(&mut lib, "Shrinkage after development", "10.1/c");
        let p = lib.db.tx(|cn| projects::create(cn, "MPL", None)).unwrap();
        lib.db.tx(|cn| projects::add_items(cn, p, &[a, b, c])).unwrap();
        lib.db
            .tx(|cn| {
                refs::store(
                    cn,
                    a,
                    &[
                        r("10.9/deubel", "Direct laser writing of photonic crystals"),
                        r("10.9/once", "Cited once"),
                        r("10.1/b", "Woodpile photonic crystals"),
                    ],
                    "openalex",
                )?;
                refs::store(
                    cn,
                    b,
                    &[
                        r("10.9/deubel", "Direct laser writing of photonic crystals"),
                        r("10.9/kawata", "Finer features for functional microdevices"),
                    ],
                    "openalex",
                )?;
                refs::store(
                    cn,
                    c,
                    &[
                        r("10.9/DEUBEL", "Direct laser writing of photonic crystals"),
                        r("10.9/kawata", "Finer features"),
                    ],
                    "openalex",
                )
            })
            .unwrap();
        let rep = suggest(&mut lib, Seeds::Project("mpl".into()), None, 10, dir.path()).unwrap();
        let titles: Vec<&str> = rep.papers.iter().map(|p| p.title.as_str()).collect();
        // shared by all three first, then by two; cited once is noise; a library paper never shows
        assert_eq!(
            titles,
            vec![
                "Direct laser writing of photonic crystals",
                "Finer features for functional microdevices"
            ]
        );
        assert_eq!(rep.papers[0].reasons, vec!["Cited by 3 of your project papers"]);
        assert_eq!(rep.seeds.len(), 3);
        assert!(rep.notes.iter().any(|n| n.contains("Offline")));
        // once suggested (or dismissed), it isn't suggested again
        lib.db
            .tx(|cn| {
                suggestions::add_many(
                    cn,
                    Some(p),
                    &[NewSuggestion {
                        doi: Some("10.9/deubel".into()),
                        title: "x".into(),
                        ..Default::default()
                    }],
                )
            })
            .unwrap();
        let again = suggest(&mut lib, Seeds::Project("MPL".into()), None, 10, dir.path()).unwrap();
        assert_eq!(again.papers.len(), 1);
        assert!(suggest(&mut lib, Seeds::Project("nope".into()), None, 10, dir.path()).is_err());
    }

    #[test]
    fn openalex_signals_parse() {
        let seeds: HashSet<String> = ["W1".to_string(), "W2".to_string()].into();
        let v = json!({"results": [
            {"id": "https://openalex.org/W9", "doi": "https://doi.org/10.5/x", "display_name": "Builds on both",
             "publication_year": 2023, "cited_by_count": 40, "referenced_works": ["https://openalex.org/W1", "https://openalex.org/W2", "https://openalex.org/W7"]},
            {"id": "https://openalex.org/W8", "display_name": "Cites neither", "referenced_works": ["https://openalex.org/W5"]}
        ], "meta": {"count": 2}});
        let got = parse_citing_seeds(&v, &seeds);
        assert_eq!(got.len(), 1);
        assert_eq!((got[0].0.title.as_str(), got[0].1), ("Builds on both", 2));
        assert_eq!(got[0].0.doi.as_deref(), Some("10.5/x"));
        let rel = json!({"results": [
            {"id": "https://openalex.org/W1", "related_works": ["https://openalex.org/W3", "https://openalex.org/W4"]},
            {"id": "https://openalex.org/W2", "related_works": ["https://openalex.org/W3"]}
        ]});
        let m = parse_related(&rel);
        assert_eq!((m["W3"], m["W4"]), (2, 1));
    }
}
