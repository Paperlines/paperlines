//! Online search: one query across OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe
//! PMC, DataCite and DOAJ (all free; only OpenAlex and Semantic Scholar take an optional key), run
//! in parallel, merged (the same paper from several sources becomes one hit) and ranked by how
//! high each source placed it. A source that fails or is rate-limited is reported, not fatal.
use crate::lookup::{get_json_with, parse_crossref_work, parse_openalex, user_agent};
use paperlines_core::model::{Author, ItemInput};
use paperlines_core::text::{normalize_arxiv, normalize_doi, normalize_title};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

pub const SOURCES: &[&str] = &[
    "openalex",
    "semantic_scholar",
    "arxiv",
    "pubmed",
    "crossref",
    "europe_pmc",
    "datacite",
    "doaj",
];
const PER_SOURCE: usize = 25;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub pmid: Option<String>,
    pub openalex_id: Option<String>,
    pub cited_by_count: Option<u64>,
    pub open_access_url: Option<String>,
    pub abstract_text: Option<String>,
    /// Sources that returned it, best first.
    pub sources: Vec<String>,
    /// Reciprocal-rank score across sources (higher: more relevant).
    pub score: f64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOutcome {
    pub hits: Vec<SearchHit>,
    /// (source, message) for sources that failed.
    pub errors: Vec<(String, String)>,
}

fn s(v: &Value, p: &str) -> Option<String> {
    v.pointer(p)
        .and_then(Value::as_str)
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
}

