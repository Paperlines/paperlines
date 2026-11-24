use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Author {
    pub family: String,
    pub given: String,
}

impl Author {
    pub fn new(family: &str, given: &str) -> Self {
        Author {
            family: family.trim().to_string(),
            given: given.trim().to_string(),
        }
    }

    /// Parses "Family, Given" or "Given Family" (with lowercase particles like "van der").
    pub fn parse(name: &str) -> Self {
        let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
        if let Some((family, given)) = name.split_once(',') {
            return Author::new(family, given);
        }
        let parts: Vec<&str> = name.split(' ').collect();
        if parts.len() < 2 {
            return Author::new(&name, "");
        }
        let mut split = parts.len() - 1;
        while split > 1 && parts[split - 1].chars().next().is_some_and(char::is_lowercase) {
            split -= 1;
        }
        Author::new(&parts[split..].join(" "), &parts[..split].join(" "))
    }
}

/// Bibliographic details beyond the core fields; used by citation styles and exports.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Biblio {
    pub volume: Option<String>,
    pub issue: Option<String>,
    pub pages: Option<String>,
    pub publisher: Option<String>,
    pub place: Option<String>,
    pub isbn: Option<String>,
    pub issn: Option<String>,
    pub edition: Option<String>,
    pub language: Option<String>,
    pub series: Option<String>,
    /// Report, patent or other number.
    pub number: Option<String>,
    pub editors: Vec<Author>,
}

impl Biblio {
    pub fn fill_from(&mut self, o: &Biblio) {
        for (a, b) in [
            (&mut self.volume, &o.volume),
            (&mut self.issue, &o.issue),
            (&mut self.pages, &o.pages),
            (&mut self.publisher, &o.publisher),
            (&mut self.place, &o.place),
            (&mut self.isbn, &o.isbn),
            (&mut self.issn, &o.issn),
            (&mut self.edition, &o.edition),
            (&mut self.language, &o.language),
            (&mut self.series, &o.series),
            (&mut self.number, &o.number),
        ] {
            if a.is_none() {
                a.clone_from(b);
            }
        }
        if self.editors.is_empty() {
            self.editors.clone_from(&o.editors);
        }
    }
}

/// Editable metadata, used for create, update and import.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemInput {
    pub item_type: String,
    pub citekey: Option<String>,
    pub title: String,
    pub authors: Vec<Author>,
    pub year: Option<i32>,
    pub pub_date: Option<String>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub url: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: Option<String>,
    pub read_status: Option<String>,
    pub rating: Option<i32>,
    #[serde(flatten)]
    pub biblio: Biblio,
}

impl ItemInput {
    /// Fills every empty field of `self` from `other`. Used by import enrichment and merge.
    pub fn fill_from(&mut self, other: &ItemInput) {
        fn opt<T: Clone>(a: &mut Option<T>, b: &Option<T>) {
            if a.is_none() {
                a.clone_from(b);
            }
        }
        if self.title.trim().is_empty() {
            self.title.clone_from(&other.title);
        }
        if self.item_type.is_empty() {
            self.item_type.clone_from(&other.item_type);
        }
        if self.authors.is_empty() {
            self.authors.clone_from(&other.authors);
        }
        opt(&mut self.citekey, &other.citekey);
        opt(&mut self.year, &other.year);
        opt(&mut self.pub_date, &other.pub_date);
        opt(&mut self.venue, &other.venue);
        opt(&mut self.doi, &other.doi);
        opt(&mut self.arxiv_id, &other.arxiv_id);
        opt(&mut self.url, &other.url);
        opt(&mut self.abstract_text, &other.abstract_text);
        self.biblio.fill_from(&other.biblio);
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: i64,
    pub item_type: String,
    pub citekey: String,
    pub title: String,
    pub authors: Vec<Author>,
    pub year: Option<i32>,
    pub pub_date: Option<String>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub url: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: Option<String>,
    pub read_status: String,
    pub rating: Option<i32>,
    pub date_added: String,
    pub date_modified: String,
    pub has_pdf: bool,
    pub has_epub: bool,
    pub tags: Vec<String>,
    pub project_ids: Vec<i64>,
    /// Set when the paper is in the Trash.
    pub deleted_at: Option<String>,
    #[serde(flatten)]
    pub biblio: Biblio,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_author_forms() {
        assert_eq!(Author::parse("Vaswani, Ashish"), Author::new("Vaswani", "Ashish"));
        assert_eq!(Author::parse("Ashish  Vaswani"), Author::new("Vaswani", "Ashish"));
        assert_eq!(
            Author::parse("Ludwig van Beethoven"),
            Author::new("van Beethoven", "Ludwig")
        );
        assert_eq!(Author::parse("Plato"), Author::new("Plato", ""));
    }
}
