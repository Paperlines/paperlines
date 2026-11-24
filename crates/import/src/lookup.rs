//! User-triggered metadata lookups. Callers must check offline mode before calling.
use paperlines_core::branding;
use paperlines_core::model::{Author, ItemInput};
use paperlines_core::text::{normalize_arxiv, normalize_doi};
use serde_json::Value;
use std::time::Duration;

pub fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .build()
        .into()
}

/// Generic client name; never includes anything about the user.
pub fn user_agent() -> String {
    format!(
        "{}/{} (local reference manager)",
        branding::DISPLAY_NAME,
        env!("CARGO_PKG_VERSION")
    )
}

/// GET a JSON document. 404 becomes "Not found"; 429 becomes a rate-limit message.
pub fn get_json_with(url: &str, headers: &[(&str, &str)]) -> Result<Value, String> {
    let mut req = agent()
        .get(url)
        .header("User-Agent", &user_agent())
        .header("Accept", "application/json");
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let mut resp = req.call().map_err(|e| match e {
        ureq::Error::StatusCode(404) => "Not found".to_string(),
        ureq::Error::StatusCode(429) => "Rate limited by the service; try again later".to_string(),
        e => format!("Lookup failed: {e}"),
    })?;
    let text = resp
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("Bad response: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("Bad response: {e}"))
}

fn get_json(url: &str) -> Result<Value, String> {
    get_json_with(url, &[])
}

pub fn encode_path(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn str_at(v: &Value, p: &str) -> Option<String> {
    v.pointer(p)
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn parse_crossref(v: &Value) -> Option<ItemInput> {
    parse_crossref_work(v.get("message")?)
}

pub fn parse_crossref_work(m: &Value) -> Option<ItemInput> {
    let parts = m.pointer("/issued/date-parts/0").and_then(Value::as_array);
    let year = parts.and_then(|p| p.first()).and_then(Value::as_i64).map(|y| y as i32);
    let pub_date = parts
        .map(|p| {
            p.iter()
                .filter_map(Value::as_i64)
                .map(|n| format!("{n:02}"))
                .collect::<Vec<_>>()
                .join("-")
        })
        .filter(|s| !s.is_empty());
    let authors = m
        .get("author")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(
                    |p| match (str_at(p, "/family"), str_at(p, "/given"), str_at(p, "/name")) {
                        (Some(f), g, _) => Some(Author::new(&f, &g.unwrap_or_default())),
                        (None, _, Some(n)) => Some(Author::new(&n, "")),
                        _ => None,
                    },
                )
                .collect()
        })
        .unwrap_or_default();
    let item_type = match m.get("type").and_then(Value::as_str).unwrap_or("") {
        "proceedings-article" => "conference-paper",
        "book" | "monograph" => "book",
        "book-chapter" => "chapter",
        "dissertation" => "thesis",
        "report" => "report",
        "posted-content" => "preprint",
        _ => "article",
    };
    Some(ItemInput {
        item_type: item_type.into(),
        title: str_at(m, "/title/0").map(|t| strip_tags(&t))?,
        authors,
        year,
        pub_date,
        venue: str_at(m, "/container-title/0").or_else(|| str_at(m, "/publisher")),
        doi: str_at(m, "/DOI").and_then(|d| normalize_doi(&d)),
        url: str_at(m, "/URL"),
        abstract_text: str_at(m, "/abstract").map(|a| strip_tags(&a)),
        biblio: paperlines_core::model::Biblio {
            volume: str_at(m, "/volume"),
            issue: str_at(m, "/issue"),
            pages: str_at(m, "/page").map(|p| p.replace('-', "–")),
            publisher: str_at(m, "/publisher"),
            place: str_at(m, "/publisher-location"),
            isbn: str_at(m, "/ISBN/0"),
            issn: str_at(m, "/ISSN/0"),
            edition: m.get("edition-number").and_then(|e| {
                e.as_str()
                    .map(String::from)
                    .or_else(|| e.as_i64().map(|n| n.to_string()))
            }),
            language: str_at(m, "/language"),
            editors: m
                .get("editor")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|p| {
                            str_at(p, "/family").map(|f| Author::new(&f, &str_at(p, "/given").unwrap_or_default()))
                        })
                        .collect()
                })
                .unwrap_or_default(),
            ..Default::default()
        },
        ..Default::default()
    })
}

