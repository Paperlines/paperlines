//! Bibliography and data exports. All functions are pure over loaded items.
use crate::model::{Author, Item};
use serde_json::{json, Value};

fn bib_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' | '%' | '$' | '#' | '_' => {
                out.push('\\');
                out.push(c);
            }
            '{' => out.push_str("\\{"),
            '}' => out.push_str("\\}"),
            '~' => out.push_str("\\textasciitilde{}"),
            '^' => out.push_str("\\textasciicircum{}"),
            '\\' => out.push_str("\\textbackslash{}"),
            _ => out.push(c),
        }
    }
    out
}

fn bib_author(a: &Author) -> String {
    if a.given.is_empty() {
        // corporate or single names stay one unit
        format!("{{{}}}", bib_escape(&a.family))
    } else {
        format!("{}, {}", bib_escape(&a.family), bib_escape(&a.given))
    }
}

fn bib_type(t: &str) -> &'static str {
    match t {
        "conference-paper" => "inproceedings",
        "book" => "book",
        "chapter" => "incollection",
        "thesis" => "phdthesis",
        "report" => "techreport",
        "preprint" => "misc",
        _ => "article",
    }
}

/// BibTeX. Titles are wrapped in braces so capitalization survives styles.
pub fn bibtex(items: &[Item]) -> String {
    let mut out = String::new();
    for i in items {
        let ty = bib_type(&i.item_type);
        let mut f: Vec<(&str, String)> = vec![("title", format!("{{{}}}", bib_escape(&i.title)))];
        if !i.authors.is_empty() {
            f.push((
                "author",
                format!(
                    "{{{}}}",
                    i.authors.iter().map(bib_author).collect::<Vec<_>>().join(" and ")
                ),
            ));
        }
        if let Some(y) = i.year {
            f.push(("year", y.to_string()));
        }
        if let Some(v) = &i.venue {
            let key = match ty {
                "inproceedings" | "incollection" => "booktitle",
                "book" | "techreport" | "phdthesis" => "publisher",
                "misc" => "howpublished",
                _ => "journal",
            };
            f.push((key, format!("{{{}}}", bib_escape(v))));
        }
        let b = &i.biblio;
        if !b.editors.is_empty() {
            f.push((
                "editor",
                format!(
                    "{{{}}}",
                    b.editors.iter().map(bib_author).collect::<Vec<_>>().join(" and ")
                ),
            ));
        }
        for (k, v) in [
            ("volume", &b.volume),
            // BibTeX "number" is the issue for articles; other types keep issue in biblatex's "issue"
            (
                "number",
                if ty == "article" && b.issue.is_some() {
                    &b.issue
                } else {
                    &b.number
                },
            ),
            ("issue", if ty == "article" { &None } else { &b.issue }),
            (
                "publisher",
                if matches!(ty, "book" | "techreport" | "phdthesis" | "misc") && i.venue.is_none() {
                    &b.publisher
                } else {
                    &None
                },
            ),
            ("address", &b.place),
            ("edition", &b.edition),
            ("series", &b.series),
            ("isbn", &b.isbn),
            ("issn", &b.issn),
            ("language", &b.language),
        ] {
            if let Some(v) = v {
                f.push((k, format!("{{{}}}", bib_escape(v))));
            }
        }
        if let Some(p) = &b.pages {
            f.push(("pages", format!("{{{}}}", p.replace(['–', '—'], "--").replace(" ", ""))));
        }
        if !matches!(ty, "book" | "techreport" | "phdthesis" | "misc") || i.venue.is_some() {
            if let Some(p) = &b.publisher {
                f.push(("publisher", format!("{{{}}}", bib_escape(p))));
            }
        }
        if let Some(d) = &i.doi {
            f.push(("doi", format!("{{{}}}", d)));
        }
        if let Some(a) = &i.arxiv_id {
            f.push(("eprint", format!("{{{a}}}")));
            f.push(("archiveprefix", "{arXiv}".into()));
        }
        if let Some(u) = &i.url {
            f.push(("url", format!("{{{u}}}")));
        }
        if let Some(a) = &i.abstract_text {
            f.push(("abstract", format!("{{{}}}", bib_escape(a))));
        }
        if !i.tags.is_empty() {
            f.push(("keywords", format!("{{{}}}", bib_escape(&i.tags.join(", ")))));
        }
        out.push_str(&format!("@{ty}{{{},\n", i.citekey));
        for (k, v) in f {
            out.push_str(&format!("  {k} = {v},\n"));
        }
        out.push_str("}\n\n");
    }
    out
}