fn enc(q: &str) -> String {
    let mut out = String::new();
    for b in q.bytes() {
        let c = b as char;
        if c.is_ascii_alphanumeric() || "-._~".contains(c) {
            out.push(c);
        } else if c == ' ' {
            out.push('+');
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn names(a: &[Author]) -> Vec<String> {
    a.iter()
        .map(|x| {
            if x.given.is_empty() {
                x.family.clone()
            } else {
                format!("{} {}", x.given, x.family)
            }
        })
        .take(30)
        .collect()
}

fn from_input(i: ItemInput, source: &str) -> SearchHit {
    SearchHit {
        authors: names(&i.authors),
        title: i.title,
        year: i.year,
        venue: i.venue,
        doi: i.doi,
        arxiv_id: i.arxiv_id,
        abstract_text: i.abstract_text,
        sources: vec![source.into()],
        ..Default::default()
    }
}

// ---- parsers (pure, tested with saved responses) ----

pub fn parse_openalex_search(v: &Value) -> Vec<SearchHit> {
    v.get("results")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|w| {
                    let mut h = from_input(parse_openalex(w)?, "openalex");
                    h.openalex_id = s(w, "/id").map(|u| u.rsplit('/').next().unwrap_or(&u).to_string());
                    h.cited_by_count = w.get("cited_by_count").and_then(Value::as_u64);
                    h.open_access_url = s(w, "/open_access/oa_url");
                    h.pmid = s(w, "/ids/pmid").map(|u| u.rsplit('/').next().unwrap_or(&u).to_string());
                    Some(h)
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_s2_search(v: &Value) -> Vec<SearchHit> {
    v.get("data")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|p| {
                    Some(SearchHit {
                        title: s(p, "/title")?,
                        authors: p
                            .get("authors")
                            .and_then(Value::as_array)
                            .map(|x| x.iter().filter_map(|y| s(y, "/name")).take(30).collect())
                            .unwrap_or_default(),
                        year: p.get("year").and_then(Value::as_i64).map(|y| y as i32),
                        venue: s(p, "/venue"),
                        doi: s(p, "/externalIds/DOI").and_then(|d| normalize_doi(&d)),
                        arxiv_id: s(p, "/externalIds/ArXiv").and_then(|a| normalize_arxiv(&a)),
                        pmid: s(p, "/externalIds/PubMed"),
                        cited_by_count: p.get("citationCount").and_then(Value::as_u64),
                        open_access_url: s(p, "/openAccessPdf/url"),
                        abstract_text: s(p, "/abstract"),
                        sources: vec!["semantic_scholar".into()],
                        ..Default::default()
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// arXiv's Atom feed, read with a few patterns (the feed is regular and small).
pub fn parse_arxiv_atom(xml: &str) -> Vec<SearchHit> {
    let tag = |chunk: &str, name: &str| -> Option<String> {
        let open = format!("<{name}");
        let i = chunk.find(&open)?;
        let start = chunk[i..].find('>')? + i + 1;
        let end = chunk[start..].find(&format!("</{name}>"))? + start;
        Some(unescape(
            chunk[start..end].split_whitespace().collect::<Vec<_>>().join(" "),
        ))
    };
    xml.split("<entry>")
        .skip(1)
        .filter_map(|e| {
            let id = tag(e, "id")?;
            let arxiv = id.rsplit("abs/").next().and_then(normalize_arxiv);
            let mut authors = Vec::new();
            for a in e.split("<author>").skip(1) {
                if let Some(n) = tag(a, "name") {
                    authors.push(n);
                }
            }
            Some(SearchHit {
                title: tag(e, "title")?,
                authors,
                year: tag(e, "published").and_then(|p| p.get(..4)?.parse().ok()),
                venue: Some("arXiv".into()),
                doi: tag(e, "arxiv:doi").and_then(|d| normalize_doi(&d)),
                open_access_url: arxiv.as_ref().map(|a| format!("https://arxiv.org/pdf/{a}")),
                arxiv_id: arxiv,
                abstract_text: tag(e, "summary"),
                sources: vec!["arxiv".into()],
                ..Default::default()
            })
        })
        .collect()
}

fn unescape(s: String) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

/// PubMed esummary results, in the order esearch returned the ids.
pub fn parse_pubmed_summary(v: &Value, ids: &[String]) -> Vec<SearchHit> {
    ids.iter()
        .filter_map(|id| {
            let d = v.pointer(&format!("/result/{id}"))?;
            let doi = d
                .get("articleids")
                .and_then(Value::as_array)
                .and_then(|a| {
                    a.iter()
                        .find(|x| x.get("idtype").and_then(Value::as_str) == Some("doi"))
                        .and_then(|x| s(x, "/value"))
                })
                .and_then(|x| normalize_doi(&x));
            Some(SearchHit {
                title: s(d, "/title")?.trim_end_matches('.').to_string(),
                authors: d
                    .get("authors")
                    .and_then(Value::as_array)
                    .map(|a| a.iter().filter_map(|x| s(x, "/name")).take(30).collect())
                    .unwrap_or_default(),
                year: s(d, "/pubdate").and_then(|p| p.get(..4)?.parse().ok()),
                venue: s(d, "/fulljournalname").or_else(|| s(d, "/source")),
                doi,
                pmid: Some(id.clone()),
                sources: vec!["pubmed".into()],
                ..Default::default()
            })
        })
        .collect()
}

pub fn parse_crossref_search(v: &Value) -> Vec<SearchHit> {
    v.pointer("/message/items")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                // peer-review reports and parts of articles aren't papers to read
                .filter(|w| !matches!(w.get("type").and_then(Value::as_str), Some("peer-review" | "component")))
                .filter_map(|w| {
                    let mut h = from_input(parse_crossref_work(w)?, "crossref");
                    h.cited_by_count = w.get("is-referenced-by-count").and_then(Value::as_u64);
                    Some(h)
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Europe PMC (life sciences, with free full text): `resultList.result`, `resultType=core`.
pub fn parse_europepmc(v: &Value) -> Vec<SearchHit> {
    v.pointer("/resultList/result")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|r| {
                    let title = clean_title(s(r, "/title")?.trim_end_matches('.'));
                    let authors: Vec<String> = r
                        .pointer("/authorList/author")
                        .and_then(Value::as_array)
                        .map(|l| {
                            l.iter()
                                .filter_map(|x| match (s(x, "/firstName"), s(x, "/lastName")) {
                                    (Some(f), Some(l)) => Some(format!("{f} {l}")),
                                    (_, Some(l)) => Some(l),
                                    _ => s(x, "/fullName").or_else(|| s(x, "/collectiveName")),
                                })
                                .take(30)
                                .collect()
                        })
                        .filter(|l: &Vec<String>| !l.is_empty())
                        .or_else(|| {
                            s(r, "/authorString")
                                .map(|a| a.trim_end_matches('.').split(", ").map(String::from).take(30).collect())
                        })
                        .unwrap_or_default();
                    // a free full text when Europe PMC has one (open access, PDF or HTML)
                    let oa = (s(r, "/isOpenAccess").as_deref() == Some("Y"))
                        .then(|| {
                            r.pointer("/fullTextUrlList/fullTextUrl")
                                .and_then(Value::as_array)?
                                .iter()
                                .find(|u| matches!(s(u, "/availabilityCode").as_deref(), Some("OA" | "F")))
                                .and_then(|u| s(u, "/url"))
                        })
                        .flatten();
                    Some(SearchHit {
                        title,
                        authors,
                        year: s(r, "/pubYear").and_then(|y| y.parse().ok()),
                        venue: s(r, "/journalInfo/journal/title").or_else(|| s(r, "/journalTitle")),
                        doi: s(r, "/doi").and_then(|d| normalize_doi(&d)),
                        pmid: s(r, "/pmid"),
                        cited_by_count: r.get("citedByCount").and_then(Value::as_u64),
                        open_access_url: oa,
                        abstract_text: s(r, "/abstractText").map(|t| strip_tags(&t)),
                        sources: vec!["europe_pmc".into()],
                        ..Default::default()
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// DataCite (datasets, software, preprints and theses with DOIs: Zenodo, Figshare, repositories).
pub fn parse_datacite(v: &Value) -> Vec<SearchHit> {
    v.get("data")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|d| {
                    let at = d.get("attributes")?;
                    let title = clean_title(
                        &at.get("titles")
                            .and_then(Value::as_array)
                            .and_then(|t| t.iter().find_map(|x| s(x, "/title")))?,
                    );
                    let authors = at
                        .get("creators")
                        .and_then(Value::as_array)
                        .map(|l| {
                            l.iter()
                                .filter_map(|c| match (s(c, "/givenName"), s(c, "/familyName")) {
                                    (Some(g), Some(f)) => Some(format!("{g} {f}")),
                                    _ => s(c, "/name"),
                                })
                                .take(30)
                                .collect()
                        })
                        .unwrap_or_default();
                    Some(SearchHit {
                        title,
                        authors,
                        year: at.get("publicationYear").and_then(Value::as_i64).map(|y| y as i32),
                        venue: s(at, "/publisher").or_else(|| s(at, "/publisher/name")),
                        doi: s(at, "/doi").and_then(|x| normalize_doi(&x)),
                        cited_by_count: at.get("citationCount").and_then(Value::as_u64).filter(|n| *n > 0),
                        open_access_url: s(at, "/url"),
                        sources: vec!["datacite".into()],
                        ..Default::default()
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// DOAJ (articles in open-access journals, so each has a free full text).
pub fn parse_doaj(v: &Value) -> Vec<SearchHit> {
    v.get("results")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|r| {
                    let b = r.get("bibjson")?;
                    let doi = b
                        .get("identifier")
                        .and_then(Value::as_array)
                        .and_then(|l| {
                            l.iter()
                                .find(|x| s(x, "/type").is_some_and(|t| t.eq_ignore_ascii_case("doi")))
                                .and_then(|x| s(x, "/id"))
                        })
                        .and_then(|d| normalize_doi(&d));
                    let link = b.get("link").and_then(Value::as_array).and_then(|l| {
                        l.iter()
                            .find(|x| s(x, "/type").as_deref() == Some("fulltext"))
                            .and_then(|x| s(x, "/url"))
                    });
                    Some(SearchHit {
                        title: clean_title(&s(b, "/title")?),
                        authors: b
                            .get("author")
                            .and_then(Value::as_array)
                            .map(|l| l.iter().filter_map(|x| s(x, "/name")).take(30).collect())
                            .unwrap_or_default(),
                        year: s(b, "/year").and_then(|y| y.parse().ok()),
                        venue: s(b, "/journal/title"),
                        doi,
                        open_access_url: link,
                        abstract_text: s(b, "/abstract").map(|t| strip_tags(&t)),
                        sources: vec!["doaj".into()],
                        ..Default::default()
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// A title as a title: some repository records put a whole description there. Long ones end at
/// their first sentence, or are cut at a word near 200 characters.
fn clean_title(t: &str) -> String {
    let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.chars().count() <= 250 {
        return t;
    }
    let head: String = t.chars().take(240).collect();
    if let Some(i) = head.find(". ").filter(|&i| i >= 20) {
        return head[..i].to_string();
    }
    let cut = head.rfind(' ').unwrap_or(head.len());
    format!("{}…", head[..cut].trim_end_matches([',', ';', ':']))
}

/// Abstracts sometimes come with HTML or JATS tags.
fn strip_tags(t: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for c in t.chars() {
        match c {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

// ---- fetching ----

fn openalex(q: &str, key: Option<&str>) -> Result<Vec<SearchHit>, String> {
    let auth = key.map(|k| format!("&api_key={}", enc(k))).unwrap_or_default();
    let v = get_json_with(
        &format!(
            "https://api.openalex.org/works?search={}&per-page={PER_SOURCE}\
             &select=id,ids,doi,title,display_name,publication_year,publication_date,type,authorships,primary_location,cited_by_count,open_access,biblio,language{auth}",
            enc(q)
        ),
        &[],
    )?;
    Ok(parse_openalex_search(&v))
}

fn semantic_scholar(q: &str, key: Option<&str>) -> Result<Vec<SearchHit>, String> {
    let headers: Vec<(&str, &str)> = key.map(|k| vec![("x-api-key", k)]).unwrap_or_default();
    let v = get_json_with(
        &format!(
            "https://api.semanticscholar.org/graph/v1/paper/search?query={}&limit={PER_SOURCE}\
             &fields=title,year,authors,venue,externalIds,citationCount,openAccessPdf",
            enc(q)
        ),
        &headers,
    )?;
    Ok(parse_s2_search(&v))
}

fn arxiv(q: &str) -> Result<Vec<SearchHit>, String> {
    // every word must match (arXiv ORs bare words)
    let all = q
        .split_whitespace()
        .map(|w| format!("all:{}", enc(w)))
        .collect::<Vec<_>>()
        .join("+AND+");
    let url = format!("https://export.arxiv.org/api/query?search_query={all}&max_results={PER_SOURCE}");
    let mut resp = crate::lookup::agent()
        .get(&url)
        .header("User-Agent", &user_agent())
        .call()
        .map_err(|e| format!("Lookup failed: {e}"))?;
    let xml = resp
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("Bad response: {e}"))?;
    Ok(parse_arxiv_atom(&xml))
}

fn pubmed(q: &str) -> Result<Vec<SearchHit>, String> {
    let ids_v = get_json_with(
        &format!(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax={PER_SOURCE}&term={}",
            enc(q)
        ),
        &[],
    )?;
    let ids: Vec<String> = ids_v
        .pointer("/esearchresult/idlist")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
        .unwrap_or_default();
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let v = get_json_with(
        &format!(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id={}",
            ids.join(",")
        ),
        &[],
    )?;
    Ok(parse_pubmed_summary(&v, &ids))
}

fn crossref(q: &str) -> Result<Vec<SearchHit>, String> {
    let v = get_json_with(
        &format!(
            "https://api.crossref.org/works?rows={PER_SOURCE}&query.bibliographic={}",
            enc(q)
        ),
        &[],
    )?;
    Ok(parse_crossref_search(&v))
}

fn europe_pmc(q: &str) -> Result<Vec<SearchHit>, String> {
    let v = get_json_with(
        &format!(
            "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query={}&format=json&resultType=core&pageSize={PER_SOURCE}",
            enc(q)
        ),
        &[],
    )?;
    Ok(parse_europepmc(&v))
}

fn datacite(q: &str) -> Result<Vec<SearchHit>, String> {
    // no descriptions: some records carry whole documents there
    let v = get_json_with(
        &format!(
            "https://api.datacite.org/dois?query={}&page%5Bsize%5D={PER_SOURCE}&disable-facets=true\
             &fields%5Bdois%5D=doi,titles,creators,publicationYear,publisher,citationCount,url,types",
            enc(q)
        ),
        &[],
    )?;
    Ok(parse_datacite(&v))
}

fn doaj(q: &str) -> Result<Vec<SearchHit>, String> {
    // the query is part of the path here, so spaces must be %20, not +
    let v = get_json_with(
        &format!(
            "https://doaj.org/api/search/articles/{}?pageSize={PER_SOURCE}",
            enc(q).replace('+', "%20")
        ),
        &[],
    )?;
    Ok(parse_doaj(&v))
}

// ---- merging ----

fn keys(h: &SearchHit) -> Vec<String> {
    let mut k = Vec::new();
    if let Some(d) = &h.doi {
        k.push(format!("doi:{}", d.to_lowercase()));
    }
    if let Some(a) = &h.arxiv_id {
        k.push(format!("arxiv:{a}"));
    }
    if let Some(p) = &h.pmid {
        k.push(format!("pmid:{p}"));
    }
    let t = normalize_title(&h.title);
    let words = t.split_whitespace().count();
    // a long title is distinctive on its own (the preprint and the journal version differ in
    // year); a short one needs the year too
    if words >= 6 {
        k.push(format!("title:{t}"));
    } else if words >= 3 {
        k.push(format!("title:{t}|{}", h.year.unwrap_or(0)));
    }
    k
}

fn absorb(into: &mut SearchHit, other: SearchHit) {
    macro_rules! fill {
        ($($f:ident),*) => { $( if into.$f.is_none() { into.$f = other.$f.clone(); } )* };
    }
    fill!(
        year,
        venue,
        doi,
        arxiv_id,
        pmid,
        openalex_id,
        cited_by_count,
        open_access_url,
        abstract_text
    );
    if into.authors.is_empty() {
        into.authors = other.authors.clone();
    }
    into.cited_by_count = match (into.cited_by_count, other.cited_by_count) {
        (Some(a), Some(b)) => Some(a.max(b)),
        (a, b) => a.or(b),
    };
    // a source counts once per paper, however many of its records matched
    for s in other.sources {
        if !into.sources.contains(&s) {
            into.sources.push(s);
            into.score += other.score;
        }
    }
}

/// Merges per-source lists (each in that source's relevance order) into one ranked list:
/// reciprocal rank fusion (1/(20 + rank) per source), ties broken by citation count.
pub fn merge(lists: Vec<Vec<SearchHit>>) -> Vec<SearchHit> {
    let mut out: Vec<SearchHit> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for list in lists {
        for (rank, mut h) in list.into_iter().enumerate() {
            h.score = 1.0 / (20.0 + rank as f64);
            let ks = keys(&h);
            match ks.iter().find_map(|k| index.get(k).copied()) {
                Some(i) => {
                    absorb(&mut out[i], h);
                    for k in keys(&out[i]) {
                        index.entry(k).or_insert(i);
                    }
                }
                None => {
                    for k in &ks {
                        index.insert(k.clone(), out.len());
                    }
                    out.push(h);
                }
            }
        }
    }
    out.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.cited_by_count.unwrap_or(0).cmp(&a.cited_by_count.unwrap_or(0)))
    });
    out
}

/// Runs the chosen sources in parallel and merges what comes back.
pub fn search(query: &str, sources: &[&str], openalex_key: Option<&str>, s2_key: Option<&str>) -> SearchOutcome {
    let q = query.trim();
    if q.is_empty() {
        return SearchOutcome::default();
    }
    let results: Vec<(String, Result<Vec<SearchHit>, String>)> = std::thread::scope(|scope| {
        let handles: Vec<_> = sources
            .iter()
            .filter(|s| SOURCES.contains(s))
            .map(|&src| {
                scope.spawn(move || {
                    let run = || match src {
                        "openalex" => openalex(q, openalex_key),
                        "semantic_scholar" => semantic_scholar(q, s2_key),
                        "arxiv" => arxiv(q),
                        "pubmed" => pubmed(q),
                        "europe_pmc" => europe_pmc(q),
                        "datacite" => datacite(q),
                        "doaj" => doaj(q),
                        _ => crossref(q),
                    };
                    // free tiers refuse bursts: one retry after a pause
                    let r = match run() {
                        Err(e) if e.contains("Rate limited") => {
                            std::thread::sleep(std::time::Duration::from_millis(1500));
                            run()
                        }
                        r => r,
                    };
                    (src.to_string(), r)
                })
            })
            .collect();
        handles.into_iter().filter_map(|h| h.join().ok()).collect()
    });
    let mut lists = Vec::new();
    let mut errors = Vec::new();
    for (src, r) in results {
        match r {
            Ok(l) => lists.push(l),
            Err(e) => errors.push((src, e)),
        }
    }
    SearchOutcome {
        hits: rerank(merge(lists), q),
        errors,
    }
}

const STOP: &[&str] = &[
    "the", "and", "for", "with", "from", "into", "that", "this", "are", "was", "using", "based", "via", "about",
];

/// Words of a query that carry meaning (lowercase, 3+ letters, no stop words).
fn terms(q: &str) -> Vec<String> {
    q.split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|w| w.chars().count() >= 3 && !STOP.contains(&w.as_str()))
        .collect()
}

/// Weighs each hit by how many query words its title holds (its abstract counts half), so a
/// source's loose top result doesn't outrank close matches. Stable for ties.
pub fn rerank(mut hits: Vec<SearchHit>, query: &str) -> Vec<SearchHit> {
    let t = terms(query);
    if t.is_empty() {
        return hits;
    }
    for h in &mut hits {
        let title = h.title.to_lowercase();
        let abs = h.abstract_text.as_deref().unwrap_or("").to_lowercase();
        let cover: f64 = t
            .iter()
            .map(|w| {
                if title.contains(w.as_str()) {
                    1.0
                } else if abs.contains(w.as_str()) {
                    0.5
                } else {
                    0.0
                }
            })
            .sum::<f64>()
            / t.len() as f64;
        h.score *= 0.25 + cover;
    }
    hits.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.cited_by_count.unwrap_or(0).cmp(&a.cited_by_count.unwrap_or(0)))
    });
    hits
}

/// A PubMed record as library metadata (for adding by PMID).
pub fn fetch_pmid(pmid: &str) -> Result<ItemInput, String> {
    let v = get_json_with(
        &format!("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id={pmid}"),
        &[],
    )?;
    let h = parse_pubmed_summary(&v, &[pmid.to_string()])
        .into_iter()
        .next()
        .ok_or("Not found in PubMed")?;
    // a DOI gives fuller metadata (pages, volume, abstract) through Crossref
    if let Some(d) = &h.doi {
        if let Ok(mut i) = crate::lookup::fetch_doi(d) {
            i.url.get_or_insert(format!("https://pubmed.ncbi.nlm.nih.gov/{pmid}/"));
            return Ok(i);
        }
    }
    Ok(ItemInput {
        item_type: "article".into(),
        title: h.title,
        authors: h
            .authors
            .iter()
            // PubMed writes "Smith AB"
            .map(|n| match n.rsplit_once(' ') {
                Some((fam, ini)) if ini.chars().all(|c| c.is_ascii_uppercase()) => Author::new(fam, ini),
                _ => Author::parse(n),
            })
            .collect(),
        year: h.year,
        venue: h.venue,
        doi: h.doi,
        url: Some(format!("https://pubmed.ncbi.nlm.nih.gov/{pmid}/")),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_each_source() {
        let oa = parse_openalex_search(&json!({"results": [{
            "id": "https://openalex.org/W1", "doi": "https://doi.org/10.1/a", "display_name": "Graph Neural Networks",
            "publication_year": 2020, "authorships": [{"author": {"display_name": "Jie Zhou"}}],
            "cited_by_count": 900, "ids": {"pmid": "https://pubmed.ncbi.nlm.nih.gov/123"},
            "open_access": {"oa_url": "https://x/y.pdf"}
        }]}));
        assert_eq!(oa[0].openalex_id.as_deref(), Some("W1"));
        assert_eq!(oa[0].pmid.as_deref(), Some("123"));
        assert_eq!(oa[0].authors, vec!["Jie Zhou"]);

        let s2 = parse_s2_search(
            &json!({"data": [{"title": "GNNs", "year": 2021, "authors": [{"name": "A B"}],
            "externalIds": {"DOI": "10.1/A", "ArXiv": "2101.00001"}, "citationCount": 5}, {"title": null}]}),
        );
        assert_eq!(s2.len(), 1);
        assert_eq!(s2[0].doi.as_deref(), Some("10.1/a"));

        let ax = parse_arxiv_atom(
            "<feed><entry><id>http://arxiv.org/abs/2101.00001v2</id><published>2021-01-01T00:00:00Z</published>\
             <title>Graph   Neural\n Networks &amp; More</title><summary>We study.</summary>\
             <author><name>Jie Zhou</name></author><author><name>Ann Lee</name></author>\
             <arxiv:doi xmlns:arxiv=\"x\">10.1/B</arxiv:doi></entry></feed>",
        );
        assert_eq!(ax[0].title, "Graph Neural Networks & More");
        assert_eq!(ax[0].arxiv_id.as_deref(), Some("2101.00001"));
        assert_eq!(ax[0].authors, vec!["Jie Zhou", "Ann Lee"]);
        assert_eq!(ax[0].year, Some(2021));
        assert_eq!(ax[0].doi.as_deref(), Some("10.1/b"));

        let pm = parse_pubmed_summary(
            &json!({"result": {"uids": ["42"], "42": {"title": "Gut microbes.", "pubdate": "2019 Mar",
                "authors": [{"name": "Smith AB"}], "fulljournalname": "Nature",
                "articleids": [{"idtype": "pubmed", "value": "42"}, {"idtype": "doi", "value": "10.1/C"}]}}}),
            &["42".to_string()],
        );
        assert_eq!(pm[0].title, "Gut microbes");
        assert_eq!(pm[0].doi.as_deref(), Some("10.1/c"));
        assert_eq!(pm[0].pmid.as_deref(), Some("42"));

        let cr = parse_crossref_search(&json!({"message": {"items": [{"title": ["A Crossref Paper"],
            "DOI": "10.1/D", "is-referenced-by-count": 7, "type": "journal-article"},
            {"title": ["Review for \"A Crossref Paper\""], "DOI": "10.1/R", "type": "peer-review"}]}}));
        assert_eq!(cr.len(), 1, "peer-review reports are skipped");
        assert_eq!(cr[0].cited_by_count, Some(7));
    }

    #[test]
    fn merges_the_same_paper_from_several_sources() {
        let h = |title: &str, doi: Option<&str>, arxiv: Option<&str>, src: &str, cites: Option<u64>| SearchHit {
            title: title.into(),
            doi: doi.map(String::from),
            arxiv_id: arxiv.map(String::from),
            year: Some(2020),
            cited_by_count: cites,
            sources: vec![src.into()],
            ..Default::default()
        };
        let merged = merge(vec![
            vec![
                h(
                    "Graph Neural Networks: A Review",
                    Some("10.1/a"),
                    None,
                    "openalex",
                    Some(900),
                ),
                h("Other", None, None, "openalex", None),
            ],
            vec![
                h(
                    "Graph neural networks: a review",
                    None,
                    Some("2101.00001"),
                    "arxiv",
                    None,
                ),
                h("Unrelated paper about cells", Some("10.1/z"), None, "arxiv", None),
            ],
            vec![h(
                "x",
                Some("10.1/A"),
                Some("2101.00001"),
                "semantic_scholar",
                Some(950),
            )],
        ]);
        let first = &merged[0];
        assert_eq!(first.sources, vec!["openalex", "arxiv", "semantic_scholar"]);
        assert_eq!(first.doi.as_deref(), Some("10.1/a"));
        assert_eq!(first.arxiv_id.as_deref(), Some("2101.00001"));
        assert_eq!(first.cited_by_count, Some(950));
        assert_eq!(merged.len(), 3, "the review, Other, the cell paper");
    }

    #[test]
    fn close_matches_rank_above_loose_ones() {
        let h = |title: &str, score: f64| SearchHit {
            title: title.into(),
            score,
            ..Default::default()
        };
        let r = rerank(
            vec![
                h("Toxicology frameworks", 0.05),
                h("Graph neural networks: a review", 0.045),
            ],
            "graph neural networks review",
        );
        assert_eq!(r[0].title, "Graph neural networks: a review");
        assert_eq!(terms("The graph of a GNN"), vec!["graph", "gnn"]);
    }

    #[test]
    fn parses_europe_pmc_datacite_and_doaj() {
        // trimmed from real responses (Nov 2026)
        let epmc = json!({"resultList": {"result": [{
            "id": "37697691", "source": "MED", "pmid": "37697691", "doi": "10.1002/smll.202306524",
            "title": "Direct Laser Writing Photonic Crystal Hydrogels with a Supramolecular Sacrificial Scaffold.",
            "authorString": "Zeng Y, Liu K, Ding H.",
            "authorList": {"author": [{"fullName": "Zeng Y", "firstName": "Yi", "lastName": "Zeng"}, {"fullName": "Liu K", "lastName": "Liu"}]},
            "pubYear": "2024", "citedByCount": 6, "isOpenAccess": "Y",
            "journalInfo": {"journal": {"title": "Small (Weinheim an der Bergstrasse, Germany)"}},
            "abstractText": "<h4>Background</h4>Photonic crystal <i>hydrogels</i> respond.",
            "fullTextUrlList": {"fullTextUrl": [
                {"availabilityCode": "S", "url": "https://doi.org/10.1002/smll.202306524"},
                {"availabilityCode": "OA", "url": "https://europepmc.org/articles/PMC1/pdf"}]}
        }]}});
        let h = &parse_europepmc(&epmc)[0];
        assert_eq!(
            h.title,
            "Direct Laser Writing Photonic Crystal Hydrogels with a Supramolecular Sacrificial Scaffold"
        );
        assert_eq!(h.authors, vec!["Yi Zeng", "Liu"]);
        assert_eq!(
            (h.year, h.pmid.as_deref(), h.doi.as_deref()),
            (Some(2024), Some("37697691"), Some("10.1002/smll.202306524"))
        );
        assert_eq!(h.venue.as_deref(), Some("Small (Weinheim an der Bergstrasse, Germany)"));
        assert_eq!(
            h.open_access_url.as_deref(),
            Some("https://europepmc.org/articles/PMC1/pdf")
        );
        assert_eq!(
            h.abstract_text.as_deref(),
            Some("BackgroundPhotonic crystal hydrogels respond.")
        );
        assert_eq!(h.cited_by_count, Some(6));

        let dc = json!({"data": [{"id": "10.5281/zenodo.24436158", "attributes": {
            "doi": "10.5281/zenodo.24436158", "publicationYear": 2026, "publisher": "Zenodo",
            "url": "https://zenodo.org/doi/10.5281/zenodo.24436158", "citationCount": 0,
            "titles": [{"title": "A Self-Powered Wireless Nerve Interface"}],
            "creators": [{"name": "Kumawat, Banti", "givenName": "Banti", "familyName": "Kumawat"}, {"name": "CERN"}]
        }}]});
        let h = &parse_datacite(&dc)[0];
        assert_eq!(h.title, "A Self-Powered Wireless Nerve Interface");
        assert_eq!(h.authors, vec!["Banti Kumawat", "CERN"]);
        assert_eq!(
            (h.year, h.venue.as_deref(), h.cited_by_count),
            (Some(2026), Some("Zenodo"), None)
        );
        assert_eq!(h.doi.as_deref(), Some("10.5281/zenodo.24436158"));

        let doaj = json!({"results": [{"bibjson": {
            "title": "Femtosecond Laser Direct Writing of Diamond Antireflective Microstructures",
            "year": "2025", "author": [{"name": "He Cao"}, {"name": "Yun-Fei Li"}],
            "journal": {"title": "Small Structures"},
            "identifier": [{"id": "2688-4062", "type": "eissn"}, {"id": "10.1002/sstr.202400590", "type": "doi"}],
            "link": [{"type": "fulltext", "url": "https://doi.org/10.1002/sstr.202400590"}],
            "abstract": "Diamond-based subwavelength structures."
        }}]});
        let h = &parse_doaj(&doaj)[0];
        assert_eq!(h.authors, vec!["He Cao", "Yun-Fei Li"]);
        assert_eq!((h.year, h.venue.as_deref()), (Some(2025), Some("Small Structures")));
        assert_eq!(h.doi.as_deref(), Some("10.1002/sstr.202400590"));
        assert_eq!(
            h.open_access_url.as_deref(),
            Some("https://doi.org/10.1002/sstr.202400590")
        );
        // the same paper from DOAJ and Crossref merges into one hit
        let mut cr = h.clone();
        cr.sources = vec!["crossref".into()];
        assert_eq!(merge(vec![vec![h.clone()], vec![cr]]).len(), 1);
    }

    #[test]
    fn long_titles_are_trimmed() {
        let blurb = format!(
            "TWO-PHOTON MICROROBOTS AT THE LIMIT  This 770-page monograph develops {}",
            "a long tail ".repeat(40)
        );
        assert_eq!(clean_title(&blurb), "TWO-PHOTON MICROROBOTS AT THE LIMIT This 770-page monograph develops a long tail a long tail a long tail a long tail a long tail a long tail a long tail a long tail a long tail a long tail a long tail a long tail a long tail a long tail a…");
        let sentences = format!("Voxel size in two-photon lithography. Then {}", "words ".repeat(60));
        assert_eq!(clean_title(&sentences), "Voxel size in two-photon lithography");
        assert_eq!(clean_title("Short and fine"), "Short and fine");
    }

    #[test]
    #[ignore = "network: run with --ignored"]
    fn live_new_sources() {
        for src in ["europe_pmc", "datacite", "doaj"] {
            let r = search("direct laser writing", &[src], None, None);
            assert!(r.errors.is_empty(), "{src}: {:?}", r.errors);
            assert!(!r.hits.is_empty(), "{src}: no hits");
            eprintln!("{src}: {} hits, first: {}", r.hits.len(), r.hits[0].title);
        }
    }

    #[test]
    #[ignore = "network: run with --ignored"]
    fn live_search() {
        let r = search("graph neural networks review", SOURCES, None, None);
        eprintln!("errors: {:?}", r.errors);
        assert!(r.hits.len() > 20, "{}", r.hits.len());
        assert!(
            r.hits.iter().any(|h| h.sources.len() >= 2),
            "some paper found by two sources"
        );
        for h in r.hits.iter().take(8) {
            eprintln!("{:.2} {:?} {} ({:?})", h.score, h.sources, h.title, h.year);
        }
    }
}
