//! Small, forgiving BibTeX reader. Handles braces, quotes, `#` concatenation and common LaTeX accents.
use paperlines_core::model::{Author, ItemInput};
use std::collections::HashMap;
use unicode_normalization::UnicodeNormalization;

struct P<'a> {
    s: &'a [u8],
    i: usize,
}

impl<'a> P<'a> {
    fn peek(&self) -> Option<u8> {
        self.s.get(self.i).copied()
    }
    fn ws(&mut self) {
        while self.peek().is_some_and(|c| c.is_ascii_whitespace()) {
            self.i += 1;
        }
    }
    fn ident(&mut self) -> String {
        let st = self.i;
        while self
            .peek()
            .is_some_and(|c| !c.is_ascii_whitespace() && !b"{}(),=#\"".contains(&c))
        {
            self.i += 1;
        }
        String::from_utf8_lossy(&self.s[st..self.i]).into_owned()
    }
    /// Content of a balanced `{...}` group starting at `{`; returns inner text with nested braces kept.
    fn braced(&mut self) -> String {
        let mut depth = 0;
        let st = self.i + 1;
        while let Some(c) = self.peek() {
            self.i += 1;
            match c {
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        return String::from_utf8_lossy(&self.s[st..self.i - 1]).into_owned();
                    }
                }
                _ => {}
            }
        }
        String::from_utf8_lossy(&self.s[st..]).into_owned()
    }
    fn quoted(&mut self) -> String {
        self.i += 1;
        let st = self.i;
        let mut depth = 0;
        while let Some(c) = self.peek() {
            match c {
                b'{' => depth += 1,
                b'}' => depth -= 1,
                b'"' if depth == 0 => {
                    let v = String::from_utf8_lossy(&self.s[st..self.i]).into_owned();
                    self.i += 1;
                    return v;
                }
                _ => {}
            }
            self.i += 1;
        }
        String::from_utf8_lossy(&self.s[st..]).into_owned()
    }
    fn value(&mut self, strings: &HashMap<String, String>) -> String {
        let mut out = String::new();
        loop {
            self.ws();
            match self.peek() {
                Some(b'{') => out.push_str(&self.braced()),
                Some(b'"') => out.push_str(&self.quoted()),
                Some(_) => {
                    let w = self.ident();
                    out.push_str(strings.get(&w.to_lowercase()).map(String::as_str).unwrap_or(&w));
                }
                None => break,
            }
            self.ws();
            if self.peek() == Some(b'#') {
                self.i += 1;
            } else {
                break;
            }
        }
        out
    }
}

pub struct Entry {
    pub kind: String,
    pub key: String,
    pub fields: HashMap<String, String>,
}

pub fn parse_entries(text: &str) -> Vec<Entry> {
    let mut p = P {
        s: text.as_bytes(),
        i: 0,
    };
    let mut strings: HashMap<String, String> = HashMap::new();
    let mut out = Vec::new();
    while let Some(off) = p.s[p.i..].iter().position(|&c| c == b'@') {
        p.i += off + 1;
        let kind = p.ident().to_lowercase();
        p.ws();
        let Some(open) = p.peek().filter(|c| *c == b'{' || *c == b'(') else {
            continue;
        };
        let close = if open == b'{' { b'}' } else { b')' };
        if kind == "comment" || kind == "preamble" {
            if open == b'{' {
                p.braced();
            }
            continue;
        }
        p.i += 1;
        p.ws();
        if kind == "string" {
            let name = p.ident().to_lowercase();
            p.ws();
            if p.peek() == Some(b'=') {
                p.i += 1;
                let v = p.value(&strings);
                strings.insert(name, v);
            }
            continue;
        }
        let key = p.ident();
        let mut fields = HashMap::new();
        loop {
            p.ws();
            match p.peek() {
                Some(b',') => {
                    p.i += 1;
                    continue;
                }
                Some(c) if c == close => {
                    p.i += 1;
                    break;
                }
                None => break,
                _ => {}
            }
            let name = p.ident().to_lowercase();
            p.ws();
            if name.is_empty() || p.peek() != Some(b'=') {
                // malformed: skip to next comma or close
                while p.peek().is_some_and(|c| c != b',' && c != close) {
                    p.i += 1;
                }
                continue;
            }
            p.i += 1;
            let v = p.value(&strings);
            fields.insert(name, v);
        }
        out.push(Entry { kind, key, fields });
    }
    out
}

