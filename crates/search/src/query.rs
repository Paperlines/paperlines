//! GitHub-style query syntax:
//!   attention "graph neural" tag:ml/nlp project:"My thesis" year:>=2020 year:2018..2020
//!   author:hinton is:unread is:pdf has:doi rating:>=4 type:book venue:neurips
//!   cites:vaswani2017attention cited-by:devlin2019bert -tag:survey -word

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Term {
    /// Free text. `phrase` is true for "quoted" text.
    Text { neg: bool, text: String, phrase: bool },
    /// key:value qualifier, key lowercased.
    Field { neg: bool, key: String, value: String },
}

pub const KEYS: &[&str] = &[
    "tag", "project", "year", "author", "is", "has", "rating", "type", "venue", "cites", "cited-by",
];

fn read_quoted(cs: &[char], i: &mut usize) -> String {
    *i += 1; // opening quote
    let mut s = String::new();
    while *i < cs.len() && cs[*i] != '"' {
        s.push(cs[*i]);
        *i += 1;
    }
    *i += 1; // closing quote (or end)
    s
}

pub fn parse(q: &str) -> Vec<Term> {
    let cs: Vec<char> = q.chars().collect();
    let mut i = 0;
    let mut out = Vec::new();
    while i < cs.len() {
        if cs[i].is_whitespace() {
            i += 1;
            continue;
        }
        let neg = cs[i] == '-' && cs.get(i + 1).is_some_and(|c| !c.is_whitespace());
        if neg {
            i += 1;
        }
        if cs[i] == '"' {
            let text = read_quoted(&cs, &mut i);
            if !text.trim().is_empty() {
                out.push(Term::Text {
                    neg,
                    text: text.trim().into(),
                    phrase: true,
                });
            }
            continue;
        }
        let start = i;
        while i < cs.len() && !cs[i].is_whitespace() && cs[i] != ':' {
            i += 1;
        }
        let word: String = cs[start..i].iter().collect();
        let key = word.to_lowercase();
        if i < cs.len() && cs[i] == ':' && KEYS.contains(&key.as_str()) {
            i += 1;
            let value = if cs.get(i) == Some(&'"') {
                read_quoted(&cs, &mut i)
            } else {
                let s = i;
                while i < cs.len() && !cs[i].is_whitespace() {
                    i += 1;
                }
                cs[s..i].iter().collect()
            };
            if !value.trim().is_empty() {
                out.push(Term::Field {
                    neg,
                    key,
                    value: value.trim().into(),
                });
            }
            continue;
        }
        // not a known qualifier: the whole token (including any colon) is text
        while i < cs.len() && !cs[i].is_whitespace() {
            i += 1;
        }
        let text: String = cs[start..i].iter().collect();
        out.push(Term::Text {
            neg,
            text,
            phrase: false,
        });
    }
    out
}

/// Comparison parsed from values like "2020", ">2020", "<=4", "2018..2020".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Range {
    Eq(i64),
    Gt(i64),
    Ge(i64),
    Lt(i64),
    Le(i64),
    Between(i64, i64),
}

pub fn parse_range(v: &str) -> Option<Range> {
    let n = |s: &str| s.trim().parse::<i64>().ok();
    if let Some((a, b)) = v.split_once("..") {
        let (a, b) = (n(a)?, n(b)?);
        return Some(Range::Between(a.min(b), a.max(b)));
    }
    for (p, f) in [
        (">=", Range::Ge as fn(i64) -> Range),
        ("<=", Range::Le),
        (">", Range::Gt),
        ("<", Range::Lt),
    ] {
        if let Some(rest) = v.strip_prefix(p) {
            return n(rest).map(f);
        }
    }
    n(v).map(Range::Eq)
}

/// Quotes a qualifier value when needed, for building queries from the UI.
pub fn qualifier(key: &str, value: &str) -> String {
    if value.chars().any(|c| c.is_whitespace() || c == '"') {
        format!("{key}:\"{}\"", value.replace('"', ""))
    } else {
        format!("{key}:{value}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(neg: bool, k: &str, v: &str) -> Term {
        Term::Field {
            neg,
            key: k.into(),
            value: v.into(),
        }
    }
    fn t(neg: bool, s: &str, phrase: bool) -> Term {
        Term::Text {
            neg,
            text: s.into(),
            phrase,
        }
    }

    #[test]
    fn parses_mixed_queries() {
        assert_eq!(
            parse(r#"attention "graph neural" Tag:ml/nlp project:"My thesis" -tag:survey -old note:x"#),
            vec![
                t(false, "attention", false),
                t(false, "graph neural", true),
                f(false, "tag", "ml/nlp"),
                f(false, "project", "My thesis"),
                f(true, "tag", "survey"),
                t(true, "old", false),
                t(false, "note:x", false),
            ]
        );
        assert_eq!(
            parse("cited-by:devlin2019bert  is:unread"),
            vec![f(false, "cited-by", "devlin2019bert"), f(false, "is", "unread")]
        );
        assert_eq!(parse("tag: - \"\""), vec![t(false, "-", false)]);
        assert_eq!(parse("a-b"), vec![t(false, "a-b", false)]);
    }

    #[test]
    fn parses_ranges() {
        assert_eq!(parse_range("2020"), Some(Range::Eq(2020)));
        assert_eq!(parse_range(">=2020"), Some(Range::Ge(2020)));
        assert_eq!(parse_range("<5"), Some(Range::Lt(5)));
        assert_eq!(parse_range("2020..2018"), Some(Range::Between(2018, 2020)));
        assert_eq!(parse_range("recent"), None);
    }

    #[test]
    fn quotes_values() {
        assert_eq!(qualifier("tag", "ml/nlp"), "tag:ml/nlp");
        assert_eq!(qualifier("project", "My thesis"), "project:\"My thesis\"");
    }
}

#[cfg(test)]
mod fixture_tests {
    use super::*;

    /// Same fixtures as packages/search-query, so the Rust and TS parsers cannot drift.
    #[test]
    fn matches_shared_fixtures() {
        let fx: Vec<serde_json::Value> = serde_json::from_str(include_str!("../fixtures/queries.json")).unwrap();
        for f in fx {
            let q = f["q"].as_str().unwrap();
            let got: Vec<serde_json::Value> = parse(q)
                .into_iter()
                .map(|t| match t {
                    Term::Text { neg, text, phrase } => {
                        serde_json::json!({ "neg": neg, "key": null, "value": text, "phrase": phrase })
                    }
                    Term::Field { neg, key, value } => {
                        serde_json::json!({ "neg": neg, "key": key, "value": value, "phrase": false })
                    }
                })
                .collect();
            assert_eq!(serde_json::Value::Array(got), f["terms"], "query: {q}");
        }
    }
}
