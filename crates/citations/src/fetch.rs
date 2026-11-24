//! Reference lists from OpenAlex, then Semantic Scholar, then (optionally) a local GROBID server.
//! OpenCitations (an open citation index, no key) adds references the first two missed, and
//! stands in when neither knows the paper.
use crate::refs::RefEntry;
use paperlines_core::text::{normalize_arxiv, normalize_doi};
use paperlines_import::lookup::{agent, get_json_with, user_agent};
use regex::Regex;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::OnceLock;

#[derive(Debug, Clone, Default)]
pub struct Ids {
    pub doi: Option<String>,
    pub arxiv: Option<String>,
    pub pdf: Option<PathBuf>,
}

#[derive(Debug, Clone, Default)]
pub struct Options {
    pub offline: bool,
    pub openalex_key: Option<String>,
    pub s2_key: Option<String>,
    /// e.g. http://localhost:8070 — the user's own GROBID server, used even in offline mode.
    pub grobid_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Fetched {
    pub refs: Vec<RefEntry>,
    pub source: &'static str,
}

fn s(v: &Value, p: &str) -> Option<String> {
    v.pointer(p)
        .and_then(Value::as_str)
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
}

// ---- OpenAlex ----

pub fn parse_referenced_works(v: &Value) -> Vec<String> {
    v.get("referenced_works")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .filter_map(|u| u.rsplit('/').next())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_openalex_batch(v: &Value) -> Vec<RefEntry> {
    v.get("results")
        .and_then(Value::as_array)
        .map(|rs| {
            rs.iter()
                .map(|w| {
                    let doi = s(w, "/doi").and_then(|d| normalize_doi(&d));
                    let arxiv = doi
                        .as_deref()
                        .and_then(|d| d.strip_prefix("10.48550/arxiv."))
                        .and_then(normalize_arxiv);
                    RefEntry {
                        doi: doi.filter(|d| !d.starts_with("10.48550/")),
                        arxiv_id: arxiv,
                        title: s(w, "/title").or_else(|| s(w, "/display_name")),
                        year: w.get("publication_year").and_then(Value::as_i64).map(|y| y as i32),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn openalex(ids: &Ids, key: Option<&str>) -> Result<Vec<RefEntry>, String> {
    let doi = match (&ids.doi, &ids.arxiv) {
        (Some(d), _) => d.clone(),
        (None, Some(a)) => format!("10.48550/arXiv.{a}"),
        _ => return Err("no DOI or arXiv ID".into()),
    };
    let auth = key.map(|k| format!("&api_key={k}")).unwrap_or_default();
    let work = get_json_with(
        &format!("https://api.openalex.org/works/doi:{doi}?select=id,referenced_works{auth}"),
        &[],
    )?;
    let ids = parse_referenced_works(&work);
    let mut out = Vec::new();
    for chunk in ids.chunks(50) {
        let filter = chunk.join("|");
        let page = get_json_with(
            &format!("https://api.openalex.org/works?filter=openalex:{filter}&select=id,doi,title,display_name,publication_year&per-page=50{auth}"),
            &[],
        )?;
        out.extend(parse_openalex_batch(&page));
    }
    Ok(out)
}

// ---- Semantic Scholar ----

pub fn parse_s2_references(v: &Value) -> Vec<RefEntry> {
    v.get("data")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.get("citedPaper").filter(|p| !p.is_null()))
                .map(|p| RefEntry {
                    doi: s(p, "/externalIds/DOI").and_then(|d| normalize_doi(&d)),
                    arxiv_id: s(p, "/externalIds/ArXiv").and_then(|a| normalize_arxiv(&a)),
                    title: s(p, "/title"),
                    year: p.get("year").and_then(Value::as_i64).map(|y| y as i32),
                })
                .filter(|r| r.doi.is_some() || r.arxiv_id.is_some() || r.title.is_some())
                .collect()
        })
        .unwrap_or_default()
}

fn semantic_scholar(ids: &Ids, key: Option<&str>) -> Result<Vec<RefEntry>, String> {
    let id = match (&ids.doi, &ids.arxiv) {
        (Some(d), _) => format!("DOI:{d}"),
        (None, Some(a)) => format!("ARXIV:{a}"),
        _ => return Err("no DOI or arXiv ID".into()),
    };
    let headers: Vec<(&str, &str)> = key.map(|k| vec![("x-api-key", k)]).unwrap_or_default();
    let v = get_json_with(
        &format!(
            "https://api.semanticscholar.org/graph/v1/paper/{id}/references?fields=title,year,externalIds&limit=1000"
        ),
        &headers,
    )?;
    Ok(parse_s2_references(&v))
}

// ---- OpenCitations (open index of who cites whom, by DOI; no account) ----

/// The DOIs a paper cites, from OpenCitations' `references`: each `cited` holds space-separated
/// ids such as `omid:br/0611 openalex:W2 doi:10.1063/1.1557328`.
pub fn parse_opencitations_refs(v: &Value) -> Vec<String> {
    let mut out: Vec<String> = v
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| s(x, "/cited"))
                .filter_map(|ids| {
                    ids.split_whitespace()
                        .find_map(|id| id.strip_prefix("doi:"))
                        .and_then(normalize_doi)
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out.dedup();
    out
}

fn opencitations(doi: &str) -> Result<Vec<String>, String> {
    let v = get_json_with(
        &format!(
            "https://api.opencitations.net/index/v2/references/doi:{}",
            url_part(doi)
        ),
        &[],
    )?;
    Ok(parse_opencitations_refs(&v))
}

/// Percent-encodes what a DOI may hold that a URL can't carry as is (DOIs allow almost anything).
fn url_part(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        let c = b as char;
        if c.is_ascii_alphanumeric() || "-._~/:|".contains(c) {
            out.push(c);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Titles and years for DOIs, from OpenAlex, 50 at a time. A DOI it doesn't know is kept bare:
/// matching against the library only needs the DOI.
fn describe_dois(dois: &[String], key: Option<&str>) -> Vec<RefEntry> {
    let auth = key.map(|k| format!("&api_key={k}")).unwrap_or_default();
    let mut out = Vec::new();
    for chunk in dois.chunks(50) {
        let found = get_json_with(
            &format!(
                "https://api.openalex.org/works?filter=doi:{}&select=id,doi,title,display_name,publication_year&per-page=50{auth}",
                url_part(&chunk.join("|"))
            ),
            &[],
        )
        .map(|v| parse_openalex_batch(&v))
        .unwrap_or_default();
        for d in chunk {
            out.push(
                found
                    .iter()
                    .find(|r| r.doi.as_deref() == Some(d.as_str()))
                    .cloned()
                    .unwrap_or_else(|| RefEntry {
                        doi: Some(d.clone()),
                        ..Default::default()
                    }),
            );
        }
    }
    out
}

/// Adds the references OpenCitations knows and `refs` lacks. Quiet on failure: it only helps.
fn add_opencitations(refs: &mut Vec<RefEntry>, doi: Option<&str>, key: Option<&str>) {
    let Some(doi) = doi else { return };
    let Ok(dois) = opencitations(doi) else { return };
    let have: std::collections::HashSet<String> = refs.iter().filter_map(|r| r.doi.clone()).collect();
    let missing: Vec<String> = dois.into_iter().filter(|d| !have.contains(d)).collect();
    if !missing.is_empty() {
        refs.extend(describe_dois(&missing, key));
    }
}

// ---- GROBID (local) ----

fn re(cell: &'static OnceLock<Regex>, p: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(p).unwrap())
}

fn xml_text(s: &str) -> String {
    static TAG: OnceLock<Regex> = OnceLock::new();
    let t = re(&TAG, r"<[^>]+>").replace_all(s, "");
    t.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Parses GROBID's TEI output for `processReferences`.
pub fn parse_tei(xml: &str) -> Vec<RefEntry> {
    static BIBL: OnceLock<Regex> = OnceLock::new();
    static TITLE_A: OnceLock<Regex> = OnceLock::new();
    static TITLE_M: OnceLock<Regex> = OnceLock::new();
    static DATE: OnceLock<Regex> = OnceLock::new();
    static DOI: OnceLock<Regex> = OnceLock::new();
    static ARXIV: OnceLock<Regex> = OnceLock::new();
    re(&BIBL, r"(?s)<biblStruct\b.*?</biblStruct>")
        .find_iter(xml)
        .map(|m| {
            let b = m.as_str();
            let cap = |r: &Regex| r.captures(b).map(|c| xml_text(&c[1])).filter(|x| !x.is_empty());
            RefEntry {
                title: cap(re(&TITLE_A, r#"(?s)<title[^>]*level="a"[^>]*>(.*?)</title>"#))
                    .or_else(|| cap(re(&TITLE_M, r#"(?s)<title[^>]*level="m"[^>]*>(.*?)</title>"#))),
                year: re(&DATE, r#"<date[^>]*when="(\d{4})"#)
                    .captures(b)
                    .and_then(|c| c[1].parse().ok()),
                doi: cap(re(&DOI, r#"(?s)<idno type="DOI">(.*?)</idno>"#)).and_then(|d| normalize_doi(&d)),
                arxiv_id: cap(re(&ARXIV, r#"(?s)<idno type="arXiv">(.*?)</idno>"#)).and_then(|a| normalize_arxiv(&a)),
            }
        })
        .filter(|r| r.title.is_some() || r.doi.is_some())
        .collect()
}

fn grobid(url: &str, pdf: &std::path::Path) -> Result<Vec<RefEntry>, String> {
    let bytes = std::fs::read(pdf).map_err(|e| format!("Could not read PDF: {e}"))?;
    let boundary = format!(
        "----refsboundary{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let mut body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"input\"; filename=\"paper.pdf\"\r\nContent-Type: application/pdf\r\n\r\n"
    )
    .into_bytes();
    body.extend_from_slice(&bytes);
    body.extend_from_slice(format!("\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"consolidateCitations\"\r\n\r\n0\r\n--{boundary}--\r\n").as_bytes());
    let endpoint = format!("{}/api/processReferences", url.trim_end_matches('/'));
    let mut resp = agent()
        .post(&endpoint)
        .header("User-Agent", &user_agent())
        .header("Content-Type", &format!("multipart/form-data; boundary={boundary}"))
        .send(&body[..])
        .map_err(|e| format!("GROBID failed: {e}"))?;
    let xml = resp
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("GROBID response: {e}"))?;
    Ok(parse_tei(&xml))
}

/// Tries each source in order and returns the first non-empty list. An empty list from a
/// source that answered still counts as "fetched", so it is not retried on every launch.
pub fn fetch(ids: &Ids, opts: &Options) -> Result<Fetched, String> {
    let mut errors = Vec::new();
    let mut answered: Option<&'static str> = None;
    if !opts.offline && (ids.doi.is_some() || ids.arxiv.is_some()) {
        let key = opts.openalex_key.as_deref();
        match openalex(ids, key) {
            Ok(mut r) if !r.is_empty() => {
                add_opencitations(&mut r, ids.doi.as_deref(), key);
                return Ok(Fetched {
                    refs: r,
                    source: "openalex",
                });
            }
            Ok(_) => answered = Some("openalex"),
            Err(e) => errors.push(format!("OpenAlex: {e}")),
        }
        match semantic_scholar(ids, opts.s2_key.as_deref()) {
            Ok(mut r) if !r.is_empty() => {
                add_opencitations(&mut r, ids.doi.as_deref(), key);
                return Ok(Fetched {
                    refs: r,
                    source: "semantic_scholar",
                });
            }
            Ok(_) => answered = answered.or(Some("semantic_scholar")),
            Err(e) => errors.push(format!("Semantic Scholar: {e}")),
        }
        // neither knows the paper's references: the open citation index may
        if let Some(doi) = ids.doi.as_deref() {
            match opencitations(doi) {
                Ok(dois) if !dois.is_empty() => {
                    return Ok(Fetched {
                        refs: describe_dois(&dois, key),
                        source: "opencitations",
                    })
                }
                Ok(_) => answered = answered.or(Some("opencitations")),
                Err(e) => errors.push(format!("OpenCitations: {e}")),
            }
        }
    }
    if let (Some(url), Some(pdf)) = (opts.grobid_url.as_deref().filter(|u| !u.trim().is_empty()), &ids.pdf) {
        match grobid(url, pdf) {
            Ok(r) if !r.is_empty() => {
                return Ok(Fetched {
                    refs: r,
                    source: "grobid",
                })
            }
            Ok(_) => answered = answered.or(Some("grobid")),
            Err(e) => errors.push(e),
        }
    }
    if let Some(source) = answered {
        return Ok(Fetched {
            refs: Vec::new(),
            source,
        });
    }
    if errors.is_empty() {
        Err(if opts.offline {
            "Offline mode is on and no GROBID server is set".into()
        } else {
            "No DOI or arXiv ID, and no GROBID server is set".into()
        })
    } else {
        Err(errors.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_opencitations() {
        // trimmed from a real answer for doi:10.1038/nmat1155
        let v: Value = serde_json::from_str(r#"[
            {"oci": "1-2", "citing": "omid:br/1 doi:10.1038/nmat1155", "cited": "omid:br/0611 openalex:W2024063572 doi:10.1063/1.1557328 doi:10.5445/ir/1000010763"},
            {"oci": "1-3", "citing": "omid:br/1 doi:10.1038/nmat1155", "cited": "omid:br/0612 openalex:W99"},
            {"oci": "1-4", "citing": "omid:br/1 doi:10.1038/nmat1155", "cited": "omid:br/0613 doi:10.1063/1.1557328"}
        ]"#).unwrap();
        // the first DOI of each reference, once; references without a DOI are skipped
        assert_eq!(parse_opencitations_refs(&v), vec!["10.1063/1.1557328"]);
        assert_eq!(url_part("10.1002/(sici)1097"), "10.1002/%28sici%291097");
    }

    #[test]
    #[ignore = "network: run with --ignored"]
    fn live_opencitations() {
        let dois = opencitations("10.1038/nmat1155").unwrap();
        assert!(dois.len() > 10, "{}", dois.len());
        let refs = describe_dois(&dois[..5], None);
        assert_eq!(refs.len(), 5);
        assert!(refs.iter().any(|r| r.title.is_some()), "titles from OpenAlex");
    }

    #[test]
    fn parses_openalex() {
        let work: Value = serde_json::from_str(r#"{"id":"https://openalex.org/W1","referenced_works":["https://openalex.org/W2","https://openalex.org/W3"]}"#).unwrap();
        assert_eq!(parse_referenced_works(&work), vec!["W2", "W3"]);
        let batch: Value = serde_json::from_str(r#"{"results":[
          {"id":"https://openalex.org/W2","doi":"https://doi.org/10.1/ABC","title":"Deep learning","publication_year":2015},
          {"id":"https://openalex.org/W3","doi":"https://doi.org/10.48550/arxiv.1706.03762","display_name":"Attention","publication_year":2017}]}"#).unwrap();
        let r = parse_openalex_batch(&batch);
        assert_eq!(
            r[0],
            RefEntry {
                doi: Some("10.1/abc".into()),
                arxiv_id: None,
                title: Some("Deep learning".into()),
                year: Some(2015)
            }
        );
        assert_eq!(
            (r[1].doi.as_deref(), r[1].arxiv_id.as_deref()),
            (None, Some("1706.03762"))
        );
    }

    #[test]
    fn parses_semantic_scholar() {
        let v: Value = serde_json::from_str(
            r#"{"data":[
          {"citedPaper":{"title":"Deep learning","year":2015,"externalIds":{"DOI":"10.1038/nature14539"}}},
          {"citedPaper":{"title":"Attention","year":2017,"externalIds":{"ArXiv":"1706.03762"}}},
          {"citedPaper":null},
          {"citedPaper":{"title":null,"year":null,"externalIds":{}}}]}"#,
        )
        .unwrap();
        let r = parse_s2_references(&v);
        assert_eq!(r.len(), 2);
        assert_eq!(r[1].arxiv_id.as_deref(), Some("1706.03762"));
    }

    #[test]
    fn parses_grobid_tei() {
        let xml = r#"<TEI><listBibl>
          <biblStruct xml:id="b0"><analytic><title level="a" type="main">Attention is all you&amp;nbsp;need</title></analytic>
            <monogr><title level="m">NeurIPS</title><imprint><date type="published" when="2017"/></imprint></monogr>
            <idno type="arXiv">arXiv:1706.03762</idno></biblStruct>
          <biblStruct xml:id="b1"><monogr><title level="m">Deep Learning Book</title><imprint><date when="2016-01-01"/></imprint></monogr>
            <idno type="DOI">10.5555/BOOK</idno></biblStruct>
          <biblStruct xml:id="b2"><monogr><imprint/></monogr></biblStruct>
        </listBibl></TEI>"#;
        let r = parse_tei(xml);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].title.as_deref(), Some("Attention is all you&nbsp;need"));
        assert_eq!((r[0].year, r[0].arxiv_id.as_deref()), (Some(2017), Some("1706.03762")));
        assert_eq!(
            (r[1].title.as_deref(), r[1].doi.as_deref(), r[1].year),
            (Some("Deep Learning Book"), Some("10.5555/book"), Some(2016))
        );
    }

    #[test]
    fn offline_without_grobid_is_an_error() {
        let ids = Ids {
            doi: Some("10.1/x".into()),
            ..Default::default()
        };
        let e = fetch(
            &ids,
            &Options {
                offline: true,
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(e.contains("Offline"));
    }

    #[test]
    #[ignore = "network: run with --ignored"]
    fn live_fetch() {
        let r = fetch(
            &Ids {
                doi: Some("10.18653/v1/n19-1423".into()),
                ..Default::default()
            },
            &Options::default(),
        )
        .unwrap();
        println!("{} refs from {}", r.refs.len(), r.source);
        assert!(r.refs.len() > 20);
        assert!(r.refs.iter().any(|x| x
            .title
            .as_deref()
            .is_some_and(|t| t.to_lowercase().contains("attention is all you need"))));
        let a = fetch(
            &Ids {
                arxiv: Some("1706.03762".into()),
                ..Default::default()
            },
            &Options::default(),
        )
        .unwrap();
        println!("{} refs from {}", a.refs.len(), a.source);
        assert!(!a.refs.is_empty());
    }
}
