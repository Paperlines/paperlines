//! Reads a Zotero library (zotero.sqlite + storage/) without touching it: the database is copied
//! first, so this also works while Zotero is open.
use paperlines_core::model::{Author, Biblio, ItemInput};
use paperlines_core::rusqlite::{Connection, OpenFlags};
use paperlines_core::text::{normalize_arxiv, normalize_doi};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub struct ZAnnotation {
    /// 1-based page.
    pub page: u32,
    /// highlight | underline | rect
    pub kind: String,
    /// In PDF user space: [x1, y1, x2, y2].
    pub rects: Vec<[f64; 4]>,
    pub text: Option<String>,
    pub comment: Option<String>,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ZAttachment {
    pub path: PathBuf,
    /// pdf | epub
    pub kind: String,
    pub annotations: Vec<ZAnnotation>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ZItem {
    pub key: String,
    pub input: ItemInput,
    pub tags: Vec<String>,
    /// Collection paths, e.g. "Thesis / Chapter 2".
    pub collections: Vec<String>,
    pub attachments: Vec<ZAttachment>,
    /// Child notes as Markdown.
    pub notes: Vec<String>,
    pub missing_files: Vec<String>,
}

#[derive(Debug, Default)]
pub struct ZoteroLibrary {
    pub items: Vec<ZItem>,
    pub collections: Vec<String>,
}

/// The usual Zotero data folder (~/Zotero on macOS and Linux).
pub fn default_data_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let d = Path::new(&home).join("Zotero");
    d.join("zotero.sqlite").exists().then_some(d)
}

fn item_type(t: &str) -> &'static str {
    match t {
        "conferencePaper" => "conference-paper",
        "book" => "book",
        "bookSection" => "chapter",
        "thesis" => "thesis",
        "report" => "report",
        "preprint" | "manuscript" => "preprint",
        "webpage" | "blogPost" => "webpage",
        "dataset" => "dataset",
        "computerProgram" => "software",
        _ => "article",
    }
}

/// Maps a Zotero highlight color to the nearest of the app's highlight colors.
pub fn nearest_color(hex: &str) -> String {
    let h = hex.trim_start_matches('#');
    let p = |i: usize| u8::from_str_radix(h.get(i..i + 2).unwrap_or("00"), 16).unwrap_or(0) as i32;
    let (r, g, b) = (p(0), p(2), p(4));
    let palette = [
        ("yellow", (255, 212, 0)),
        ("red", (255, 102, 102)),
        ("green", (95, 178, 54)),
        ("blue", (46, 168, 229)),
        ("purple", (162, 138, 229)),
        ("orange", (241, 152, 55)),
    ];
    palette
        .iter()
        .min_by_key(|(_, (pr, pg, pb))| (r - pr).pow(2) + (g - pg).pow(2) + (b - pb).pow(2))
        .map(|(n, _)| n.to_string())
        .unwrap_or_else(|| "yellow".into())
}

/// Zotero note HTML to Markdown (headings, emphasis, lists, links, paragraphs).
pub fn html_to_markdown(html: &str) -> String {
    let mut s = html.to_string();
    let rules: &[(&str, &str)] = &[
        (r"(?is)<h1[^>]*>(.*?)</h1>", "\n# $1\n\n"),
        (r"(?is)<h2[^>]*>(.*?)</h2>", "\n## $1\n\n"),
        (r"(?is)<h3[^>]*>(.*?)</h3>", "\n### $1\n\n"),
        (r"(?is)<(?:strong|b)>(.*?)</(?:strong|b)>", "**$1**"),
        (r"(?is)<(?:em|i)>(.*?)</(?:em|i)>", "*$1*"),
        (r#"(?is)<a [^>]*href="([^"]*)"[^>]*>(.*?)</a>"#, "[$2]($1)"),
        (r"(?is)<li[^>]*>(.*?)</li>", "\n- $1"),
        (r"(?is)<br\s*/?>", "\n"),
        (r"(?is)</p>", "\n\n"),
        (r"(?is)<blockquote[^>]*>(.*?)</blockquote>", "\n> $1\n"),
        (r"(?s)<[^>]+>", ""),
    ];
    for (pat, rep) in rules {
        s = regex::Regex::new(pat).unwrap().replace_all(&s, *rep).into_owned();
    }
    let s = s
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&");
    let lines: Vec<&str> = s.lines().map(str::trim_end).collect();
    let mut out = String::new();
    let mut blank = 0;
    for l in lines {
        if l.trim().is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
        } else {
            blank = 0;
        }
        out.push_str(l.trim_start_matches(' '));
        out.push('\n');
    }
    out.trim().to_string()
}

