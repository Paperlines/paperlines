//! CSL-JSON (array or single object) to ItemInput.
use paperlines_core::model::{Author, ItemInput};
use paperlines_core::text::{normalize_arxiv, normalize_doi};
use serde_json::Value;

fn s(v: &Value, k: &str) -> Option<String> {
    v.get(k)
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn item_type(t: &str) -> &'static str {
    match t {
        "paper-conference" => "conference-paper",
        "book" => "book",
        "chapter" => "chapter",
        "thesis" => "thesis",
        "report" => "report",
        "manuscript" | "post" | "post-weblog" => "preprint",
        _ => "article",
    }
}

pub fn from_value(v: &Value) -> ItemInput {
    let authors = v
        .get("author")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|p| match (s(p, "family"), s(p, "given"), s(p, "literal")) {
                    (Some(f), g, _) => Some(Author::new(&f, &g.unwrap_or_default())),
                    (None, _, Some(l)) => Some(Author::new(&l, "")),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();
    let parts = v.pointer("/issued/date-parts/0").and_then(Value::as_array);
    let year = parts
        .and_then(|p| p.first())
        .and_then(|y| y.as_i64().or_else(|| y.as_str()?.parse().ok()))
        .map(|y| y as i32);
    let pub_date = parts.map(|p| {
        p.iter()
            .filter_map(|x| x.as_i64().or_else(|| x.as_str()?.parse().ok()))
            .map(|n| format!("{n:02}"))
            .collect::<Vec<_>>()
            .join("-")
    });
    let id = s(v, "id").filter(|i| i.chars().all(|c| c.is_ascii_alphanumeric() || ":_-.".contains(c)));
    let arxiv = s(v, "URL")
        .filter(|u| u.contains("arxiv.org"))
        .and_then(|u| normalize_arxiv(&u))
        .or_else(|| {
            s(v, "number")
                .filter(|n| n.to_lowercase().starts_with("arxiv"))
                .and_then(|n| normalize_arxiv(&n))
        });
    ItemInput {
        item_type: item_type(v.get("type").and_then(Value::as_str).unwrap_or("")).into(),
        citekey: s(v, "citation-key").or(id),
        title: s(v, "title").unwrap_or_default(),
        authors,
        year,
        pub_date,
        venue: s(v, "container-title"),
        doi: s(v, "DOI").and_then(|d| normalize_doi(&d)),
        arxiv_id: arxiv,
        url: s(v, "URL"),
        abstract_text: s(v, "abstract"),
        biblio: paperlines_core::model::Biblio {
            volume: s(v, "volume").or_else(|| v.get("volume").and_then(Value::as_i64).map(|n| n.to_string())),
            issue: s(v, "issue").or_else(|| v.get("issue").and_then(Value::as_i64).map(|n| n.to_string())),
            pages: s(v, "page"),
            publisher: s(v, "publisher"),
            place: s(v, "publisher-place"),
            isbn: s(v, "ISBN"),
            issn: s(v, "ISSN"),
            edition: s(v, "edition").or_else(|| v.get("edition").and_then(Value::as_i64).map(|n| n.to_string())),
            language: s(v, "language"),
            series: s(v, "collection-title"),
            number: s(v, "number"),
            editors: people(v, "editor"),
        },
        ..Default::default()
    }
}

fn people(v: &Value, key: &str) -> Vec<Author> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|p| match (s(p, "family"), s(p, "given"), s(p, "literal")) {
                    (Some(f), g, _) => Some(Author::new(&f, &g.unwrap_or_default())),
                    (None, _, Some(l)) => Some(Author::new(&l, "")),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse(text: &str) -> serde_json::Result<Vec<ItemInput>> {
    let v: Value = serde_json::from_str(text)?;
    Ok(match &v {
        Value::Array(a) => a.iter().map(from_value).collect(),
        _ => vec![from_value(&v)],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_csl() {
        let j = r#"[{"id":"he2016deep","type":"paper-conference","title":"Deep Residual Learning",
          "author":[{"family":"He","given":"Kaiming"},{"literal":"ACME Lab"}],
          "issued":{"date-parts":[[2016,6]]},"container-title":"CVPR","DOI":"10.1109/CVPR.2016.90"}]"#;
        let i = &parse(j).unwrap()[0];
        assert_eq!(i.citekey.as_deref(), Some("he2016deep"));
        assert_eq!(i.item_type, "conference-paper");
        assert_eq!(i.year, Some(2016));
        assert_eq!(i.pub_date.as_deref(), Some("2016-06"));
        assert_eq!(
            i.authors,
            vec![Author::new("He", "Kaiming"), Author::new("ACME Lab", "")]
        );
        assert_eq!(i.doi.as_deref(), Some("10.1109/cvpr.2016.90"));
    }
}
