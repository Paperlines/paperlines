use crate::model::ItemInput;
use crate::text::fold;
use crate::Result;
use rusqlite::{Connection, OptionalExtension};

const STOP: &[&str] = &[
    "a", "an", "the", "on", "of", "in", "for", "to", "and", "with", "towards", "toward", "is", "are", "from", "by",
    "at",
];

fn ascii_alnum(s: &str) -> String {
    fold(s).chars().filter(char::is_ascii_alphanumeric).collect()
}

/// smith2021attention style key, without uniqueness.
pub fn base_citekey(input: &ItemInput) -> String {
    let author = input
        .authors
        .first()
        .map(|a| ascii_alnum(a.family.split_whitespace().last().unwrap_or("")))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "anon".into());
    let year = input.year.map(|y| y.to_string()).unwrap_or_else(|| "nd".into());
    let word = input
        .title
        .split_whitespace()
        .map(ascii_alnum)
        .find(|w| !w.is_empty() && !STOP.contains(&w.as_str()))
        .unwrap_or_default();
    format!("{author}{year}{word}")
}

fn exists(conn: &Connection, key: &str, except: Option<i64>) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT id FROM items WHERE citekey = ?1 AND id IS NOT ?2",
            rusqlite::params![key, except],
            |r| r.get::<_, i64>(0),
        )
        .optional()?
        .is_some())
}

/// Returns `base` or the first free `base` + a, b, ..., z, then numbered.
pub fn unique_citekey(conn: &Connection, base: &str, except: Option<i64>) -> Result<String> {
    if !exists(conn, base, except)? {
        return Ok(base.to_string());
    }
    for c in 'a'..='z' {
        let k = format!("{base}{c}");
        if !exists(conn, &k, except)? {
            return Ok(k);
        }
    }
    for n in 2.. {
        let k = format!("{base}_{n}");
        if !exists(conn, &k, except)? {
            return Ok(k);
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Author;

    #[test]
    fn builds_readable_keys() {
        let i = ItemInput {
            title: "Attention Is All You Need".into(),
            authors: vec![Author::new("Vaswani", "Ashish")],
            year: Some(2017),
            ..Default::default()
        };
        assert_eq!(base_citekey(&i), "vaswani2017attention");
        let j = ItemInput {
            title: "The Ünïcode way".into(),
            authors: vec![Author::new("Müller", "J")],
            ..Default::default()
        };
        assert_eq!(base_citekey(&j), "mullerndunicode");
    }
}
