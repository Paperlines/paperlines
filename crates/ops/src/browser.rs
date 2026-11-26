//! The browser extension's side of Paperlines: Chrome-family native messaging.
//!
//! The extension never talks to a server. The browser starts the `paperlines` command-line tool
//! (registered by [`install`] as a native messaging host) and exchanges length-prefixed JSON
//! messages with it over stdin/stdout ([`read_message`], [`write_message`]). The tool opens the
//! library directly, so saving works whether or not the app is running; the app shows new papers
//! when it comes back to the front.
use crate::{summary, ItemSummary, Library};
use base64::Engine;
use paperlines_citations::edges;
use paperlines_core::items::{find_duplicate, get_item};
use paperlines_core::model::{Author, ItemInput};
use paperlines_core::{attachments, branding, settings, Error, Result};
use paperlines_import::pipeline::{self, Action, Candidate, Decision};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// What the extension found on the page: identifiers and the metadata journals publish in
/// `citation_*` meta tags.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Page {
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub pmid: Option<String>,
    pub title: Option<String>,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub url: Option<String>,
}

/// A message from the extension.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Request {
    /// Is the host there, and which library does it use?
    Ping,
    /// Is this page's paper already in the library?
    Lookup { page: Page },
    /// Add the page's paper; `pdf` is the PDF's bytes in base64.
    Save {
        page: Page,
        #[serde(default)]
        pdf: Option<String>,
    },
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Response {
    #[serde(rename_all = "camelCase")]
    Pong {
        app: String,
        version: String,
        library: String,
    },
    #[serde(rename_all = "camelCase")]
    Found {
        item: Option<ItemSummary>,
    },
    /// `added` false: it was already there (`pdfAttached` says whether its missing PDF was added).
    #[serde(rename_all = "camelCase")]
    Saved {
        item: ItemSummary,
        added: bool,
        pdf_attached: bool,
        warnings: Vec<String>,
    },
    Error {
        message: String,
    },
}

pub fn handle(lib: &mut Library, req: Request) -> Response {
    let r = match req {
        Request::Ping => Ok(Response::Pong {
            app: branding::DISPLAY_NAME.into(),
            version: env!("CARGO_PKG_VERSION").into(),
            library: lib.paths.root.to_string_lossy().into(),
        }),
        Request::Lookup { page } => lookup(lib, &page).map(|item| Response::Found { item }),
        Request::Save { page, pdf } => save(lib, &page, pdf.as_deref()),
    };
    r.unwrap_or_else(|e| Response::Error { message: e.to_string() })
}

/// The page's identifiers as an ItemInput, for duplicate checks and as a last-resort record.
fn page_input(page: &Page) -> ItemInput {
    ItemInput {
        item_type: "article".into(),
        title: page.title.clone().unwrap_or_default().trim().to_string(),
        authors: page.authors.iter().filter_map(|a| author(a)).collect(),
        year: page.year,
        venue: page.venue.clone().filter(|v| !v.trim().is_empty()),
        doi: page.doi.as_deref().and_then(paperlines_import::ids::find_doi),
        arxiv_id: page.arxiv_id.as_deref().and_then(paperlines_import::ids::find_arxiv),
        url: page.url.clone(),
        ..Default::default()
    }
}

/// "Family, Given" or "Given Family".
fn author(name: &str) -> Option<Author> {
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    Some(match name.split_once(',') {
        Some((family, given)) => Author::new(family.trim(), given.trim()),
        None => match name.rsplit_once(' ') {
            Some((given, family)) => Author::new(family.trim(), given.trim()),
            None => Author::new(name, ""),
        },
    })
}

fn lookup(lib: &Library, page: &Page) -> Result<Option<ItemSummary>> {
    let input = page_input(page);
    if input.doi.is_none() && input.arxiv_id.is_none() && input.title.is_empty() {
        return Ok(None);
    }
    Ok(match find_duplicate(lib.conn(), &input)? {
        Some(id) => get_item(lib.conn(), id)?
            .filter(|i| i.deleted_at.is_none())
            .map(|i| summary(&i)),
        None => None,
    })
}

/// The identifier to look the paper up by: DOI, then arXiv ID, then PubMed ID.
fn identifier(page: &Page) -> Option<String> {
    let input = page_input(page);
    input.doi.or(input.arxiv_id.map(|a| format!("arXiv:{a}"))).or(page
        .pmid
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| format!("pmid:{p}")))
}

