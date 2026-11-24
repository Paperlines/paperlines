//! Online search (see `paperlines_import::discover`), with hits matched against the library.
use crate::Library;
use paperlines_citations::matcher::LibIndex;
use paperlines_citations::refs::RefEntry;
use paperlines_core::rusqlite::Connection;
use paperlines_core::secrets::Secrets;
use paperlines_core::{settings, Error, Result};
use paperlines_import::discover::{self, SearchHit};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverHit {
    #[serde(flatten)]
    pub hit: SearchHit,
    /// The same paper in the library, if any.
    pub in_library: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceError {
    pub source: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverReport {
    pub hits: Vec<DiscoverHit>,
    pub errors: Vec<SourceError>,
    /// Whether an OpenAlex key is set (without one, lookups share a small daily allowance).
    pub has_openalex_key: bool,
}

/// Marks which hits are already in the library (DOI, arXiv ID, or fuzzy title and year).
pub fn match_library(conn: &Connection, hits: Vec<SearchHit>) -> Result<Vec<DiscoverHit>> {
    let idx = LibIndex::load(conn)?;
    Ok(hits
        .into_iter()
        .map(|hit| {
            let in_library = idx.match_ref(&RefEntry {
                doi: hit.doi.clone(),
                arxiv_id: hit.arxiv_id.clone(),
                title: Some(hit.title.clone()),
                year: hit.year,
            });
            DiscoverHit { hit, in_library }
        })
        .collect())
}

pub struct Keys {
    pub openalex: Option<String>,
    pub s2: Option<String>,
}

pub fn keys(config_dir: &Path) -> Keys {
    let secrets = Secrets::new(config_dir, true);
    Keys {
        openalex: secrets.get("openalex").ok().flatten(),
        s2: secrets.get("semantic_scholar").ok().flatten(),
    }
}

/// Searches the chosen sources (all when empty). Fails only in offline mode.
pub fn search(lib: &Library, query: &str, sources: &[String], config_dir: &Path) -> Result<DiscoverReport> {
    if settings::load(lib.conn())?.offline_mode {
        return Err(Error::msg("Offline mode is on, so online search is off."));
    }
    let k = keys(config_dir);
    let chosen: Vec<&str> = if sources.is_empty() {
        discover::SOURCES.to_vec()
    } else {
        sources.iter().map(String::as_str).collect()
    };
    let out = discover::search(query, &chosen, k.openalex.as_deref(), k.s2.as_deref());
    Ok(DiscoverReport {
        hits: match_library(lib.conn(), out.hits)?,
        errors: out
            .errors
            .into_iter()
            .map(|(source, message)| SourceError { source, message })
            .collect(),
        has_openalex_key: k.openalex.is_some(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_core::db::Db;
    use paperlines_core::items::insert_item;
    use paperlines_core::model::ItemInput;

    #[test]
    fn marks_papers_already_in_the_library() {
        let mut db = Db::open_in_memory().unwrap();
        let id = db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "Graph Neural Networks: A Review of Methods and Applications".into(),
                        year: Some(2020),
                        doi: Some("10.1016/j.aiopen.2021.01.001".into()),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        let hit = |title: &str, doi: Option<&str>| SearchHit {
            title: title.into(),
            doi: doi.map(String::from),
            year: Some(2020),
            ..Default::default()
        };
        let m = match_library(
            &db.conn,
            vec![
                hit("whatever the title", Some("10.1016/j.aiopen.2021.01.001")),
                hit("Graph neural networks: a review of methods and applications", None),
                hit("Something else entirely different", None),
            ],
        )
        .unwrap();
        assert_eq!(m[0].in_library, Some(id), "by DOI");
        assert_eq!(m[1].in_library, Some(id), "by title");
        assert_eq!(m[2].in_library, None);
    }
}