/// LaTeX to plain Unicode: accents, escapes, and braces removed.
pub fn clean_latex(s: &str) -> String {
    let mut out = String::new();
    let cs: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\\' && i + 1 < cs.len() {
            let n = cs[i + 1];
            let mark = match n {
                '\'' => Some('\u{301}'),
                '`' => Some('\u{300}'),
                '^' => Some('\u{302}'),
                '"' => Some('\u{308}'),
                '~' => Some('\u{303}'),
                '=' => Some('\u{304}'),
                '.' => Some('\u{307}'),
                'c' if cs.get(i + 2).is_some_and(|c| *c == '{' || *c == ' ') => Some('\u{327}'),
                'v' if cs.get(i + 2).is_some_and(|c| *c == '{' || *c == ' ') => Some('\u{30C}'),
                'u' if cs.get(i + 2).is_some_and(|c| *c == '{') => Some('\u{306}'),
                _ => None,
            };
            if let Some(m) = mark {
                let mut j = i + 2;
                while j < cs.len() && (cs[j] == '{' || cs[j] == ' ' || cs[j] == '\\') {
                    j += 1;
                }
                if let Some(&base) = cs.get(j) {
                    out.push(if base == 'i' { 'i' } else { base });
                    out.push(m);
                    j += 1;
                    if cs.get(j) == Some(&'}') {
                        j += 1;
                    }
                    i = j;
                    continue;
                }
            }
            if "&%$#_{}".contains(n) {
                out.push(n);
                i += 2;
                continue;
            }
            let word: String = cs[i + 1..].iter().take_while(|c| c.is_ascii_alphabetic()).collect();
            let rep = match word.as_str() {
                "ss" => Some("ß"),
                "o" => Some("ø"),
                "O" => Some("Ø"),
                "ae" => Some("æ"),
                "aa" => Some("å"),
                "l" => Some("ł"),
                "textendash" => Some("–"),
                "textemdash" => Some("—"),
                _ => None,
            };
            if let Some(r) = rep {
                out.push_str(r);
            }
            // drop unknown commands like \emph, \textit, keep their argument text
            i += 1 + word.len().max(if word.is_empty() { 1 } else { 0 });
            continue;
        }
        if c != '{' && c != '}' {
            out.push(if c == '~' { ' ' } else { c });
        }
        i += 1;
    }
    let s: String = out.nfc().collect();
    s.replace("---", "—")
        .replace("--", "–")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Splits `author` on top-level " and ", keeping `{Corporate Names}` as one family name.
pub fn parse_authors(raw: &str) -> Vec<Author> {
    let mut names = Vec::new();
    let (mut depth, mut cur) = (0i32, String::new());
    let words: Vec<&str> = raw.split_whitespace().collect();
    for w in words {
        let before = depth;
        depth += w.matches('{').count() as i32 - w.matches('}').count() as i32;
        if before == 0 && w.eq_ignore_ascii_case("and") {
            names.push(std::mem::take(&mut cur));
            continue;
        }
        if !cur.is_empty() {
            cur.push(' ');
        }
        cur.push_str(w);
    }
    names.push(cur);
    names
        .into_iter()
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty() && n != "others")
        .map(|n| {
            if n.starts_with('{') && n.ends_with('}') && !n.contains(',') {
                Author::new(&clean_latex(&n), "")
            } else {
                Author::parse(&clean_latex(&n))
            }
        })
        .collect()
}

fn item_type(kind: &str) -> &'static str {
    match kind {
        "inproceedings" | "conference" | "proceedings" => "conference-paper",
        "book" => "book",
        "inbook" | "incollection" => "chapter",
        "phdthesis" | "mastersthesis" | "thesis" => "thesis",
        "techreport" | "report" => "report",
        "misc" | "online" | "unpublished" => "preprint",
        _ => "article",
    }
}