/// Writes the PDF the browser sent to a temporary file, after checking it is one.
fn pdf_file(b64: &str) -> Result<tempfile_path::TempPdf> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|_| Error::msg("The PDF arrived damaged"))?;
    if !bytes.starts_with(b"%PDF-") {
        return Err(Error::msg(
            "That isn't a PDF (the site may have shown a login or download page instead)",
        ));
    }
    tempfile_path::TempPdf::write(&bytes)
}

fn save(lib: &mut Library, page: &Page, pdf: Option<&str>) -> Result<Response> {
    let offline = settings::load(lib.conn())?.offline_mode;
    let pdf = pdf.map(pdf_file).transpose()?;
    let mut warnings = Vec::new();

    // the paper: looked up by its identifier, else from the PDF, else from the page's own metadata
    let mut candidate: Option<Candidate> = None;
    if let Some(id) = identifier(page) {
        let pv = pipeline::preview_text(&id, offline, &|_, _| {});
        warnings.extend(pv.errors);
        candidate = pv.candidates.into_iter().next();
    }
    if candidate.is_none() {
        // no identifier on the page: the PDF's own DOI or arXiv ID (looked up) beats the page's
        // tags, but a PDF without one only knows its file name, so then the page's details win
        let from_pdf = pdf.as_ref().and_then(|p| {
            let pv = pipeline::preview_paths(std::slice::from_ref(&p.path), offline, &|_, _| {});
            pv.candidates.into_iter().next()
        });
        let page_has_title = !page_input(page).title.is_empty();
        candidate = match from_pdf {
            Some(c) if c.input.doi.is_some() || c.input.arxiv_id.is_some() || !page_has_title => Some(c),
            _ => None,
        };
    }
    let mut candidate = match candidate {
        Some(c) => c,
        None => {
            let input = page_input(page);
            if input.title.is_empty() {
                return Err(Error::msg("No DOI, arXiv ID, PubMed ID or PDF found on this page"));
            }
            let mut c = Candidate::from_input(input, "web");
            c.warnings
                .push("Saved from the page's own details; check them in the library".into());
            c
        }
    };
    // what the lookup didn't know, from the page
    candidate.input.fill_from(&page_input(page));
    if let Some(p) = &pdf {
        candidate.pdf_path = Some(p.path.to_string_lossy().into_owned());
    }
    warnings.extend(candidate.warnings.iter().cloned());

    pipeline::mark_duplicates(lib.conn(), std::slice::from_mut(&mut candidate))?;
    if let Some(id) = candidate.duplicate_of {
        // already there: keep it, and give it the PDF if it has none
        let mut pdf_attached = false;
        if let Some(p) = &pdf {
            let has_pdf = attachments::attachment_path(lib.conn(), &lib.paths.pdfs, id, "pdf")?.is_some();
            if !has_pdf {
                let stored = attachments::store_pdf(&lib.paths.pdfs, &p.path)?;
                let pages = paperlines_import::pdf::extract(&p.path).ok().and_then(|m| m.page_count);
                lib.db
                    .tx(|c| attachments::add_attachment(c, id, &stored, pages).map(|_| ()))?;
                pdf_attached = true;
            }
        }
        let item = get_item(lib.conn(), id)?.ok_or_else(|| Error::msg("Item not found"))?;
        return Ok(Response::Saved {
            item: summary(&item),
            added: false,
            pdf_attached,
            warnings,
        });
    }

    let r = pipeline::commit(
        &mut lib.db,
        &lib.paths,
        &[Decision {
            candidate,
            action: Action::Add,
        }],
    );
    if let Some(e) = r.errors.into_iter().next() {
        return Err(Error::msg(e));
    }
    let id = *r.added.first().ok_or_else(|| Error::msg("Nothing was added"))?;
    lib.db.tx(|c| edges::link_new_items(c, &[id]))?;
    let item = get_item(lib.conn(), id)?.ok_or_else(|| Error::msg("Item not found"))?;
    let pdf_attached = pdf.is_some() && item.has_pdf;
    Ok(Response::Saved {
        item: summary(&item),
        added: true,
        pdf_attached,
        warnings,
    })
}

/// A PDF from the browser, in a temporary file that is removed when dropped.
mod tempfile_path {
    use paperlines_core::Result;
    use std::path::PathBuf;

