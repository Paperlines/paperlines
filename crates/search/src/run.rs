//! Compiles parsed queries to SQL over `items` and the `items_fts` index.
use crate::query::{parse, parse_range, Range, Term};
use paperlines_core::rusqlite::{params_from_iter, types::Value, Connection};
use paperlines_core::text::fold;
use paperlines_core::Result;
use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct SearchResult {
    /// Matching item ids: by relevance when the query has text, else newest first.
    pub ids: Vec<i64>,
    /// Parts of the query that were ignored, with the reason.
    pub warnings: Vec<String>,
}

fn like_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

/// FTS5 MATCH expression: every word must match, as a prefix unless it is a phrase.
fn fts_expr(texts: &[(&str, bool)]) -> Option<String> {
    let parts: Vec<String> = texts
        .iter()
        .flat_map(|(t, phrase)| {
            if *phrase {
                vec![format!("\"{}\"", t.replace('"', "\"\""))]
            } else {
                t.split(|c: char| !c.is_alphanumeric())
                    .filter(|w| !w.is_empty())
                    .map(|w| format!("\"{}\"*", w.replace('"', "\"\"")))
                    .collect()
            }
        })
        .filter(|p| p.chars().any(char::is_alphanumeric))
        .collect();
    (!parts.is_empty()).then(|| parts.join(" "))
}

fn range_sql(col: &str, r: Range, params: &mut Vec<Value>) -> String {
    let (sql, vals): (String, Vec<i64>) = match r {
        Range::Eq(n) => (format!("{col} = ?"), vec![n]),
        Range::Gt(n) => (format!("{col} > ?"), vec![n]),
        Range::Ge(n) => (format!("{col} >= ?"), vec![n]),
        Range::Lt(n) => (format!("{col} < ?"), vec![n]),
        Range::Le(n) => (format!("{col} <= ?"), vec![n]),
        Range::Between(a, b) => (format!("{col} BETWEEN ? AND ?"), vec![a, b]),
    };
    params.extend(vals.into_iter().map(Value::Integer));
    sql
}

fn field_sql(key: &str, value: &str, params: &mut Vec<Value>) -> std::result::Result<String, String> {
    let mut text = |v: String| {
        params.push(Value::Text(v));
    };
    Ok(match key {
        "tag" => {
            text(value.trim_matches('/').to_lowercase());
            text(format!("{}/%", like_escape(&value.trim_matches('/').to_lowercase())));
            "EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id
                AND (lower(t.path) = ? OR lower(t.path) LIKE ? ESCAPE '\\'))"
                .into()
        }
        "project" => {
            text(value.to_lowercase());
            "EXISTS (SELECT 1 FROM project_items pi JOIN projects p ON p.id = pi.project_id
                WHERE pi.item_id = i.id AND lower(p.name) = ?)"
                .into()
        }
        "author" => {
            text(format!("%{}%", like_escape(&fold(value))));
            "EXISTS (SELECT 1 FROM item_authors ia JOIN authors a ON a.id = ia.author_id
                WHERE ia.item_id = i.id AND a.name_norm LIKE ? ESCAPE '\\')"
                .into()
        }
        "venue" => {
            text(format!("%{}%", like_escape(value)));
            "i.venue LIKE ? ESCAPE '\\'".into()
        }
        "type" => {
            text(value.to_lowercase());
            "lower(i.item_type) = ?".into()
        }
        "year" => {
            let r = parse_range(value).ok_or_else(|| format!("year:{value} is not a year or range"))?;
            range_sql("i.year", r, params)
        }
        "rating" => {
            let r = parse_range(value).ok_or_else(|| format!("rating:{value} is not a number or range"))?;
            range_sql("coalesce(i.rating, 0)", r, params)
        }
        "is" | "has" => match value.to_lowercase().as_str() {
            s @ ("unread" | "reading" | "read") => {
                text(s.into());
                "i.read_status = ?".into()
            }
            "pdf" => "EXISTS (SELECT 1 FROM attachments a WHERE a.item_id = i.id AND a.kind = 'pdf')".into(),
            "doi" => "i.doi IS NOT NULL".into(),
            "abstract" => "i.abstract IS NOT NULL".into(),
            "tagged" => "EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id)".into(),
            "untagged" => "NOT EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id)".into(),
            "notes" => "EXISTS (SELECT 1 FROM notes n WHERE n.item_id = i.id AND trim(n.body) <> '')".into(),
            other => {
                return Err(format!(
                    "{key}:{other} is not supported (try unread, reading, read, pdf, doi, untagged, notes)"
                ))
            }
        },
        "cites" => {
            text(value.into());
            "EXISTS (SELECT 1 FROM citation_edges e JOIN items c ON c.id = e.cited_item_id
                WHERE e.citing_item_id = i.id AND e.is_suppressed = 0 AND c.citekey = ?)"
                .into()
        }
        "cited-by" => {
            text(value.into());
            "EXISTS (SELECT 1 FROM citation_edges e JOIN items c ON c.id = e.citing_item_id
                WHERE e.cited_item_id = i.id AND e.is_suppressed = 0 AND c.citekey = ?)"
                .into()
        }
        other => return Err(format!("unknown qualifier {other}")),
    })
}

