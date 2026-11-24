//! Import as two steps: `preview` builds reviewable candidates, `commit` writes the user's decisions.
use crate::ids::{parse_identifier, Identifier};
use crate::{bibtex, csl, epub, lookup, pdf, ris};
use paperlines_core::attachments::{add_attachment_of_kind, hash_file, item_with_hash, store_file};
use paperlines_core::db::Db;
use paperlines_core::items::{find_duplicate, get_item, insert_item, merge_into};
use paperlines_core::model::ItemInput;
use paperlines_core::paths::LibraryPaths;
use paperlines_core::rusqlite::Connection;
use paperlines_core::text::{nfc, normalize_title};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub input: ItemInput,
    /// pdf | doi | arxiv | bibtex | csl | ris
    pub source: String,
    /// The PDF or EPUB file to attach.
    pub pdf_path: Option<String>,
    pub page_count: Option<u32>,
    /// "pdf" or "epub" (pdf when absent).
    #[serde(default)]
    pub file_kind: Option<String>,
    pub duplicate_of: Option<i64>,
    pub duplicate_title: Option<String>,
    pub warnings: Vec<String>,
}

impl Candidate {
    fn new(input: ItemInput, source: &str) -> Self {
        Candidate {
            input,
            source: source.into(),
            pdf_path: None,
            page_count: None,
            file_kind: None,
            duplicate_of: None,
            duplicate_title: None,
            warnings: Vec::new(),
        }
    }
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub candidates: Vec<Candidate>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Add,
    Merge,
    Skip,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub candidate: Candidate,
    pub action: Action,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub added: Vec<i64>,
    pub merged: Vec<i64>,
    pub skipped: usize,
    pub errors: Vec<String>,
}

fn ext(p: &Path) -> String {
    p.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn display(p: &Path) -> String {
    nfc(&p.file_name().unwrap_or_default().to_string_lossy())
}

/// Files stay as given; folders are walked recursively for PDFs (hidden entries skipped).
pub fn expand_paths(paths: &[PathBuf]) -> Vec<PathBuf> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        let mut entries: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
        entries.sort();
        for p in entries {
            if p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')) {
                continue;
            }
            if p.is_dir() {
                walk(&p, out);
            } else if ext(&p) == "pdf" || ext(&p) == "epub" {
                out.push(p);
            }
        }
    }
    let mut out = Vec::new();
    for p in paths {
        if p.is_dir() {
            walk(p, &mut out);
        } else {
            out.push(p.clone());
        }
    }
    out
}