/// Rebuilds plain text from OpenAlex's inverted abstract index.
fn openalex_abstract(v: &Value) -> Option<String> {
    let idx = v.get("abstract_inverted_index")?.as_object()?;
    let mut words: Vec<(i64, &str)> = Vec::new();
    for (w, ps) in idx {
        for p in ps.as_array()? {
            words.push((p.as_i64()?, w.as_str()));
        }
    }
    words.sort();
    (!words.is_empty()).then(|| words.iter().map(|(_, w)| *w).collect::<Vec<_>>().join(" "))
}

pub fn parse_openalex(v: &Value) -> Option<ItemInput> {
    let authors = v
        .get("authorships")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| str_at(x, "/author/display_name"))
                .map(|n| Author::parse(&n))
                .collect()
        })
        .unwrap_or_default();
    let doi = str_at(v, "/doi").and_then(|d| normalize_doi(&d));
    let arxiv = doi
        .as_deref()
        .and_then(|d| d.strip_prefix("10.48550/arxiv."))
        .and_then(normalize_arxiv);
    let item_type = match v.get("type").and_then(Value::as_str).unwrap_or("") {
        "book" => "book",
        "book-chapter" => "chapter",
        "dissertation" => "thesis",
        "report" => "report",
        "preprint" => "preprint",
        _ => "article",
    };
    Some(ItemInput {
        item_type: item_type.into(),
        title: str_at(v, "/title").or_else(|| str_at(v, "/display_name"))?,
        authors,
        year: v.get("publication_year").and_then(Value::as_i64).map(|y| y as i32),
        pub_date: str_at(v, "/publication_date"),
        venue: str_at(v, "/primary_location/source/display_name"),
        doi: doi.filter(|d| !d.starts_with("10.48550/")),
        arxiv_id: arxiv,
        url: str_at(v, "/primary_location/landing_page_url"),
        abstract_text: openalex_abstract(v),
        biblio: paperlines_core::model::Biblio {
            volume: str_at(v, "/biblio/volume"),
            issue: str_at(v, "/biblio/issue"),
            pages: match (str_at(v, "/biblio/first_page"), str_at(v, "/biblio/last_page")) {
                (Some(a), Some(b)) if a != b => Some(format!("{a}–{b}")),
                (Some(a), _) => Some(a),
                _ => None,
            },
            publisher: str_at(v, "/primary_location/source/host_organization_name"),
            issn: str_at(v, "/primary_location/source/issn_l"),
            language: str_at(v, "/language"),
            ..Default::default()
        },
        ..Default::default()
    })
}

pub fn fetch_doi(doi: &str) -> Result<ItemInput, String> {
    let v = get_json(&format!("https://api.crossref.org/works/{}", encode_path(doi)))?;
    parse_crossref(&v).ok_or_else(|| "Unexpected Crossref response".into())
}