pub fn to_input(e: &Entry) -> ItemInput {
    let f = |k: &str| e.fields.get(k).map(|v| clean_latex(v)).filter(|v| !v.is_empty());
    let year = f("year")
        .or_else(|| f("date"))
        .and_then(|y| y.chars().take(4).collect::<String>().parse().ok());
    let eprint_is_arxiv = f("archiveprefix")
        .or_else(|| f("eprinttype"))
        .is_some_and(|p| p.eq_ignore_ascii_case("arxiv"));
    ItemInput {
        item_type: item_type(&e.kind).into(),
        citekey: (!e.key.is_empty()).then(|| e.key.clone()),
        title: f("title").unwrap_or_default(),
        authors: e
            .fields
            .get("author")
            .or_else(|| e.fields.get("editor"))
            .map(|a| parse_authors(a))
            .unwrap_or_default(),
        year,
        pub_date: f("date"),
        venue: f("journal").or_else(|| f("journaltitle")).or_else(|| f("booktitle")),
        doi: f("doi").and_then(|d| paperlines_core::text::normalize_doi(&d)),
        arxiv_id: f("eprint")
            .filter(|_| eprint_is_arxiv)
            .and_then(|a| paperlines_core::text::normalize_arxiv(&a)),
        url: f("url"),
        abstract_text: f("abstract"),
        biblio: paperlines_core::model::Biblio {
            volume: f("volume"),
            issue: f("issue").or_else(|| f("number").filter(|_| e.kind == "article")),
            number: f("number").filter(|_| e.kind != "article"),
            pages: f("pages").map(|p| p.replace("--", "–").replace(['—'], "–")),
            publisher: f("publisher").or_else(|| f("institution")).or_else(|| f("school")),
            place: f("address").or_else(|| f("location")),
            isbn: f("isbn"),
            issn: f("issn"),
            edition: f("edition"),
            language: f("language").or_else(|| f("langid")),
            series: f("series"),
            editors: e
                .fields
                .get("editor")
                .filter(|_| e.fields.contains_key("author"))
                .map(|a| parse_authors(a))
                .unwrap_or_default(),
        },
        ..Default::default()
    }
}

pub fn parse(text: &str) -> Vec<ItemInput> {
    parse_entries(text).iter().map(to_input).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const BIB: &str = r#"
@string{nips = "Advances in Neural Information Processing Systems"}
% a comment line
@inproceedings{vaswani2017attention,
  title     = {Attention Is {All} You Need},
  author    = {Vaswani, Ashish and Shazeer, Noam and Gomez, Aidan N. and others},
  booktitle = nips,
  year      = 2017,
  eprint    = {1706.03762},
  archivePrefix = {arXiv},
}
@article{muller,
  title = "M{\"u}ller's {\'E}tude --- on {\c{c}}a",
  author = "J{\"o}rg M{\"u}ller and {World Health Organization}",
  journal = {J. Test} # { Letters},
  doi = {https://doi.org/10.1000/XYZ},
  year = {2020}
}
@comment{ ignored @article{nope, title={x}} }
"#;

    #[test]
    fn parses_entries_strings_and_accents() {
        let items = parse(BIB);
        assert_eq!(items.len(), 2);
        let a = &items[0];
        assert_eq!(a.citekey.as_deref(), Some("vaswani2017attention"));
        assert_eq!(a.title, "Attention Is All You Need");
        assert_eq!(a.item_type, "conference-paper");
        assert_eq!(
            a.venue.as_deref(),
            Some("Advances in Neural Information Processing Systems")
        );
        assert_eq!(a.year, Some(2017));
        assert_eq!(a.arxiv_id.as_deref(), Some("1706.03762"));
        assert_eq!(a.authors.len(), 3);
        assert_eq!(a.authors[2], Author::new("Gomez", "Aidan N."));

        let b = &items[1];
        assert_eq!(b.title, "Müller's Étude — on ça");
        assert_eq!(b.authors[0], Author::new("Müller", "Jörg"));
        assert_eq!(b.authors[1], Author::new("World Health Organization", ""));
        assert_eq!(b.venue.as_deref(), Some("J. Test Letters"));
        assert_eq!(b.doi.as_deref(), Some("10.1000/xyz"));
    }
}