fn csl_type(t: &str) -> &'static str {
    match t {
        "conference-paper" => "paper-conference",
        "book" => "book",
        "chapter" => "chapter",
        "thesis" => "thesis",
        "report" => "report",
        "preprint" => "article",
        _ => "article-journal",
    }
}

pub fn csl_item(i: &Item) -> Value {
    let mut v = json!({
        "id": i.citekey,
        "citation-key": i.citekey,
        "type": csl_type(&i.item_type),
        "title": i.title,
        "author": i.authors.iter().map(|a| if a.given.is_empty() { json!({"literal": a.family}) } else { json!({"family": a.family, "given": a.given}) }).collect::<Vec<_>>(),
    });
    let o = v.as_object_mut().expect("object");
    if let Some(d) = &i.pub_date {
        let parts: Vec<Value> = d
            .split('-')
            .filter_map(|p| p.parse::<i64>().ok())
            .map(Value::from)
            .collect();
        if !parts.is_empty() {
            o.insert("issued".into(), json!({ "date-parts": [parts] }));
        }
    } else if let Some(y) = i.year {
        o.insert("issued".into(), json!({ "date-parts": [[y]] }));
    }
    if let Some(x) = &i.venue {
        o.insert("container-title".into(), json!(x));
    }
    if let Some(x) = &i.doi {
        o.insert("DOI".into(), json!(x));
    }
    if let Some(x) = &i.url {
        o.insert("URL".into(), json!(x));
    } else if let Some(a) = &i.arxiv_id {
        o.insert("URL".into(), json!(format!("https://arxiv.org/abs/{a}")));
    }
    if let Some(x) = &i.abstract_text {
        o.insert("abstract".into(), json!(x));
    }
    let b = &i.biblio;
    for (k, v) in [
        ("volume", &b.volume),
        ("issue", &b.issue),
        ("page", &b.pages),
        ("publisher", &b.publisher),
        ("publisher-place", &b.place),
        ("ISBN", &b.isbn),
        ("ISSN", &b.issn),
        ("edition", &b.edition),
        ("language", &b.language),
        ("collection-title", &b.series),
        ("number", &b.number),
    ] {
        if let Some(v) = v {
            o.insert(k.into(), json!(v));
        }
    }
    if !b.editors.is_empty() {
        o.insert(
            "editor".into(),
            json!(b
                .editors
                .iter()
                .map(|a| if a.given.is_empty() {
                    json!({"literal": a.family})
                } else {
                    json!({"family": a.family, "given": a.given})
                })
                .collect::<Vec<_>>()),
        );
    }
    v
}

pub fn csl_json(items: &[Item]) -> String {
    serde_json::to_string_pretty(&items.iter().map(csl_item).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".into())
}

fn ris_type(t: &str) -> &'static str {
    match t {
        "conference-paper" => "CONF",
        "book" => "BOOK",
        "chapter" => "CHAP",
        "thesis" => "THES",
        "report" => "RPRT",
        "preprint" => "UNPB",
        _ => "JOUR",
    }
}