pub fn fetch_arxiv(id: &str) -> Result<ItemInput, String> {
    let v = get_json(&format!(
        "https://api.openalex.org/works/doi:10.48550/arXiv.{}",
        encode_path(id)
    ))?;
    let mut i = parse_openalex(&v).ok_or("Unexpected OpenAlex response")?;
    i.arxiv_id = Some(id.to_string());
    if i.url.is_none() {
        i.url = Some(format!("https://arxiv.org/abs/{id}"));
    }
    Ok(i)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_crossref_fixture() {
        let v: Value = serde_json::from_str(
            r#"{"message":{"type":"journal-article","title":["Deep <i>learning</i>"],
          "author":[{"given":"Yann","family":"LeCun"},{"name":"Some Consortium"}],
          "issued":{"date-parts":[[2015,5,27]]},"container-title":["Nature"],"DOI":"10.1038/NATURE14539",
          "URL":"http://dx.doi.org/10.1038/nature14539","abstract":"<jats:p>Deep learning allows...</jats:p>"}}"#,
        )
        .unwrap();
        let i = parse_crossref(&v).unwrap();
        assert_eq!(i.title, "Deep learning");
        assert_eq!(
            i.authors,
            vec![Author::new("LeCun", "Yann"), Author::new("Some Consortium", "")]
        );
        assert_eq!((i.year, i.pub_date.as_deref()), (Some(2015), Some("2015-05-27")));
        assert_eq!(i.doi.as_deref(), Some("10.1038/nature14539"));
        assert_eq!(i.abstract_text.as_deref(), Some("Deep learning allows..."));
    }

    #[test]
    fn parses_openalex_fixture() {
        let v: Value = serde_json::from_str(
            r#"{"title":"Attention Is All You Need","publication_year":2017,
          "publication_date":"2017-06-12","doi":"https://doi.org/10.48550/arxiv.1706.03762","type":"preprint",
          "authorships":[{"author":{"display_name":"Ashish Vaswani"}}],
          "primary_location":{"source":{"display_name":"arXiv (Cornell University)"}},
          "abstract_inverted_index":{"The":[0],"dominant":[1],"models":[2]}}"#,
        )
        .unwrap();
        let i = parse_openalex(&v).unwrap();
        assert_eq!(i.arxiv_id.as_deref(), Some("1706.03762"));
        assert_eq!(i.doi, None);
        assert_eq!(i.authors, vec![Author::new("Vaswani", "Ashish")]);
        assert_eq!(i.abstract_text.as_deref(), Some("The dominant models"));
    }

    #[test]
    #[ignore = "network: run with --ignored"]
    fn live_lookups() {
        let d = fetch_doi("10.1038/nature14539").unwrap();
        assert_eq!(d.year, Some(2015));
        assert!(d.title.to_lowercase().contains("deep learning"));
        let a = fetch_arxiv("1706.03762").unwrap();
        assert!(a.title.to_lowercase().contains("attention"), "{a:?}");
        println!("{d:?}\n{a:?}");
    }

    #[test]
    fn encodes_doi_paths() {
        assert_eq!(encode_path("10.1002/(SICI)1097"), "10.1002/%28SICI%291097");
    }
}

fn encode_query(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// True when a candidate title (3+ words) literally appears in the page text.
pub fn title_in_text(title: &str, text: &str) -> bool {
    let t = paperlines_core::text::normalize_title(title);
    t.split_whitespace().count() >= 3 && paperlines_core::text::normalize_title(text).contains(&t)
}

/// Identifies a paper from its first page (like Zotero's "Retrieve metadata"). Queries Crossref
/// with the PDF's own title and first author when it has them (precise), then with the start of
/// the page; a result is accepted only if its title appears on the page or matches the PDF title.
pub fn crossref_by_text(
    first_page: &str,
    title_hint: Option<&str>,
    author_hint: Option<&str>,
) -> Result<Option<ItemInput>, String> {
    let mut queries = Vec::new();
    if let Some(t) = title_hint.filter(|t| t.split_whitespace().count() >= 3) {
        queries.push(format!("{t} {}", author_hint.unwrap_or("")).trim().to_string());
    }
    // affiliations and e-mails after the first lines only add noise
    let words: Vec<&str> = first_page.split_whitespace().take(25).collect();
    if words.len() >= 5 {
        queries.push(words.join(" "));
    }
    let mut last_err = None;
    for q in queries {
        let url = format!(
            "https://api.crossref.org/works?rows=5&query.bibliographic={}",
            encode_query(&q)
        );
        match get_json(&url) {
            Ok(v) => {
                if let Some(found) = pick_crossref_match(&v, first_page, title_hint) {
                    return Ok(Some(found));
                }
            }
            Err(e) => last_err = Some(e),
        }
    }
    match last_err {
        Some(e) => Err(e),
        None => Ok(None),
    }
}

pub fn pick_crossref_match(v: &Value, first_page: &str, title_hint: Option<&str>) -> Option<ItemInput> {
    use paperlines_core::text::{normalize_title, title_similarity};
    let head: String = first_page.chars().take(4000).collect();
    v.pointer("/message/items")?
        .as_array()?
        .iter()
        .filter_map(parse_crossref_work)
        .find(|i| {
            title_in_text(&i.title, &head)
                || title_hint.is_some_and(|t| {
                    title_similarity(&normalize_title(t), &normalize_title(&i.title))
                        >= paperlines_core::items::FUZZY_THRESHOLD
                })
        })
}

/// Candidate URLs of a legal open-access PDF: arXiv directly, else OpenAlex's OA locations.
pub fn open_access_urls(doi: Option<&str>, arxiv: Option<&str>) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    if let Some(a) = arxiv {
        out.push(format!("https://arxiv.org/pdf/{a}"));
    }
    if let Some(d) = doi {
        let v = get_json(&format!(
            "https://api.openalex.org/works/doi:{}?select=best_oa_location,locations,open_access",
            encode_path(d)
        ))?;
        out.extend(parse_oa_urls(&v));
    }
    out.dedup();
    Ok(out)
}

