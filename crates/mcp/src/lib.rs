//! A Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0). It never opens a
//! network socket. Tools wrap `paperlines-ops`, so answers match the CLI and the app.
use paperlines_core::branding;
use paperlines_ops::{self as ops, Direction, Format, Library, Scope};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

pub const PROTOCOL_VERSIONS: &[&str] = &["2025-06-18", "2025-03-26", "2024-11-05"];

fn tool(name: &str, description: &str, props: Value, required: &[&str], read_only: bool) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": { "type": "object", "properties": props, "required": required, "additionalProperties": false },
        "annotations": { "readOnlyHint": read_only, "destructiveHint": false, "openWorldHint": false },
    })
}

pub fn tools() -> Value {
    let key =
        json!({ "type": "string", "description": "Citekey (e.g. vaswani2017attention), DOI, arXiv ID or numeric id" });
    json!([
        tool(
            "search_library",
            "Search the user's reference library. Supports free text and qualifiers: tag:ml/nlp project:\"Thesis\" author:hinton year:>=2020 year:2018..2020 is:unread|reading|read has:pdf cites:<citekey> cited-by:<citekey>, and -term to exclude. Empty query lists the newest papers.",
            json!({ "query": { "type": "string" }, "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 20 } }),
            &["query"],
            true,
        ),
        tool("get_item", "Full metadata for one paper plus its paper note, highlight count and citation counts.", json!({ "key": key }), &["key"], true),
        tool(
            "get_paper_note",
            "The user's paper note as Markdown: a generated header (title, authors, dates) as front matter, then the user's bullets.",
            json!({ "key": key }),
            &["key"],
            true,
        ),
        tool(
            "list_citations",
            "Papers in the library that this paper cites (direction \"cites\") or that cite it (\"cited_by\"). Only library papers are included.",
            json!({ "key": key, "direction": { "type": "string", "enum": ["cites", "cited_by"] } }),
            &["key", "direction"],
            true,
        ),
        tool(
            "find_citing_papers",
            "Papers anywhere (not only in the library) that cite this paper, from OpenAlex or Semantic Scholar. Uses the network unless a recent copy is cached; fails in offline mode without one. Sort \"connected\" ranks papers that also cite other papers in the user's library first: the best candidates for what to read next.",
            json!({
                "key": key,
                "sort": { "type": "string", "enum": ["cited", "newest", "connected"], "default": "cited" },
                "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 20 }
            }),
            &["key"],
            true,
        ),
        tool(
            "search_online",
            "Search for papers beyond the library: OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC (life sciences, free full text), DataCite (datasets and software) and DOAJ (open-access journals) at once, merged and ranked. Results say which are already in the library. Uses the network; fails in offline mode. To add papers, give the user their DOIs/arXiv IDs to import.",
            json!({
                "query": { "type": "string" },
                "limit": { "type": "integer", "minimum": 1, "maximum": 50, "default": 15 }
            }),
            &["query"],
            true,
        ),
        tool(
            "list_relations",
            "The user's typed connections of a paper (extends, contradicts, replicates, applies method of, or their own types), both directions, with notes and evidence quotes. Unlike list_citations these are judgments the user recorded.",
            json!({ "key": key }),
            &["key"],
            true,
        ),
        tool(
            "add_relation",
            "Record a typed connection between two library papers, e.g. from=chen2022 type=extends to=smith2021. Types: extends, contradicts, replicates, applies-method, or one the user made (see list_relations output). Only add one the user asked for or confirmed.",
            json!({
                "from": key,
                "type": { "type": "string" },
                "to": key,
                "note": { "type": "string", "description": "Why, in a sentence (optional)" }
            }),
            &["from", "type", "to"],
            false,
        ),
        tool(
            "add_bullet",
            "Append one bullet point to a paper's note. Write it as the user would: short, specific, Markdown allowed ([[citekey]] links, $math$).",
            json!({ "key": key, "text": { "type": "string", "description": "Bullet text without the leading dash" } }),
            &["key", "text"],
            false,
        ),
        tool(
            "format_citation",
            "Format papers as an in-text citation or a reference list in a citation style (apa, ieee, chicago-author-date, nature, mla, vancouver, ...). Defaults to the user's chosen style.",
            json!({
                "keys": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
                "style": { "type": "string" },
                "mode": { "type": "string", "enum": ["citation", "bibliography"], "default": "citation" }
            }),
            &["keys"],
            true,
        ),
        tool(
            "export_bibliography",
            "Export references as BibTeX, CSL-JSON, RIS or a Markdown reference list, for a project, a search query, or given keys.",
            json!({
                "format": { "type": "string", "enum": ["bibtex", "csl-json", "ris", "markdown"] },
                "project": { "type": "string" },
                "query": { "type": "string" },
                "keys": { "type": "array", "items": { "type": "string" } }
            }),
            &["format"],
            true,
        ),
        // ---- projects, interests, suggestions ----
        tool(
            "list_projects",
            "The user's projects: name, description, number of papers, key papers (the spine, in steps), whether it has a project note, and waiting suggestions.",
            json!({}),
            &[],
            true,
        ),
        tool(
            "get_project",
            "One project in full: its papers (citekey, title, authors, year, read status, tags, whether the paper has notes), key papers in steps, the project note, and suggestions waiting in its inbox.",
            json!({ "project": { "type": "string", "description": "Project name (case does not matter)" } }),
            &["project"],
            true,
        ),
        tool(
            "library_overview",
            "The shape of the user's library, to understand what they work on: number of papers, read status, projects, most used tags and the newest papers.",
            json!({}),
            &[],
            true,
        ),
        tool(
            "suggest_papers",
            "Suggest papers the user doesn't have yet, each with reasons: papers their papers keep citing (from cached reference lists), papers that cite several of them and papers OpenAlex calls related (network), and, with a topic, matches from an online search. Start from a project, from some papers (keys), or from the whole library. Papers in the library or already suggested for that project (also dismissed ones) are left out.",
            json!({
                "project": { "type": "string" },
                "keys": { "type": "array", "items": { "type": "string" }, "description": "Citekeys to start from instead of a project" },
                "topic": { "type": "string", "description": "Optional subject to search for as well" },
                "limit": { "type": "integer", "minimum": 1, "maximum": 50, "default": 15 }
            }),
            &[],
            true,
        ),
        tool(
            "post_suggestions",
            "Put suggested papers in a project's Suggestions inbox in the app, where the user adds or dismisses each one. Nothing is added to the library. Give each paper a DOI or arXiv ID when known, its title, and one sentence on why it fits. Without a project, they go to the library's inbox.",
            json!({
                "project": { "type": "string" },
                "papers": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "doi": { "type": "string" }, "arxivId": { "type": "string" },
                            "title": { "type": "string" }, "authors": { "type": "string" },
                            "year": { "type": "integer" }, "venue": { "type": "string" },
                            "reason": { "type": "string" }
                        },
                        "required": ["title"]
                    }
                }
            }),
            &["papers"],
            false,
        ),
        // ---- reading the PDF, highlighting passages ----
        tool(
            "read_pdf",
            "A paper's PDF as text, page by page (with page numbers), to read it and to quote passages exactly. Long papers come in parts: call again with `from` for the rest.",
            json!({
                "key": key,
                "from": { "type": "integer", "minimum": 1 },
                "to": { "type": "integer", "minimum": 1 }
            }),
            &["key"],
            true,
        ),
        tool(
            "list_highlights",
            "A paper's highlights: id, page, colour, highlighted text, comment, and the Markdown link `[p. N](#hl-ID)` a note uses to point at it.",
            json!({ "key": key }),
            &["key"],
            true,
        ),
        tool(
            "add_highlights",
            "Highlight passages in a paper's PDF by quoting them word for word from read_pdf, with their page. The app places each one on the page the next time the PDF is open. Colours carry meanings: yellow = key idea, green = method, blue = definition, red = disagree, purple = question; the user may have named these differently or added orange, pink, teal, lime, brown or gray (library_overview lists them). Returns each highlight's link `[p. N](#hl-ID)` to put in a note. Ask before highlighting.",
            json!({
                "key": key,
                "highlights": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "quote": { "type": "string", "description": "The exact words, one to three sentences" },
                            "page": { "type": "integer", "minimum": 1 },
                            "color": { "type": "string", "enum": ["yellow", "green", "blue", "red", "purple", "orange", "pink", "teal", "lime", "brown", "gray"] },
                            "comment": { "type": "string" }
                        },
                        "required": ["quote", "page"]
                    }
                }
            }),
            &["key", "highlights"],
            false,
        ),
        // ---- notes ----
        tool(
            "list_notes",
            "The user's free notes and project notes (title, kind, first line). Paper notes belong to their paper: read them with get_paper_note.",
            json!({}),
            &[],
            true,
        ),
        tool(
            "get_note",
            "Read a note as Markdown: give a note title, a project name (its project note) or a citekey (that paper's note).",
            json!({ "note": { "type": "string" } }),
            &["note"],
            true,
        ),
        tool(
            "create_note",
            "Create a new note in Markdown ([[citekey]] and [[note title]] links, @citekey citations, $math$ and $$display math$$ work). With a project, it becomes that project's note (a project has one). Show the user the text and ask before creating it.",
            json!({
                "title": { "type": "string" },
                "body": { "type": "string", "description": "Markdown" },
                "project": { "type": "string" }
            }),
            &["title", "body"],
            false,
        ),
        tool(
            "append_to_note",
            "Add Markdown to the end of a note: a paper's note (give its citekey), a free note (its title) or a project note (the project's name). Never replaces what is there. Show the user the text and ask before adding it.",
            json!({
                "note": { "type": "string" },
                "markdown": { "type": "string" }
            }),
            &["note", "markdown"],
            false,
        ),
    ])
}

