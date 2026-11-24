//! Matches cached references to library items: DOI, then arXiv ID, then fuzzy title + year.
use crate::refs::RefEntry;
use paperlines_core::items::FUZZY_THRESHOLD;
use paperlines_core::rusqlite::Connection;
use paperlines_core::text::{normalize_arxiv, normalize_doi, normalize_title, title_similarity};
use paperlines_core::Result;
use std::collections::HashMap;

const STOP: &[&str] = &[
    "with", "from", "that", "this", "using", "based", "towards", "toward", "into", "over", "under", "their", "learning",
];

struct Entry {
    id: i64,
    title: String,
    year: Option<i32>,
}

/// An in-memory index of library items, so matching stays fast at 10k items.
#[derive(Default)]
pub struct LibIndex {
    by_doi: HashMap<String, i64>,
    by_arxiv: HashMap<String, i64>,
    entries: Vec<Entry>,
    by_token: HashMap<String, Vec<usize>>,
}

fn tokens(norm: &str) -> impl Iterator<Item = &str> {
    norm.split_whitespace()
        .filter(|w| w.chars().count() >= 4 && !STOP.contains(w))
}

impl LibIndex {
    pub fn load(conn: &Connection) -> Result<Self> {
        Self::load_where(conn, "deleted_at IS NULL", &[])
    }

    /// Index of only the given items (used to find citations of newly added papers).
    pub fn load_ids(conn: &Connection, ids: &[i64]) -> Result<Self> {
        if ids.is_empty() {
            return Ok(Self::default());
        }
        let list = ids.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(",");
        Self::load_where(conn, &format!("id IN ({list})"), &[])
    }

    fn load_where(conn: &Connection, filter: &str, _p: &[i64]) -> Result<Self> {
        let mut stmt = conn.prepare(&format!(
            "SELECT id, doi, arxiv_id, title_norm, year FROM items WHERE {filter}"
        ))?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<i32>>(4)?,
            ))
        })?;
        let mut idx = LibIndex::default();
        for row in rows {
            let (id, doi, arxiv, title, year) = row?;
            idx.add(id, doi.as_deref(), arxiv.as_deref(), &title, year);
        }
        Ok(idx)
    }

    pub fn add(&mut self, id: i64, doi: Option<&str>, arxiv: Option<&str>, title_norm: &str, year: Option<i32>) {
        if let Some(d) = doi.and_then(normalize_doi) {
            self.by_doi.insert(d, id);
        }
        if let Some(a) = arxiv.and_then(normalize_arxiv) {
            self.by_arxiv.insert(a, id);
        }
        let n = self.entries.len();
        for t in tokens(title_norm) {
            self.by_token.entry(t.to_string()).or_default().push(n);
        }
        self.entries.push(Entry {
            id,
            title: title_norm.to_string(),
            year,
        });
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn match_ref(&self, r: &RefEntry) -> Option<i64> {
        if let Some(id) = r
            .doi
            .as_deref()
            .and_then(normalize_doi)
            .and_then(|d| self.by_doi.get(&d))
        {
            return Some(*id);
        }
        if let Some(id) = r
            .arxiv_id
            .as_deref()
            .and_then(normalize_arxiv)
            .and_then(|a| self.by_arxiv.get(&a))
        {
            return Some(*id);
        }
        let norm = normalize_title(r.title.as_deref()?);
        let words = norm.split_whitespace().count();
        // the rarest distinctive word narrows the candidates
        let candidates = tokens(&norm)
            .filter_map(|t| self.by_token.get(t))
            .min_by_key(|v| v.len())?;
        let mut best: Option<(f64, i64)> = None;
        for &i in candidates {
            let e = &self.entries[i];
            if let (Some(a), Some(b)) = (r.year, e.year) {
                if (a - b).abs() > 1 {
                    continue;
                }
            }
            // short titles ("Deep learning") must match exactly
            let s = if words < 4 {
                if e.title == norm {
                    1.0
                } else {
                    0.0
                }
            } else {
                title_similarity(&norm, &e.title)
            };
            if s >= FUZZY_THRESHOLD && best.is_none_or(|(b, _)| s > b) {
                best = Some((s, e.id));
            }
        }
        best.map(|(_, id)| id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(doi: Option<&str>, arxiv: Option<&str>, title: Option<&str>, year: Option<i32>) -> RefEntry {
        RefEntry {
            doi: doi.map(Into::into),
            arxiv_id: arxiv.map(Into::into),
            title: title.map(Into::into),
            year,
        }
    }

    fn idx() -> LibIndex {
        let mut i = LibIndex::default();
        i.add(
            1,
            Some("10.5555/3295222"),
            Some("1706.03762"),
            &normalize_title("Attention Is All You Need"),
            Some(2017),
        );
        i.add(
            2,
            None,
            None,
            &normalize_title("Deep Residual Learning for Image Recognition"),
            Some(2016),
        );
        i.add(
            3,
            Some("10.1038/nature14539"),
            None,
            &normalize_title("Deep learning"),
            Some(2015),
        );
        i
    }

    #[test]
    fn matches_by_doi_then_arxiv_then_title() {
        let i = idx();
        assert_eq!(
            i.match_ref(&r(Some("https://doi.org/10.5555/3295222"), None, None, None)),
            Some(1)
        );
        assert_eq!(
            i.match_ref(&r(None, Some("arXiv:1706.03762v7"), Some("whatever"), None)),
            Some(1)
        );
        assert_eq!(
            i.match_ref(&r(
                None,
                None,
                Some("Deep residual learning for image recognition."),
                Some(2016)
            )),
            Some(2)
        );
        assert_eq!(
            i.match_ref(&r(
                None,
                None,
                Some("Deep Residual Learning for Image Recognition"),
                None
            )),
            Some(2)
        );
        assert_eq!(
            i.match_ref(&r(
                Some("10.9999/other"),
                None,
                Some("Attention is all you need"),
                Some(2017)
            )),
            Some(1)
        );
    }

    #[test]
    fn rejects_near_misses() {
        let i = idx();
        assert_eq!(
            i.match_ref(&r(
                None,
                None,
                Some("Deep Residual Learning for Image Recognition"),
                Some(2019)
            )),
            None,
            "year too far"
        );
        assert_eq!(
            i.match_ref(&r(None, None, Some("Deep learning in medicine"), Some(2015))),
            None,
            "short titles must be exact"
        );
        assert_eq!(i.match_ref(&r(None, None, Some("Deep learning"), Some(2015))), Some(3));
        assert_eq!(
            i.match_ref(&r(
                None,
                None,
                Some("Residual networks behave like ensembles"),
                Some(2016)
            )),
            None
        );
        assert_eq!(i.match_ref(&r(None, None, None, None)), None);
    }
}
