---
name: paperlines
description: Work with the user's own research library in Paperlines (papers, PDFs, notes, citations, projects). Use when the user asks about papers they have or read, wants a literature review, related work, citations or a bibliography, wants notes added to a paper, or asks which papers cite, extend or contradict others.
---

# Paperlines

Paperlines is the user's local reference manager. Its MCP server (`paperlines`) gives you their library: metadata, the notes they wrote on each paper, citation links between papers, and the connections they recorded (extends, contradicts, replicates, applies the method of, and their own types). Everything stays on their machine.

Two companion skills go deeper: **paperlines-notes** (writing paper notes, project syntheses, related-work drafts) and **paperlines-scout** (suggesting papers the user doesn't have yet). Use them for those tasks.

## Ground rules

- **The library is the source of truth for "my papers".** Search it before relying on memory, and quote titles, years and citekeys from it.
- **Cite by citekey** (e.g. `vaswani2017attention`). Every tool accepts a citekey, DOI, arXiv ID or numeric id as `key`.
- **Their notes are their own reading.** Separate what a paper says (from `get_item` / `get_paper_note`) from your own analysis.
- **Ask before writing.** Only call `add_bullet` or `add_relation` when the user asks you to record something, or agrees when you offer.
- **Say when a paper isn't in the library.** Don't invent library entries. `search_online` finds papers outside it; the user adds them in the app (or with `paperlines add DOI`).

## Tools

| Tool | Use it to |
| --- | --- |
| `search_library` | Find papers. Query syntax: free text plus `tag:ml/nlp`, `project:"Thesis"`, `author:hinton`, `year:>=2020`, `year:2018..2020`, `is:unread\|reading\|read`, `has:pdf`, `cites:KEY`, `cited-by:KEY`, `-term`. An empty query lists the newest papers. |
| `get_item` | Get the full metadata of one paper, plus its note and counts. |
| `get_paper_note` | Read the user's note on a paper, as Markdown. |
| `add_bullet` | Append a bullet to a paper's note (only when asked). |
| `list_citations` | List library papers this one cites (`cites`), or that cite it (`cited_by`). |
| `find_citing_papers` | Find papers anywhere (OpenAlex) that cite this one, including ones not in the library. |
| `list_relations` / `add_relation` | Read or record typed connections: extends, contradicts, replicates, applies_method, or the user's own types. |
| `list_projects` / `get_project` | See the user's projects: papers, read status, key papers (the spine), the project note, waiting suggestions. |
| `library_overview` | The shape of the library (projects, top tags, newest papers): what the user works on. |
| `list_notes` / `get_note` | Read free and project notes (and, by citekey, paper notes). |
| `search_online` | Search OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC, DataCite and DOAJ together. |
| `format_citation` | Format citations in a CSL style (apa, ieee, chicago-author-date, nature, …). |
| `export_bibliography` | Export BibTeX, CSL-JSON, RIS or Markdown, for the whole library or for a query. |

## Recipes

- **"What do I have on X?"** Run `search_library` with the topic, then `get_paper_note` for the top hits. Summarise each paper in one line, then the user's own takeaways from their notes.
- **Related-work paragraph.** Find the papers with `search_library` (`project:"…"` when they name a project), read their notes, and write prose that cites the papers by citekey. Then offer a `format_citation` list or an `export_bibliography` BibTeX.
- **"What builds on this paper?"** Use `list_citations` with `cited_by` for papers in the library, then `find_citing_papers` for the wider field. Mark which results are already in the library.
- **Tensions in the literature.** Check `list_relations` for `contradicts` links, and compare the notes on both sides.
- **Reading queue.** `search_library` with `is:unread project:"…"`, ordered by how central each paper is (cited by many library papers, from `list_citations`).

## Without the MCP server

If the tools aren't available, the same library is reachable from a shell with the `paperlines` command (add `--json` for machine output):

```sh
paperlines search 'project:"Thesis" is:unread'
paperlines show vaswani2017attention
paperlines note vaswani2017attention
paperlines cites vaswani2017attention
paperlines cited-by vaswani2017attention
paperlines relations vaswani2017attention
paperlines cite vaswani2017attention --style apa
paperlines export -f bibtex --project Thesis
```