fn parse_date(raw: &str) -> (Option<i32>, Option<String>) {
    // Zotero stores "2017-06-12 June 12, 2017" (SQL date, then the original)
    let sql = raw.split_whitespace().next().unwrap_or("");
    let year = sql.get(..4).and_then(|y| y.parse().ok()).filter(|y| *y > 0);
    let parts: Vec<&str> = sql.split('-').filter(|p| !p.chars().all(|c| c == '0')).collect();
    let date = (parts.len() > 1).then(|| parts.join("-"));
    (year, date)
}

fn query<T>(
    c: &Connection,
    sql: &str,
    f: impl FnMut(&paperlines_core::rusqlite::Row) -> paperlines_core::rusqlite::Result<T>,
) -> Result<Vec<T>, String> {
    let mut stmt = c.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], f).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn has_table(c: &Connection, name: &str) -> bool {
    c.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [name],
        |_| Ok(()),
    )
    .is_ok()
}

/// Reads the whole library from a Zotero data folder (the one holding zotero.sqlite and storage/).
pub fn read(data_dir: &Path) -> Result<ZoteroLibrary, String> {
    let src = data_dir.join("zotero.sqlite");
    if !src.exists() {
        return Err(format!("No zotero.sqlite in {}", data_dir.display()));
    }
    let tmp = std::env::temp_dir().join(format!(
        "zotero-import-{}-{}.sqlite",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::copy(&src, &tmp).map_err(|e| format!("Could not copy zotero.sqlite: {e}"))?;
    let result = read_db(&tmp, data_dir);
    let _ = std::fs::remove_file(&tmp);
    result
}

fn read_db(db: &Path, data_dir: &Path) -> Result<ZoteroLibrary, String> {
    let c = Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Not a Zotero database: {e}"))?;
    let deleted = if has_table(&c, "deletedItems") {
        "(SELECT itemID FROM deletedItems)"
    } else {
        "(SELECT -1)"
    };

    let tops: Vec<(i64, String, String)> = query(
        &c,
        &format!(
            "SELECT i.itemID, i.key, t.typeName FROM items i JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
             WHERE t.typeName NOT IN ('attachment', 'note', 'annotation') AND i.itemID NOT IN {deleted} ORDER BY i.itemID"
        ),
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let mut fields: HashMap<i64, HashMap<String, String>> = HashMap::new();
    for (id, name, value) in query(
        &c,
        "SELECT d.itemID, f.fieldName, v.value FROM itemData d JOIN fields f ON f.fieldID = d.fieldID JOIN itemDataValues v ON v.valueID = d.valueID",
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
    )? {
        fields.entry(id).or_default().insert(name, value);
    }
    let mut people: HashMap<i64, Vec<(String, Author)>> = HashMap::new();
    for (id, first, last, mode, role) in query(
        &c,
        "SELECT ic.itemID, c.firstName, c.lastName, c.fieldMode, ct.creatorType FROM itemCreators ic
         JOIN creators c ON c.creatorID = ic.creatorID JOIN creatorTypes ct ON ct.creatorTypeID = ic.creatorTypeID
         ORDER BY ic.itemID, ic.orderIndex",
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<i64>>(3)?,
                r.get::<_, String>(4)?,
            ))
        },
    )? {
        let a = if mode == Some(1) {
            Author::new(&last.unwrap_or_default(), "")
        } else {
            Author::new(&last.unwrap_or_default(), &first.unwrap_or_default())
        };
        people.entry(id).or_default().push((role, a));
    }
    let mut tags: HashMap<i64, Vec<String>> = HashMap::new();
    for (id, name) in query(
        &c,
        "SELECT it.itemID, t.name FROM itemTags it JOIN tags t ON t.tagID = it.tagID",
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
    )? {
        tags.entry(id).or_default().push(name);
    }
    // collection paths
    let cols: Vec<(i64, String, Option<i64>)> = query(
        &c,
        "SELECT collectionID, collectionName, parentCollectionID FROM collections",
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let by_id: HashMap<i64, (String, Option<i64>)> = cols.iter().map(|(i, n, p)| (*i, (n.clone(), *p))).collect();
    let path_of = |mut id: i64| {
        let mut parts = Vec::new();
        for _ in 0..32 {
            let Some((n, p)) = by_id.get(&id) else { break };
            parts.push(n.clone());
            match p {
                Some(p) => id = *p,
                None => break,
            }
        }
        parts.reverse();
        parts.join(" / ")
    };
    let mut item_cols: HashMap<i64, Vec<String>> = HashMap::new();
    for (cid, iid) in query(&c, "SELECT collectionID, itemID FROM collectionItems", |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
    })? {
        item_cols.entry(iid).or_default().push(path_of(cid));
    }
    // attachments and their annotations
    let mut anns: HashMap<i64, Vec<ZAnnotation>> = HashMap::new();
    if has_table(&c, "itemAnnotations") {
        for (att, ty, text, comment, color, pos) in query(
            &c,
            &format!("SELECT parentItemID, type, text, comment, color, position FROM itemAnnotations WHERE itemID NOT IN {deleted}"),
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, Option<String>>(4)?, r.get::<_, String>(5)?)),
        )? {
            let kind = match ty {
                1 => "highlight",
                5 => "underline",
                3 => "rect",
                _ => continue,
            };
            let Ok(p) = serde_json::from_str::<Value>(&pos) else { continue };
            let page = p.get("pageIndex").and_then(Value::as_u64).unwrap_or(0) as u32 + 1;
            let rects: Vec<[f64; 4]> = p
                .get("rects")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|r| { let v: Vec<f64> = r.as_array()?.iter().filter_map(Value::as_f64).collect(); (v.len() == 4).then(|| [v[0], v[1], v[2], v[3]]) }).collect())
                .unwrap_or_default();
            if rects.is_empty() {
                continue;
            }
            anns.entry(att).or_default().push(ZAnnotation {
                page,
                kind: kind.into(),
                rects,
                text: text.filter(|t| !t.trim().is_empty()),
                comment: comment.map(|c| html_to_markdown(&c)).filter(|c| !c.trim().is_empty()),
                color: nearest_color(color.as_deref().unwrap_or("#ffd400")),
            });
        }
    }
    let mut atts: HashMap<i64, Vec<ZAttachment>> = HashMap::new();
    let mut missing: HashMap<i64, Vec<String>> = HashMap::new();
    for (aid, parent, link_mode, ctype, path, key) in query(
        &c,
        &format!(
            "SELECT a.itemID, a.parentItemID, a.linkMode, a.contentType, a.path, i.key FROM itemAttachments a JOIN items i ON i.itemID = a.itemID
             WHERE a.parentItemID IS NOT NULL AND a.itemID NOT IN {deleted}"
        ),
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, Option<String>>(4)?, r.get::<_, String>(5)?)),
    )? {
        let kind = match ctype.as_deref() {
            Some("application/pdf") => "pdf",
            Some("application/epub+zip") => "epub",
            _ => continue,
        };
        let Some(path) = path else { continue };
        let file = if let Some(rel) = path.strip_prefix("storage:") {
            Some(data_dir.join("storage").join(&key).join(rel))
        } else if link_mode == 2 && Path::new(&path).is_absolute() {
            Some(PathBuf::from(&path))
        } else {
            None
        };
        match file.filter(|f| f.exists()) {
            Some(f) => atts.entry(parent).or_default().push(ZAttachment { path: f, kind: kind.into(), annotations: anns.remove(&aid).unwrap_or_default() }),
            None => missing.entry(parent).or_default().push(path),
        }
    }
    let mut notes: HashMap<i64, Vec<String>> = HashMap::new();
    for (parent, html) in query(
        &c,
        &format!("SELECT parentItemID, note FROM itemNotes WHERE parentItemID IS NOT NULL AND itemID NOT IN {deleted}"),
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
    )? {
        let md = html_to_markdown(&html);
        if !md.is_empty() {
            notes.entry(parent).or_default().push(md);
        }
    }

    let mut lib = ZoteroLibrary {
        collections: cols.iter().map(|(i, _, _)| path_of(*i)).collect(),
        ..Default::default()
    };
    for (id, key, ty) in tops {
        let f = fields.remove(&id).unwrap_or_default();
        let get = |k: &str| f.get(k).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        let (year, pub_date) = get("date").map(|d| parse_date(&d)).unwrap_or((None, None));
        let extra = get("extra").unwrap_or_default();
        let extra_field = |name: &str| {
            extra.lines().find_map(|l| {
                l.split_once(':')
                    .filter(|(k, _)| k.trim().eq_ignore_ascii_case(name))
                    .map(|(_, v)| v.trim().to_string())
            })
        };
        let arxiv = get("archiveID")
            .and_then(|a| normalize_arxiv(&a))
            .or_else(|| extra_field("arXiv").and_then(|a| normalize_arxiv(&a)))
            .or_else(|| {
                get("url")
                    .filter(|u| u.contains("arxiv.org"))
                    .and_then(|u| normalize_arxiv(&u))
            });
        let ppl = people.remove(&id).unwrap_or_default();
        let by_role = |r: &str| {
            ppl.iter()
                .filter(|(role, _)| role == r)
                .map(|(_, a)| a.clone())
                .collect::<Vec<_>>()
        };
        let mut authors = by_role("author");
        if authors.is_empty() {
            authors = ppl
                .iter()
                .filter(|(r, _)| r != "editor")
                .map(|(_, a)| a.clone())
                .collect();
        }
        let input = ItemInput {
            item_type: item_type(&ty).into(),
            citekey: extra_field("Citation Key").filter(|k| !k.contains(' ')),
            title: get("title").unwrap_or_else(|| "Untitled".into()),
            authors,
            year,
            pub_date,
            venue: get("publicationTitle")
                .or_else(|| get("proceedingsTitle"))
                .or_else(|| get("bookTitle"))
                .or_else(|| get("websiteTitle"))
                .or_else(|| get("conferenceName")),
            doi: get("DOI")
                .and_then(|d| normalize_doi(&d))
                .or_else(|| extra_field("DOI").and_then(|d| normalize_doi(&d))),
            arxiv_id: arxiv,
            url: get("url"),
            abstract_text: get("abstractNote"),
            biblio: Biblio {
                volume: get("volume"),
                issue: get("issue"),
                pages: get("pages"),
                publisher: get("publisher")
                    .or_else(|| get("university"))
                    .or_else(|| get("institution")),
                place: get("place"),
                isbn: get("ISBN"),
                issn: get("ISSN"),
                edition: get("edition"),
                language: get("language"),
                series: get("series"),
                number: get("reportNumber").or_else(|| get("number")),
                editors: by_role("editor"),
            },
            ..Default::default()
        };
        lib.items.push(ZItem {
            key,
            input,
            tags: tags.remove(&id).unwrap_or_default(),
            collections: item_cols.remove(&id).unwrap_or_default(),
            attachments: atts.remove(&id).unwrap_or_default(),
            notes: notes.remove(&id).unwrap_or_default(),
            missing_files: missing.remove(&id).unwrap_or_default(),
        });
    }
    Ok(lib)
}