pub fn ris(items: &[Item]) -> String {
    let mut out = String::new();
    for i in items {
        let mut line = |k: &str, v: &str| {
            if !v.trim().is_empty() {
                out.push_str(&format!("{k}  - {}\n", v.replace('\n', " ")));
            }
        };
        line("TY", ris_type(&i.item_type));
        line("ID", &i.citekey);
        line("TI", &i.title);
        for a in &i.authors {
            // a trailing comma keeps corporate names ("World Health Organization,") from being split
            line(
                "AU",
                &if a.given.is_empty() {
                    format!("{},", a.family)
                } else {
                    format!("{}, {}", a.family, a.given)
                },
            );
        }
        if let Some(y) = i.year {
            line("PY", &y.to_string());
        }
        if let Some(d) = &i.pub_date {
            line("DA", &d.replace('-', "/"));
        }
        if let Some(v) = &i.venue {
            line("T2", v);
        }
        let b = &i.biblio;
        for e in &b.editors {
            line(
                "ED",
                &if e.given.is_empty() {
                    format!("{},", e.family)
                } else {
                    format!("{}, {}", e.family, e.given)
                },
            );
        }
        for (k, v) in [
            ("VL", &b.volume),
            ("IS", &b.issue),
            ("PB", &b.publisher),
            ("CY", &b.place),
            ("ET", &b.edition),
            ("LA", &b.language),
            ("T3", &b.series),
            ("M1", &b.number),
        ] {
            if let Some(v) = v {
                line(k, v);
            }
        }
        if let Some(sn) = b.isbn.as_ref().or(b.issn.as_ref()) {
            line("SN", sn);
        }
        if let Some(p) = &b.pages {
            let mut parts = p.splitn(2, ['-', '–', '—']);
            line("SP", parts.next().unwrap_or("").trim());
            if let Some(ep) = parts.next() {
                line("EP", ep.trim_matches(['-', ' ']));
            }
        }
        if let Some(d) = &i.doi {
            line("DO", d);
        }
        if let Some(u) = &i.url {
            line("UR", u);
        }
        if let Some(a) = &i.arxiv_id {
            line("M3", &format!("arXiv:{a}"));
        }
        if let Some(a) = &i.abstract_text {
            line("AB", a);
        }
        for t in &i.tags {
            line("KW", t);
        }
        out.push_str("ER  - \n\n");
    }
    out
}

fn md_authors(a: &[Author]) -> String {
    let names: Vec<String> = a
        .iter()
        .map(|x| {
            let initials: String = x
                .given
                .split_whitespace()
                .filter_map(|g| g.chars().next())
                .map(|c| format!("{c}."))
                .collect::<Vec<_>>()
                .join(" ");
            if initials.is_empty() {
                x.family.clone()
            } else {
                format!("{}, {initials}", x.family)
            }
        })
        .collect();
    match names.len() {
        0 => String::new(),
        1..=6 => names.join(", "),
        _ => format!(
            "{}, … {}",
            names[..6].join(", "),
            names.last().cloned().unwrap_or_default()
        ),
    }
}

/// A readable Markdown reference list (APA-like), sorted by first author then year.
pub fn markdown_bibliography(items: &[Item]) -> String {
    let mut sorted: Vec<&Item> = items.iter().collect();
    sorted.sort_by(|a, b| {
        let fa = a.authors.first().map(|x| x.family.to_lowercase()).unwrap_or_default();
        let fb = b.authors.first().map(|x| x.family.to_lowercase()).unwrap_or_default();
        fa.cmp(&fb).then(a.year.cmp(&b.year)).then(a.title.cmp(&b.title))
    });
    let mut out = String::new();
    for i in sorted {
        let mut parts = Vec::new();
        let authors = md_authors(&i.authors);
        if !authors.is_empty() {
            parts.push(authors);
        }
        parts.push(format!(
            "({}).",
            i.year.map(|y| y.to_string()).unwrap_or_else(|| "n.d.".into())
        ));
        parts.push(format!("*{}*.", i.title.trim_end_matches('.')));
        if let Some(v) = &i.venue {
            let b = &i.biblio;
            let mut s = v.clone();
            if let Some(vol) = &b.volume {
                s.push_str(&format!(", {vol}"));
                if let Some(iss) = &b.issue {
                    s.push_str(&format!("({iss})"));
                }
            }
            if let Some(p) = &b.pages {
                s.push_str(&format!(", {p}"));
            }
            parts.push(format!("{s}."));
        } else if let Some(p) = &i.biblio.publisher {
            parts.push(format!("{p}."));
        }
        if let Some(d) = &i.doi {
            parts.push(format!("https://doi.org/{d}"));
        } else if let Some(a) = &i.arxiv_id {
            parts.push(format!("https://arxiv.org/abs/{a}"));
        } else if let Some(u) = &i.url {
            parts.push(u.clone());
        }
        out.push_str(&format!("- {} `@{}`\n", parts.join(" "), i.citekey));
    }
    out
}

