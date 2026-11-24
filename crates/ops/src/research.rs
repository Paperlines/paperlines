//! What an assistant needs to work on the user's research: projects and their papers, an overview
//! of the library (to infer interests), notes it can read, create and add to (never overwrite),
//! and the Suggestions inbox it posts to.
use crate::{resolve, select, summary, Library, Scope};
use paperlines_core::model::Item;
use paperlines_core::notes::{self, NewNote, Note, NoteRef};
use paperlines_core::rusqlite::Connection;
use paperlines_core::suggestions::{self, NewSuggestion};
use paperlines_core::{projects, spine, tags, Error, Result};
use serde_json::{json, Value};

fn project_by_name(conn: &Connection, name: &str) -> Result<projects::ProjectInfo> {
    projects::list(conn)?
        .into_iter()
        .find(|p| p.name.eq_ignore_ascii_case(name.trim()))
        .ok_or_else(|| Error::msg(format!("No project called “{name}”")))
}

fn spine_json(conn: &Connection, project: i64, items: &[Item]) -> Result<Vec<Value>> {
    let key = |id: i64| items.iter().find(|i| i.id == id).map(|i| i.citekey.clone());
    Ok(spine::get(conn, project)?
        .into_iter()
        .enumerate()
        .map(|(n, st)| {
            json!({
                "step": n + 1,
                "label": st.label,
                "papers": st.items.iter().filter_map(|i| key(*i)).collect::<Vec<_>>(),
            })
        })
        .collect())
}

/// The project's own note (one per project), if it has one.
fn project_note(conn: &Connection, project: i64) -> Result<Option<Note>> {
    for r in notes::list(conn, None)? {
        if r.kind == "project" && r.project_id == Some(project) {
            return notes::get(conn, r.note_id).map(Some);
        }
    }
    Ok(None)
}

/// Every project: name, description, paper count, key papers and waiting suggestions.
pub fn projects_overview(conn: &Connection) -> Result<Vec<Value>> {
    let waiting: std::collections::HashMap<i64, i64> = suggestions::count_new(conn)?.into_iter().collect();
    let mut out = Vec::new();
    for p in projects::list(conn)? {
        let items = select(conn, &Scope::Project(p.name.clone()))?;
        out.push(json!({
            "name": p.name,
            "description": p.description,
            "papers": items.len(),
            "keyPapers": spine_json(conn, p.id, &items)?,
            "hasNote": project_note(conn, p.id)?.is_some(),
            "waitingSuggestions": waiting.get(&p.id).copied().unwrap_or(0),
        }));
    }
    Ok(out)
}

/// One project in full: its papers (with read status and tags), key papers, note and inbox.
pub fn project_detail(conn: &Connection, name: &str) -> Result<Value> {
    let p = project_by_name(conn, name)?;
    let items = select(conn, &Scope::Project(p.name.clone()))?;
    let papers: Vec<Value> = items
        .iter()
        .map(|i| {
            json!({
                "citekey": i.citekey,
                "title": i.title,
                "authors": summary(i).authors,
                "year": i.year,
                "readStatus": i.read_status,
                "tags": i.tags,
                "hasNote": notes::paper_note(conn, i.id).map(|n| !n.body.trim().is_empty()).unwrap_or(false),
            })
        })
        .collect();
    let note = project_note(conn, p.id)?;
    let waiting = suggestions::list(conn, Some(p.id), Some("new"))?;
    Ok(json!({
        "name": p.name,
        "description": p.description,
        "papers": papers,
        "keyPapers": spine_json(conn, p.id, &items)?,
        "note": note.map(|n| json!({"title": n.title, "body": n.body})),
        "waitingSuggestions": waiting.iter().map(|s| json!({"title": s.title, "doi": s.doi, "reason": s.reason})).collect::<Vec<_>>(),
    }))
}

/// The shape of the library, to infer what the user works on: projects, most used tags, newest papers.
pub fn library_overview(conn: &Connection) -> Result<Value> {
    let items = paperlines_core::items::list_items(conn)?;
    let mut t = tags::list(conn)?;
    t.sort_by(|a, b| b.count.cmp(&a.count).then(a.path.cmp(&b.path)));
    let mut newest = items.clone();
    newest.sort_by(|a, b| b.date_added.cmp(&a.date_added));
    let mut by_status = std::collections::BTreeMap::new();
    for i in &items {
        *by_status.entry(i.read_status.clone()).or_insert(0usize) += 1;
    }
    Ok(json!({
        "papers": items.len(),
        "readStatus": by_status,
        "projects": projects::list(conn)?.into_iter().map(|p| json!({"name": p.name, "description": p.description, "papers": p.count})).collect::<Vec<_>>(),
        "topTags": t.iter().take(25).map(|t| json!({"tag": t.path, "papers": t.count})).collect::<Vec<_>>(),
        "newest": newest.iter().take(15).map(|i| json!({"citekey": i.citekey, "title": i.title, "year": i.year, "venue": i.venue})).collect::<Vec<_>>(),
        // what each highlight colour means to this user (for add_highlights)
        "highlightColors": paperlines_core::settings::load(conn)?.highlight_colors.iter().map(|c| json!({"color": c.color, "meaning": c.label})).collect::<Vec<_>>(),
    }))
}