    pub struct TempPdf {
        pub path: PathBuf,
    }

    impl TempPdf {
        pub fn write(bytes: &[u8]) -> Result<TempPdf> {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default();
            let path = std::env::temp_dir().join(format!(
                "{}-browser-{}-{nanos}.pdf",
                paperlines_core::branding::BINARY_NAME,
                std::process::id()
            ));
            std::fs::write(&path, bytes)?;
            Ok(TempPdf { path })
        }
    }

    impl Drop for TempPdf {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

// --- native messaging: 32-bit native-endian length, then that many bytes of UTF-8 JSON ---

/// Messages from the browser are at most 4 GB by spec; a PDF in base64 is far below this cap.
const MAX_MESSAGE: u32 = 512 * 1024 * 1024;

/// The next message, or None when the browser closed the connection.
pub fn read_message(r: &mut impl Read) -> Result<Option<Request>> {
    let mut len = [0u8; 4];
    match r.read_exact(&mut len) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.into()),
    }
    let len = u32::from_ne_bytes(len);
    if len > MAX_MESSAGE {
        return Err(Error::msg("Message too large"));
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf)?;
    Ok(Some(
        serde_json::from_slice(&buf).map_err(|e| Error::msg(format!("Bad message: {e}")))?,
    ))
}

pub fn write_message(w: &mut impl Write, resp: &Response) -> Result<()> {
    let body = serde_json::to_vec(resp)?;
    w.write_all(&(body.len() as u32).to_ne_bytes())?;
    w.write_all(&body)?;
    w.flush()?;
    Ok(())
}

/// Serves the extension until it disconnects: the `paperlines` binary runs this when the browser
/// starts it with the extension's origin as its argument.
pub fn serve(lib: &mut Library, input: &mut impl Read, output: &mut impl Write) -> Result<()> {
    while let Some(req) = read_message(input)? {
        write_message(output, &handle(lib, req))?;
    }
    Ok(())
}

/// True when the browser started us as a native messaging host: its first argument is the
/// calling extension's origin.
pub fn is_host_invocation(args: &[String]) -> bool {
    args.get(1).is_some_and(|a| a.starts_with("chrome-extension://"))
}

// --- registering the host with each installed browser ---

/// "macos", "linux" or "windows", as [`install`] and [`status`] take it.
pub fn os_name() -> &'static str {
    match paperlines_core::platform::current_os() {
        paperlines_core::platform::Os::Macos => "macos",
        paperlines_core::platform::Os::Windows => "windows",
        paperlines_core::platform::Os::Linux => "linux",
    }
}

/// The path browsers should start: `exe`, except that a Nix store path (gone after an upgrade) is
/// replaced by the same program found on PATH outside the store (the profile's link).
pub fn stable_program(exe: PathBuf) -> PathBuf {
    if !exe.starts_with("/nix/store") {
        return exe;
    }
    let name = exe.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default()
        .into_iter()
        .map(|d| d.join(&name))
        .find(|p| p.exists() && !p.starts_with("/nix/store"))
        .unwrap_or(exe)
}

/// The home folder.
pub fn home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// The host's name, as the extension asks for it: the app ID ("dev.example.paperlines").
pub fn host_name() -> &'static str {
    branding::APP_ID
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserStatus {
    pub name: String,
    /// The browser is installed (its profile folder exists).
    pub installed: bool,
    /// Paperlines is registered with it.
    pub connected: bool,
}

/// (name, macOS folder under ~/Library/Application Support, Linux folder under ~/.config,
/// Windows registry key under HKCU\Software)
const BROWSERS: &[(&str, &str, &str, &str)] = &[
    ("Google Chrome", "Google/Chrome", "google-chrome", r"Google\Chrome"),
    ("Microsoft Edge", "Microsoft Edge", "microsoft-edge", r"Microsoft\Edge"),
    (
        "Brave",
        "BraveSoftware/Brave-Browser",
        "BraveSoftware/Brave-Browser",
        r"BraveSoftware\Brave-Browser",
    ),
    ("Arc", "Arc/User Data", "", ""),
    ("Vivaldi", "Vivaldi", "vivaldi", r"Vivaldi"),
    ("Chromium", "Chromium", "chromium", r"Chromium"),
];