/// A file name that is safe on macOS, Linux and Windows.
pub fn safe_filename(name: &str) -> String {
    let s: String = crate::text::nfc(name)
        .chars()
        .map(|c| {
            if "/\\:*?\"<>|".contains(c) || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let s = s.trim().trim_matches('.').to_string();
    let s: String = s.chars().take(120).collect();
    if s.is_empty() {
        "untitled".into()
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub fn sample() -> Item {
        Item {
            id: 1,
            item_type: "conference-paper".into(),
            citekey: "vaswani2017attention".into(),
            title: "Attention Is All You Need: 100% {of} it_now".into(),
            authors: vec![Author::new("Vaswani", "Ashish"), Author::new("Google Brain", "")],
            year: Some(2017),
            pub_date: Some("2017-06-12".into()),
            venue: Some("NeurIPS".into()),
            doi: Some("10.5555/3295222".into()),
            arxiv_id: Some("1706.03762".into()),
            url: None,
            abstract_text: Some("The dominant & sequence models.".into()),
            read_status: "read".into(),
            rating: None,
            date_added: "2026-01-01 00:00:00".into(),
            date_modified: String::new(),
            has_pdf: false,
            tags: vec!["ml/nlp".into()],
            project_ids: vec![],
            ..Default::default()
        }
    }

    #[test]
    fn bibtex_escapes_and_types() {
        let b = bibtex(&[sample()]);
        assert!(b.starts_with("@inproceedings{vaswani2017attention,\n"), "{b}");
        assert!(b.contains(r"title = {Attention Is All You Need: 100\% \{of\} it\_now},"));
        assert!(b.contains("author = {Vaswani, Ashish and {Google Brain}},"));
        assert!(b.contains("booktitle = {NeurIPS},"));
        assert!(b.contains("archiveprefix = {arXiv},"));
        assert!(b.contains(r"abstract = {The dominant \& sequence models.},"));
    }

    #[test]
    fn csl_and_ris() {
        let v = csl_item(&sample());
        assert_eq!(v["type"], "paper-conference");
        assert_eq!(v["issued"]["date-parts"][0], json!([2017, 6, 12]));
        assert_eq!(v["author"][1]["literal"], "Google Brain");
        let r = ris(&[sample()]);
        assert!(r.starts_with("TY  - CONF\n"));
        assert!(r.contains("AU  - Vaswani, Ashish\n") && r.contains("DA  - 2017/06/12\n") && r.contains("ER  - \n"));
    }

    #[test]
    fn markdown_reference_list() {
        let m = markdown_bibliography(&[sample()]);
        assert_eq!(
            m,
            "- Vaswani, A., Google Brain (2017). *Attention Is All You Need: 100% {of} it_now*. NeurIPS. https://doi.org/10.5555/3295222 `@vaswani2017attention`\n"
        );
    }

    #[test]
    fn filenames_are_portable() {
        assert_eq!(safe_filename("A/B: c?*"), "A-B- c--");
        assert_eq!(safe_filename("  ..  "), "untitled");
        assert_eq!(safe_filename("Mu\u{0308}ller"), "Müller");
    }
}
