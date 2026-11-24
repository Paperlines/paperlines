//! Best-effort metadata from a PDF: document info, plus DOI/arXiv IDs from the first pages.
use crate::ids::{find_arxiv, find_doi};
use paperlines_core::model::Author;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;

#[derive(Debug, Default, Clone, PartialEq)]
pub struct PdfMeta {
    pub title: Option<String>,
    pub authors: Vec<Author>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub page_count: Option<u32>,
    /// Text of the first page (for identifying papers without a DOI).
    pub first_text: String,
}

fn decode(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let u: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| u16::from_be_bytes(*c))
            .collect();
        String::from_utf16_lossy(&u)
    } else if let Ok(s) = std::str::from_utf8(bytes) {
        s.to_string()
    } else {
        bytes.iter().map(|&b| b as char).collect()
    }
}

/// Rejects titles that are really file names or producer junk.
fn plausible_title(t: &str) -> bool {
    let l = t.to_lowercase();
    t.chars().filter(|c| c.is_alphabetic()).count() >= 6
        && !l.starts_with("microsoft word")
        && !l.ends_with(".pdf")
        && !l.ends_with(".dvi")
        && !l.ends_with(".tex")
        && !l.ends_with(".doc")
        && !l.ends_with(".docx")
        && l != "untitled"
}

fn split_authors(s: &str) -> Vec<Author> {
    let parts: Vec<&str> = if s.contains(';') {
        s.split(';').collect()
    } else if s.contains(" and ") {
        s.split(" and ").flat_map(|p| p.split(", ")).collect()
    } else {
        s.split(", ").collect()
    };
    parts
        .into_iter()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(Author::parse)
        .collect()
}

pub fn extract(path: &Path) -> Result<PdfMeta, String> {
    let doc = lopdf::Document::load(path).map_err(|e| format!("Could not read PDF: {e}"))?;
    let mut m = PdfMeta {
        page_count: Some(doc.get_pages().len() as u32),
        ..Default::default()
    };
    let info = doc
        .trailer
        .get(b"Info")
        .ok()
        .and_then(|o| o.as_reference().ok())
        .and_then(|r| doc.get_dictionary(r).ok());
    let field = |k: &[u8]| -> Option<String> {
        let v = info?.get(k).ok()?.as_str().ok()?;
        let s = decode(v).trim().to_string();
        (!s.is_empty()).then_some(s)
    };
    m.title = field(b"Title").filter(|t| plausible_title(t));
    m.authors = field(b"Author").map(|a| split_authors(&a)).unwrap_or_default();
    let mut haystack = [field(b"Subject"), field(b"Keywords"), field(b"doi")]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
    let pages: Vec<u32> = doc.get_pages().keys().copied().take(2).collect();
    // lopdf can panic on unusual content streams; text is optional, so contain it.
    for (n, &p) in pages.iter().enumerate() {
        let Ok(Ok(t)) = catch_unwind(AssertUnwindSafe(|| doc.extract_text(&[p]))) else {
            continue;
        };
        if n == 0 {
            m.first_text = t.clone();
        }
        // a paper's own DOI comes before its reference list; DOIs after the "References"
        // heading belong to the papers it cites (short papers start citing on page 1)
        match references_start(&t) {
            Some(at) => {
                haystack.push(' ');
                haystack.push_str(&t[..at]);
                break;
            }
            None => {
                haystack.push(' ');
                haystack.push_str(&t);
            }
        }
    }
    m.doi = find_doi(&haystack);
    m.arxiv_id = find_arxiv(&haystack);
    Ok(m)
}

/// Where the reference list starts: a "References" (or "Bibliography", ...) heading followed by
/// the first entry ("1." / "[1]"), so the word in running text doesn't count.
pub fn references_start(text: &str) -> Option<usize> {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(
            r"(?i)\b(references(?:\s+and\s+(?:links|notes))?|bibliography|literature\s+cited|works\s+cited|cited\s+literature)\s*:?\s*(?:\[\s*1\s*\]|\(\s*1\s*\)|1\s*\.|1\s)",
        )
        .expect("valid regex")
    })
    .find(text)
    .map(|m| m.start())
}

