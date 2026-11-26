//! Command-line interface to the library. Same operations as the app and the MCP server.
use clap::{Parser, Subcommand};
use paperlines_core::{backup, branding, doctor, platform};
use paperlines_ops::{self as ops, Direction, Format, ItemSummary, Library, Scope};
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;
use std::process::ExitCode;

#[derive(Parser)]
#[command(name = branding::CLI_COMMAND, version, about = branding::DESCRIPTION, long_about = None)]
struct Cli {
    /// Library folder (default: the app's library; also settable via the <BINARY>_LIBRARY env var)
    #[arg(long, global = true, value_name = "DIR")]
    library: Option<PathBuf>,
    /// Machine-readable JSON output
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Add papers: PDFs, folders, .bib/.ris/CSL-JSON files, DOIs, arXiv IDs. Duplicates are skipped.
    Add {
        #[arg(required = true)]
        inputs: Vec<String>,
        /// Do not look up metadata online
        #[arg(long)]
        offline: bool,
        /// Also fetch reference lists for the added papers
        #[arg(long)]
        fetch_refs: bool,
    },
    /// Search with the app's query syntax (tag:, project:, year:, author:, is:, cites:, cited-by:)
    Search {
        query: Vec<String>,
        #[arg(long, default_value_t = 50)]
        limit: usize,
    },
    /// Show one paper: metadata, counts and its paper note
    Show { key: String },
    /// Print a paper note as Markdown, or append a bullet with --add
    Note {
        key: String,
        #[arg(long, value_name = "TEXT")]
        add: Option<String>,
    },
    /// Papers in the library that KEY cites
    Cites { key: String },
    /// Papers in the library that cite KEY
    CitedBy { key: String },
    /// A project's spine (the key papers of its argument, in steps): list, add, remove
    Spine {
        project: String,
        #[command(subcommand)]
        action: Option<SpineCmd>,
    },
    /// Search OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC, DataCite and DOAJ at once
    SearchOnline {
        query: String,
        /// Only these sources (repeatable): openalex, semantic_scholar, arxiv, pubmed, crossref,
        /// europe_pmc, datacite, doaj
        #[arg(long = "source")]
        sources: Vec<String>,
        #[arg(long, short = 'n', default_value_t = 20)]
        limit: usize,
    },
    /// Projects: papers, key papers, notes and waiting suggestions
    Projects,
    /// Suggest papers you don't have yet, with reasons: for a project, some papers, or the library
    Suggest {
        #[arg(long)]
        project: Option<String>,
        /// Start from these papers instead (repeatable)
        #[arg(long = "key")]
        keys: Vec<String>,
        /// Also search for this subject online
        #[arg(long)]
        topic: Option<String>,
        #[arg(long, short = 'n', default_value_t = 15)]
        limit: usize,
        /// Put them in the project's Suggestions inbox (shown in the app)
        #[arg(long)]
        post: bool,
    },
    /// Connect two papers with a type: `relate chen2022 extends smith2021 --note "..."`
    Relate {
        from: String,
        /// extends, contradicts, replicates, applies-method, or a type of your own
        r#type: String,
        to: String,
        #[arg(long)]
        note: Option<String>,
    },
    /// Removes a connection: `unrelate chen2022 extends smith2021`
    Unrelate { from: String, r#type: String, to: String },
    /// A paper's typed connections, both ways (all connections without KEY)
    Relations { key: Option<String> },
    /// Connection types: list, add your own, remove
    RelationTypes {
        #[command(subcommand)]
        action: Option<RelTypeCmd>,
    },
    /// Papers anywhere that cite KEY (OpenAlex, then Semantic Scholar; cached for a week)
    Citing {
        key: String,
        /// cited (most cited first), newest, or connected (cite the most other papers in the library)
        #[arg(long, short, default_value = "cited")]
        sort: String,
        #[arg(long, short = 'n', default_value_t = 25)]
        limit: usize,
        /// Ask the source again even if the cached list is recent
        #[arg(long)]
        refresh: bool,
    },
    /// Export as bibtex, csl-json, ris, markdown or json (full dump)
    Export {
        #[arg(long, short, default_value = "bibtex")]
        format: String,
        #[arg(long, conflicts_with = "query")]
        project: Option<String>,
        #[arg(long)]
        query: Option<String>,
        /// Citekeys (default: everything)
        keys: Vec<String>,
        #[arg(long, short, value_name = "FILE")]
        output: Option<PathBuf>,
    },
    /// Write every note as a Markdown file into DIR
    ExportNotes { dir: PathBuf },
    /// The library-only citation graph
    Graph,
    /// Fetch reference lists (all papers without one, or the given keys) and link citations
    FetchRefs {
        keys: Vec<String>,
        #[arg(long)]
        force: bool,
    },
    /// Check database integrity, files, edges and the search index
    Doctor {
        /// Repair what can be repaired safely (never deletes files)
        #[arg(long)]
        fix: bool,
    },
    /// Make a backup now, list backups, or restore one (quit the app first)
    Backup {
        #[arg(long)]
        list: bool,
        #[arg(long, value_name = "FILE")]
        restore: Option<PathBuf>,
        /// Required with --restore
        #[arg(long)]
        yes: bool,
    },
    /// Run the MCP server on stdin/stdout (for Claude Code / Claude Desktop)
    Mcp,
    /// The browser extension: show which browsers know Paperlines; --connect registers it with
    /// every installed Chrome-family browser (Chrome, Edge, Brave, Arc, Vivaldi, Chromium)
    Browser {
        #[arg(long)]
        connect: bool,
    },
    /// Show where the library and config live; --set-library changes the default library folder
    Paths {
        #[arg(long, value_name = "DIR")]
        set_library: Option<PathBuf>,
    },
    /// Format a citation or bibliography in a CSL style (apa, ieee, chicago-author-date, nature, ...)
    Cite {
        #[arg(required = true)]
        keys: Vec<String>,
        #[arg(long, short)]
        style: Option<String>,
        /// A reference list instead of an in-text citation
        #[arg(long, short)]
        bibliography: bool,
        /// HTML instead of plain text
        #[arg(long)]
        html: bool,
    },
    /// List the available citation styles
    Styles,
    /// Move papers to the Trash
    Rm {
        #[arg(required = true)]
        keys: Vec<String>,
    },
    /// List the Trash, restore papers from it, or empty it
    Trash {
        #[command(subcommand)]
        action: Option<TrashCmd>,
    },
    /// Find duplicate papers, merge them, or mark them as distinct
    Duplicates {
        /// Merge OTHERS into MASTER (the others go to the Trash)
        #[arg(long, num_args = 2.., value_names = ["MASTER", "OTHERS"])]
        merge: Option<Vec<String>>,
        /// Mark these papers as not duplicates
        #[arg(long, num_args = 2..)]
        dismiss: Option<Vec<String>>,
    },
    /// Download legal open-access PDFs (arXiv, OpenAlex) for papers without one
    FindPdf { keys: Vec<String> },
    /// Import a Zotero library (default ~/Zotero). Zotero itself is not modified.
    ImportZotero { dir: Option<PathBuf> },
    /// Import a library exported with `export-library` (its folder or library.json), or a JSON
    /// dump made by `export -f json`. Papers already here are skipped
    ImportDump { file: PathBuf },
    /// Export the whole library, PDFs included, as a folder "Paperlines library <date>" in DIR
    ExportLibrary { dir: PathBuf },
    /// Files rewritten whenever the library changes (Better BibTeX style)
    AutoExport {
        #[command(subcommand)]
        action: Option<AutoCmd>,
    },
}

#[derive(Subcommand)]
enum TrashCmd {
    List,
    Restore {
        #[arg(required = true)]
        keys: Vec<String>,
    },
    Empty {
        /// Only papers deleted more than DAYS ago
        #[arg(long, value_name = "DAYS")]
        older_than: Option<i64>,
    },
}

#[derive(Subcommand)]
enum SpineCmd {
    List,
    /// Puts KEY in step N (1-based), or in a new step at the end
    Add {
        key: String,
        #[arg(long)]
        step: Option<usize>,
    },
    Remove {
        key: String,
    },
}

#[derive(Subcommand)]
enum RelTypeCmd {
    List,
    /// A type of your own, e.g. `add Supports --inverse "Supported by" --color teal`
    Add {
        label: String,
        #[arg(long)]
        inverse: Option<String>,
        #[arg(long, default_value = "gray")]
        color: String,
    },
    /// Deletes a type you made, with its connections
    Remove {
        name: String,
    },
}

#[derive(Subcommand)]
enum AutoCmd {
    List,
    Add {
        path: PathBuf,
        #[arg(long, short, default_value = "bibtex")]
        format: String,
        #[arg(long, conflicts_with = "query")]
        project: Option<String>,
        #[arg(long)]
        query: Option<String>,
    },
    Remove {
        id: i64,
    },
}

fn print_import(j: bool, r: &ops::manage::ImportReport) {
    out(j, serde_json::to_value(r).unwrap_or_default(), || {
        println!(
            "added {}, skipped {} duplicate(s); {} file(s), {} highlight(s), {} note(s), {} new project(s)",
            r.added, r.duplicates, r.files, r.highlights, r.notes, r.projects
        );
        for w in &r.warnings {
            eprintln!("warning: {w}");
        }
    });
}

fn print_list(list: &[ItemSummary]) {
    for i in list {
        let year = i.year.map(|y| y.to_string()).unwrap_or_else(|| "n.d.".into());
        println!("{:<28} {:>4}  {}  ({})", i.citekey, year, i.title, i.authors);
    }
}

fn out(json_mode: bool, v: Value, human: impl FnOnce()) {
    if json_mode {
        println!("{}", serde_json::to_string_pretty(&v).unwrap_or_default());
    } else {
        human();
    }
}

fn config_dir() -> PathBuf {
    platform::app_dirs()
        .map(|d| d.config)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn run(cli: Cli) -> Result<ExitCode, String> {
    let j = cli.json;
    if let Cmd::Styles = cli.cmd {
        let l = ops::cite::styles();
        out(j, json!(l), || {
            for s in &l {
                println!("{:<40} {}", s.id, s.name);
            }
        });
        return Ok(ExitCode::SUCCESS);
    }
    if let Cmd::Browser { connect } = cli.cmd {
        let home = ops::browser::home().ok_or("No home folder")?;
        let os = ops::browser::os_name();
        let config = config_dir();
        let list = if connect {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            ops::browser::install(&home, os, &config, &ops::browser::stable_program(exe)).map_err(|e| e.to_string())?
        } else {
            ops::browser::status(&home, os, &config)
        };
        out(j, json!(list), || {
            for b in list.iter().filter(|b| b.installed) {
                let state = if b.connected {
                    "connected"
                } else {
                    "not connected (run: browser --connect)"
                };
                println!("{:<16} {state}", b.name);
            }
            if !list.iter().any(|b| b.installed) {
                println!("no Chrome-family browser found");
            }
        });
        return Ok(ExitCode::SUCCESS);
    }
    if let Cmd::Paths { set_library: Some(dir) } = &cli.cmd {
        let dirs = platform::app_dirs().ok_or("No home folder")?;
        let mut c = paperlines_core::config::load(&dirs.config);
        c.library_path = Some(std::fs::canonicalize(dir).unwrap_or_else(|_| dir.clone()));
        paperlines_core::config::save(&dirs.config, &c).map_err(|e| e.to_string())?;
        println!("default library is now {}", dir.display());
        return Ok(ExitCode::SUCCESS);
    }
    if let Cmd::Paths { .. } = cli.cmd {
        let dirs = platform::app_dirs();
        let lib = cli
            .library
            .clone()
            .map(Ok)
            .unwrap_or_else(ops::default_root)
            .map_err(|e| e.to_string())?;
        out(
            j,
            json!({"library": lib, "config": dirs.as_ref().map(|d| &d.config), "cache": dirs.as_ref().map(|d| &d.cache), "env": ops::library_env_var()}),
            || {
                println!("library  {}", lib.display());
                if let Some(d) = &dirs {
                    println!("config   {}", d.config.display());
                    println!("cache    {}", d.cache.display());
                }
                println!("override with --library DIR or {}=DIR", ops::library_env_var());
            },
        );
        return Ok(ExitCode::SUCCESS);
    }
    let mut lib = Library::open(cli.library.as_deref()).map_err(|e| e.to_string())?;
    let e = |x: paperlines_core::Error| x.to_string();
    match cli.cmd {
        Cmd::Paths { .. } | Cmd::Styles | Cmd::Browser { .. } => unreachable!(),
        Cmd::Cite {
            keys,
            style,
            bibliography,
            html,
        } => {
            let items = keys
                .iter()
                .map(|k| ops::resolve(lib.conn(), k))
                .collect::<paperlines_core::Result<Vec<_>>>()
                .map_err(e)?;
            let style = style.unwrap_or_else(|| {
                paperlines_core::settings::load(lib.conn())
                    .map(|s| s.citation_style)
                    .unwrap_or_else(|_| "apa".into())
            });
            let f = if bibliography {
                ops::cite::bibliography(&items, &style)
            } else {
                ops::cite::citation(&items, &style)
            }
            .map_err(e)?;
            out(j, serde_json::to_value(&f).unwrap_or_default(), || {
                println!("{}", if html { &f.html } else { &f.text })
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Rm { keys } => {
            let ids = keys
                .iter()
                .map(|k| ops::resolve(lib.conn(), k).map(|i| i.id))
                .collect::<paperlines_core::Result<Vec<_>>>()
                .map_err(e)?;
            ops::manage::trash(&mut lib, &ids).map_err(e)?;
            out(j, json!({"trashed": ids.len()}), || {
                println!("moved {} paper(s) to the Trash", ids.len())
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Trash { action } => {
            match action.unwrap_or(TrashCmd::List) {
                TrashCmd::List => {
                    let l: Vec<ItemSummary> = ops::manage::list_trash(lib.conn())
                        .map_err(e)?
                        .iter()
                        .map(ops::summary)
                        .collect();
                    out(j, json!(l), || print_list(&l));
                }
                TrashCmd::Restore { keys } => {
                    let trashed = ops::manage::list_trash(lib.conn()).map_err(e)?;
                    let ids: Vec<i64> = keys
                        .iter()
                        .map(|k| {
                            trashed
                                .iter()
                                .find(|i| {
                                    i.citekey.eq_ignore_ascii_case(k.trim_start_matches('@')) || i.id.to_string() == *k
                                })
                                .map(|i| i.id)
                                .ok_or(format!("{k} is not in the Trash"))
                        })
                        .collect::<Result<_, _>>()?;
                    ops::manage::restore(&mut lib, &ids).map_err(e)?;
                    out(j, json!({"restored": ids.len()}), || {
                        println!("restored {} paper(s)", ids.len())
                    });
                }
                TrashCmd::Empty { older_than } => {
                    let n = ops::manage::empty_trash(&mut lib, older_than).map_err(e)?;
                    out(j, json!({"deleted": n}), || {
                        println!("permanently deleted {n} paper(s)")
                    });
                }
            }
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Duplicates { merge, dismiss } => {
            let ids_of = |keys: &[String], lib: &Library| {
                keys.iter()
                    .map(|k| ops::resolve(lib.conn(), k).map(|i| i.id))
                    .collect::<paperlines_core::Result<Vec<_>>>()
            };
            if let Some(keys) = merge {
                let ids = ids_of(&keys, &lib).map_err(e)?;
                ops::manage::merge_duplicates(&mut lib, ids[0], &ids[1..]).map_err(e)?;
                out(j, json!({"merged": ids.len() - 1}), || {
                    println!("merged {} paper(s) into {}", ids.len() - 1, keys[0])
                });
            } else if let Some(keys) = dismiss {
                let ids = ids_of(&keys, &lib).map_err(e)?;
                ops::manage::dismiss_duplicates(&mut lib, &ids).map_err(e)?;
                out(j, json!({"dismissed": ids.len()}), || {
                    println!("marked as not duplicates")
                });
            } else {
                let g = ops::manage::duplicate_groups(lib.conn()).map_err(e)?;
                out(j, json!(g), || {
                    if g.is_empty() {
                        println!("no duplicates found");
                    }
                    for grp in &g {
                        println!("{}:", grp.reason);
                        print_list(&grp.papers);
                        println!();
                    }
                });
            }
            Ok(ExitCode::SUCCESS)
        }
        Cmd::FindPdf { keys } => {
            let ids: Vec<i64> = if keys.is_empty() {
                paperlines_core::items::list_items(lib.conn())
                    .map_err(e)?
                    .into_iter()
                    .filter(|i| !i.has_pdf)
                    .map(|i| i.id)
                    .collect()
            } else {
                keys.iter()
                    .map(|k| ops::resolve(lib.conn(), k).map(|i| i.id))
                    .collect::<paperlines_core::Result<_>>()
                    .map_err(e)?
            };
            let r = ops::manage::find_pdfs(&mut lib, &ids).map_err(e)?;
            out(j, serde_json::to_value(&r).unwrap_or_default(), || {
                println!(
                    "found {}, not found {}, skipped {}",
                    r.found.len(),
                    r.not_found.len(),
                    r.skipped
                );
                for k in &r.found {
                    println!("  + {k}");
                }
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::ImportZotero { dir } => {
            let dir = dir
                .or_else(paperlines_import::zotero::default_data_dir)
                .ok_or("No Zotero library found in ~/Zotero; pass its folder")?;
            let r = ops::manage::import_zotero(&mut lib, &dir).map_err(e)?;
            print_import(j, &r);
            Ok(ExitCode::SUCCESS)
        }
        Cmd::ExportLibrary { dir } => {
            let r = ops::export_library(lib.conn(), &lib.paths.pdfs, &dir).map_err(e)?;
            out(j, json!(r), || {
                println!("{} papers and {} files exported to {}", r.papers, r.files, r.path);
                for m in &r.missing {
                    println!("  missing file: {m}");
                }
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::ImportDump { file } => {
            let r = ops::manage::import_dump(&mut lib, &file).map_err(e)?;
            print_import(j, &r);
            Ok(ExitCode::SUCCESS)
        }
        Cmd::AutoExport { action } => {
            match action.unwrap_or(AutoCmd::List) {
                AutoCmd::List => {
                    let l = ops::manage::list_auto_exports(lib.conn()).map_err(e)?;
                    out(j, json!(l), || {
                        for a in &l {
                            println!(
                                "{:>3}  {:<9} {:<8} {:<20} {}{}",
                                a.id,
                                a.format,
                                a.scope_kind,
                                a.scope_value.clone().unwrap_or_default(),
                                a.path,
                                a.last_error
                                    .as_ref()
                                    .map(|x| format!("  (error: {x})"))
                                    .unwrap_or_default()
                            );
                        }
                    });
                }
                AutoCmd::Add {
                    path,
                    format,
                    project,
                    query,
                } => {
                    let (kind, value) = match (project, query) {
                        (Some(p), _) => ("project", Some(p)),
                        (_, Some(q)) => ("query", Some(q)),
                        _ => ("all", None),
                    };
                    let abs = std::path::absolute(&path).unwrap_or(path);
                    let a =
                        ops::manage::add_auto_export(&mut lib, &format, kind, value.as_deref(), &abs.to_string_lossy())
                            .map_err(e)?;
                    out(j, json!(a), || println!("{} is now kept up to date", a.path));
                }
                AutoCmd::Remove { id } => {
                    ops::manage::remove_auto_export(lib.conn(), id).map_err(e)?;
                    out(j, json!({"removed": id}), || println!("removed auto-export {id}"));
                }
            }
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Add {
            inputs,
            offline,
            fetch_refs,
        } => {
            let r = ops::add(&mut lib, &inputs, offline.then_some(true)).map_err(e)?;
            let fetched = if fetch_refs && !r.added.is_empty() {
                let keys: Vec<String> = r.added.iter().map(|i| i.citekey.clone()).collect();
                Some(ops::fetch_references(&mut lib, &keys, false, &config_dir()).map_err(e)?)
            } else {
                None
            };
            out(
                j,
                json!({"added": r.added, "duplicates": r.duplicates, "errors": r.errors, "linked": r.linked, "references": fetched}),
                || {
                    println!(
                        "added {} paper(s), {} new citation link(s) from cached references",
                        r.added.len(),
                        r.linked
                    );
                    print_list(&r.added);
                    for d in &r.duplicates {
                        println!("skipped duplicate: {d}");
                    }
                    for x in &r.errors {
                        eprintln!("error: {x}");
                    }
                    if let Some(f) = &fetched {
                        println!(
                            "references fetched for {}, {} link(s); {} failed",
                            f.fetched.len(),
                            f.linked,
                            f.failed.len()
                        );
                    }
                },
            );
            Ok(if r.errors.is_empty() {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            })
        }
        Cmd::Search { query, limit } => {
            let r = ops::search(lib.conn(), &query.join(" "), limit).map_err(e)?;
            out(j, serde_json::to_value(&r).unwrap_or_default(), || {
                for w in &r.warnings {
                    eprintln!("warning: {w}");
                }
                print_list(&r.results);
                if r.total > r.results.len() {
                    println!("… {} more (use --limit)", r.total - r.results.len());
                }
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Show { key } => {
            let v = ops::item_detail(lib.conn(), &key).map_err(e)?;
            out(j, v.clone(), || {
                let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
                println!("{}\n{}", s("title"), "=".repeat(s("title").chars().count().min(80)));
                let authors: Vec<String> = v["authors"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|a| {
                        format!(
                            "{} {}",
                            a["given"].as_str().unwrap_or(""),
                            a["family"].as_str().unwrap_or("")
                        )
                        .trim()
                        .to_string()
                    })
                    .collect();
                println!("{}", authors.join(", "));
                println!(
                    "citekey {}  year {}  status {}",
                    s("citekey"),
                    v["year"],
                    s("readStatus")
                );
                for k in ["venue", "doi", "arxivId", "url"] {
                    if !s(k).is_empty() {
                        println!("{k}: {}", s(k));
                    }
                }
                println!(
                    "cites {} · cited by {} (in library) · {} highlights",
                    v["cites"], v["citedBy"], v["highlights"]
                );
                let note = s("paperNote");
                println!(
                    "\n{}",
                    if note.trim().is_empty() {
                        "(no key points yet)".into()
                    } else {
                        note
                    }
                );
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Note { key, add } => {
            if let Some(text) = add {
                let n = ops::add_bullet(&mut lib, &key, &text).map_err(e)?;
                out(j, json!({"body": n.body}), || print!("{}", n.body));
            } else {
                let (_, note, md) = ops::paper_note(lib.conn(), &key).map_err(e)?;
                out(j, json!({"body": note.body, "markdown": md}), || print!("{md}"));
            }
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Cites { key } => {
            let l = ops::citations(lib.conn(), &key, Direction::Cites).map_err(e)?;
            out(j, json!(l), || print_list(&l));
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Citing {
            key,
            sort,
            limit,
            refresh,
        } => {
            let sort = match sort.as_str() {
                "cited" => ops::CitingSort::Cited,
                "newest" => ops::CitingSort::Newest,
                "connected" => ops::CitingSort::Connected,
                other => return Err(format!("Unknown sort `{other}`: use cited, newest or connected")),
            };
            let r = ops::citing_papers(&mut lib, &key, refresh, sort, limit, &config_dir()).map_err(e)?;
            out(j, json!(r), || {
                println!(
                    "{} papers cite {} ({}, {})",
                    r.total,
                    r.paper.citekey,
                    if r.source == "openalex" {
                        "OpenAlex"
                    } else {
                        "Semantic Scholar"
                    },
                    &r.fetched_at[..r.fetched_at.len().min(10)]
                );
                for p in &r.papers {
                    let who = match p.authors.len() {
                        0 => String::new(),
                        1 => p.authors[0].clone(),
                        _ => format!("{} et al.", p.authors[0]),
                    };
                    let mut extra = Vec::new();
                    if let Some(k) = &p.in_library {
                        extra.push(format!("in library: {k}"));
                    }
                    if !p.connected.is_empty() {
                        extra.push(format!("also cites {}", p.connected.join(", ")));
                    }
                    println!(
                        "{:>7}  {}  {} — {}{}",
                        p.cited_by_count.map(|c| c.to_string()).unwrap_or_default(),
                        p.year.map(|y| y.to_string()).unwrap_or_else(|| "    ".into()),
                        p.title,
                        who,
                        if extra.is_empty() {
                            String::new()
                        } else {
                            format!("  [{}]", extra.join("; "))
                        }
                    );
                }
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Spine { project, action } => {
            use paperlines_core::spine;
            let pid = paperlines_core::projects::list(lib.conn())
                .map_err(e)?
                .into_iter()
                .find(|p| p.name.eq_ignore_ascii_case(&project))
                .map(|p| p.id)
                .ok_or_else(|| format!("No project called “{project}”"))?;
            match action.unwrap_or(SpineCmd::List) {
                SpineCmd::List => {}
                SpineCmd::Add { key, step } => {
                    let item = ops::resolve(lib.conn(), &key).map_err(e)?;
                    let steps = spine::get(lib.conn(), pid).map_err(e)?;
                    let step_id = match step {
                        Some(n) => Some(
                            steps
                                .get(n.saturating_sub(1))
                                .map(|s| s.id)
                                .ok_or_else(|| format!("The spine has {} steps", steps.len()))?,
                        ),
                        None => None,
                    };
                    lib.db.tx(|c| spine::add(c, pid, item.id, step_id)).map_err(e)?;
                }
                SpineCmd::Remove { key } => {
                    let item = ops::resolve(lib.conn(), &key).map_err(e)?;
                    lib.db.tx(|c| spine::remove(c, pid, item.id)).map_err(e)?;
                }
            }
            let keys: std::collections::HashMap<i64, String> = paperlines_core::items::list_items(lib.conn())
                .map_err(e)?
                .into_iter()
                .map(|i| (i.id, i.citekey))
                .collect();
            let steps = spine::get(lib.conn(), pid).map_err(e)?;
            let rows: Vec<Value> = steps
                .iter()
                .map(|st| json!({"label": st.label, "papers": st.items.iter().filter_map(|i| keys.get(i)).collect::<Vec<_>>()}))
                .collect();
            out(j, json!(rows), || {
                for (n, st) in steps.iter().enumerate() {
                    let papers: Vec<&str> = st
                        .items
                        .iter()
                        .filter_map(|i| keys.get(i).map(String::as_str))
                        .collect();
                    println!(
                        "{}. {}{}",
                        n + 1,
                        st.label.as_deref().map(|l| format!("{l}: ")).unwrap_or_default(),
                        papers.join(" + ")
                    );
                }
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::SearchOnline { query, sources, limit } => {
            let mut r = ops::discover::search(&lib, &query, &sources, &config_dir()).map_err(e)?;
            r.hits.truncate(limit);
            out(j, json!(r), || {
                for err in &r.errors {
                    eprintln!("{}: {}", err.source, err.message);
                }
                for h in &r.hits {
                    let id = h
                        .hit
                        .doi
                        .clone()
                        .or_else(|| h.hit.arxiv_id.clone().map(|a| format!("arXiv:{a}")))
                        .or_else(|| h.hit.pmid.clone().map(|p| format!("PMID:{p}")))
                        .unwrap_or_default();
                    let who = match h.hit.authors.len() {
                        0 => String::new(),
                        1 => h.hit.authors[0].clone(),
                        _ => format!("{} et al.", h.hit.authors[0]),
                    };
                    println!(
                        "{:>6}  {}  {} — {}  {}{}",
                        h.hit.cited_by_count.map(|c| c.to_string()).unwrap_or_default(),
                        h.hit.year.map(|y| y.to_string()).unwrap_or_else(|| "    ".into()),
                        h.hit.title,
                        who,
                        id,
                        if h.in_library.is_some() { "  [in library]" } else { "" }
                    );
                }
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Projects => {
            let v = ops::research::projects_overview(lib.conn()).map_err(e)?;
            out(j, json!(v), || {
                for p in &v {
                    println!(
                        "{}  ({} papers{})",
                        p["name"].as_str().unwrap_or(""),
                        p["papers"],
                        match p["waitingSuggestions"].as_i64().unwrap_or(0) {
                            0 => String::new(),
                            n => format!(", {n} suggestions waiting"),
                        }
                    );
                    if let Some(d) = p["description"].as_str() {
                        println!("  {d}");
                    }
                }
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Suggest {
            project,
            keys,
            topic,
            limit,
            post,
        } => {
            let seeds = match (&project, keys.is_empty()) {
                (Some(p), _) => ops::suggest::Seeds::Project(p.clone()),
                (None, false) => ops::suggest::Seeds::Keys(keys),
                (None, true) => ops::suggest::Seeds::Library,
            };
            let r = ops::suggest::suggest(&mut lib, seeds, topic.as_deref(), limit, &config_dir()).map_err(e)?;
            let posted = if post {
                let list: Vec<paperlines_core::suggestions::NewSuggestion> = r
                    .papers
                    .iter()
                    .map(|p| paperlines_core::suggestions::NewSuggestion {
                        doi: p.doi.clone(),
                        arxiv_id: p.arxiv_id.clone(),
                        title: p.title.clone(),
                        authors: (!p.authors.is_empty()).then(|| p.authors.join(", ")),
                        year: p.year,
                        venue: p.venue.clone(),
                        reason: Some(p.reasons.join("; ")),
                    })
                    .collect();
                Some(ops::research::post_suggestions(&mut lib, project.as_deref(), &list).map_err(e)?)
            } else {
                None
            };
            out(j, json!({"report": r, "posted": posted}), || {
                for n in &r.notes {
                    eprintln!("({n})");
                }
                for p in &r.papers {
                    println!(
                        "{:>5.1}  {}  {}  {}\n       {}",
                        p.score,
                        p.year.map(|y| y.to_string()).unwrap_or_else(|| "    ".into()),
                        p.title,
                        p.doi.as_deref().or(p.arxiv_id.as_deref()).unwrap_or(""),
                        p.reasons.join("; ")
                    );
                }
                if let Some(a) = &posted {
                    println!("{} put in the Suggestions inbox, {} skipped", a.added, a.skipped);
                }
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Relate { from, r#type, to, note } => {
            use paperlines_core::relations;
            let a = ops::resolve(lib.conn(), &from).map_err(e)?;
            let b = ops::resolve(lib.conn(), &to).map_err(e)?;
            let t = relations::find_type(lib.conn(), &r#type).map_err(e)?;
            // an inverse wording ("extended by") flips the direction
            let inverse = t.inverse_label.as_deref().is_some_and(|l| {
                l.to_lowercase().replace(['-', ' '], "_") == r#type.trim().to_lowercase().replace(['-', ' '], "_")
            });
            let (x, y) = if inverse { (b.id, a.id) } else { (a.id, b.id) };
            let r = lib
                .db
                .tx(|c| relations::add(c, x, y, t.id, note.as_deref(), None))
                .map_err(e)?;
            out(j, json!(r), || {
                println!(
                    "{} {} {}",
                    if inverse { &b.citekey } else { &a.citekey },
                    t.label.to_lowercase(),
                    if inverse { &a.citekey } else { &b.citekey }
                )
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Unrelate { from, r#type, to } => {
            use paperlines_core::relations;
            let a = ops::resolve(lib.conn(), &from).map_err(e)?;
            let b = ops::resolve(lib.conn(), &to).map_err(e)?;
            let t = relations::find_type(lib.conn(), &r#type).map_err(e)?;
            let hit = relations::all(lib.conn())
                .map_err(e)?
                .into_iter()
                .find(|r| {
                    r.type_id == t.id
                        && ((r.from_item_id, r.to_item_id) == (a.id, b.id)
                            || (r.from_item_id, r.to_item_id) == (b.id, a.id))
                })
                .ok_or_else(|| format!("{} and {} have no “{}” connection", a.citekey, b.citekey, t.label))?;
            lib.db.tx(|c| relations::remove(c, hit.id)).map_err(e)?;
            out(j, json!({"removed": hit.id}), || println!("removed"));
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Relations { key } => {
            use paperlines_core::relations;
            let keys: std::collections::HashMap<i64, String> = paperlines_core::items::list_items(lib.conn())
                .map_err(e)?
                .into_iter()
                .map(|i| (i.id, i.citekey))
                .collect();
            let k = |id: i64| keys.get(&id).cloned().unwrap_or_else(|| id.to_string());
            match key {
                Some(key) => {
                    let item = ops::resolve(lib.conn(), &key).map_err(e)?;
                    let l = relations::for_item(lib.conn(), item.id).map_err(e)?;
                    let rows: Vec<Value> = l
                        .iter()
                        .map(|v| json!({"id": v.relation.id, "label": v.label, "other": k(v.other_item_id), "outgoing": v.outgoing, "note": v.relation.note, "evidence": v.evidence_text}))
                        .collect();
                    out(j, json!(rows), || {
                        if l.is_empty() {
                            println!("No connections.");
                        }
                        for v in &l {
                            let note = v
                                .relation
                                .note
                                .as_deref()
                                .map(|n| format!("  — {n}"))
                                .unwrap_or_default();
                            println!(
                                "{} {} {}{note}",
                                item.citekey,
                                v.label.to_lowercase(),
                                k(v.other_item_id)
                            );
                        }
                    });
                }
                None => {
                    let types: std::collections::HashMap<i64, String> = relations::list_types(lib.conn())
                        .map_err(e)?
                        .into_iter()
                        .map(|t| (t.id, t.label))
                        .collect();
                    let l = relations::all(lib.conn()).map_err(e)?;
                    let rows: Vec<Value> = l
                        .iter()
                        .map(|r| json!({"id": r.id, "from": k(r.from_item_id), "type": types.get(&r.type_id), "to": k(r.to_item_id), "note": r.note}))
                        .collect();
                    out(j, json!(rows), || {
                        for r in &l {
                            println!(
                                "{} {} {}",
                                k(r.from_item_id),
                                types.get(&r.type_id).map(|t| t.to_lowercase()).unwrap_or_default(),
                                k(r.to_item_id)
                            );
                        }
                    });
                }
            }
            Ok(ExitCode::SUCCESS)
        }
        Cmd::RelationTypes { action } => {
            use paperlines_core::relations;
            match action.unwrap_or(RelTypeCmd::List) {
                RelTypeCmd::List => {
                    let l = relations::list_types(lib.conn()).map_err(e)?;
                    out(j, json!(l), || {
                        for t in &l {
                            println!(
                                "{:<20} {:<22} {:<22} {:>4}{}",
                                t.key,
                                t.label,
                                t.inverse_label.as_deref().unwrap_or("(same both ways)"),
                                t.count,
                                if t.builtin { "  built-in" } else { "" }
                            );
                        }
                    });
                }
                RelTypeCmd::Add { label, inverse, color } => {
                    let id = lib
                        .db
                        .tx(|c| relations::create_type(c, &label, inverse.as_deref(), &color))
                        .map_err(e)?;
                    out(j, json!({"id": id}), || println!("added {label}"));
                }
                RelTypeCmd::Remove { name } => {
                    let t = relations::find_type(lib.conn(), &name).map_err(e)?;
                    lib.db.tx(|c| relations::delete_type(c, t.id)).map_err(e)?;
                    out(j, json!({"removed": t.key}), || println!("removed {}", t.label));
                }
            }
            Ok(ExitCode::SUCCESS)
        }
        Cmd::CitedBy { key } => {
            let l = ops::citations(lib.conn(), &key, Direction::CitedBy).map_err(e)?;
            out(j, json!(l), || print_list(&l));
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Export {
            format,
            project,
            query,
            keys,
            output,
        } => {
            let f = Format::parse(&format).map_err(e)?;
            let scope = match (project, query) {
                (Some(p), _) => Scope::Project(p),
                (_, Some(q)) => Scope::Query(q),
                _ if !keys.is_empty() => Scope::Keys(keys),
                _ => Scope::All,
            };
            let text = ops::export_items(lib.conn(), f, &scope).map_err(e)?;
            match output {
                Some(p) => {
                    std::fs::write(&p, &text).map_err(|x| x.to_string())?;
                    eprintln!("wrote {}", p.display());
                }
                None => {
                    std::io::stdout()
                        .write_all(text.as_bytes())
                        .map_err(|x| x.to_string())?;
                }
            }
            Ok(ExitCode::SUCCESS)
        }
        Cmd::ExportNotes { dir } => {
            let n = ops::export_notes_folder(lib.conn(), &dir).map_err(e)?;
            out(j, json!({"files": n, "dir": dir}), || {
                println!("wrote {n} note file(s) to {}", dir.display())
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Graph => {
            let g = ops::graph(lib.conn()).map_err(e)?;
            out(j, g.clone(), || {
                let key = |id: &Value| {
                    g["nodes"]
                        .as_array()
                        .and_then(|n| n.iter().find(|x| x["id"] == *id))
                        .and_then(|x| x["citekey"].as_str())
                        .unwrap_or("?")
                        .to_string()
                };
                println!(
                    "{} papers, {} links",
                    g["nodes"].as_array().map_or(0, Vec::len),
                    g["edges"].as_array().map_or(0, Vec::len)
                );
                for e in g["edges"].as_array().into_iter().flatten() {
                    println!("{} -> {}", key(&e[0]), key(&e[1]));
                }
            });
            Ok(ExitCode::SUCCESS)
        }
        Cmd::FetchRefs { keys, force } => {
            let r = ops::fetch_references(&mut lib, &keys, force, &config_dir()).map_err(e)?;
            out(j, serde_json::to_value(&r).unwrap_or_default(), || {
                println!(
                    "fetched {}, skipped {}, {} new link(s)",
                    r.fetched.len(),
                    r.skipped,
                    r.linked
                );
                for f in &r.failed {
                    eprintln!("failed: {f}");
                }
            });
            Ok(if r.failed.is_empty() {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            })
        }
        Cmd::Doctor { fix } => {
            let r = lib.db.tx(|c| doctor::check(c, &lib.paths, fix)).map_err(e)?;
            out(j, serde_json::to_value(&r).unwrap_or_default(), || {
                println!("{} papers, {} PDFs, {} citation links", r.items, r.pdfs, r.edges);
                for f in &r.fixed {
                    println!("fixed: {f}");
                }
                for i in &r.issues {
                    println!(
                        "{}: {}{}",
                        i.kind,
                        i.detail,
                        if i.fixable && !fix { " (run with --fix)" } else { "" }
                    );
                }
                if r.ok() {
                    println!("everything looks good");
                }
            });
            Ok(if r.ok() { ExitCode::SUCCESS } else { ExitCode::from(2) })
        }
        Cmd::Backup { list, restore, yes } => {
            if list {
                let l = backup::list(&lib.paths.backups).map_err(e)?;
                out(j, json!(l), || {
                    for b in &l {
                        println!("{:<44} {:>10} KB  {}", b.name, b.size / 1024, b.kind);
                    }
                });
            } else if let Some(file) = restore {
                if !yes {
                    return Err("Restoring replaces the library. Quit the app, then add --yes.".into());
                }
                let safety = backup::restore(&mut lib.db, &lib.paths.db, &lib.paths.backups, &file).map_err(e)?;
                out(j, json!({"restored": file, "previousStateSavedTo": safety}), || {
                    println!(
                        "restored {}; the previous state was saved to {}",
                        file.display(),
                        safety.display()
                    );
                });
            } else {
                let p = backup::manual(lib.conn(), &lib.paths.backups, "manual").map_err(e)?;
                out(j, json!({"backup": p}), || println!("wrote {}", p.display()));
            }
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Mcp => {
            let stdin = std::io::stdin();
            paperlines_mcp::serve(&mut lib, stdin.lock(), std::io::stdout()).map_err(|x| x.to_string())?;
            Ok(ExitCode::SUCCESS)
        }
    }
}

/// Started by the browser for the extension: answer its messages on stdin/stdout until it closes.
fn browser_host() -> ExitCode {
    let mut input = std::io::stdin().lock();
    let mut output = std::io::stdout().lock();
    let result = match Library::open(None) {
        Ok(mut lib) => ops::browser::serve(&mut lib, &mut input, &mut output),
        // no library: say so to each message, so the extension can show why
        Err(e) => (|| {
            while ops::browser::read_message(&mut input)?.is_some() {
                let message = format!("Couldn't open the library: {e}");
                ops::browser::write_message(&mut output, &ops::browser::Response::Error { message })?;
            }
            Ok(())
        })(),
    };
    if let Err(e) = result {
        eprintln!("error: {e}");
        return ExitCode::from(1);
    }
    ExitCode::SUCCESS
}

fn main() -> ExitCode {
    if ops::browser::is_host_invocation(&std::env::args().collect::<Vec<_>>()) {
        return browser_host();
    }
    let cli = Cli::parse();
    let library = cli.library.clone();
    let mutating = !matches!(
        cli.cmd,
        Cmd::Search { .. }
            | Cmd::Show { .. }
            | Cmd::Cites { .. }
            | Cmd::CitedBy { .. }
            | Cmd::Relations { .. }
            | Cmd::Export { .. }
            | Cmd::Graph
            | Cmd::Paths { .. }
            | Cmd::Styles
            | Cmd::Cite { .. }
            | Cmd::Browser { .. }
    );
    let result = run(cli);
    if mutating && result.is_ok() {
        if let Ok(lib) = Library::open(library.as_deref()) {
            let _ = ops::manage::refresh_auto_exports(lib.conn());
        }
    }
    match result {
        Ok(c) => c,
        Err(msg) => {
            eprintln!("error: {msg}");
            ExitCode::from(1)
        }
    }
}