/// Free and project notes (paper notes are reached through their paper).
pub fn list_notes(conn: &Connection) -> Result<Vec<NoteRef>> {
    notes::list(conn, None)
}

/// A note by citekey (that paper's note), number, or title (free or project note; a project's
/// name finds its note).
pub fn find_note(conn: &Connection, target: &str) -> Result<Note> {
    let t = target.trim();
    if let Ok(id) = t.parse::<i64>() {
        if let Ok(n) = notes::get(conn, id) {
            return Ok(n);
        }
    }
    if let Ok(item) = resolve(conn, t) {
        return notes::paper_note(conn, item.id);
    }
    let lower = t.to_lowercase();
    for r in notes::list(conn, None)? {
        if r.title.to_lowercase() == lower {
            return notes::get(conn, r.note_id);
        }
    }
    // a project's name: its note, whatever that note is titled
    if let Ok(p) = project_by_name(conn, t) {
        if let Some(n) = project_note(conn, p.id)? {
            return Ok(n);
        }
    }
    Err(Error::msg(format!(
        "No note or paper called “{t}” (use a citekey, a note title or a project name)"
    )))
}

/// A new free note, or the project's note (a project has one: adding to it is `append_to_note`).
pub fn create_note(lib: &mut Library, title: &str, body: &str, project: Option<&str>) -> Result<Note> {
    let title = title.trim();
    if title.is_empty() {
        return Err(Error::msg("The note needs a title"));
    }
    let project = match project.map(str::trim).filter(|p| !p.is_empty()) {
        Some(name) => {
            let p = project_by_name(lib.conn(), name)?;
            if project_note(lib.conn(), p.id)?.is_some() {
                return Err(Error::msg(format!(
                    "“{}” already has a project note: add to it with append_to_note",
                    p.name
                )));
            }
            Some(p.id)
        }
        None => {
            if notes::list(lib.conn(), None)?
                .iter()
                .any(|n| n.title.eq_ignore_ascii_case(title))
            {
                return Err(Error::msg(format!(
                    "A note called “{title}” exists: add to it with append_to_note, or choose another title"
                )));
            }
            None
        }
    };
    let n = NewNote {
        kind: if project.is_some() { "project" } else { "free" }.into(),
        item_id: None,
        project_id: project,
        highlight_id: None,
        title: Some(title.to_string()),
        body: body.trim_end().to_string() + "\n",
    };
    lib.db.tx(|c| notes::create(c, &n))
}

/// Adds Markdown at the end of a note (a paper's, a free or a project note). Never replaces.
pub fn append_to_note(lib: &mut Library, target: &str, markdown: &str) -> Result<Note> {
    let add = markdown.trim();
    if add.is_empty() {
        return Err(Error::msg("Nothing to add"));
    }
    let note = find_note(lib.conn(), target)?;
    let mut body = note.body.trim_end().to_string();
    if !body.is_empty() {
        // keep a list a list; anything else starts a new paragraph
        let list = add.starts_with("- ") || add.starts_with("* ");
        body.push_str(
            if list && body.lines().last().is_some_and(|l| l.trim_start().starts_with("- ")) {
                "\n"
            } else {
                "\n\n"
            },
        );
    }
    body.push_str(add);
    body.push('\n');
    lib.db.tx(|c| notes::save_body(c, note.id, &body))
}

/// A paper's PDF as text, page by page (pages `from..=to`, capped so one answer stays readable).
pub fn read_pdf(lib: &Library, key: &str, from: Option<u32>, to: Option<u32>) -> Result<Value> {
    let item = resolve(lib.conn(), key)?;
    let att = paperlines_core::highlights::pdf_attachment(lib.conn(), item.id)?
        .ok_or_else(|| Error::msg(format!("{} has no PDF", item.citekey)))?;
    let path = paperlines_core::attachments::stored_path(&lib.paths.pdfs, &att.hash);
    let total = paperlines_import::pdf::page_count(&path).map_err(Error::msg)?;
    let from = from.unwrap_or(1).max(1);
    let to = to.unwrap_or(total).min(total);
    let mut pages = Vec::new();
    let mut chars = 0;
    let mut last = from.saturating_sub(1);
    for (p, text) in paperlines_import::pdf::page_texts(&path, from, to).map_err(Error::msg)? {
        // about 60k characters per answer; the rest is a call away
        if chars > 0 && chars + text.len() > 60_000 {
            break;
        }
        chars += text.len();
        last = p;
        pages.push(json!({ "page": p, "text": text }));
    }
    Ok(json!({
        "citekey": item.citekey,
        "title": item.title,
        "pages": total,
        "from": from,
        "to": last,
        "more": (last < to).then(|| format!("Pages {}–{to} not included: call again with from={}", last + 1, last + 1)),
        "text": pages,
    }))
}