/// Text of pages `from..=to` (1-based), one string per page, for reading and quoting. Words
/// hyphenated across a line break are joined; lopdf can panic on odd content streams, so each
/// page is contained (an unreadable page comes back empty).
pub fn page_texts(path: &Path, from: u32, to: u32) -> Result<Vec<(u32, String)>, String> {
    let doc = lopdf::Document::load(path).map_err(|e| format!("Could not read PDF: {e}"))?;
    let pages: Vec<u32> = doc
        .get_pages()
        .keys()
        .copied()
        .filter(|p| *p >= from && *p <= to)
        .collect();
    Ok(pages
        .into_iter()
        .map(|p| {
            let raw = catch_unwind(AssertUnwindSafe(|| doc.extract_text(&[p])))
                .ok()
                .and_then(Result::ok)
                .unwrap_or_default();
            (p, tidy(&raw))
        })
        .collect())
}

/// One line per text line, spaces collapsed, "exam-\nple" joined.
fn tidy(raw: &str) -> String {
    let mut out = String::new();
    for line in raw.lines() {
        let l = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if l.is_empty() {
            continue;
        }
        if out.ends_with('-') && l.chars().next().is_some_and(char::is_lowercase) {
            out.pop();
        } else if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&l);
    }
    out
}

/// How many pages a PDF has.
pub fn page_count(path: &Path) -> Result<u32, String> {
    let doc = lopdf::Document::load(path).map_err(|e| format!("Could not read PDF: {e}"))?;
    Ok(doc.get_pages().len() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_filter_and_author_split() {
        assert!(!plausible_title("Microsoft Word - draft3.docx"));
        assert!(!plausible_title("paper.pdf"));
        assert!(plausible_title("Attention Is All You Need"));
        assert_eq!(split_authors("Ashish Vaswani, Noam Shazeer").len(), 2);
        assert_eq!(
            split_authors("Vaswani, A.; Shazeer, N.")[1],
            Author::new("Shazeer", "N.")
        );
        assert_eq!(decode(&[0xFE, 0xFF, 0, b'H', 0, b'i']), "Hi");
    }

    #[test]
    fn reference_lists_are_not_the_papers_own_ids() {
        let page = "Three-dimensional multi-photon direct laser writing. Abstract: we write. \
            References and links 1. H. B. Sun, Opt. Lett. doi: 10.1016/j.physrep.2013.07.005 (2013).";
        let at = references_start(page).unwrap();
        assert!(page[at..].starts_with("References and links"));
        assert!(find_doi(&page[..at]).is_none());
        assert!(references_start("REFERENCES [1] A. Author").is_some());
        assert!(references_start("Bibliography\n1 Smith").is_some());
        // the word in running text is not a heading
        assert!(references_start("as the references in [12] show, the effect").is_none());
        assert!(references_start("see references therein").is_none());
    }

    #[test]
    fn reads_generated_pdf() {
        use lopdf::{dictionary, Object, Stream};
        let mut doc = lopdf::Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let font = doc.add_object(dictionary! {"Type"=>"Font","Subtype"=>"Type1","BaseFont"=>"Helvetica"});
        let content = b"BT /F1 12 Tf 72 720 Td (doi:10.1234/abcd.5678 arXiv:2101.00001v2) Tj ET".to_vec();
        let c = doc.add_object(Stream::new(dictionary! {}, content));
        let page = doc.add_object(dictionary! {"Type"=>"Page","Parent"=>pages_id,"Contents"=>c,
            "Resources"=>dictionary!{"Font"=>dictionary!{"F1"=>font}}, "MediaBox"=>vec![0.into(),0.into(),612.into(),792.into()]});
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {"Type"=>"Pages","Kids"=>vec![page.into()],"Count"=>1}),
        );
        let catalog = doc.add_object(dictionary! {"Type"=>"Catalog","Pages"=>pages_id});
        let info = doc.add_object(dictionary! {"Title"=>Object::string_literal("A Generated Test Paper"),
        "Author"=>Object::string_literal("Ada Lovelace; Alan Turing")});
        doc.trailer.set("Root", catalog);
        doc.trailer.set("Info", info);
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("t.pdf");
        doc.save(&p).unwrap();
        let m = extract(&p).unwrap();
        assert_eq!(m.title.as_deref(), Some("A Generated Test Paper"));
        assert_eq!(
            m.authors,
            vec![Author::new("Lovelace", "Ada"), Author::new("Turing", "Alan")]
        );
        assert_eq!(m.page_count, Some(1));
        assert_eq!(m.doi.as_deref(), Some("10.1234/abcd.5678"));
        assert_eq!(m.arxiv_id.as_deref(), Some("2101.00001"));
    }
}