/// Builds a minimal Zotero-shaped database for tests (also used by the ops crate's tests).
#[doc(hidden)]
pub fn write_test_library(dir: &Path, pdf: &[u8]) {
    let c = Connection::open(dir.join("zotero.sqlite")).unwrap();
    c.execute_batch(
        "CREATE TABLE itemTypes(itemTypeID INTEGER PRIMARY KEY, typeName TEXT);
         INSERT INTO itemTypes VALUES (1,'journalArticle'),(2,'attachment'),(3,'note'),(4,'annotation'),(5,'book');
         CREATE TABLE items(itemID INTEGER PRIMARY KEY, itemTypeID INT, key TEXT, dateAdded TEXT);
         INSERT INTO items VALUES (1,1,'AAAA1111','2024-01-01'),(2,2,'BBBB2222','2024-01-01'),(3,3,'CCCC3333','2024-01-01'),
                                  (4,4,'DDDD4444','2024-01-01'),(5,5,'EEEE5555','2024-01-01'),(6,1,'FFFF6666','2024-01-01');
         CREATE TABLE deletedItems(itemID INT PRIMARY KEY);
         INSERT INTO deletedItems VALUES (6);
         CREATE TABLE fields(fieldID INTEGER PRIMARY KEY, fieldName TEXT);
         INSERT INTO fields VALUES (1,'title'),(2,'date'),(3,'DOI'),(4,'publicationTitle'),(5,'volume'),(6,'pages'),(7,'extra'),(8,'publisher'),(9,'ISBN');
         CREATE TABLE itemDataValues(valueID INTEGER PRIMARY KEY, value TEXT);
         INSERT INTO itemDataValues VALUES (1,'Attention Is All You Need'),(2,'2017-06-12 June 12, 2017'),(3,'10.5555/3295222'),
            (4,'NeurIPS'),(5,'30'),(6,'5998-6008'),(7,'Citation Key: vaswani2017attention\narXiv: 1706.03762'),
            (8,'Deep Learning'),(9,'2016-00-00 2016'),(10,'MIT Press'),(11,'9780262035613'),(12,'Deleted paper');
         CREATE TABLE itemData(itemID INT, fieldID INT, valueID INT);
         INSERT INTO itemData VALUES (1,1,1),(1,2,2),(1,3,3),(1,4,4),(1,5,5),(1,6,6),(1,7,7),(5,1,8),(5,2,9),(5,8,10),(5,9,11),(6,1,12);
         CREATE TABLE creatorTypes(creatorTypeID INTEGER PRIMARY KEY, creatorType TEXT);
         INSERT INTO creatorTypes VALUES (1,'author'),(2,'editor');
         CREATE TABLE creators(creatorID INTEGER PRIMARY KEY, firstName TEXT, lastName TEXT, fieldMode INT);
         INSERT INTO creators VALUES (1,'Ashish','Vaswani',0),(2,'Noam','Shazeer',0),(3,NULL,'Google Brain',1),(4,'Ian','Goodfellow',0),(5,'Jane','Editor',0);
         CREATE TABLE itemCreators(itemID INT, creatorID INT, creatorTypeID INT, orderIndex INT);
         INSERT INTO itemCreators VALUES (1,1,1,0),(1,2,1,1),(1,3,1,2),(5,4,1,0),(5,5,2,1);
         CREATE TABLE tags(tagID INTEGER PRIMARY KEY, name TEXT);
         INSERT INTO tags VALUES (1,'transformers'),(2,'nlp');
         CREATE TABLE itemTags(itemID INT, tagID INT, type INT);
         INSERT INTO itemTags VALUES (1,1,0),(1,2,0);
         CREATE TABLE collections(collectionID INTEGER PRIMARY KEY, collectionName TEXT, parentCollectionID INT, key TEXT);
         INSERT INTO collections VALUES (1,'Thesis',NULL,'K1'),(2,'Chapter 2',1,'K2');
         CREATE TABLE collectionItems(collectionID INT, itemID INT, orderIndex INT);
         INSERT INTO collectionItems VALUES (2,1,0),(1,5,0);
         CREATE TABLE itemAttachments(itemID INTEGER PRIMARY KEY, parentItemID INT, linkMode INT, contentType TEXT, path TEXT);
         INSERT INTO itemAttachments VALUES (2,1,0,'application/pdf','storage:attention.pdf');
         CREATE TABLE itemNotes(itemID INTEGER PRIMARY KEY, parentItemID INT, note TEXT, title TEXT);
         INSERT INTO itemNotes VALUES (3,1,'<div><h1>Reading notes</h1><p>Uses <strong>multi-head</strong> attention.</p><ul><li>Encoder</li><li>Decoder</li></ul></div>','Reading notes');
         CREATE TABLE itemAnnotations(itemID INTEGER PRIMARY KEY, parentItemID INT, type INT, text TEXT, comment TEXT, color TEXT, position TEXT);
         INSERT INTO itemAnnotations VALUES (4,2,1,'dispensing with recurrence','key claim','#ffd400','{\"pageIndex\":0,\"rects\":[[72,700,300,712]]}');",
    )
    .unwrap();
    let storage = dir.join("storage").join("BBBB2222");
    std::fs::create_dir_all(&storage).unwrap();
    std::fs::write(storage.join("attention.pdf"), pdf).unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_items_fields_people_tags_collections_files_notes_annotations() {
        let dir = tempfile::tempdir().unwrap();
        write_test_library(dir.path(), b"%PDF-1.4 fake");
        let lib = read(dir.path()).unwrap();
        assert_eq!(
            lib.items.len(),
            2,
            "attachments, notes, annotations and trashed items are not top-level"
        );
        let a = &lib.items[0];
        assert_eq!(a.input.title, "Attention Is All You Need");
        assert_eq!(a.input.citekey.as_deref(), Some("vaswani2017attention"));
        assert_eq!(
            (a.input.year, a.input.pub_date.as_deref()),
            (Some(2017), Some("2017-06-12"))
        );
        assert_eq!(a.input.arxiv_id.as_deref(), Some("1706.03762"));
        assert_eq!(a.input.authors[2], Author::new("Google Brain", ""));
        assert_eq!(
            (a.input.biblio.volume.as_deref(), a.input.biblio.pages.as_deref()),
            (Some("30"), Some("5998-6008"))
        );
        assert_eq!(a.tags, vec!["transformers", "nlp"]);
        assert_eq!(a.collections, vec!["Thesis / Chapter 2"]);
        assert_eq!(a.attachments.len(), 1);
        let ann = &a.attachments[0].annotations[0];
        assert_eq!(
            (ann.page, ann.kind.as_str(), ann.color.as_str()),
            (1, "highlight", "yellow")
        );
        assert_eq!(
            a.notes[0],
            "# Reading notes\n\nUses **multi-head** attention.\n\n- Encoder\n- Decoder"
        );
        let b = &lib.items[1];
        assert_eq!(
            (b.input.item_type.as_str(), b.input.year, b.input.pub_date.as_deref()),
            ("book", Some(2016), None)
        );
        assert_eq!(b.input.biblio.editors, vec![Author::new("Editor", "Jane")]);
        assert_eq!(b.input.biblio.publisher.as_deref(), Some("MIT Press"));
    }

    #[test]
    fn colors_and_dates() {
        assert_eq!(nearest_color("#ff6666"), "red");
        assert_eq!(nearest_color("#5fb236"), "green");
        assert_eq!(
            parse_date("2020-03-00 March 2020"),
            (Some(2020), Some("2020-03".into()))
        );
        assert!(read(Path::new("/nonexistent")).is_err());
    }
}
