//! RIS (Zotero, EndNote, Mendeley, most publishers) to ItemInput.
use paperlines_core::model::{Author, ItemInput};
use paperlines_core::text::{normalize_arxiv, normalize_doi};

fn item_type(ty: &str) -> &'static str {
    match ty {
        "CONF" | "CPAPER" => "conference-paper",
        "BOOK" | "EBOOK" => "book",
        "CHAP" | "ECHAP" => "chapter",
        "THES" => "thesis",
        "RPRT" => "report",
        "UNPB" | "MANSCPT" => "preprint",
        _ => "article",
    }
}

pub fn parse(text: &str) -> Vec<ItemInput> {
    let mut out = Vec::new();
    let mut cur: Option<(ItemInput, Vec<String>)> = None;
    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        if line.len() < 5 || &line[2..4] != "  " || !line[4..].starts_with('-') {
            continue;
        }
        let tag = &line[..2];
        let val = line[5..].trim().to_string();
        if tag == "TY" {
            cur = Some((
                ItemInput {
                    item_type: item_type(&val).into(),
                    ..Default::default()
                },
                Vec::new(),
            ));
            continue;
        }
        let Some((it, extra)) = cur.as_mut() else { continue };
        match tag {
            "TI" | "T1" if it.title.is_empty() => it.title = val,
            "AU" | "A1" => it.authors.push(Author::parse(&val)),
            "PY" | "Y1" => it.year = val.get(..4).and_then(|y| y.parse().ok()).or(it.year),
            "DA" => {
                let d: Vec<&str> = val.split('/').filter(|p| !p.is_empty()).collect();
                if !d.is_empty() {
                    it.pub_date = Some(d.join("-"));
                    it.year = it.year.or_else(|| d[0].parse().ok());
                }
            }
            "JO" | "JF" | "T2" | "BT" if it.venue.is_none() => it.venue = Some(val),
            "DO" => it.doi = normalize_doi(&val),
            "UR" if it.url.is_none() => {
                if val.contains("arxiv.org") {
                    it.arxiv_id = normalize_arxiv(&val);
                }
                it.url = Some(val);
            }
            "AB" | "N2" if it.abstract_text.is_none() => it.abstract_text = Some(val),
            "ID" => {
                it.citekey = Some(val).filter(|v| v.chars().all(|c| c.is_ascii_alphanumeric() || ":_-.".contains(c)))
            }
            "M3" | "N1" if val.to_lowercase().starts_with("arxiv:") => it.arxiv_id = normalize_arxiv(&val),
            "KW" => extra.push(val),
            "ED" | "A3" => it.biblio.editors.push(Author::parse(&val)),
            "VL" => it.biblio.volume = Some(val),
            "IS" => it.biblio.issue = Some(val),
            "SP" => {
                it.biblio.pages = Some(match it.biblio.pages.take() {
                    Some(ep) => format!("{val}–{ep}"),
                    None => val,
                })
            }
            "EP" => {
                it.biblio.pages = Some(match it.biblio.pages.take() {
                    Some(sp) => format!("{sp}–{val}"),
                    None => val,
                })
            }
            "PB" => it.biblio.publisher = Some(val),
            "CY" => it.biblio.place = Some(val),
            "ET" => it.biblio.edition = Some(val),
            "LA" => it.biblio.language = Some(val),
            "T3" => it.biblio.series = Some(val),
            "M1" => it.biblio.number = Some(val),
            "SN" => {
                let digits = val.chars().filter(|c| c.is_ascii_alphanumeric()).count();
                if digits == 8 {
                    it.biblio.issn = Some(val)
                } else {
                    it.biblio.isbn = Some(val)
                }
            }
            "ER" => {
                if let Some((it, _)) = cur.take() {
                    if !it.title.trim().is_empty() {
                        out.push(it);
                    }
                }
            }
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ris_records() {
        let r = "TY  - JOUR\r\nTI  - Deep learning\r\nAU  - LeCun, Yann\r\nAU  - Bengio, Yoshua\r\nPY  - 2015\r\nDA  - 2015/05/27\r\nJO  - Nature\r\nDO  - https://doi.org/10.1038/NATURE14539\r\nER  - \r\n\r\nTY  - CONF\nTI  - Attention\nUR  - https://arxiv.org/abs/1706.03762\nER  - \nTY  - JOUR\nER  - \n";
        let items = parse(r);
        assert_eq!(items.len(), 2, "untitled record skipped");
        assert_eq!(items[0].authors[1], Author::new("Bengio", "Yoshua"));
        assert_eq!(
            (items[0].year, items[0].pub_date.as_deref()),
            (Some(2015), Some("2015-05-27"))
        );
        assert_eq!(items[0].doi.as_deref(), Some("10.1038/nature14539"));
        assert_eq!(
            (items[1].item_type.as_str(), items[1].arxiv_id.as_deref()),
            ("conference-paper", Some("1706.03762"))
        );
    }
}

#[cfg(test)]
mod roundtrip {
    use paperlines_core::export;
    use paperlines_core::model::{Author, Item};

    fn item() -> Item {
        Item {
            id: 1,
            item_type: "conference-paper".into(),
            citekey: "muller2020etude".into(),
            title: "Müller's Étude: 100% of {it} & more".into(),
            authors: vec![
                Author::new("Müller", "Jörg"),
                Author::new("World Health Organization", ""),
            ],
            year: Some(2020),
            pub_date: Some("2020-03-01".into()),
            venue: Some("Proc. Test".into()),
            doi: Some("10.1/abc".into()),
            arxiv_id: Some("2001.00001".into()),
            url: None,
            abstract_text: Some("Abstract_with_underscores".into()),
            read_status: "unread".into(),
            rating: None,
            date_added: String::new(),
            date_modified: String::new(),
            has_pdf: false,
            tags: vec![],
            project_ids: vec![],
            biblio: paperlines_core::model::Biblio {
                volume: Some("30".into()),
                issue: Some("2".into()),
                pages: Some("5998–6008".into()),
                publisher: Some("Curran".into()),
                place: Some("Red Hook, NY".into()),
                isbn: Some("9781510860964".into()),
                edition: Some("2".into()),
                language: Some("en".into()),
                series: Some("Advances".into()),
                editors: vec![Author::new("Guyon", "Isabelle")],
                ..Default::default()
            },
            ..Default::default()
        }
    }

    /// Exports read back through our own importers keep the metadata.
    #[test]
    fn exports_reimport_cleanly() {
        let i = item();
        for parsed in [
            crate::bibtex::parse(&export::bibtex(std::slice::from_ref(&i))),
            crate::csl::parse(&export::csl_json(std::slice::from_ref(&i))).unwrap(),
            super::parse(&export::ris(std::slice::from_ref(&i))),
        ] {
            let p = &parsed[0];
            assert_eq!(p.title, i.title);
            assert_eq!(p.authors, i.authors);
            assert_eq!(p.year, Some(2020));
            assert_eq!(p.doi.as_deref(), Some("10.1/abc"));
            assert_eq!(p.citekey.as_deref(), Some("muller2020etude"));
            assert_eq!(p.item_type, "conference-paper");
            let b = &p.biblio;
            assert_eq!(
                (b.volume.as_deref(), b.issue.as_deref(), b.pages.as_deref()),
                (Some("30"), Some("2"), Some("5998–6008"))
            );
            assert_eq!(
                (b.publisher.as_deref(), b.place.as_deref(), b.isbn.as_deref()),
                (Some("Curran"), Some("Red Hook, NY"), Some("9781510860964"))
            );
            assert_eq!(
                (b.edition.as_deref(), b.language.as_deref(), b.series.as_deref()),
                (Some("2"), Some("en"), Some("Advances"))
            );
            assert_eq!(b.editors, vec![Author::new("Guyon", "Isabelle")]);
        }
    }
}