fn title_from_filename(p: &Path) -> String {
    let stem = nfc(&p.file_stem().unwrap_or_default().to_string_lossy());
    stem.replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Whether looked-up metadata describes this PDF: its title appears on the first page, or is
/// close to the title stored in the PDF. With neither to compare against, it is trusted.
fn matches_pdf(found: &ItemInput, meta: &pdf::PdfMeta) -> bool {
    use paperlines_core::text::{normalize_title, title_similarity};
    let has_text = meta.first_text.split_whitespace().count() >= 5;
    if !has_text && meta.title.is_none() {
        return true;
    }
    (has_text && lookup::title_in_text(&found.title, &meta.first_text))
        || meta.title.as_deref().is_some_and(|t| {
            title_similarity(&normalize_title(t), &normalize_title(&found.title))
                >= paperlines_core::items::FUZZY_THRESHOLD
        })
}

pub fn from_pdf(path: &Path, offline: bool) -> Candidate {
    let meta = pdf::extract(path);
    let mut c = Candidate::new(ItemInput::default(), "pdf");
    c.pdf_path = Some(path.to_string_lossy().into_owned());
    let meta = match meta {
        Ok(m) => m,
        Err(e) => {
            c.warnings.push(e);
            pdf::PdfMeta::default()
        }
    };
    c.page_count = meta.page_count;
    let mut from_pdf = ItemInput {
        title: meta.title.clone().unwrap_or_else(|| title_from_filename(path)),
        authors: meta.authors.clone(),
        doi: meta.doi.clone(),
        arxiv_id: meta.arxiv_id.clone(),
        ..Default::default()
    };
    let looked_up = match (&meta.doi, &meta.arxiv_id, offline) {
        (Some(_), _, true) | (None, Some(_), true) => {
            c.warnings.push("Offline mode: metadata comes from the PDF only".into());
            None
        }
        (Some(d), _, false) => Some(lookup::fetch_doi(d)),
        (None, Some(a), false) => Some(lookup::fetch_arxiv(a)),
        (None, None, false) => match lookup::crossref_by_text(
            &meta.first_text,
            meta.title.as_deref(),
            meta.authors.first().map(|a| a.family.as_str()),
        ) {
            Ok(Some(found)) => {
                c.warnings
                    .push("Identified by matching the first page with Crossref. Check that it is right.".into());
                Some(Ok(found))
            }
            _ => {
                c.warnings
                    .push("No DOI or arXiv ID found in the PDF. Check the title and authors.".into());
                None
            }
        },
        (None, None, true) => {
            c.warnings
                .push("No DOI or arXiv ID found in the PDF. Check the title and authors.".into());
            None
        }
    };
    // A DOI or arXiv ID found in the PDF may belong to a paper it cites: accept the lookup only
    // if its title is on the first page or matches the PDF's own title; else search by the page.
    let looked_up = match looked_up {
        Some(Ok(found)) if (meta.doi.is_some() || meta.arxiv_id.is_some()) && !matches_pdf(&found, &meta) => {
            c.warnings.push(format!(
                "The identifier found in the PDF leads to “{}”, which doesn't match this PDF, so it was ignored.",
                found.title
            ));
            match lookup::crossref_by_text(
                &meta.first_text,
                meta.title.as_deref(),
                meta.authors.first().map(|a| a.family.as_str()),
            ) {
                Ok(Some(better)) if matches_pdf(&better, &meta) => {
                    c.warnings
                        .push("Identified by matching the first page with Crossref. Check that it is right.".into());
                    Some(Ok(better))
                }
                _ => None,
            }
        }
        other => other,
    };
    if c.warnings.iter().any(|w| w.contains("doesn't match this PDF")) {
        // the ID belongs to another paper: don't keep it
        from_pdf.doi = None;
        from_pdf.arxiv_id = None;
    }
    c.input = match looked_up {
        Some(Ok(mut found)) => {
            found.fill_from(&from_pdf);
            found
        }
        Some(Err(e)) => {
            c.warnings
                .push(format!("Metadata lookup failed ({e}). Using what the PDF contains."));
            from_pdf
        }
        None => from_pdf,
    };
    if meta.title.is_none() && c.source == "pdf" && c.input.title == title_from_filename(path) {
        c.warnings.push("Title was taken from the file name".into());
    }
    c
}

pub fn from_epub(path: &Path) -> Candidate {
    let mut c = Candidate::new(ItemInput::default(), "epub");
    c.pdf_path = Some(path.to_string_lossy().into_owned());
    c.file_kind = Some("epub".into());
    match epub::extract(path) {
        Ok(i) if !i.title.trim().is_empty() => c.input = i,
        Ok(i) => {
            c.input = ItemInput {
                title: title_from_filename(path),
                ..i
            };
            c.warnings.push("Title was taken from the file name".into());
        }
        Err(e) => {
            c.input = ItemInput {
                item_type: "book".into(),
                title: title_from_filename(path),
                ..Default::default()
            };
            c.warnings.push(e);
        }
    }
    c
}

pub fn from_identifier(id: &Identifier, offline: bool) -> Result<Candidate, String> {
    if offline {
        return Err("Offline mode is on. Turn it off in Settings to look up identifiers.".into());
    }
    match id {
        Identifier::Doi(d) => lookup::fetch_doi(d)
            .map(|i| Candidate::new(i, "doi"))
            .map_err(|e| format!("{d}: {e}")),
        Identifier::Arxiv(a) => lookup::fetch_arxiv(a)
            .map(|i| Candidate::new(i, "arxiv"))
            .map_err(|e| format!("arXiv {a}: {e}")),
        Identifier::Pmid(p) => crate::discover::fetch_pmid(p)
            .map(|i| Candidate::new(i, "doi"))
            .map_err(|e| format!("PMID {p}: {e}")),
    }
}

fn from_bib_text(text: &str) -> Vec<Candidate> {
    bibtex::parse(text)
        .into_iter()
        .filter(|i| !i.title.is_empty())
        .map(|i| Candidate::new(i, "bibtex"))
        .collect()
}

/// Reads candidates from files and folders. `progress(done, total)` is called after each file.
pub fn preview_paths(paths: &[PathBuf], offline: bool, progress: &dyn Fn(usize, usize)) -> Preview {
    let files = expand_paths(paths);
    let mut pv = Preview::default();
    for (n, f) in files.iter().enumerate() {
        match ext(f).as_str() {
            "pdf" => pv.candidates.push(from_pdf(f, offline)),
            "epub" => pv.candidates.push(from_epub(f)),
            "bib" => match std::fs::read_to_string(f) {
                Ok(t) => pv.candidates.extend(from_bib_text(&t)),
                Err(e) => pv.errors.push(format!("{}: {e}", display(f))),
            },
            "ris" => match std::fs::read_to_string(f) {
                Ok(t) => pv
                    .candidates
                    .extend(ris::parse(&t).into_iter().map(|i| Candidate::new(i, "ris"))),
                Err(e) => pv.errors.push(format!("{}: {e}", display(f))),
            },
            "json" => match std::fs::read_to_string(f)
                .map_err(|e| e.to_string())
                .and_then(|t| csl::parse(&t).map_err(|e| e.to_string()))
            {
                Ok(items) => pv
                    .candidates
                    .extend(items.into_iter().map(|i| Candidate::new(i, "csl"))),
                Err(e) => pv.errors.push(format!("{}: not valid CSL-JSON ({e})", display(f))),
            },
            _ => pv.errors.push(format!("{}: unsupported file type", display(f))),
        }
        progress(n + 1, files.len());
    }
    pv
}

/// Pasted text: BibTeX, CSL-JSON, or one DOI / arXiv ID per line.
pub fn preview_text(text: &str, offline: bool, progress: &dyn Fn(usize, usize)) -> Preview {
    let t = text.trim();
    let mut pv = Preview::default();
    if t.contains('@') && t.contains('{') {
        pv.candidates = from_bib_text(t);
        if pv.candidates.is_empty() {
            pv.errors.push("No BibTeX entries with a title were found".into());
        }
        return pv;
    }
    if t.starts_with("TY  -") {
        pv.candidates = ris::parse(t).into_iter().map(|i| Candidate::new(i, "ris")).collect();
        if pv.candidates.is_empty() {
            pv.errors.push("No RIS records with a title were found".into());
        }
        return pv;
    }
    if t.starts_with('[') || t.starts_with('{') {
        match csl::parse(t) {
            Ok(items) => pv.candidates = items.into_iter().map(|i| Candidate::new(i, "csl")).collect(),
            Err(e) => pv.errors.push(format!("Not valid CSL-JSON: {e}")),
        }
        return pv;
    }
    let lines: Vec<&str> = t.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    for (n, line) in lines.iter().enumerate() {
        match parse_identifier(line) {
            Some(id) => match from_identifier(&id, offline) {
                Ok(c) => pv.candidates.push(c),
                Err(e) => pv.errors.push(e),
            },
            None => pv.errors.push(format!("Not a DOI or arXiv ID: {line}")),
        }
        progress(n + 1, lines.len());
    }
    pv
}

/// Flags candidates that match library items (DOI, arXiv, fuzzy title, same PDF) or each other.
pub fn mark_duplicates(conn: &Connection, candidates: &mut [Candidate]) -> paperlines_core::Result<()> {
    let mut seen: Vec<String> = Vec::new();
    for c in candidates.iter_mut() {
        let mut dup = find_duplicate(conn, &c.input)?;
        if dup.is_none() {
            if let Some(p) = &c.pdf_path {
                if let Ok((hash, _)) = hash_file(Path::new(p)) {
                    dup = item_with_hash(conn, &hash)?;
                }
            }
        }
        if let Some(id) = dup {
            c.duplicate_of = Some(id);
            c.duplicate_title = get_item(conn, id)?.map(|i| i.title);
        }
        let key = c.input.doi.clone().unwrap_or_else(|| normalize_title(&c.input.title));
        if seen.contains(&key) {
            c.warnings.push("Appears more than once in this import".into());
        }
        seen.push(key);
    }
    Ok(())
}

/// Applies decisions one transaction per candidate, so one failure never loses the others.
pub fn commit(db: &mut Db, lib: &LibraryPaths, decisions: &[Decision]) -> CommitResult {
    let mut r = CommitResult::default();
    for d in decisions {
        let c = &d.candidate;
        if d.action == Action::Skip {
            r.skipped += 1;
            continue;
        }
        let kind = c.file_kind.as_deref().unwrap_or("pdf");
        let stored = match &c.pdf_path {
            Some(p) => match store_file(&lib.pdfs, Path::new(p), kind) {
                Ok(s) => Some(s),
                Err(e) => {
                    r.errors.push(format!("{}: {e}", c.input.title));
                    continue;
                }
            },
            None => None,
        };
        let res = match (d.action, c.duplicate_of) {
            (Action::Add, _) => db.tx(|tx| {
                let id = insert_item(tx, &c.input)?;
                if let Some(s) = &stored {
                    add_attachment_of_kind(tx, id, s, c.page_count, kind)?;
                }
                Ok(id)
            }),
            (Action::Merge, Some(target)) => db.tx(|tx| {
                merge_into(tx, target, &c.input)?;
                if let Some(s) = &stored {
                    if item_with_hash(tx, &s.hash)? != Some(target) {
                        add_attachment_of_kind(tx, target, s, c.page_count, kind)?;
                    }
                }
                Ok(target)
            }),
            (Action::Merge, None) => Err(paperlines_core::Error::msg("Nothing to merge into")),
            (Action::Skip, _) => unreachable!(),
        };
        match (res, d.action) {
            (Ok(id), Action::Add) => r.added.push(id),
            (Ok(id), _) => r.merged.push(id),
            (Err(e), _) => r.errors.push(format!("{}: {e}", c.input.title)),
        }
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_core::items::list_items;

    const BIB: &str =
        "@article{a, title={Attention Is All You Need}, author={Vaswani, Ashish}, year=2017, doi={10.1/a}}
                       @article{b, title={Deep Residual Learning}, author={He, Kaiming}, year=2016}";

    #[test]
    fn bibtex_preview_then_commit_then_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let lib = LibraryPaths::new(dir.path());
        lib.ensure().unwrap();
        let mut db = Db::open(&lib.db).unwrap();

        let mut pv = preview_text(BIB, true, &|_, _| {});
        assert_eq!(pv.candidates.len(), 2);
        mark_duplicates(&db.conn, &mut pv.candidates).unwrap();
        assert!(pv.candidates.iter().all(|c| c.duplicate_of.is_none()));
        let decisions: Vec<Decision> = pv
            .candidates
            .into_iter()
            .map(|candidate| Decision {
                candidate,
                action: Action::Add,
            })
            .collect();
        let r = commit(&mut db, &lib, &decisions);
        assert_eq!((r.added.len(), r.errors.len()), (2, 0));

        let mut again = preview_text(BIB, true, &|_, _| {});
        mark_duplicates(&db.conn, &mut again.candidates).unwrap();
        assert!(again.candidates.iter().all(|c| c.duplicate_of.is_some()));
        let mut merge = again.candidates[1].clone();
        merge.input.venue = Some("CVPR".into());
        let r = commit(
            &mut db,
            &lib,
            &[Decision {
                candidate: merge,
                action: Action::Merge,
            }],
        );
        assert_eq!(r.merged.len(), 1);
        let items = list_items(&db.conn).unwrap();
        assert_eq!(items.len(), 2);
        assert!(items.iter().any(|i| i.venue.as_deref() == Some("CVPR")));
    }

    #[test]
    fn offline_identifiers_report_errors_and_bad_lines() {
        let pv = preview_text("10.1038/nature14539\nnot an id", true, &|_, _| {});
        assert!(pv.candidates.is_empty());
        assert_eq!(pv.errors.len(), 2);
        assert!(pv.errors[0].contains("Offline"));
    }

    #[test]
    fn folder_import_walks_pdfs_and_attaches_by_hash() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("papers");
        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::write(src.join("sub").join("broken_paper.pdf"), b"not really a pdf").unwrap();
        std::fs::write(src.join(".hidden.pdf"), b"x").unwrap();
        std::fs::write(src.join("notes.txt"), b"x").unwrap();
        assert_eq!(expand_paths(std::slice::from_ref(&src)).len(), 1);

        let lib = LibraryPaths::new(&dir.path().join("lib"));
        lib.ensure().unwrap();
        let mut db = Db::open(&lib.db).unwrap();
        let mut pv = preview_paths(&[src], true, &|_, _| {});
        assert_eq!(pv.candidates.len(), 1);
        let c = &pv.candidates[0];
        assert_eq!(c.input.title, "broken paper");
        assert!(!c.warnings.is_empty());
        mark_duplicates(&db.conn, &mut pv.candidates).unwrap();
        let d = Decision {
            candidate: pv.candidates[0].clone(),
            action: Action::Add,
        };
        let r = commit(&mut db, &lib, &[d]);
        assert_eq!(r.added.len(), 1);
        assert!(list_items(&db.conn).unwrap()[0].has_pdf);

        // same file again is recognized by content hash even with a different title
        let mut c2 = pv.candidates[0].clone();
        c2.input.title = "Totally different".into();
        let mut v = vec![c2];
        mark_duplicates(&db.conn, &mut v).unwrap();
        assert_eq!(v[0].duplicate_of, Some(r.added[0]));
    }
}