/// Where a browser keeps its profile on this system (None: not on this OS).
fn browser_dir(home: &Path, os: &str, entry: &(&str, &str, &str, &str)) -> Option<PathBuf> {
    match os {
        "macos" if !entry.1.is_empty() => Some(home.join("Library/Application Support").join(entry.1)),
        "linux" if !entry.2.is_empty() => Some(home.join(".config").join(entry.2)),
        "windows" if !entry.3.is_empty() => {
            let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from)?;
            Some(local.join(entry.3).join("User Data"))
        }
        _ => None,
    }
}

/// The host manifest Chrome reads: which program to start, and which extensions may.
pub fn manifest(program: &Path) -> serde_json::Value {
    serde_json::json!({
        "name": host_name(),
        "description": format!("{} (save papers from the browser)", branding::DISPLAY_NAME),
        "path": program.to_string_lossy(),
        "type": "stdio",
        "allowed_origins": branding::BROWSER_EXTENSION_IDS
            .iter()
            .map(|id| format!("chrome-extension://{id}/"))
            .collect::<Vec<_>>(),
    })
}

fn manifest_file_name() -> String {
    format!("{}.json", host_name())
}

/// Which browsers are installed, and which already know Paperlines.
pub fn status(home: &Path, os: &str, config_dir: &Path) -> Vec<BrowserStatus> {
    BROWSERS
        .iter()
        .filter_map(|b| {
            let dir = browser_dir(home, os, b)?;
            let connected = if os == "windows" {
                windows::registered(b.3) && config_dir.join(manifest_file_name()).exists()
            } else {
                dir.join("NativeMessagingHosts").join(manifest_file_name()).exists()
            };
            Some(BrowserStatus {
                name: b.0.into(),
                installed: dir.exists(),
                connected,
            })
        })
        .collect()
}

/// Registers `program` (the `paperlines` binary) as the native messaging host with every
/// installed Chrome-family browser. On Windows the manifest lives in `config_dir` and each
/// browser's registry key points at it.
pub fn install(home: &Path, os: &str, config_dir: &Path, program: &Path) -> Result<Vec<BrowserStatus>> {
    let body = serde_json::to_string_pretty(&manifest(program))? + "\n";
    let mut any = false;
    if os == "windows" {
        std::fs::create_dir_all(config_dir)?;
        let file = config_dir.join(manifest_file_name());
        std::fs::write(&file, &body)?;
        for b in BROWSERS {
            if browser_dir(home, os, b).is_some_and(|d| d.exists()) {
                windows::register(b.3, &file)?;
                any = true;
            }
        }
    } else {
        for b in BROWSERS {
            let Some(dir) = browser_dir(home, os, b).filter(|d| d.exists()) else {
                continue;
            };
            let hosts = dir.join("NativeMessagingHosts");
            std::fs::create_dir_all(&hosts)?;
            std::fs::write(hosts.join(manifest_file_name()), &body)?;
            any = true;
        }
    }
    if !any {
        return Err(Error::msg(
            "No Chrome, Edge, Brave, Arc, Vivaldi or Chromium found. Install one and open it once, then try again.",
        ));
    }
    Ok(status(home, os, config_dir))
}

/// Windows keeps native messaging hosts in the registry (HKCU), written with `reg.exe`.
mod windows {
    use paperlines_core::{branding, Error, Result};
    use std::path::Path;

    fn key(browser: &str) -> String {
        format!(r"HKCU\Software\{browser}\NativeMessagingHosts\{}", branding::APP_ID)
    }

