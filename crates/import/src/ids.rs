use paperlines_core::text::{normalize_arxiv, normalize_doi};
use regex::Regex;
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Identifier {
    Doi(String),
    Arxiv(String),
    /// A PubMed ID.
    Pmid(String),
}

fn pmid_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?i)^(?:pmid[:\s]*|https?://pubmed\.ncbi\.nlm\.nih\.gov/)(\d{1,9})/?$").unwrap())
}

fn doi_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r#"(?i)\b10\.\d{4,9}/[^\s"<>{}]+"#).unwrap())
}

fn arxiv_new_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?i)arxiv[:\s/]*(?:abs/)?(\d{4}\.\d{4,5})(v\d+)?").unwrap())
}

fn arxiv_bare_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^(\d{4}\.\d{4,5}|[a-z\-]+(\.[A-Z]{2})?/\d{7})(v\d+)?$").unwrap())
}

/// First DOI in free text (e.g. a PDF's first page).
pub fn find_doi(text: &str) -> Option<String> {
    let m = doi_re().find(text)?.as_str();
    let m = m.trim_end_matches(['.', ',', ';', ')', ']']);
    normalize_doi(m)
}

/// First "arXiv:2101.00001"-style mention in free text.
pub fn find_arxiv(text: &str) -> Option<String> {
    arxiv_new_re().captures(text).and_then(|c| normalize_arxiv(&c[1]))
}

/// Parses one user-typed identifier: DOI, doi.org URL, arXiv ID or arxiv.org URL.
pub fn parse_identifier(s: &str) -> Option<Identifier> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if let Some(c) = pmid_re().captures(s) {
        return Some(Identifier::Pmid(c[1].to_string()));
    }
    let lower = s.to_lowercase();
    if lower.contains("arxiv") {
        if let Some(a) = find_arxiv(s).or_else(|| {
            let tail = lower.rsplit("abs/").next().unwrap_or("").trim_end_matches(".pdf");
            arxiv_bare_re().is_match(tail).then(|| normalize_arxiv(tail)).flatten()
        }) {
            return Some(Identifier::Arxiv(a));
        }
    }
    if let Some(d) = find_doi(s) {
        // arXiv's DataCite DOIs are better served by the arXiv path
        if let Some(a) = d.strip_prefix("10.48550/arxiv.") {
            return normalize_arxiv(a).map(Identifier::Arxiv);
        }
        return Some(Identifier::Doi(d));
    }
    if arxiv_bare_re().is_match(s) {
        return normalize_arxiv(s).map(Identifier::Arxiv);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pubmed_ids() {
        assert_eq!(
            parse_identifier("PMID: 31234567"),
            Some(Identifier::Pmid("31234567".into()))
        );
        assert_eq!(
            parse_identifier("pmid31234567"),
            Some(Identifier::Pmid("31234567".into()))
        );
        assert_eq!(
            parse_identifier("https://pubmed.ncbi.nlm.nih.gov/31234567/"),
            Some(Identifier::Pmid("31234567".into()))
        );
        assert_eq!(parse_identifier("31234567"), None, "a bare number is ambiguous");
    }

    #[test]
    fn parses_identifiers() {
        use Identifier::*;
        assert_eq!(
            parse_identifier("10.1038/nature14539"),
            Some(Doi("10.1038/nature14539".into()))
        );
        assert_eq!(
            parse_identifier("https://doi.org/10.1038/Nature14539"),
            Some(Doi("10.1038/nature14539".into()))
        );
        assert_eq!(parse_identifier("arXiv:1706.03762v5"), Some(Arxiv("1706.03762".into())));
        assert_eq!(
            parse_identifier("https://arxiv.org/abs/1706.03762"),
            Some(Arxiv("1706.03762".into()))
        );
        assert_eq!(parse_identifier("1706.03762"), Some(Arxiv("1706.03762".into())));
        assert_eq!(
            parse_identifier("10.48550/arXiv.1706.03762"),
            Some(Arxiv("1706.03762".into()))
        );
        assert_eq!(parse_identifier("hello world"), None);
    }

    #[test]
    fn finds_ids_in_text() {
        let t = "Proc. X (2019). https://doi.org/10.1145/3292500.3330701. arXiv:1905.12345v2 [cs.LG]";
        assert_eq!(find_doi(t), Some("10.1145/3292500.3330701".into()));
        assert_eq!(find_arxiv(t), Some("1905.12345".into()));
    }
}
