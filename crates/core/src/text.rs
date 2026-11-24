//! Unicode-aware normalization shared by matching, citekeys and file handling.
use std::collections::HashSet;
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

/// NFC form. macOS file APIs often return NFD; always compare NFC.
pub fn nfc(s: &str) -> String {
    s.nfc().collect()
}

/// Lowercase ASCII-ish folding: strips diacritics, keeps letters and digits.
pub fn fold(s: &str) -> String {
    s.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect()
}

/// Title key for fuzzy matching: folded, punctuation removed, whitespace collapsed.
pub fn normalize_title(s: &str) -> String {
    let f: String = fold(s)
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();
    f.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Jaccard similarity over word sets of two normalized titles.
pub fn title_similarity(a: &str, b: &str) -> f64 {
    let sa: HashSet<&str> = a.split_whitespace().collect();
    let sb: HashSet<&str> = b.split_whitespace().collect();
    if sa.is_empty() || sb.is_empty() {
        return 0.0;
    }
    sa.intersection(&sb).count() as f64 / sa.union(&sb).count() as f64
}

pub fn normalize_doi(s: &str) -> Option<String> {
    let t = s.trim();
    let lower = t.to_lowercase();
    let mut d = lower.as_str();
    for p in [
        "https://doi.org/",
        "http://doi.org/",
        "https://dx.doi.org/",
        "http://dx.doi.org/",
        "doi:",
    ] {
        if let Some(rest) = d.strip_prefix(p) {
            d = rest.trim();
        }
    }
    let d = d.trim_end_matches(['.', ',', ';']);
    d.starts_with("10.").then(|| d.to_string())
}

pub fn normalize_arxiv(s: &str) -> Option<String> {
    let t = s.trim();
    let l = t.to_lowercase();
    let mut d = l.as_str();
    for p in [
        "https://arxiv.org/abs/",
        "http://arxiv.org/abs/",
        "https://arxiv.org/pdf/",
        "arxiv:",
    ] {
        if let Some(rest) = d.strip_prefix(p) {
            d = rest;
        }
    }
    let d = d.trim_end_matches(".pdf");
    // drop version suffix: 2101.00001v3 -> 2101.00001
    let base = match d.rfind('v') {
        Some(i) if i > 0 && d[i + 1..].chars().all(|c| c.is_ascii_digit()) && i + 1 < d.len() => &d[..i],
        _ => d,
    };
    (!base.is_empty()).then(|| base.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nfc_makes_macos_nfd_equal() {
        let nfd = "Mu\u{0308}ller.pdf"; // as returned by HFS+/APFS listings
        let nfc_form = "Müller.pdf";
        assert_ne!(nfd, nfc_form);
        assert_eq!(nfc(nfd), nfc(nfc_form));
    }

    #[test]
    fn titles_fold_diacritics_and_punctuation() {
        assert_eq!(
            normalize_title("Attention Is All You Need!"),
            "attention is all you need"
        );
        assert_eq!(normalize_title("Über  Naïve—Bayes"), "uber naive bayes");
    }

    #[test]
    fn similarity_is_high_for_near_duplicates() {
        let a = normalize_title("Attention is all you need");
        let b = normalize_title("Attention Is All You Need.");
        assert_eq!(title_similarity(&a, &b), 1.0);
        assert!(title_similarity(&a, &normalize_title("BERT: pre-training")) < 0.2);
    }

    #[test]
    fn doi_and_arxiv_normalization() {
        assert_eq!(
            normalize_doi("https://doi.org/10.1000/ABC.1."),
            Some("10.1000/abc.1".into())
        );
        assert_eq!(normalize_doi("doi: 10.1/x"), Some("10.1/x".into()));
        assert_eq!(normalize_doi("not a doi"), None);
        assert_eq!(normalize_arxiv("arXiv:1706.03762v5"), Some("1706.03762".into()));
        assert_eq!(
            normalize_arxiv("https://arxiv.org/abs/1706.03762"),
            Some("1706.03762".into())
        );
        assert_eq!(normalize_arxiv("hep-th/9901001v2"), Some("hep-th/9901001".into()));
    }
}