    pub fn register(browser: &str, manifest: &Path) -> Result<()> {
        let out = std::process::Command::new("reg")
            .args(["add", &key(browser), "/ve", "/t", "REG_SZ", "/d"])
            .arg(manifest)
            .arg("/f")
            .output()?;
        if !out.status.success() {
            return Err(Error::msg(format!(
                "Couldn't register with {browser}: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            )));
        }
        Ok(())
    }

    pub fn registered(browser: &str) -> bool {
        cfg!(windows)
            && std::process::Command::new("reg")
                .args(["query", &key(browser), "/ve"])
                .output()
                .is_ok_and(|o| o.status.success())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lib() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let lib = Library::open(Some(&dir.path().join("lib"))).unwrap();
        // no network in tests
        paperlines_core::settings::apply(
            lib.conn(),
            &paperlines_core::settings::SettingsPatch {
                offline_mode: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        (dir, lib)
    }

    fn page() -> Page {
        Page {
            doi: Some("https://doi.org/10.48550/arXiv.1706.03762".into()),
            title: Some("Attention Is All You Need".into()),
            authors: vec!["Vaswani, Ashish".into(), "Noam Shazeer".into()],
            year: Some(2017),
            venue: Some("NeurIPS".into()),
            url: Some("https://example.org/paper".into()),
            ..Default::default()
        }
    }

    #[test]
    fn messages_round_trip_through_the_native_framing() {
        let msg = br#"{"type":"ping"}"#;
        let mut input = (msg.len() as u32).to_ne_bytes().to_vec();
        input.extend_from_slice(msg);
        let (_d, mut lib) = lib();
        let mut out = Vec::new();
        serve(&mut lib, &mut input.as_slice(), &mut out).unwrap();
        let len = u32::from_ne_bytes(out[..4].try_into().unwrap()) as usize;
        let v: serde_json::Value = serde_json::from_slice(&out[4..4 + len]).unwrap();
        assert_eq!(v["type"], "pong");
        assert_eq!(v["app"], branding::DISPLAY_NAME);
        assert_eq!(out.len(), 4 + len, "exactly one reply");
    }

    #[test]
    fn saves_a_page_and_knows_it_afterwards() {
        let (_d, mut lib) = lib();
        assert_eq!(
            handle(&mut lib, Request::Lookup { page: page() }),
            Response::Found { item: None }
        );
        // offline: the DOI can't be looked up, so the page's own details are used
        let Response::Saved {
            item,
            added,
            pdf_attached,
            ..
        } = handle(
            &mut lib,
            Request::Save {
                page: page(),
                pdf: None,
            },
        )
        else {
            panic!("not saved")
        };
        assert!(added && !pdf_attached);
        assert_eq!(item.title, "Attention Is All You Need");
        assert!(item.authors.contains("Vaswani"));
        assert_eq!(item.year, Some(2017));
        let full = get_item(lib.conn(), item.id).unwrap().unwrap();
        assert_eq!(full.doi.as_deref(), Some("10.48550/arxiv.1706.03762"));
        // now it's known, by DOI or by title
        let Response::Found { item: Some(found) } = handle(&mut lib, Request::Lookup { page: page() }) else {
            panic!("not found")
        };
        assert_eq!(found.id, item.id);
        // saving again doesn't duplicate it
        let Response::Saved { added, .. } = handle(
            &mut lib,
            Request::Save {
                page: page(),
                pdf: None,
            },
        ) else {
            panic!()
        };
        assert!(!added);
        assert_eq!(paperlines_core::items::list_items(lib.conn()).unwrap().len(), 1);
    }

    /// A minimal one-page PDF.
    fn tiny_pdf() -> String {
        let pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
        base64::engine::general_purpose::STANDARD.encode(pdf)
    }

    #[test]
    fn keeps_the_pdf_with_the_paper() {
        let (_d, mut lib) = lib();
        // saved with its PDF: one paper, PDF attached
        let Response::Saved {
            item,
            added,
            pdf_attached,
            ..
        } = handle(
            &mut lib,
            Request::Save {
                page: page(),
                pdf: Some(tiny_pdf()),
            },
        )
        else {
            panic!("not saved")
        };
        assert!(added && pdf_attached && item.has_pdf);
        assert_eq!(paperlines_core::items::list_items(lib.conn()).unwrap().len(), 1);

        // a paper saved earlier without its PDF gets it the second time, still one paper
        let (_d2, mut lib) = super::tests::lib();
        let other = Page {
            doi: Some("10.1000/xyz123".into()),
            title: Some("Another paper".into()),
            ..page()
        };
        let Response::Saved { item, .. } = handle(
            &mut lib,
            Request::Save {
                page: other.clone(),
                pdf: None,
            },
        ) else {
            panic!()
        };
        assert!(!item.has_pdf);
        let Response::Saved {
            item,
            added,
            pdf_attached,
            ..
        } = handle(
            &mut lib,
            Request::Save {
                page: other,
                pdf: Some(tiny_pdf()),
            },
        )
        else {
            panic!()
        };
        assert!(!added && pdf_attached && item.has_pdf);
        assert_eq!(paperlines_core::items::list_items(lib.conn()).unwrap().len(), 1);
    }

    #[test]
    fn a_page_without_identifiers_keeps_its_own_details_with_the_pdf() {
        let (_d, mut lib) = lib();
        let page = Page {
            title: Some("Native Messaging for Reference Managers".into()),
            authors: vec!["Lovelace, Ada".into()],
            year: Some(2024),
            venue: Some("Journal of Tests".into()),
            ..Default::default()
        };
        // the tiny PDF has no title or DOI of its own: the page's details are used
        let Response::Saved {
            item,
            added,
            pdf_attached,
            ..
        } = handle(
            &mut lib,
            Request::Save {
                page: page.clone(),
                pdf: Some(tiny_pdf()),
            },
        )
        else {
            panic!("not saved")
        };
        assert!(added && pdf_attached);
        assert_eq!(item.title, "Native Messaging for Reference Managers");
        assert_eq!(item.year, Some(2024));
        // and the next visit finds it
        let Response::Found { item: Some(found) } = handle(&mut lib, Request::Lookup { page }) else {
            panic!("not found again")
        };
        assert_eq!(found.id, item.id);
    }

    #[test]
    fn refuses_what_isnt_a_pdf_or_a_paper() {
        let (_d, mut lib) = lib();
        let html = base64::engine::general_purpose::STANDARD.encode(b"<html>Sign in</html>");
        let r = handle(
            &mut lib,
            Request::Save {
                page: page(),
                pdf: Some(html),
            },
        );
        assert!(
            matches!(r, Response::Error { ref message } if message.contains("isn't a PDF")),
            "{r:?}"
        );
        let r = handle(
            &mut lib,
            Request::Save {
                page: Page::default(),
                pdf: None,
            },
        );
        assert!(
            matches!(r, Response::Error { ref message } if message.contains("No DOI")),
            "{r:?}"
        );
    }

    #[test]
    fn reads_author_names_either_way() {
        assert_eq!(author("Vaswani, Ashish"), Some(Author::new("Vaswani", "Ashish")));
        assert_eq!(author("Ashish Vaswani"), Some(Author::new("Vaswani", "Ashish")));
        assert_eq!(author("Plato"), Some(Author::new("Plato", "")));
        assert_eq!(author("  "), None);
    }

    #[test]
    fn recognizes_being_started_by_the_browser() {
        let args = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(is_host_invocation(&args(&["paperlines", "chrome-extension://abc/"])));
        assert!(is_host_invocation(&args(&[
            "paperlines",
            "chrome-extension://abc/",
            "--parent-window=0"
        ])));
        assert!(!is_host_invocation(&args(&["paperlines", "search", "x"])));
    }

    #[test]
    fn registers_with_installed_browsers_only() {
        let home = tempfile::tempdir().unwrap();
        let config = home.path().join("config");
        let program = Path::new("/opt/paperlines/bin/paperlines");
        // nothing installed: a clear error
        assert!(install(home.path(), "linux", &config, program).is_err());
        // Chrome and Brave installed
        std::fs::create_dir_all(home.path().join(".config/google-chrome")).unwrap();
        std::fs::create_dir_all(home.path().join(".config/BraveSoftware/Brave-Browser")).unwrap();
        let st = install(home.path(), "linux", &config, program).unwrap();
        let connected: Vec<_> = st.iter().filter(|b| b.connected).map(|b| b.name.as_str()).collect();
        assert_eq!(connected, ["Google Chrome", "Brave"]);
        assert!(!st.iter().find(|b| b.name == "Microsoft Edge").unwrap().installed);
        let m: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(
                home.path()
                    .join(".config/google-chrome/NativeMessagingHosts")
                    .join(manifest_file_name()),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(m["name"], host_name());
        assert_eq!(m["path"], "/opt/paperlines/bin/paperlines");
        assert_eq!(m["type"], "stdio");
        // every allowed extension: the zip's fixed ID and the Chrome Web Store's
        let origins: Vec<_> = m["allowed_origins"]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o.as_str().unwrap())
            .collect();
        for id in branding::BROWSER_EXTENSION_IDS {
            assert!(origins.contains(&format!("chrome-extension://{id}/").as_str()), "{id}");
        }
        // macOS keeps them under Application Support; Arc is macOS-only
        let mac = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(mac.path().join("Library/Application Support/Arc/User Data")).unwrap();
        install(mac.path(), "macos", &config, program).unwrap();
        assert!(mac
            .path()
            .join("Library/Application Support/Arc/User Data/NativeMessagingHosts")
            .join(manifest_file_name())
            .exists());
    }
}
