//! Edges A -> B ("A cites B") between library items. Automatic edges are recomputed from the
//! reference cache; manual decisions (added or removed by hand) are never overwritten.
use crate::matcher::LibIndex;
use crate::refs;
use paperlines_core::rusqlite::{params, Connection, OptionalExtension};
use paperlines_core::{Error, Result};
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationLink {
    pub item_id: i64,
    pub source: String,
    pub is_manual: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HiddenEdge {
    pub citing_item_id: i64,
    pub cited_item_id: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefStatus {
    pub source: String,
    pub fetched_at: String,
    pub total: usize,
    /// References that match no library item ("N references outside your library").
    pub outside: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Citations {
    pub cites: Vec<CitationLink>,
    pub cited_by: Vec<CitationLink>,
    /// Edges removed by hand that involve this item (can be restored).
    pub hidden: Vec<HiddenEdge>,
    pub status: Option<RefStatus>,
}

fn insert_auto(conn: &Connection, citing: i64, cited: i64, source: &str) -> Result<bool> {
    if citing == cited {
        return Ok(false);
    }
    // ON CONFLICT DO NOTHING keeps manual rows (added or suppressed) untouched
    Ok(conn.execute(
        "INSERT INTO citation_edges(citing_item_id, cited_item_id, source) VALUES (?1, ?2, ?3)
         ON CONFLICT(citing_item_id, cited_item_id) DO NOTHING",
        params![citing, cited, source],
    )? > 0)
}

/// Rebuilds the automatic outgoing edges of one item from its cached references.
pub fn recompute_item(conn: &Connection, idx: &LibIndex, item_id: i64) -> Result<usize> {
    conn.execute(
        "DELETE FROM citation_edges WHERE citing_item_id = ?1 AND is_manual = 0",
        [item_id],
    )?;
    let Some(cached) = refs::load(conn, item_id)? else {
        return Ok(0);
    };
    let targets: BTreeSet<i64> = cached.refs.iter().filter_map(|r| idx.match_ref(r)).collect();
    let mut n = 0;
    for t in targets {
        n += insert_auto(conn, item_id, t, &cached.source)? as usize;
    }
    Ok(n)
}

/// After papers are added: link every cached reference list to them. Works offline.
pub fn link_new_items(conn: &Connection, new_ids: &[i64]) -> Result<usize> {
    let small = LibIndex::load_ids(conn, new_ids)?;
    if small.is_empty() {
        return Ok(0);
    }
    let mut n = 0;
    for (citing, source, list) in refs::all(conn)? {
        let targets: BTreeSet<i64> = list.iter().filter_map(|r| small.match_ref(r)).collect();
        for t in targets {
            n += insert_auto(conn, citing, t, &source)? as usize;
        }
    }
    Ok(n)
}

/// Full refresh for items whose metadata changed (e.g. a DOI was added): their own references,
/// and other papers' references to them.
pub fn relink_items(conn: &Connection, ids: &[i64]) -> Result<usize> {
    let idx = LibIndex::load(conn)?;
    let mut n = 0;
    for id in ids {
        conn.execute(
            "DELETE FROM citation_edges WHERE cited_item_id = ?1 AND is_manual = 0",
            [id],
        )?;
        n += recompute_item(conn, &idx, *id)?;
    }
    n += link_new_items(conn, ids)?;
    Ok(n)
}

pub fn add_manual(conn: &Connection, citing: i64, cited: i64) -> Result<()> {
    if citing == cited {
        return Err(Error::msg("A paper cannot cite itself"));
    }
    conn.execute(
        "INSERT INTO citation_edges(citing_item_id, cited_item_id, source, is_manual, is_suppressed) VALUES (?1, ?2, 'manual', 1, 0)
         ON CONFLICT(citing_item_id, cited_item_id) DO UPDATE SET is_manual = 1, is_suppressed = 0",
        params![citing, cited],
    )?;
    Ok(())
}

/// Hides an edge for good: recomputation will not bring it back.
pub fn remove_manual(conn: &Connection, citing: i64, cited: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO citation_edges(citing_item_id, cited_item_id, source, is_manual, is_suppressed) VALUES (?1, ?2, 'manual', 1, 1)
         ON CONFLICT(citing_item_id, cited_item_id) DO UPDATE SET is_manual = 1, is_suppressed = 1",
        params![citing, cited],
    )?;
    Ok(())
}

/// Forgets a manual decision and lets the automatic matching decide again.
pub fn reset(conn: &Connection, citing: i64, cited: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM citation_edges WHERE citing_item_id = ?1 AND cited_item_id = ?2",
        params![citing, cited],
    )?;
    let idx = LibIndex::load(conn)?;
    recompute_item(conn, &idx, citing)?;
    Ok(())
}

fn links(conn: &Connection, sql: &str, id: i64) -> Result<Vec<CitationLink>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([id], |r| {
        Ok(CitationLink {
            item_id: r.get(0)?,
            source: r.get(1)?,
            is_manual: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

pub fn status(conn: &Connection, idx: &LibIndex, item_id: i64) -> Result<Option<RefStatus>> {
    let Some(c) = refs::load(conn, item_id)? else {
        return Ok(None);
    };
    let outside = c
        .refs
        .iter()
        .filter(|r| idx.match_ref(r).is_none_or(|m| m == item_id))
        .count();
    Ok(Some(RefStatus {
        source: c.source,
        fetched_at: c.fetched_at,
        total: c.refs.len(),
        outside,
    }))
}

pub fn citations(conn: &Connection, item_id: i64) -> Result<Citations> {
    let order = "ORDER BY i.year DESC, i.title";
    let cites = links(
        conn,
        &format!(
            "SELECT e.cited_item_id, e.source, e.is_manual FROM citation_edges e JOIN items i ON i.id = e.cited_item_id
          WHERE e.citing_item_id = ?1 AND e.is_suppressed = 0 AND i.deleted_at IS NULL {order}"
        ),
        item_id,
    )?;
    let cited_by = links(
        conn,
        &format!("SELECT e.citing_item_id, e.source, e.is_manual FROM citation_edges e JOIN items i ON i.id = e.citing_item_id
          WHERE e.cited_item_id = ?1 AND e.is_suppressed = 0 AND i.deleted_at IS NULL {order}"),
        item_id,
    )?;
    let mut stmt = conn.prepare(
        "SELECT citing_item_id, cited_item_id FROM citation_edges WHERE is_suppressed = 1 AND (citing_item_id = ?1 OR cited_item_id = ?1)",
    )?;
    let hidden = stmt
        .query_map([item_id], |r| {
            Ok(HiddenEdge {
                citing_item_id: r.get(0)?,
                cited_item_id: r.get(1)?,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;
    let status = if refs::has_cache(conn, item_id)? {
        status(conn, &LibIndex::load(conn)?, item_id)?
    } else {
        None
    };
    Ok(Citations {
        cites,
        cited_by,
        hidden,
        status,
    })
}

/// All visible edges, for the graph view.
pub fn all_edges(conn: &Connection) -> Result<Vec<(i64, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT e.citing_item_id, e.cited_item_id FROM citation_edges e
         JOIN items a ON a.id = e.citing_item_id JOIN items b ON b.id = e.cited_item_id
         WHERE e.is_suppressed = 0 AND a.deleted_at IS NULL AND b.deleted_at IS NULL",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

pub fn edge_exists(conn: &Connection, citing: i64, cited: i64) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM citation_edges WHERE citing_item_id = ?1 AND cited_item_id = ?2 AND is_suppressed = 0",
            params![citing, cited],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::refs::{store, RefEntry};
    use paperlines_core::db::Db;
    use paperlines_core::items::{delete_item, get_item, insert_item, to_input, update_item};
    use paperlines_core::model::{Author, ItemInput};

    fn paper(db: &mut Db, title: &str, year: i32, doi: Option<&str>) -> i64 {
        db.tx(|c| {
            insert_item(
                c,
                &ItemInput {
                    title: title.into(),
                    year: Some(year),
                    doi: doi.map(Into::into),
                    authors: vec![Author::new("X", "Y")],
                    ..Default::default()
                },
            )
        })
        .unwrap()
    }

    fn rf(doi: Option<&str>, title: &str, year: i32) -> RefEntry {
        RefEntry {
            doi: doi.map(Into::into),
            title: Some(title.into()),
            year: Some(year),
            arxiv_id: None,
        }
    }

    fn ids(v: &[CitationLink]) -> Vec<i64> {
        v.iter().map(|l| l.item_id).collect()
    }

    /// BERT cites Attention (by DOI) and ResNet (by title) and one paper outside the library.
    fn setup() -> (Db, i64, i64, i64) {
        let mut db = Db::open_in_memory().unwrap();
        let attention = paper(&mut db, "Attention Is All You Need", 2017, Some("10.1/attn"));
        let resnet = paper(&mut db, "Deep Residual Learning for Image Recognition", 2016, None);
        let bert = paper(
            &mut db,
            "BERT: Pre-training of Deep Bidirectional Transformers",
            2019,
            None,
        );
        db.tx(|c| {
            store(
                c,
                bert,
                &[
                    rf(Some("10.1/ATTN"), "Attention is all you need", 2017),
                    rf(None, "Deep residual learning for image recognition", 2016),
                    rf(None, "Some paper nobody has", 2010),
                    rf(None, "BERT: Pre-training of Deep Bidirectional Transformers", 2019), // self-reference
                ],
                "openalex",
            )?;
            recompute_item(c, &LibIndex::load(c)?, bert)
        })
        .unwrap();
        (db, attention, resnet, bert)
    }

    #[test]
    fn builds_cites_and_cited_by_with_outside_count() {
        let (db, attention, resnet, bert) = setup();
        let c = citations(&db.conn, bert).unwrap();
        let mut cites = ids(&c.cites);
        cites.sort();
        assert_eq!(cites, vec![attention, resnet]);
        assert!(c.cited_by.is_empty());
        let s = c.status.unwrap();
        assert_eq!((s.total, s.outside, s.source.as_str()), (4, 2, "openalex"));
        assert_eq!(ids(&citations(&db.conn, attention).unwrap().cited_by), vec![bert]);
    }

    #[test]
    fn new_paper_is_linked_from_cached_lists_offline() {
        let (mut db, _, _, bert) = setup();
        let late = paper(&mut db, "Some Paper Nobody Has", 2010, None);
        let n = db.tx(|c| link_new_items(c, &[late])).unwrap();
        assert_eq!(n, 1);
        assert_eq!(ids(&citations(&db.conn, late).unwrap().cited_by), vec![bert]);
        assert_eq!(citations(&db.conn, bert).unwrap().status.unwrap().outside, 1);
        assert_eq!(db.tx(|c| link_new_items(c, &[late])).unwrap(), 0, "idempotent");
    }

    #[test]
    fn manual_decisions_survive_recomputation() {
        let (mut db, attention, resnet, bert) = setup();
        db.tx(|c| remove_manual(c, bert, resnet)).unwrap();
        db.tx(|c| add_manual(c, attention, resnet)).unwrap();
        db.tx(|c| recompute_item(c, &LibIndex::load(c)?, bert)).unwrap();
        db.tx(|c| recompute_item(c, &LibIndex::load(c)?, attention)).unwrap();
        db.tx(|c| link_new_items(c, &[resnet])).unwrap();
        let c = citations(&db.conn, bert).unwrap();
        assert_eq!(ids(&c.cites), vec![attention]);
        assert_eq!(
            c.hidden,
            vec![HiddenEdge {
                citing_item_id: bert,
                cited_item_id: resnet
            }]
        );
        let a = citations(&db.conn, attention).unwrap();
        assert_eq!(
            a.cites,
            vec![CitationLink {
                item_id: resnet,
                source: "manual".into(),
                is_manual: true
            }]
        );
        assert!(db.tx(|c| add_manual(c, bert, bert)).is_err());

        db.tx(|c| reset(c, bert, resnet)).unwrap();
        let mut cites = ids(&citations(&db.conn, bert).unwrap().cites);
        cites.sort();
        assert_eq!(cites, vec![attention, resnet], "reset lets matching decide again");
    }

    #[test]
    fn relink_after_metadata_change_and_cascade_on_delete() {
        let (mut db, attention, _, bert) = setup();
        let mut input = to_input(&get_item(&db.conn, attention).unwrap().unwrap());
        input.doi = None;
        input.title = "A Different Paper Entirely".into();
        db.tx(|c| update_item(c, attention, &input)).unwrap();
        db.tx(|c| relink_items(c, &[attention])).unwrap();
        assert!(!edge_exists(&db.conn, bert, attention).unwrap());
        db.tx(|c| delete_item(c, bert)).unwrap();
        assert!(all_edges(&db.conn).unwrap().is_empty());
        assert!(refs::load(&db.conn, bert).unwrap().is_none());
    }
}

#[cfg(test)]
mod live {
    use super::*;
    use crate::fetch::{fetch, Ids, Options};
    use paperlines_core::db::Db;
    use paperlines_core::items::insert_item;
    use paperlines_core::model::ItemInput;

    /// Real OpenAlex data end to end: BERT's fetched references link to the Transformer paper,
    /// which is in the library only by arXiv ID. `cargo test -p paperlines-citations live -- --ignored`
    #[test]
    #[ignore = "network"]
    fn bert_links_to_attention() {
        let mut db = Db::open_in_memory().unwrap();
        let attention = db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "Attention Is All You Need".into(),
                        arxiv_id: Some("1706.03762".into()),
                        year: Some(2017),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        let bert = db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "BERT".into(),
                        doi: Some("10.18653/v1/n19-1423".into()),
                        year: Some(2019),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        let f = fetch(
            &Ids {
                doi: Some("10.18653/v1/n19-1423".into()),
                ..Default::default()
            },
            &Options::default(),
        )
        .unwrap();
        db.tx(|c| {
            refs::store(c, bert, &f.refs, f.source)?;
            recompute_item(c, &LibIndex::load(c)?, bert)
        })
        .unwrap();
        let c = citations(&db.conn, bert).unwrap();
        println!(
            "{} refs, outside {}, cites {:?}",
            f.refs.len(),
            c.status.as_ref().unwrap().outside,
            c.cites
        );
        assert!(c.cites.iter().any(|l| l.item_id == attention));
    }
}