pub fn search(conn: &Connection, q: &str) -> Result<SearchResult> {
    let terms = parse(q);
    let mut warnings = Vec::new();
    let mut wheres: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();
    let mut pos: Vec<(&str, bool)> = Vec::new();
    let mut neg: Vec<(&str, bool)> = Vec::new();

    for term in &terms {
        match term {
            Term::Text { neg: n, text, phrase } => (if *n { &mut neg } else { &mut pos }).push((text, *phrase)),
            Term::Field { neg: n, key, value } => {
                let mut p = Vec::new();
                match field_sql(key, value, &mut p) {
                    Ok(sql) => {
                        wheres.push(if *n { format!("NOT ({sql})") } else { sql });
                        params.extend(p);
                    }
                    Err(w) => warnings.push(w),
                }
            }
        }
    }

    let match_expr = fts_expr(&pos);
    let mut sql = match &match_expr {
        Some(_) => "SELECT i.id FROM items_fts f JOIN items i ON i.id = f.rowid WHERE items_fts MATCH ? AND i.deleted_at IS NULL".to_string(),
        None => "SELECT i.id FROM items i WHERE i.deleted_at IS NULL".to_string(),
    };
    let mut all: Vec<Value> = match_expr.into_iter().map(Value::Text).collect();
    if let Some(n) = fts_expr(&neg) {
        sql.push_str(" AND i.id NOT IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)");
        all.push(Value::Text(n));
    }
    for w in &wheres {
        sql.push_str(" AND ");
        sql.push_str(w);
    }
    all.extend(params);
    let ranked = sql.starts_with("SELECT i.id FROM items_fts");
    sql.push_str(if ranked {
        // column weights: title, authors, abstract, notes, meta
        " ORDER BY bm25(items_fts, 10.0, 6.0, 1.0, 2.0, 4.0), i.date_added DESC"
    } else {
        " ORDER BY i.date_added DESC, i.id DESC"
    });
    let mut stmt = conn.prepare(&sql)?;
    let ids = stmt
        .query_map(params_from_iter(all), |r| r.get(0))?
        .collect::<std::result::Result<_, _>>()?;
    Ok(SearchResult { ids, warnings })
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_core::db::Db;
    use paperlines_core::items::{insert_item, update_item};
    use paperlines_core::model::{Author, ItemInput};
    use paperlines_core::{projects, tags};

    struct Lib {
        db: Db,
        attention: i64,
        bert: i64,
        resnet: i64,
    }

    fn lib() -> Lib {
        let mut db = Db::open_in_memory().unwrap();
        let mk = |t: &str, fam: &str, y: i32, abs: &str| ItemInput {
            title: t.into(),
            authors: vec![Author::new(fam, "X")],
            year: Some(y),
            abstract_text: Some(abs.into()),
            ..Default::default()
        };
        let attention = db
            .tx(|c| {
                insert_item(
                    c,
                    &mk(
                        "Attention Is All You Need",
                        "Vaswani",
                        2017,
                        "transformers replace recurrence",
                    ),
                )
            })
            .unwrap();
        let bert = db
            .tx(|c| {
                insert_item(
                    c,
                    &mk(
                        "BERT: Pre-training of Deep Bidirectional Transformers",
                        "Devlin",
                        2019,
                        "masked language model",
                    ),
                )
            })
            .unwrap();
        let resnet = db
            .tx(|c| {
                insert_item(
                    c,
                    &mk("Deep Residual Learning", "He", 2016, "über residual connections"),
                )
            })
            .unwrap();
        db.tx(|c| tags::tag_items(c, &[attention, bert], &["ml/nlp".into()]))
            .unwrap();
        db.tx(|c| tags::tag_items(c, &[resnet], &["ml/vision".into(), "survey reading".into()]))
            .unwrap();
        let p = db.tx(|c| projects::create(c, "My Thesis", None)).unwrap();
        db.tx(|c| projects::add_items(c, p, &[bert])).unwrap();
        db.conn
            .execute(
                "INSERT INTO citation_edges(citing_item_id, cited_item_id, source) VALUES (?1, ?2, 'openalex')",
                [bert, attention],
            )
            .unwrap();
        Lib {
            db,
            attention,
            bert,
            resnet,
        }
    }

    fn ids(l: &Lib, q: &str) -> Vec<i64> {
        let mut v = search(&l.db.conn, q).unwrap().ids;
        v.sort();
        v
    }

    #[test]
    fn free_text_prefix_and_diacritics() {
        let l = lib();
        assert_eq!(ids(&l, "transf"), vec![l.attention, l.bert]);
        assert_eq!(ids(&l, "uber"), vec![l.resnet]);
        assert_eq!(ids(&l, "devlin"), vec![l.bert]);
        assert_eq!(ids(&l, "\"language model\""), vec![l.bert]);
        assert_eq!(ids(&l, "transformers -bert"), vec![l.attention]);
        assert_eq!(search(&l.db.conn, "attention").unwrap().ids[0], l.attention);
    }

    #[test]
    fn qualifiers() {
        let l = lib();
        assert_eq!(ids(&l, "tag:ml"), vec![l.attention, l.bert, l.resnet]);
        assert_eq!(ids(&l, "tag:ML/NLP"), vec![l.attention, l.bert]);
        assert_eq!(ids(&l, "tag:\"survey reading\""), vec![l.resnet]);
        assert_eq!(ids(&l, "-tag:ml/nlp"), vec![l.resnet]);
        assert_eq!(ids(&l, "project:\"my thesis\""), vec![l.bert]);
        assert_eq!(ids(&l, "year:>=2017"), vec![l.attention, l.bert]);
        assert_eq!(ids(&l, "year:2016..2017"), vec![l.attention, l.resnet]);
        assert_eq!(ids(&l, "author:vaswani is:unread"), vec![l.attention]);
        assert_eq!(ids(&l, "cites:vaswani2017attention"), vec![l.bert]);
        assert_eq!(ids(&l, "cited-by:devlin2019bert"), vec![l.attention]);
        assert_eq!(ids(&l, "is:untagged"), Vec::<i64>::new());
        assert_eq!(ids(&l, "deep year:2019"), vec![l.bert]);
    }

    #[test]
    fn bad_qualifiers_warn_instead_of_failing() {
        let l = lib();
        let r = search(&l.db.conn, "year:recent is:starred deep").unwrap();
        assert_eq!(r.warnings.len(), 2);
        assert_eq!(r.ids.len(), 2);
        assert_eq!(search(&l.db.conn, "\" * ( OR").unwrap().ids.len(), 0);
    }

    #[test]
    fn index_follows_edits_notes_and_deletes() {
        let mut l = lib();
        let mut input =
            paperlines_core::items::to_input(&paperlines_core::items::get_item(&l.db.conn, l.resnet).unwrap().unwrap());
        input.title = "Residual Nets Revisited".into();
        input.authors = vec![Author::new("Zhang", "Y")];
        let id = l.resnet;
        l.db.tx(|c| update_item(c, id, &input)).unwrap();
        assert_eq!(ids(&l, "revisited zhang"), vec![l.resnet]);
        assert_eq!(ids(&l, "learning"), Vec::<i64>::new());
        l.db.conn
            .execute(
                "UPDATE notes SET body = 'skip connections matter' WHERE item_id = ?1",
                [l.resnet],
            )
            .unwrap();
        assert_eq!(ids(&l, "skip"), vec![l.resnet]);
        l.db.tx(|c| paperlines_core::items::delete_item(c, id)).unwrap();
        assert_eq!(ids(&l, "skip"), Vec::<i64>::new());
        let n: i64 =
            l.db.conn
                .query_row("SELECT count(*) FROM items_fts", [], |r| r.get(0))
                .unwrap();
        assert_eq!(n, 2);
    }
}