fn opt<'a>(args: &'a Value, k: &str) -> Option<&'a str> {
    args.get(k)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
}

fn pretty(v: &Value) -> String {
    serde_json::to_string_pretty(v).unwrap_or_default()
}

fn s<'a>(args: &'a Value, k: &str) -> Result<&'a str, String> {
    args.get(k)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Missing argument: {k}"))
}

/// Runs one tool; errors become tool results with isError (per the MCP spec), not protocol errors.
pub fn call_tool(lib: &mut Library, name: &str, args: &Value) -> Value {
    let result: Result<(String, Value), String> = (|| match name {
        "search_library" => {
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(20).clamp(1, 200) as usize;
            let r = ops::search(lib.conn(), s(args, "query")?, limit).map_err(|e| e.to_string())?;
            let mut text = format!("{} of {} results\n", r.results.len(), r.total);
            for w in &r.warnings {
                text.push_str(&format!("warning: {w}\n"));
            }
            for i in &r.results {
                text.push_str(&format!(
                    "- {} ({}, {}) {}\n",
                    i.citekey,
                    i.authors,
                    i.year.map(|y| y.to_string()).unwrap_or_else(|| "n.d.".into()),
                    i.title
                ));
            }
            Ok((text, serde_json::to_value(&r).map_err(|e| e.to_string())?))
        }
        "get_item" => {
            let v = ops::item_detail(lib.conn(), s(args, "key")?).map_err(|e| e.to_string())?;
            Ok((serde_json::to_string_pretty(&v).unwrap_or_default(), v))
        }
        "get_paper_note" => {
            let (item, note, md) = ops::paper_note(lib.conn(), s(args, "key")?).map_err(|e| e.to_string())?;
            Ok((
                md.clone(),
                json!({ "citekey": item.citekey, "title": item.title, "body": note.body, "markdown": md }),
            ))
        }
        "list_citations" => {
            let dir = match s(args, "direction")? {
                "cites" => Direction::Cites,
                "cited_by" => Direction::CitedBy,
                d => return Err(format!("direction must be cites or cited_by, not {d}")),
            };
            let list = ops::citations(lib.conn(), s(args, "key")?, dir).map_err(|e| e.to_string())?;
            let text = if list.is_empty() {
                "No papers in the library.".to_string()
            } else {
                list.iter()
                    .map(|i| {
                        format!(
                            "- {} ({}) {}",
                            i.citekey,
                            i.year.map(|y| y.to_string()).unwrap_or_default(),
                            i.title
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            Ok((text, json!({ "papers": list })))
        }
        "find_citing_papers" => {
            let sort = match args.get("sort").and_then(Value::as_str).unwrap_or("cited") {
                "cited" => ops::CitingSort::Cited,
                "newest" => ops::CitingSort::Newest,
                "connected" => ops::CitingSort::Connected,
                o => return Err(format!("sort must be cited, newest or connected, not {o}")),
            };
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(20).clamp(1, 200) as usize;
            let config = paperlines_core::platform::app_dirs()
                .map(|d| d.config)
                .ok_or("No home folder")?;
            let r = ops::citing_papers(lib, s(args, "key")?, false, sort, limit, &config).map_err(|e| e.to_string())?;
            let mut text = format!(
                "{} papers cite {} (source: {}); showing {}\n",
                r.total,
                r.paper.citekey,
                r.source,
                r.papers.len()
            );
            for p in &r.papers {
                text.push_str(&format!(
                    "- {} ({}, {} citations) {}{}{}\n",
                    p.doi.as_deref().or(p.arxiv_id.as_deref()).unwrap_or("no id"),
                    p.year.map(|y| y.to_string()).unwrap_or_else(|| "n.d.".into()),
                    p.cited_by_count.unwrap_or(0),
                    p.title,
                    p.in_library
                        .as_ref()
                        .map(|k| format!(" [in library: {k}]"))
                        .unwrap_or_default(),
                    if p.connected.is_empty() {
                        String::new()
                    } else {
                        format!(" [also cites {}]", p.connected.join(", "))
                    }
                ));
            }
            Ok((text, serde_json::to_value(&r).map_err(|e| e.to_string())?))
        }
        "search_online" => {
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(15).clamp(1, 50) as usize;
            let config = paperlines_core::platform::app_dirs()
                .map(|d| d.config)
                .ok_or("No home folder")?;
            let mut r = ops::discover::search(lib, s(args, "query")?, &[], &config).map_err(|e| e.to_string())?;
            r.hits.truncate(limit);
            let mut text = String::new();
            for e in &r.errors {
                text.push_str(&format!("({} unavailable: {})\n", e.source, e.message));
            }
            for h in &r.hits {
                text.push_str(&format!(
                    "- {} ({}, {} citations) {}{}\n",
                    h.hit
                        .doi
                        .as_deref()
                        .or(h.hit.arxiv_id.as_deref())
                        .or(h.hit.pmid.as_deref())
                        .unwrap_or("no id"),
                    h.hit.year.map(|y| y.to_string()).unwrap_or_else(|| "n.d.".into()),
                    h.hit.cited_by_count.unwrap_or(0),
                    h.hit.title,
                    if h.in_library.is_some() { " [in library]" } else { "" }
                ));
            }
            Ok((text, serde_json::to_value(&r).map_err(|e| e.to_string())?))
        }
        "list_relations" => {
            use paperlines_core::relations;
            let item = ops::resolve(lib.conn(), s(args, "key")?).map_err(|e| e.to_string())?;
            let list = relations::for_item(lib.conn(), item.id).map_err(|e| e.to_string())?;
            let keys: std::collections::HashMap<i64, String> = paperlines_core::items::list_items(lib.conn())
                .map_err(|e| e.to_string())?
                .into_iter()
                .map(|i| (i.id, i.citekey))
                .collect();
            let rows: Vec<Value> = list
                .iter()
                .map(|v| json!({"relation": v.label, "paper": keys.get(&v.other_item_id), "note": v.relation.note, "evidence": v.evidence_text}))
                .collect();
            let text = if rows.is_empty() {
                format!("{} has no typed connections.", item.citekey)
            } else {
                list.iter()
                    .map(|v| {
                        format!(
                            "- {} {} {}{}",
                            item.citekey,
                            v.label.to_lowercase(),
                            keys.get(&v.other_item_id).map(String::as_str).unwrap_or("?"),
                            v.relation
                                .note
                                .as_deref()
                                .map(|n| format!(" — {n}"))
                                .unwrap_or_default()
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            Ok((text, json!({ "relations": rows })))
        }
        "add_relation" => {
            use paperlines_core::relations;
            let a = ops::resolve(lib.conn(), s(args, "from")?).map_err(|e| e.to_string())?;
            let b = ops::resolve(lib.conn(), s(args, "to")?).map_err(|e| e.to_string())?;
            let t = relations::find_type(lib.conn(), s(args, "type")?).map_err(|e| e.to_string())?;
            let note = args.get("note").and_then(Value::as_str);
            let r = lib
                .db
                .tx(|c| relations::add(c, a.id, b.id, t.id, note, None))
                .map_err(|e| e.to_string())?;
            Ok((
                format!("Recorded: {} {} {}", a.citekey, t.label.to_lowercase(), b.citekey),
                json!({ "id": r.id }),
            ))
        }
        "add_bullet" => {
            let note = ops::add_bullet(lib, s(args, "key")?, s(args, "text")?).map_err(|e| e.to_string())?;
            Ok((
                format!("Added. The paper note now reads:\n{}", note.body),
                json!({ "body": note.body }),
            ))
        }
        "format_citation" => {
            let keys: Vec<String> = args
                .get("keys")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
                .unwrap_or_default();
            if keys.is_empty() {
                return Err("keys must name at least one paper".into());
            }
            let items = keys
                .iter()
                .map(|k| ops::resolve(lib.conn(), k))
                .collect::<paperlines_core::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?;
            let style = args
                .get("style")
                .and_then(Value::as_str)
                .map(String::from)
                .unwrap_or_else(|| {
                    paperlines_core::settings::load(lib.conn())
                        .map(|s| s.citation_style)
                        .unwrap_or_else(|_| "apa".into())
                });
            let f = if args.get("mode").and_then(Value::as_str) == Some("bibliography") {
                ops::cite::bibliography(&items, &style)
            } else {
                ops::cite::citation(&items, &style)
            }
            .map_err(|e| e.to_string())?;
            Ok((
                f.text.clone(),
                json!({ "style": style, "text": f.text, "html": f.html }),
            ))
        }
        "export_bibliography" => {
            let format = Format::parse(s(args, "format")?).map_err(|e| e.to_string())?;
            if format == Format::Json {
                return Err("Use bibtex, csl-json, ris or markdown".into());
            }
            let scope = if let Some(p) = args.get("project").and_then(Value::as_str) {
                Scope::Project(p.into())
            } else if let Some(q) = args.get("query").and_then(Value::as_str) {
                Scope::Query(q.into())
            } else if let Some(k) = args.get("keys").and_then(Value::as_array) {
                Scope::Keys(k.iter().filter_map(Value::as_str).map(String::from).collect())
            } else {
                Scope::All
            };
            let out = ops::export_items(lib.conn(), format, &scope).map_err(|e| e.to_string())?;
            Ok((out.clone(), json!({ "format": s(args, "format")?, "content": out })))
        }
        "list_projects" => {
            let v = json!({ "projects": ops::research::projects_overview(lib.conn()).map_err(|e| e.to_string())? });
            Ok((pretty(&v), v))
        }
        "get_project" => {
            let v = ops::research::project_detail(lib.conn(), s(args, "project")?).map_err(|e| e.to_string())?;
            Ok((pretty(&v), v))
        }
        "library_overview" => {
            let v = ops::research::library_overview(lib.conn()).map_err(|e| e.to_string())?;
            Ok((pretty(&v), v))
        }
        "suggest_papers" => {
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(15).clamp(1, 50) as usize;
            let keys: Vec<String> = args
                .get("keys")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
                .unwrap_or_default();
            let seeds = match (opt(args, "project"), keys.is_empty()) {
                (Some(p), _) => ops::suggest::Seeds::Project(p.into()),
                (None, false) => ops::suggest::Seeds::Keys(keys),
                (None, true) => ops::suggest::Seeds::Library,
            };
            let config = paperlines_core::platform::app_dirs()
                .map(|d| d.config)
                .ok_or("No home folder")?;
            let r = ops::suggest::suggest(lib, seeds, opt(args, "topic"), limit, &config).map_err(|e| e.to_string())?;
            let mut text = String::new();
            for n in &r.notes {
                text.push_str(&format!("({n})\n"));
            }
            if r.papers.is_empty() {
                text.push_str("No new papers to suggest.\n");
            }
            for p in &r.papers {
                text.push_str(&format!(
                    "- {} ({}{}) {} — {}\n",
                    p.doi.as_deref().or(p.arxiv_id.as_deref()).unwrap_or("no id"),
                    p.year.map(|y| y.to_string()).unwrap_or_else(|| "n.d.".into()),
                    p.cited_by_count.map(|c| format!(", {c} citations")).unwrap_or_default(),
                    p.title,
                    p.reasons.join("; ")
                ));
            }
            Ok((text, serde_json::to_value(&r).map_err(|e| e.to_string())?))
        }
        "post_suggestions" => {
            let papers: Vec<paperlines_core::suggestions::NewSuggestion> = args
                .get("papers")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|p| serde_json::from_value(p.clone()).ok())
                        .collect()
                })
                .unwrap_or_default();
            if papers.is_empty() {
                return Err("papers must hold at least one paper with a title".into());
            }
            let project = opt(args, "project");
            let r = ops::research::post_suggestions(lib, project, &papers).map_err(|e| e.to_string())?;
            let place = project
                .map(|p| format!("the “{p}” inbox"))
                .unwrap_or_else(|| "the library's inbox".into());
            Ok((
                format!(
                    "{} suggestion(s) put in {place} for the user to review in the app; {} skipped (already there, dismissed before, or in the library).",
                    r.added, r.skipped
                ),
                serde_json::to_value(&r).map_err(|e| e.to_string())?,
            ))
        }
        "read_pdf" => {
            let n = |k: &str| args.get(k).and_then(Value::as_u64).map(|v| v as u32);
            let v = ops::research::read_pdf(lib, s(args, "key")?, n("from"), n("to")).map_err(|e| e.to_string())?;
            let mut text = format!("{} — {} pages\n", v["title"].as_str().unwrap_or(""), v["pages"]);
            for p in v["text"].as_array().into_iter().flatten() {
                text.push_str(&format!(
                    "\n--- page {} ---\n{}\n",
                    p["page"],
                    p["text"].as_str().unwrap_or("")
                ));
            }
            if let Some(m) = v["more"].as_str() {
                text.push_str(&format!("\n({m})\n"));
            }
            Ok((text, v))
        }
        "list_highlights" => {
            let list = ops::research::list_highlights(lib.conn(), s(args, "key")?).map_err(|e| e.to_string())?;
            let text = if list.is_empty() {
                "No highlights yet.".to_string()
            } else {
                list.iter()
                    .map(|h| {
                        format!(
                            "- {} {} {}: “{}”{}",
                            h["link"].as_str().unwrap_or(""),
                            h["color"].as_str().unwrap_or(""),
                            if h["placed"] == true { "" } else { "(not placed yet)" },
                            h["text"].as_str().unwrap_or(""),
                            h["comment"].as_str().map(|c| format!(" — {c}")).unwrap_or_default()
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            Ok((text, json!({ "highlights": list })))
        }
        "add_highlights" => {
            let quotes: Vec<ops::research::NewQuote> = args
                .get("highlights")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|q| serde_json::from_value(q.clone()).ok())
                        .collect()
                })
                .unwrap_or_default();
            if quotes.is_empty() {
                return Err("highlights must hold at least one {quote, page}".into());
            }
            let made = ops::research::add_highlights(lib, s(args, "key")?, &quotes).map_err(|e| e.to_string())?;
            let mut text = format!(
                "Highlighted {} passage(s); they appear on the page next time the PDF is open. Links for the note:\n",
                made.len()
            );
            for h in &made {
                text.push_str(&format!(
                    "- {} “{}”\n",
                    h["link"].as_str().unwrap_or(""),
                    h["text"].as_str().unwrap_or("")
                ));
            }
            Ok((text, json!({ "highlights": made })))
        }
        "list_notes" => {
            let list = ops::research::list_notes(lib.conn()).map_err(|e| e.to_string())?;
            let text = if list.is_empty() {
                "No free or project notes yet.".to_string()
            } else {
                list.iter()
                    .map(|n| format!("- {} ({}): {}", n.title, n.kind, n.snippet))
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            Ok((text, json!({ "notes": list })))
        }
        "get_note" => {
            let n = ops::research::find_note(lib.conn(), s(args, "note")?).map_err(|e| e.to_string())?;
            Ok((
                if n.body.trim().is_empty() {
                    "(empty note)".to_string()
                } else {
                    n.body.clone()
                },
                json!({ "id": n.id, "kind": n.kind, "title": n.title, "body": n.body }),
            ))
        }
        "create_note" => {
            let n = ops::research::create_note(lib, s(args, "title")?, s(args, "body")?, opt(args, "project"))
                .map_err(|e| e.to_string())?;
            Ok((
                format!("Created the note “{}”.", n.title.clone().unwrap_or_default()),
                json!({ "id": n.id, "kind": n.kind, "title": n.title }),
            ))
        }
        "append_to_note" => {
            let n = ops::research::append_to_note(lib, s(args, "note")?, s(args, "markdown")?)
                .map_err(|e| e.to_string())?;
            Ok((
                format!("Added. The note now reads:\n{}", n.body),
                json!({ "id": n.id, "body": n.body }),
            ))
        }
        other => Err(format!("Unknown tool: {other}")),
    })();
    match result {
        Ok((text, structured)) => {
            json!({ "content": [{ "type": "text", "text": text }], "structuredContent": structured, "isError": false })
        }
        Err(e) => json!({ "content": [{ "type": "text", "text": e }], "isError": true }),
    }
}

fn error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// Handles one JSON-RPC message; returns the response, or None for notifications.
pub fn handle(lib: &mut Library, msg: &Value) -> Option<Value> {
    let id = msg.get("id").cloned();
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    let params = msg.get("params").cloned().unwrap_or(Value::Null);
    // notifications (e.g. notifications/initialized) get no reply
    let id = id?;
    let result = match method {
        "initialize" => {
            let asked = params
                .get("protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or(PROTOCOL_VERSIONS[0]);
            let version = if PROTOCOL_VERSIONS.contains(&asked) {
                asked
            } else {
                PROTOCOL_VERSIONS[0]
            };
            json!({
                "protocolVersion": version,
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": branding::BINARY_NAME, "title": branding::DISPLAY_NAME, "version": env!("CARGO_PKG_VERSION") },
                "instructions": format!("Tools for the user's {} reference library: search papers, read and write notes (create, append; never overwrite), see projects and what the library is about, follow citations, suggest new papers with reasons and put them in a project's Suggestions inbox for the user to review, format citations and export bibliographies. Papers are identified by citekey. Ask before writing notes.", branding::DISPLAY_NAME),
            })
        }
        "ping" => json!({}),
        "tools/list" => json!({ "tools": tools() }),
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            call_tool(lib, name, &args)
        }
        _ => return Some(error(id, -32601, &format!("Method not found: {method}"))),
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

/// Serves until stdin closes.
pub fn serve(lib: &mut Library, input: impl BufRead, mut output: impl Write) -> std::io::Result<()> {
    for line in input.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(Value::Array(batch)) => {
                let out: Vec<Value> = batch.iter().filter_map(|m| handle(lib, m)).collect();
                (!out.is_empty()).then_some(Value::Array(out))
            }
            Ok(msg) => handle(lib, &msg),
            Err(e) => Some(error(Value::Null, -32700, &format!("Parse error: {e}"))),
        };
        if let Some(r) = reply {
            writeln!(output, "{}", serde_json::to_string(&r).unwrap_or_default())?;
            output.flush()?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use paperlines_core::items::insert_item;
    use paperlines_core::model::{Author, ItemInput};

    fn run(lines: &[Value]) -> Vec<Value> {
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::open(Some(dir.path())).unwrap();
        lib.db
            .tx(|c| {
                insert_item(
                    c,
                    &ItemInput {
                        title: "Attention Is All You Need".into(),
                        authors: vec![Author::new("Vaswani", "Ashish")],
                        year: Some(2017),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        let input = lines.iter().map(|l| l.to_string()).collect::<Vec<_>>().join("\n") + "\nnot json\n";
        let mut out = Vec::new();
        serve(&mut lib, input.as_bytes(), &mut out).unwrap();
        String::from_utf8(out)
            .unwrap()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }

    /// Calls tools in order on a library with one paper in a project "MPL" (offline mode).
    fn call_all(calls: &[(&str, Value)]) -> Vec<Value> {
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::open(Some(dir.path())).unwrap();
        lib.db
            .tx(|c| {
                let id = insert_item(
                    c,
                    &ItemInput {
                        title: "Woodpile photonic crystals".into(),
                        authors: vec![Author::new("Deubel", "Markus")],
                        year: Some(2004),
                        doi: Some("10.1038/nmat1155".into()),
                        ..Default::default()
                    },
                )?;
                let p = paperlines_core::projects::create(c, "MPL", Some("Two-photon lithography"))?;
                paperlines_core::projects::add_items(c, p, &[id])?;
                paperlines_core::settings::apply(
                    c,
                    &paperlines_core::settings::SettingsPatch {
                        offline_mode: Some(true),
                        ..Default::default()
                    },
                )?;
                Ok(())
            })
            .unwrap();
        calls
            .iter()
            .map(|(name, args)| call_tool(&mut lib, name, args))
            .collect()
    }

    fn text(v: &Value) -> &str {
        v["content"][0]["text"].as_str().unwrap_or("")
    }

    #[test]
    fn projects_notes_and_the_suggestions_inbox() {
        let names: Vec<String> = tools()
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect();
        for n in [
            "list_projects",
            "get_project",
            "library_overview",
            "suggest_papers",
            "post_suggestions",
            "list_notes",
            "get_note",
            "create_note",
            "append_to_note",
        ] {
            assert!(names.contains(&n.to_string()), "{n}");
        }
        let r = call_all(&[
            ("list_projects", json!({})),
            ("get_project", json!({"project": "mpl"})),
            ("library_overview", json!({})),
            (
                "create_note",
                json!({"title": "MPL synthesis", "body": "## State of the art\n- woodpiles [[deubel2004woodpile]]", "project": "MPL"}),
            ),
            (
                "append_to_note",
                json!({"note": "MPL", "markdown": "- shrinkage is the open problem"}),
            ),
            (
                "append_to_note",
                json!({"note": "deubel2004woodpile", "markdown": "- **Key idea:** DLW woodpiles"}),
            ),
            ("get_note", json!({"note": "MPL synthesis"})),
            ("list_notes", json!({})),
            (
                "post_suggestions",
                json!({"project": "MPL", "papers": [
                    {"doi": "10.1002/adma.201000001", "title": "Finer features", "reason": "Cited by 3 of your project papers"},
                    {"doi": "10.1038/nmat1155", "title": "Woodpile photonic crystals", "reason": "already have it"}
                ]}),
            ),
            ("suggest_papers", json!({"project": "MPL"})),
            ("get_project", json!({"project": "MPL"})),
            ("create_note", json!({"title": "x", "body": "y", "project": "MPL"})),
        ]);
        assert!(
            r.iter().take(11).all(|v| v["isError"] == false),
            "{:?}",
            r.iter().map(text).collect::<Vec<_>>()
        );
        assert_eq!(r[0]["structuredContent"]["projects"][0]["name"], "MPL");
        assert_eq!(
            r[1]["structuredContent"]["papers"][0]["title"],
            "Woodpile photonic crystals"
        );
        assert_eq!(r[2]["structuredContent"]["papers"], 1);
        assert!(text(&r[6]).contains("shrinkage is the open problem"));
        assert!(text(&r[7]).contains("MPL synthesis (project)"));
        assert!(
            text(&r[8]).starts_with("1 suggestion(s) put in the “MPL” inbox"),
            "{}",
            text(&r[8])
        );
        assert!(text(&r[9]).contains("Offline mode"), "{}", text(&r[9]));
        assert_eq!(
            r[10]["structuredContent"]["waitingSuggestions"][0]["title"],
            "Finer features"
        );
        assert_eq!(r[10]["structuredContent"]["papers"][0]["hasNote"], true);
        assert_eq!(r[11]["isError"], true, "a project has one note");
    }

    #[test]
    fn speaks_mcp_over_stdio() {
        let r = run(&[
            json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}),
            json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
            json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
            json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_library","arguments":{"query":"attention"}}}),
            json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"add_bullet","arguments":{"key":"vaswani2017attention","text":"Self-attention only"}}}),
            json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_paper_note","arguments":{"key":"vaswani2017attention"}}}),
            json!({"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_item","arguments":{"key":"missing"}}}),
            json!({"jsonrpc":"2.0","id":7,"method":"resources/list"}),
            json!({"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"export_bibliography","arguments":{"format":"bibtex"}}}),
            json!({"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"format_citation","arguments":{"keys":["vaswani2017attention"],"style":"apa"}}}),
        ]);
        assert_eq!(r.len(), 10, "notification got no reply; parse error did");
        assert_eq!(r[8]["result"]["content"][0]["text"], "(Vaswani, 2017)");
        assert_eq!(r[0]["result"]["protocolVersion"], "2025-06-18");
        assert!(r[0]["result"]["capabilities"]["tools"].is_object());
        let names: Vec<&str> = r[1]["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            vec![
                "search_library",
                "get_item",
                "get_paper_note",
                "list_citations",
                "find_citing_papers",
                "search_online",
                "list_relations",
                "add_relation",
                "add_bullet",
                "format_citation",
                "export_bibliography",
                "list_projects",
                "get_project",
                "library_overview",
                "suggest_papers",
                "post_suggestions",
                "read_pdf",
                "list_highlights",
                "add_highlights",
                "list_notes",
                "get_note",
                "create_note",
                "append_to_note"
            ]
        );
        assert_eq!(
            r[2]["result"]["structuredContent"]["results"][0]["citekey"],
            "vaswani2017attention"
        );
        assert_eq!(r[3]["result"]["isError"], false);
        assert!(r[4]["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("- Self-attention only"));
        assert_eq!(
            r[5]["result"]["isError"], true,
            "tool errors are results, not protocol errors"
        );
        assert_eq!(r[6]["error"]["code"], -32601);
        assert!(r[7]["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .starts_with("@article{vaswani2017attention,"));
        assert_eq!(r[9]["error"]["code"], -32700);
    }

    #[test]
    fn negotiates_protocol_version() {
        let r = run(&[json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1999-01-01"}})]);
        assert_eq!(r[0]["result"]["protocolVersion"], PROTOCOL_VERSIONS[0]);
    }
}
