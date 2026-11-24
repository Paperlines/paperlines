//! Formatted citations and bibliographies in CSL styles (APA, Chicago, IEEE, Nature, MLA, ...).
//! Styles and locales are embedded by hayagriva; nothing is downloaded.
use hayagriva::archive::{locales, ArchivedStyle};
use hayagriva::citationberg::json::Item as CslItem;
use hayagriva::citationberg::{IndependentStyle, Locale, Style};
use hayagriva::{BibliographyDriver, BibliographyRequest, BufWriteFormat, CitationItem, CitationRequest, ElemChildren};
use paperlines_core::export::csl_item;
use paperlines_core::model::Item;
use paperlines_core::{Error, Result};
use serde::Serialize;
use std::sync::OnceLock;

pub const DEFAULT_STYLE: &str = "apa";

#[derive(Debug, Clone, Serialize)]
pub struct StyleInfo {
    pub id: String,
    pub name: String,
}

/// Every embedded style, by id (e.g. "apa", "ieee", "chicago-author-date").
pub fn styles() -> Vec<StyleInfo> {
    let mut v: Vec<StyleInfo> = ArchivedStyle::all()
        .iter()
        .map(|s| StyleInfo {
            // the shortest alias is the friendliest id ("apa", "ieee")
            id: s
                .names()
                .iter()
                .min_by_key(|n| n.len())
                .copied()
                .unwrap_or_default()
                .to_string(),
            name: s.display_name().to_string(),
        })
        .collect();
    v.sort_by_key(|s| s.name.to_lowercase());
    v
}

fn style(id: &str) -> Result<IndependentStyle> {
    let s = ArchivedStyle::by_name(id).ok_or_else(|| Error::msg(format!("Unknown citation style: {id}")))?;
    match s.get() {
        Style::Independent(i) => Ok(i),
        Style::Dependent(_) => Err(Error::msg(format!("Style {id} is not usable on its own"))),
    }
}

fn locale_files() -> &'static [Locale] {
    static L: OnceLock<Vec<Locale>> = OnceLock::new();
    L.get_or_init(locales)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Formatted {
    pub text: String,
    pub html: String,
}

fn render(children: &ElemChildren) -> (String, String) {
    let mut text = String::new();
    let mut html = String::new();
    let _ = children.write_buf(&mut text, BufWriteFormat::Plain);
    let _ = children.write_buf(&mut html, BufWriteFormat::Html);
    (text, html)
}

fn entries(items: &[Item]) -> Result<Vec<CslItem>> {
    items
        .iter()
        .map(|i| serde_json::from_value::<CslItem>(csl_item(i)).map_err(|e| Error::msg(format!("{}: {e}", i.citekey))))
        .collect()
}

/// One in-text citation for all `items` together, e.g. "(Vaswani et al., 2017; He et al., 2016)".
pub fn citation(items: &[Item], style_id: &str) -> Result<Formatted> {
    let st = style(style_id)?;
    let es = entries(items)?;
    let mut driver = BibliographyDriver::new();
    driver.citation(CitationRequest::from_items(
        es.iter().map(CitationItem::with_entry).collect(),
        &st,
        locale_files(),
    ));
    let r = driver.finish(BibliographyRequest::new(&st, None, locale_files()));
    let c = r.citations.first().ok_or_else(|| Error::msg("Nothing to cite"))?;
    let (text, html) = render(&c.citation);
    Ok(Formatted { text, html })
}

/// A reference list in the style's order, one entry per paragraph.
pub fn bibliography(items: &[Item], style_id: &str) -> Result<Formatted> {
    let st = style(style_id)?;
    let es = entries(items)?;
    let mut driver = BibliographyDriver::new();
    for e in &es {
        driver.citation(CitationRequest::from_items(
            vec![CitationItem::with_entry(e)],
            &st,
            locale_files(),
        ));
    }
    let r = driver.finish(BibliographyRequest::new(&st, None, locale_files()));
    let Some(bib) = r.bibliography else {
        return Err(Error::msg(format!("The style {style_id} has no bibliography")));
    };
    let mut text = Vec::new();
    let mut html = Vec::new();
    for item in &bib.items {
        let (mut t, mut h) = (String::new(), String::new());
        if let Some(first) = &item.first_field {
            let _ = first.write_buf(&mut t, BufWriteFormat::Plain);
            let _ = first.write_buf(&mut h, BufWriteFormat::Html);
            t.push(' ');
            h.push(' ');
        }
        let (bt, bh) = render(&item.content);
        text.push(format!("{t}{bt}"));
        html.push(format!("<div class=\"csl-entry\">{h}{bh}</div>"));
    }
    Ok(Formatted {
        text: text.join("\n"),
        html: html.join("\n"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_core::model::{Author, Biblio};

    fn paper() -> Item {
        Item {
            id: 1,
            citekey: "vaswani2017attention".into(),
            item_type: "conference-paper".into(),
            title: "Attention is all you need".into(),
            authors: vec![
                Author::new("Vaswani", "Ashish"),
                Author::new("Shazeer", "Noam"),
                Author::new("Parmar", "Niki"),
            ],
            year: Some(2017),
            venue: Some("Advances in Neural Information Processing Systems".into()),
            biblio: Biblio {
                volume: Some("30".into()),
                pages: Some("5998–6008".into()),
                ..Default::default()
            },
            ..Default::default()
        }
    }

    fn resnet() -> Item {
        Item {
            id: 2,
            citekey: "he2016deep".into(),
            item_type: "article".into(),
            title: "Deep residual learning".into(),
            authors: vec![Author::new("He", "Kaiming")],
            year: Some(2016),
            venue: Some("CVPR".into()),
            ..Default::default()
        }
    }

    #[test]
    fn apa_citation_and_bibliography() {
        let c = citation(&[paper()], "apa").unwrap();
        assert_eq!(c.text, "(Vaswani et al., 2017)");
        let b = bibliography(&[paper(), resnet()], "apa").unwrap();
        let lines: Vec<&str> = b.text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("He, K. (2016)."), "{}", b.text);
        assert!(
            lines[1].starts_with("Vaswani, A., Shazeer, N., & Parmar, N. (2017). Attention is all you need."),
            "{}",
            b.text
        );
        assert!(b.html.contains("font-style: italic"), "{}", b.html);
    }

    #[test]
    fn other_styles_and_errors() {
        let ieee = citation(&[paper()], "ieee").unwrap();
        assert_eq!(ieee.text, "[1]");
        let chicago = bibliography(&[paper()], "chicago-author-date").unwrap();
        assert!(chicago.text.starts_with("Vaswani, Ashish"), "{}", chicago.text);
        assert!(citation(&[paper()], "no-such-style").is_err());
        let all = styles();
        assert!(all.len() > 50);
        assert!(all.iter().any(|s| s.id == "apa"));
    }
}