#[cfg(test)]
mod perf {
    use super::*;
    use paperlines_core::db::Db;
    use paperlines_core::items::{insert_item, list_items};
    use paperlines_core::model::{Author, ItemInput};
    use std::time::Instant;

    /// `cargo test -p paperlines-search --release perf -- --ignored --nocapture`
    #[test]
    #[ignore = "timing check, run on demand"]
    fn ten_thousand_items() {
        let mut db = Db::open_in_memory().unwrap();
        let words = [
            "graph",
            "neural",
            "attention",
            "learning",
            "residual",
            "language",
            "vision",
            "causal",
            "bayesian",
            "sparse",
        ];
        let t0 = Instant::now();
        db.tx(|c| {
            for n in 0..10_000 {
                let title = format!(
                    "{} {} {} study {n}",
                    words[n % 10],
                    words[(n / 10) % 10],
                    words[(n / 100) % 10]
                );
                insert_item(
                    c,
                    &ItemInput {
                        title,
                        authors: vec![
                            Author::new(&format!("Author{}", n % 700), "A"),
                            Author::new("Coauthor", "B"),
                        ],
                        year: Some(1990 + (n % 35) as i32),
                        abstract_text: Some("We study things at length. ".repeat(20)),
                        ..Default::default()
                    },
                )?;
            }
            Ok(())
        })
        .unwrap();
        println!("insert 10k: {:?}", t0.elapsed());
        let t = Instant::now();
        assert_eq!(list_items(&db.conn).unwrap().len(), 10_000);
        println!("list_items: {:?}", t.elapsed());
        for q in [
            "attention",
            "graph neural year:>=2010",
            "author:author12",
            "atten -graph is:unread",
            "year:2000..2005",
        ] {
            let t = Instant::now();
            let n = search(&db.conn, q).unwrap().ids.len();
            println!("search {q:?}: {n} hits in {:?}", t.elapsed());
        }
    }
}