pub fn parse_oa_urls(v: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(u) = str_at(v, "/best_oa_location/pdf_url") {
        out.push(u);
    }
    for l in v.get("locations").and_then(Value::as_array).into_iter().flatten() {
        if l.get("is_oa").and_then(Value::as_bool) == Some(true) {
            if let Some(u) = str_at(l, "/pdf_url") {
                if !out.contains(&u) {
                    out.push(u);
                }
            }
        }
    }
    if let Some(u) = str_at(v, "/open_access/oa_url") {
        if !out.contains(&u) {
            out.push(u);
        }
    }
    out
}

/// Downloads a PDF (max 100 MB) into `dir`; rejects anything that is not a PDF.
pub fn download_pdf(url: &str, dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let mut resp = agent()
        .get(url)
        .header("User-Agent", &user_agent())
        .header("Accept", "application/pdf,*/*;q=0.5")
        .call()
        .map_err(|e| format!("Download failed: {e}"))?;
    let bytes = resp
        .body_mut()
        .with_config()
        .limit(100 * 1024 * 1024)
        .read_to_vec()
        .map_err(|e| format!("Download failed: {e}"))?;
    if !bytes.starts_with(b"%PDF") {
        return Err("The link did not return a PDF (it may need a browser or a subscription)".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let p = dir.join(format!("download-{}.pdf", std::process::id()));
    std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(p)
}

#[cfg(test)]
mod more_tests {
    use super::*;

    #[test]
    fn picks_crossref_match_only_when_title_is_on_the_page() {
        let page = "Deep Residual Learning for Image Recognition\nKaiming He Xiangyu Zhang\nMicrosoft Research\nAbstract Deeper neural networks are more difficult to train.";
        let v: Value = serde_json::from_str(r#"{"message":{"items":[
            {"title":["Residual networks behave like ensembles"],"DOI":"10.1/wrong"},
            {"title":["Deep Residual Learning for Image Recognition"],"DOI":"10.1109/CVPR.2016.90","author":[{"family":"He","given":"Kaiming"}]}]}}"#).unwrap();
        assert_eq!(
            pick_crossref_match(&v, page, None).unwrap().doi.as_deref(),
            Some("10.1109/cvpr.2016.90")
        );
        let none: Value =
            serde_json::from_str(r#"{"message":{"items":[{"title":["Something else entirely here"]}]}}"#).unwrap();
        assert!(pick_crossref_match(&none, page, None).is_none());
        assert!(!title_in_text("Deep", page), "too short to trust");
        // a garbled first page still matches through the PDF's own title
        let garbled = "Th re e-dim ension al multi pho ton";
        let oe: Value = serde_json::from_str(r#"{"message":{"items":[
            {"title":["Three-dimensional multi-photon direct laser writing with variable repetition rate"],"DOI":"10.1364/OE.21.026244"}]}}"#).unwrap();
        assert!(pick_crossref_match(&oe, garbled, None).is_none());
        assert_eq!(
            pick_crossref_match(
                &oe,
                garbled,
                Some("Three-dimensional multi-photon direct laser writing with variable repetition rate")
            )
            .unwrap()
            .doi
            .as_deref(),
            Some("10.1364/oe.21.026244")
        );
    }

    #[test]
    fn collects_open_access_urls() {
        let v: Value = serde_json::from_str(r#"{"best_oa_location":{"pdf_url":"https://a.org/x.pdf"},
            "locations":[{"is_oa":true,"pdf_url":"https://b.org/y.pdf"},{"is_oa":false,"pdf_url":"https://paywall/z.pdf"},{"is_oa":true,"pdf_url":"https://a.org/x.pdf"}],
            "open_access":{"oa_url":"https://c.org/landing"}}"#).unwrap();
        assert_eq!(
            parse_oa_urls(&v),
            vec!["https://a.org/x.pdf", "https://b.org/y.pdf", "https://c.org/landing"]
        );
    }
}
