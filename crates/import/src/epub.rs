//! EPUB metadata from the package document (OPF): title, creators, date, publisher, language,
//! ISBN/DOI, description. Reads the zip; never modifies it.
use paperlines_core::model::{Author, Biblio, ItemInput};
use paperlines_core::text::normalize_doi;
use regex::Regex;
use std::io::Read;
use std::path::Path;
use std::sync::OnceLock;

fn re(cell: &'static OnceLock<Regex>, p: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(p).unwrap())
}

fn unescape(s: &str) -> String {
    static TAG: OnceLock<Regex> = OnceLock::new();
    let strip = |x: &str| re(&TAG, r"<[^>]+>").replace_all(x, "").into_owned();
    // entity-encoded HTML (common in descriptions) only shows its tags after decoding
    let decoded = strip(s)
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&amp;", "&");
    strip(&decoded).split_whitespace().collect::<Vec<_>>().join(" ")
}

fn read_entry(zip: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Result<String, String> {
    let mut f = zip.by_name(name).map_err(|e| format!("{name}: {e}"))?;
    let mut s = String::new();
    f.read_to_string(&mut s).map_err(|e| format!("{name}: {e}"))?;
    Ok(s)
}

/// Parses an OPF package document into metadata.
pub fn parse_opf(opf: &str) -> ItemInput {
    static META: OnceLock<Regex> = OnceLock::new();
    let all = |tag: &str| -> Vec<(String, String)> {
        // (attributes, inner text) for every <dc:tag ...>text</dc:tag>
        let r = Regex::new(&format!(r"(?s)<dc:{tag}\b([^>]*)>(.*?)</dc:{tag}>")).unwrap();
        r.captures_iter(opf)
            .map(|c| (c[1].to_string(), unescape(&c[2])))
            .filter(|(_, t)| !t.is_empty())
            .collect()
    };
    let first = |tag: &str| all(tag).into_iter().next().map(|(_, t)| t);
    // EPUB 3 refines roles: <meta refines="#id" property="role">aut</meta>
    let roles: Vec<(String, String)> = re(
        &META,
        r##"(?s)<meta\b[^>]*refines="#([^"]+)"[^>]*property="role"[^>]*>(.*?)</meta>"##,
    )
    .captures_iter(opf)
    .map(|c| (c[1].to_string(), c[2].trim().to_string()))
    .collect();
    let (mut authors, mut editors) = (Vec::new(), Vec::new());
    let (id_re, role_re, file_as_re) = (
        Regex::new(r#"\bid="([^"]+)""#).unwrap(),
        Regex::new(r#"role="([^"]+)""#).unwrap(),
        Regex::new(r#"file-as="([^"]+)""#).unwrap(),
    );
    for (attrs, name) in all("creator") {
        let id = id_re.captures(&attrs).map(|c| c[1].to_string());
        let role = role_re
            .captures(&attrs)
            .map(|c| c[1].to_string())
            .or_else(|| id.and_then(|i| roles.iter().find(|(r, _)| *r == i).map(|(_, v)| v.clone())))
            .unwrap_or_else(|| "aut".into());
        let file_as = file_as_re.captures(&attrs).map(|c| unescape(&c[1]));
        let person = Author::parse(file_as.as_deref().filter(|f| f.contains(',')).unwrap_or(&name));
        match role.as_str() {
            "edt" => editors.push(person),
            "aut" => authors.push(person),
            _ => {}
        }
    }
    let date = first("date");
    let ids = all("identifier");
    let isbn = ids.iter().find_map(|(_, v)| {
        let digits: String = v.chars().filter(|c| c.is_ascii_digit() || *c == 'X').collect();
        let looks = v.to_lowercase().contains("isbn")
            || (digits.len() == 13 && (digits.starts_with("978") || digits.starts_with("979")));
        (looks && (digits.len() == 10 || digits.len() == 13)).then_some(digits)
    });
    let doi = ids
        .iter()
        .find_map(|(_, v)| normalize_doi(v.trim_start_matches("urn:doi:")));
    ItemInput {
        item_type: "book".into(),
        title: first("title").unwrap_or_default(),
        authors,
        year: date.as_deref().and_then(|d| d.get(..4)).and_then(|y| y.parse().ok()),
        pub_date: date.and_then(|d| d.get(..10).map(String::from).or(Some(d))),
        doi,
        abstract_text: first("description"),
        biblio: Biblio {
            publisher: first("publisher"),
            language: first("language"),
            isbn,
            editors,
            ..Default::default()
        },
        ..Default::default()
    }
}

/// Reads an .epub file's metadata.
pub fn extract(path: &Path) -> Result<ItemInput, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("Could not open EPUB: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Not an EPUB (zip): {e}"))?;
    let container = read_entry(&mut zip, "META-INF/container.xml")?;
    static ROOT: OnceLock<Regex> = OnceLock::new();
    let opf_path = re(&ROOT, r#"full-path="([^"]+)""#)
        .captures(&container)
        .map(|c| c[1].to_string())
        .ok_or("EPUB has no package document")?;
    Ok(parse_opf(&read_entry(&mut zip, &opf_path)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    const OPF: &str = r##"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Deep Learning &amp; You</dc:title>
    <dc:creator id="c1">Ian Goodfellow</dc:creator>
    <meta refines="#c1" property="role" scheme="marc:relators">aut</meta>
    <dc:creator opf:role="aut" opf:file-as="Bengio, Yoshua">Yoshua Bengio</dc:creator>
    <dc:creator id="e1">Jane Editor</dc:creator>
    <meta refines="#e1" property="role">edt</meta>
    <dc:date>2016-11-18T00:00:00Z</dc:date>
    <dc:publisher>MIT Press</dc:publisher>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">urn:uuid:1234</dc:identifier>
    <dc:identifier>urn:isbn:978-0-262-03561-3</dc:identifier>
    <dc:description>&lt;p&gt;An introduction.&lt;/p&gt;</dc:description>
  </metadata>
</package>"##;

    #[test]
    fn parses_opf_metadata() {
        let i = parse_opf(OPF);
        assert_eq!(i.title, "Deep Learning & You");
        assert_eq!(
            i.authors,
            vec![Author::new("Goodfellow", "Ian"), Author::new("Bengio", "Yoshua")]
        );
        assert_eq!(i.biblio.editors, vec![Author::new("Editor", "Jane")]);
        assert_eq!((i.year, i.pub_date.as_deref()), (Some(2016), Some("2016-11-18")));
        assert_eq!(i.biblio.isbn.as_deref(), Some("9780262035613"));
        assert_eq!(
            (i.biblio.publisher.as_deref(), i.biblio.language.as_deref()),
            (Some("MIT Press"), Some("en"))
        );
        assert_eq!(i.abstract_text.as_deref(), Some("An introduction."));
        assert_eq!(i.item_type, "book");
    }

    #[test]
    fn reads_a_real_zip() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("book.epub");
        let mut z = zip::ZipWriter::new(std::fs::File::create(&p).unwrap());
        let o = zip::write::SimpleFileOptions::default();
        z.start_file("mimetype", o).unwrap();
        z.write_all(b"application/epub+zip").unwrap();
        z.start_file("META-INF/container.xml", o).unwrap();
        z.write_all(br#"<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>"#)
            .unwrap();
        z.start_file("OEBPS/content.opf", o).unwrap();
        z.write_all(OPF.as_bytes()).unwrap();
        z.finish().unwrap();
        assert_eq!(extract(&p).unwrap().title, "Deep Learning & You");
        std::fs::write(dir.path().join("bad.epub"), b"nope").unwrap();
        assert!(extract(&dir.path().join("bad.epub")).is_err());
    }
}