/// A paper's highlights (id, page, colour, text, comment, placed or not), for linking notes to them.
pub fn list_highlights(conn: &Connection, key: &str) -> Result<Vec<Value>> {
    let item = resolve(conn, key)?;
    Ok(paperlines_core::highlights::list_for_item(conn, item.id)?
        .into_iter()
        .map(|h| {
            json!({
                "id": h.id, "page": h.page, "kind": h.kind, "color": h.color,
                "text": h.text, "comment": h.comment, "placed": !h.rects.is_empty(),
                "link": format!("[p. {}](#hl-{})", h.page, h.id),
            })
        })
        .collect())
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct NewQuote {
    /// The passage, word for word from the PDF's text.
    pub quote: String,
    pub page: i64,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub comment: Option<String>,
}

/// Highlights passages by quoting them (the reader places them on the page next time the PDF is
/// open). Returns each highlight with the Markdown link a note uses to point at it.
pub fn add_highlights(lib: &mut Library, key: &str, quotes: &[NewQuote]) -> Result<Vec<Value>> {
    let item = resolve(lib.conn(), key)?;
    let mut out = Vec::new();
    for q in quotes {
        let color = q.color.as_deref().unwrap_or("yellow");
        let h = lib.db.tx(|c| {
            paperlines_core::highlights::create_pending(c, item.id, q.page, &q.quote, color, q.comment.as_deref())
        })?;
        out.push(json!({
            "id": h.id, "page": h.page, "color": h.color, "text": h.text,
            "link": format!("[p. {}](#hl-{})", h.page, h.id),
        }));
    }
    Ok(out)
}

/// Puts suggestions in a project's inbox (None: the library's). Nothing enters the library.
pub fn post_suggestions(
    lib: &mut Library,
    project: Option<&str>,
    list: &[NewSuggestion],
) -> Result<suggestions::Added> {
    let id = match project.map(str::trim).filter(|p| !p.is_empty()) {
        Some(name) => Some(project_by_name(lib.conn(), name)?.id),
        None => None,
    };
    // papers already in the library are not suggestions
    let library = paperlines_core::items::list_items(lib.conn())?;
    let in_library = |s: &NewSuggestion| {
        let d = s.doi.as_deref().and_then(paperlines_core::text::normalize_doi);
        let a = s.arxiv_id.as_deref().and_then(paperlines_core::text::normalize_arxiv);
        let t = paperlines_core::text::normalize_title(&s.title);
        library.iter().any(|i| {
            (d.is_some() && i.doi.as_deref().and_then(paperlines_core::text::normalize_doi) == d)
                || (a.is_some() && i.arxiv_id == a)
                || (!t.is_empty() && paperlines_core::text::normalize_title(&i.title) == t)
        })
    };
    let fresh: Vec<NewSuggestion> = list.iter().filter(|s| !in_library(s)).cloned().collect();
    let skipped_in_library = list.len() - fresh.len();
    let mut r = lib.db.tx(|c| suggestions::add_many(c, id, &fresh))?;
    r.skipped += skipped_in_library;
    Ok(r)
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_core::items::insert_item;
    use paperlines_core::model::ItemInput;

    #[test]
    fn notes_are_created_and_added_to_never_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::open(Some(dir.path())).unwrap();
        let id = lib
            .db
            .tx(|c| {
                let id = insert_item(
                    c,
                    &ItemInput {
                        title: "Woodpile photonic crystals".into(),
                        year: Some(2004),
                        ..Default::default()
                    },
                )?;
                let p = projects::create(c, "MPL", Some("Two-photon lithography"))?;
                projects::add_items(c, p, &[id])?;
                Ok(id)
            })
            .unwrap();
        let key = paperlines_core::items::get_item(lib.conn(), id)
            .unwrap()
            .expect("item")
            .citekey;
        // a paper note grows
        append_to_note(&mut lib, &key, "- **Key idea:** woodpiles").unwrap();
        let n = append_to_note(&mut lib, &key, "- **Method:** DLW in SU-8").unwrap();
        assert_eq!(n.body, "- **Key idea:** woodpiles\n- **Method:** DLW in SU-8\n");
        // a free note, then text added as a new paragraph
        create_note(&mut lib, "Reading plan", "First the reviews.", None).unwrap();
        assert!(
            create_note(&mut lib, "reading plan", "again", None).is_err(),
            "no two notes with one title"
        );
        let n = append_to_note(&mut lib, "Reading plan", "Then the methods.").unwrap();
        assert_eq!(n.body, "First the reviews.\n\nThen the methods.\n");
        // the project note: once, then appended to; a project's name finds it
        create_note(&mut lib, "MPL synthesis", "## Where the field is", Some("mpl")).unwrap();
        assert!(create_note(&mut lib, "Another", "x", Some("MPL")).is_err());
        assert!(append_to_note(&mut lib, "MPL", "More.")
            .unwrap()
            .body
            .ends_with("More.\n"));
        let d = project_detail(lib.conn(), "MPL").unwrap();
        assert_eq!(d["papers"][0]["hasNote"], true);
        assert_eq!(d["note"]["title"], "MPL synthesis");
        assert!(append_to_note(&mut lib, "nothing like this", "x").is_err());
    }

    #[test]
    fn quoted_highlights_wait_to_be_placed_and_give_note_links() {
        use paperlines_core::attachments::{add_attachment_of_kind, store_file};
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::open(Some(dir.path())).unwrap();
        let file = dir.path().join("p.pdf");
        std::fs::write(&file, b"%PDF-1.4 bytes").unwrap();
        let stored = store_file(&lib.paths.pdfs, &file, "pdf").unwrap();
        let id = lib
            .db
            .tx(|c| {
                let id = insert_item(
                    c,
                    &ItemInput {
                        title: "Woodpiles".into(),
                        year: Some(2004),
                        ..Default::default()
                    },
                )?;
                add_attachment_of_kind(c, id, &stored, Some(4), "pdf")?;
                Ok(id)
            })
            .unwrap();
        let key = paperlines_core::items::get_item(lib.conn(), id)
            .unwrap()
            .expect("item")
            .citekey;
        let q = |quote: &str, page: i64, color: Option<&str>| NewQuote {
            quote: quote.into(),
            page,
            color: color.map(String::from),
            comment: None,
        };
        let made = add_highlights(
            &mut lib,
            &key,
            &[
                q("stop bands at  telecom\nwavelengths", 1, None),
                q("SU-8 resist", 2, Some("green")),
            ],
        )
        .unwrap();
        assert_eq!(made.len(), 2);
        let link = made[0]["link"].as_str().unwrap().to_string();
        assert!(link.starts_with("[p. 1](#hl-"));
        assert_eq!(made[0]["text"], "stop bands at telecom wavelengths");
        // they wait for the reader to place them
        let list = list_highlights(lib.conn(), &key).unwrap();
        assert!(list.iter().all(|h| h["placed"] == false));
        let hid = made[0]["id"].as_i64().unwrap();
        lib.db
            .tx(|c| {
                paperlines_core::highlights::place(
                    c,
                    hid,
                    1,
                    &[paperlines_core::highlights::Rect {
                        x: 0.1,
                        y: 0.2,
                        w: 0.5,
                        h: 0.02,
                    }],
                )
            })
            .unwrap();
        assert_eq!(list_highlights(lib.conn(), &key).unwrap()[0]["placed"], true);
        // the note points at them
        let n = append_to_note(&mut lib, &key, &format!("- **Claim:** telecom stop bands {link}")).unwrap();
        assert!(n.body.contains("(#hl-"));
        // a page past the end, an unknown colour, or no PDF are refused
        assert!(add_highlights(&mut lib, &key, &[q("text here", 9, None)]).is_err());
        assert!(add_highlights(&mut lib, &key, &[q("text here", 1, Some("magenta"))]).is_err());
    }

    #[test]
    fn suggestions_skip_papers_already_in_the_library() {
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::open(Some(dir.path())).unwrap();
        lib.db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "Have it".into(),
                        doi: Some("10.1/have".into()),
                        ..Default::default()
                    },
                )?;
                projects::create(c, "MPL", None)
            })
            .unwrap();
        let s = |doi: &str, t: &str| NewSuggestion {
            doi: Some(doi.into()),
            title: t.into(),
            reason: Some("why".into()),
            ..Default::default()
        };
        let r = post_suggestions(
            &mut lib,
            Some("MPL"),
            &[s("10.1/HAVE", "Have it"), s("10.1/new", "New one")],
        )
        .unwrap();
        assert_eq!((r.added, r.skipped), (1, 1));
        assert_eq!(projects_overview(lib.conn()).unwrap()[0]["waitingSuggestions"], 1);
        assert!(post_suggestions(&mut lib, Some("Nope"), &[]).is_err());
        assert_eq!(library_overview(lib.conn()).unwrap()["papers"], 1);
    }
}
