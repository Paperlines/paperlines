<div align="center">

<img src="src/assets/logo-128.png" alt="Paperlines logo" width="112" height="112" />

<h1>Paperlines<br />&#8203;<sup><sub><em>Nanos gigantum humeris insidentes</em></sub></sup></h1>

**Your papers, your notes and how they cite each other, in one local app.**

A free, open-source reference manager for macOS, Windows and Linux: your papers, your notes and a live map of how they cite each other, in one app on your own computer.

<!-- the release workflow points these buttons at each new version -->
<a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.pkg"><img src="docs/assets/readme/download-macos.svg" alt="Download for macOS (Apple Silicon)" height="52" /></a> <a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64-setup.exe"><img src="docs/assets/readme/download-windows.svg" alt="Download for Windows" height="52" /></a> <a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_amd64.AppImage"><img src="docs/assets/readme/download-linux.svg" alt="Download for Linux (AppImage)" height="52" /></a>

[![Latest release](https://img.shields.io/github/v/release/Paperlines/paperlines?color=0e7490)](https://github.com/Paperlines/paperlines/releases/latest) [![Downloads](https://img.shields.io/github/downloads/Paperlines/paperlines/total?color=0e7490)](https://github.com/Paperlines/paperlines/releases) [![CI](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml/badge.svg)](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml) [![Licence: AGPL v3+](https://img.shields.io/badge/licence-AGPL--3.0--or--later-0e7490)](LICENSE) [![Last commit](https://img.shields.io/github/last-commit/Paperlines/paperlines?color=0e7490)](https://github.com/Paperlines/paperlines/commits/main) [![Stars](https://img.shields.io/github/stars/Paperlines/paperlines?style=social)](https://github.com/Paperlines/paperlines/stargazers)

[**Download**](#download) · [Features](#why-paperlines) · [Command line and MCP](#command-line-and-ai-assistants) · [FAQ](#questions-people-ask) · [Contributing](.github/CONTRIBUTING.md)

Free · Open source · No account · No cloud · No telemetry

**English** · [Español](docs/readme/README.es.md) · [Français](docs/readme/README.fr.md) · [Deutsch](docs/readme/README.de.md) · [简体中文](docs/readme/README.zh.md) · [日本語](docs/readme/README.ja.md) · [हिन्दी](docs/readme/README.hi.md)

</div>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/hero-dark.png" />
    <img src="docs/assets/readme/hero-light.png" alt="Paperlines: the library, a paper note with math and links, and the PDF reader side by side" width="100%" />
  </picture>
</p>

## Why Paperlines

Research reading happens in three places at once: a reference manager, a notes app and a pile of PDFs. Paperlines puts them in one window, on your own computer.

- **Collect.** Drop in PDFs, EPUBs or whole folders, paste a DOI, arXiv or PubMed ID, or import BibTeX, RIS, CSL-JSON or your Zotero library. Metadata is completed from Crossref and OpenAlex, and you review everything before it's saved.
- **Read and annotate.** A fast PDF reader with highlights in colours that mean something (key idea, method, disagree…), underlines and area selections. "Quote to note" drops a highlight into your note with a link back to the page.
- **Write notes that link.** Every paper has a note; free and project notes too. Markdown with `[[links]]`, `@citekey` citations, backlinks, tables and LaTeX math, rendered as you type.
- **See how papers connect.** Reference lists are fetched once and cached; the citation graph shows which of *your* papers cite which, and updates offline as you add more.
- **Cite anywhere.** About 80 citation styles, BibTeX files that stay up to date for LaTeX, and exports of everything, including the whole library as one folder.
- **Yours.** One SQLite file and your PDFs, in a folder you choose. Daily backups, one-click restore. Nothing leaves your computer except the lookups you ask for.

## A citation graph you can think with

<p align="center">
  <img src="docs/assets/readme/graph.png" alt="The citation graph in Tree layout, with a project's key papers in numbered steps" width="100%" />
</p>

- Papers float in a live force layout: drag one and its neighbours follow, hover to light up what it cites (blue) and what cites it (orange).
- Filled with the project's colour, bordered by read status. Filters for years, tags, projects, status, and a local graph around one paper.
- **Key papers (spine):** mark the papers a project rests on, step by step. The **Tree** layout grows the rest of the field from them; **Circle** groups everything by project and year.
- **Typed connections** in your own judgment: one paper *extends*, *contradicts*, *replicates* or *applies the method of* another, with a note and a highlight as evidence.

## Find what to read next

<p align="center">
  <img src="docs/assets/readme/citing.png" alt="A paper's citations and the papers citing it, sorted by most cited" width="100%" />
</p>

- **Papers citing this:** for any paper, the 2,000 most-cited works that cite it, from all of OpenAlex. Sort by **most connected** to see the ones that also cite other papers in your library, usually the best next reads.
- **Search online** across OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC, DataCite and DOAJ at once, merged into one list that marks what you already have. All free.
- Duplicates are found and merged without losing a note or highlight.

## Save papers from your browser

<p align="center">
  <a href="https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf"><img src="docs/assets/readme/extension.png" alt="The Paperlines extension on an article page, ready to save the paper and its PDF" width="100%" /></a>
</p>

- **One click from the article:** on a journal's page, arXiv, PubMed or a DOI link, the Paperlines button shows the paper it found (title, authors, year, journal, identifiers) and saves it, with its PDF.
- **Knows what you have:** it tells you when a paper is already in your library; a paper you have without its PDF gets the PDF instead of a duplicate.
- **Your subscriptions work:** the PDF is downloaded with your own browser login.
- **Private:** it reads a page only when you click it, and hands what it finds to Paperlines on your computer, never to a server. It works even when the app is closed.
- **Works in** Google Chrome, Microsoft Edge, Brave, Arc, Vivaldi and Chromium.

**👉 [Add Paperlines to your browser](https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf)**, then click **Connect** in the app's **Settings → Browser extension**.

## Bring your own AI assistant

<p align="center">
  <img src="docs/assets/readme/assistants.png" alt="Settings → AI Assistants with the three Paperlines skills" width="80%" />
</p>

- **Assistant panel (⌘J):** chat with your own Claude Code or Codex about the paper, PDF or note you have open. It's read-only until you allow edits, and every change it makes is shown.
- **One-click connections** for Claude Code, Claude Desktop, Codex, Antigravity, Gemini CLI, Grok and Cursor, through the built-in MCP server, with three skills: working with your papers, writing structured paper notes (each point linked to its highlight in the PDF), and scouting for papers you're missing.
- Suggestions land in a project's **Suggested papers** inbox. Nothing enters your library without your click.

## Download

<!-- the release workflow updates these links to each new version -->
| Platform | Installer | Other formats |
| --- | --- | --- |
| **macOS**, Apple Silicon (M1 and later) | [Paperlines_0.1.4_aarch64.pkg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.pkg) | [.dmg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.dmg) |
| **macOS**, Intel | [Paperlines_0.1.4_x64.pkg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64.pkg) | [.dmg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64.dmg) |
| **Windows** 10/11, x64 | [Paperlines_0.1.4_x64-setup.exe](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64-setup.exe) (no admin needed) | [.msi](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64_en-US.msi) |
| **Linux**, x86_64 | [Paperlines_0.1.4_amd64.AppImage](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_amd64.AppImage) | [.deb](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_amd64.deb) · [.rpm](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines-0.1.4-1.x86_64.rpm) · [CLI](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/paperlines-x86_64-unknown-linux-gnu) |
| **Linux**, aarch64 | [Paperlines_0.1.4_aarch64.AppImage](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.AppImage) | [.deb](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_arm64.deb) · [.rpm](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines-0.1.4-1.aarch64.rpm) · [CLI](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/paperlines-aarch64-unknown-linux-gnu) |
| **NixOS** | `nix profile install github:Paperlines/paperlines` | see the notes below |

Every file is on the [Releases page](https://github.com/Paperlines/paperlines/releases/latest). Linux packages need glibc 2.35 or newer (Ubuntu 22.04, Debian 12, Fedora 36 and later).

**Browser extension (Chrome, Edge, Brave, Arc, Vivaldi):** save the paper you're reading, and its PDF, with one click. [Add it from the Chrome Web Store](https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf), then click **Connect** in the app's **Settings → Browser extension**. A [.zip](https://github.com/Paperlines/paperlines/releases/latest/download/paperlines-browser-extension.zip) is also available for browsers without the store.

### Updates, from inside the app

<p align="center">
  <img src="docs/assets/readme/update.png" alt="The update dialog: what's new, who made it, Update now or Later" width="420" />
</p>

When a new version is out, Paperlines tells you the next time it opens: what's new, who worked on it, and **Update now** or **Later**. Updates are signed and checked before they're installed. The macOS app, the Windows installers and the AppImage update themselves; `.deb`, `.rpm` and Nix installs update through their package manager. Turn the check off in Settings → General; offline mode never checks.

<details>
<summary>Platform notes: macOS installer, Linux, NixOS, COSMIC/Wayland</summary>

**macOS installer.** Open the `.pkg` and follow the steps. It installs Paperlines into Applications and the `paperlines` command into `/usr/local/bin`. To uninstall, delete the app and `/usr/local/bin/paperlines`; your library stays where it is.

**Unsigned macOS builds.** Right-click the app and choose **Open** the first time, then confirm. Builds signed in CI (see [Signing](docs/development.md#signing-and-notarization)) open normally.

**Linux.** The `.deb` and `.rpm` packages install the CLI as `paperlines`. For the AppImage, put the separate `paperlines-<triple>` file on your PATH, or use **Settings → Command line → Install command-line tool**.

**NixOS.** The repository is a flake that builds the app and the CLI from source (x86_64 and aarch64):

```sh
nix run github:Paperlines/paperlines            # try it
nix profile install github:Paperlines/paperlines
```

In a NixOS or home-manager configuration, add the flake as an input and use its overlay:

```nix
nixpkgs.overlays = [ inputs.paperlines.overlays.default ];
environment.systemPackages = [ pkgs.paperlines ];   # or home.packages
```

This installs the app with its desktop entry and icon, and the `paperlines` command. Notes:
- API keys go to the Secret Service. Enable one (`services.gnome.gnome-keyring.enable = true;`, or KeePassXC); without it they are kept in an encrypted file instead.
- The AppImage does not run on NixOS as is; use the flake (or `appimage-run`).

**COSMIC (and other Wayland desktops).** Built for COSMIC; not yet tested on it, so reports are welcome:
- Light/dark follows the desktop setting (read from the XDG desktop portal, which COSMIC, GNOME and KDE use), including switching while the app is open. The **System** theme in Settings means this.
- The window has a proper app ID, so the dock shows the right icon and groups the window with its launcher.
- On NVIDIA's driver under Wayland, WebKitGTK's DMA-BUF renderer is turned off automatically (it shows a blank window there). Set `WEBKIT_DISABLE_DMABUF_RENDERER=0` to keep it on.
- File dialogs are GTK's. The window has no system title bar or menu bar: Paperlines' own top bar has the window buttons, and you drag it to move the window.

</details>

## Command line and AI assistants

The `paperlines` command works on the same library as the app. The macOS `.pkg` installs it; elsewhere use **Settings → Command line → Install command-line tool**.

<details>
<summary>Commands</summary>

The macOS `.pkg` installs it for you. Otherwise use **Settings → Command line → Install command-line tool**. On macOS it links the CLI bundled in the app into `~/.local/bin/paperlines`. Then:

```sh
paperlines search 'tag:ml year:>=2020 attention'
paperlines show vaswani2017attention          # metadata, counts and the paper note
paperlines note devlin2019bert --add 'Masked LM pre-training'
paperlines cites devlin2019bert               # library papers it cites (also: cited-by)
paperlines add paper.pdf 10.1038/nature14539 refs.bib --fetch-refs
paperlines export -f bibtex --project Thesis -o thesis.bib
paperlines export-notes ~/notes-export
paperlines fetch-refs                         # every paper without a reference list
paperlines doctor [--fix]                     # integrity, files, edges, search index
paperlines backup [--list | --restore FILE --yes]
paperlines cite vaswani2017attention --style ieee   # -b for a reference list; `paperlines styles` lists styles
paperlines rm KEY... / paperlines trash [list | restore KEY... | empty [--older-than DAYS]]
paperlines citing vaswani2017attention -s connected   # papers anywhere citing it (also: cited, newest)
paperlines relate chen2022 extends smith2021 --note "same loss"   # also: unrelate, relations [KEY], relation-types
paperlines duplicates [--merge | --dismiss]
paperlines find-pdf [KEY...]                  # open-access PDFs via OpenAlex
paperlines import-zotero [~/Zotero] / paperlines import-dump library.json
paperlines auto-export add -f bibtex thesis.bib [--project Thesis]
paperlines paths [--set-library DIR]
```

Every command accepts `--json`. `--library DIR` or `PAPERLINES_LIBRARY=DIR` selects another library. The CLI, the app and the MCP server share one implementation (`crates/ops`), so their results are identical.

</details>

<details>
<summary>MCP server for Claude Code, Claude Desktop and others</summary>

```sh
claude mcp add paperlines -- paperlines mcp
```

Claude Desktop: add this to `claude_desktop_config.json`:

```json
{ "mcpServers": { "paperlines": { "command": "paperlines", "args": ["mcp"] } } }
```

Tools: `search_library`, `get_item`, `get_paper_note`, `list_citations`, `find_citing_papers`, `list_relations`, `export_bibliography` (all read-only; `find_citing_papers` uses the network unless its answer is cached), `add_bullet` (appends one bullet to a paper note) and `add_relation` (records a typed connection the user asked for). The server only talks over stdin and stdout.

</details>

## Questions people ask

<details>
<summary>Do I need an account? Does anything go to the cloud?</summary>

No account, no cloud, no telemetry. The library is a folder on your computer. The only network requests are metadata, reference and citing-paper lookups (Crossref, OpenAlex, Semantic Scholar, arXiv) when you add papers or ask for them, which send identifiers such as a DOI, and one request to GitHub when the app opens, to see whether a new version is out. **Settings → Offline mode** turns all of it off.

</details>

<details>
<summary>Can I move from Zotero?</summary>

Yes. **Add → Import from Zotero** brings in papers with their PDFs, collections (as projects), tags, notes and highlights. Zotero's database is copied first and never changed, so you can keep using both.

</details>

<details>
<summary>Where is my data, and how do I back it up?</summary>

| | macOS | Linux |
| --- | --- | --- |
| Library (database, `pdfs/`, `backups/`; movable in **Settings → Library**) | `~/Library/Application Support/Paperlines/` | `$XDG_DATA_HOME/paperlines/` (default `~/.local/share/paperlines/`) |
| Config (API key fallback) | `~/Library/Application Support/Paperlines/` | `$XDG_CONFIG_HOME/paperlines/` |
| Cache | `~/Library/Caches/Paperlines/` | `$XDG_CACHE_HOME/paperlines/` |

- **The library** is one SQLite file (WAL, FTS5) plus PDFs stored by content hash. Original files are copied in, never changed.
- **Cloud folders.** If you keep the library in iCloud Drive or Dropbox, quit the app before syncing. A cloud client must not sync an open SQLite database.
- **API keys.** Keys (Semantic Scholar and OpenAlex, both optional) go to the macOS Keychain or the Linux Secret Service. Without a Secret Service they go to an encrypted file in the config folder.

A backup is taken every day and before every upgrade; **Settings → Library** restores one with a click, and `paperlines backup` does the same from a terminal.

</details>

<details>
<summary>Does it work with LaTeX?</summary>

Yes. Copy citations in about 80 styles, export BibTeX, CSL-JSON or RIS, and use **Keep this file updated** to rewrite a `.bib` file whenever the library changes, like Better BibTeX.

</details>

<details>
<summary>Everything Paperlines does</summary>

- **Library.** Add papers by dropping PDFs, EPUBs or folders, or from DOIs, arXiv IDs, and BibTeX, RIS or CSL-JSON files. Each file is listed by title and author, not file name. Metadata comes from the file (PDF info, EPUB package data) and is completed through Crossref or OpenAlex. A PDF without a DOI is matched by its first-page text. You review everything before it is saved. The library is a sortable table (title, creator, year, date added), and all the bibliographic fields are editable: volume, issue, pages, publisher, place, ISBN/ISSN, edition, series and editors.
- **Import from Zotero.** Brings in papers with their PDFs, collections (as projects), tags, notes and highlights. Zotero's database is copied first and never changed. A JSON dump from this app imports too.
- **Duplicates and Trash.** A Duplicates view finds papers with the same PDF, or nearly the same title in the same year. Merge them into one, keeping every note, highlight, tag and file. Deleting moves papers to the Trash (with Undo); it empties itself after 30 days (configurable).
- **Search.** Full-text search covers titles, authors, abstracts, notes and highlights, with qualifiers: `tag:ml/nlp project:"Thesis" author:hinton year:>=2020 is:unread has:pdf cites:<citekey> cited-by:<citekey>`, and `-` excludes a term. Searches can be saved.
- **Organize.** Colored, hierarchical tags (rename and merge), projects, read status, ratings, and a command palette (⌘K / Ctrl+K).
- **Read.** A PDF.js reader with highlights, underlines and area selections. Highlight colors carry meanings (yellow = key idea, and so on). "Quote to note" copies a highlight into the paper note with a link back to the page. "Export annotated PDF" writes a copy; the original is never modified.
- **Quick add.** Paste a DOI, arXiv or PubMed ID, or a title into the box in the top bar and press Enter to review and add it; the button at its end has the other ways in (files, folders, BibTeX, Zotero, a library export, online search).
- **Paper notes.** Every paper has one note. Its header (title, authors, dates) is generated from the paper; the body is your bullets. Notes are Markdown with `[[links]]` to other notes and papers (typing `[[` suggests them, and offers a new note when nothing matches; following it creates the note), `@citekey`, math and backlinks. Math is LaTeX: `$…$` inline and `$$…$$` for a centered formula, also over several lines, rendered with KaTeX. Inside math, typing `\` completes commands with their symbol (`\al` → `\alpha` α), and the editor's toolbar has titles and headings, bold, italic, strikethrough and code, bullet, numbered and check lists and quotes (with shortcuts: ⌘B, ⌘I, ⌘E, ⌘⇧X, ⌘⇧8/7/9, ⌘⌥1–3; each button toggles, and Enter continues a list), a link button, inline and block formula buttons, and an **Ω** palette of Greek letters, operators, relations, arrows, set and logic symbols, and accents. Live preview: Markdown and formulas render as you type, except where you are editing. Free notes and project notes work the same way.
- **Search online.** One search across OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC (life sciences, with free full text), DataCite (datasets, software and preprints) and DOAJ (open-access journals), merged into one ranked list; switch sources on and off, see which papers you already have, and map the results into a project graph. All free; only OpenAlex and Semantic Scholar take an optional key.
- **Citation graph.** Reference lists are fetched once (OpenAlex, then Semantic Scholar, or your own GROBID server) and cached; OpenCitations, an open citation index, adds references they missed and stands in when neither knows a paper. Only papers in your library appear in the graph. Papers you add later are linked offline from the cache. You can add or remove links by hand, and recomputation keeps those decisions.
- **Graph view.** Papers are rounded boxes labelled by first author and year ("Smith ’21"), or as dots. A live force layout: papers float and settle, dragging one pulls its neighbors along, labels fade in as you zoom, and hovering lights up a paper's citations (blue: it cites, orange: cites it) and dims the rest. Papers are filled with their project's color and bordered by read status; selection and keyboard focus draw an outline around the box, and a small legend on the canvas says what the colors mean. The gear docks the graph settings beside the graph (widening it first when the pane is narrow): **Filters** (search, unlinked papers, years, tag, project, status, local graph around the selected paper), **Groups** (color by project, tag or status; status ring; legend), **Display** (boxes or dots, force or by-year layout, labels, arrows, text fade, node size, link thickness, overview map) and **Forces** (center, repel, link force, link distance). Hovering a paper shows its note card; click to pin and edit it; double-click or Enter opens the PDF.
- **Typed connections.** Record how papers relate, in your judgment: one *extends*, *contradicts*, *replicates* or *applies the method of* another, or a type you define (e.g. *supports* / *supported by*). Each connection reads correctly from both papers ("Extends" / "Extended by"), can carry a note and a PDF highlight as evidence, and shows in the graph as a colored, labelled link that can be filtered by type. Add them from a paper's Citations tab, the right-click menu, ⌘K, or in the graph by ⌥-dragging from one paper onto another. Also `paperlines relate chen2022 extends smith2021` and the MCP tools `list_relations` / `add_relation`.
- **Papers citing this.** For any paper with a DOI or arXiv ID, see who cites it, from all of OpenAlex (Semantic Scholar as a fallback): the 2,000 most cited, sortable by citations, date, or **most connected**, meaning the papers that also cite other papers in your library, usually the best next reads. Filter, mark which are already in your library, and add the ones you want through the import review. Kept for a week; `paperlines citing` and the MCP server do the same.
- **Key papers (spine).** Mark the papers a project rests on, step by step: the idea, then what built on it. A step can hold several papers (two groups that found the same thing at once). Build it in the project dialog or by right-clicking a paper → *Add to spine*. The graph draws key papers as amber boxes numbered by step (①, ②…), joined by a gold path. Two more layouts use it: **Tree** grows left to right from the spine, each step a named box on the trunk and each other paper hanging from the key paper it is closest to; **Circle** puts every paper on one ring, grouped by project and ordered by year (dots above 150 papers). Also `paperlines spine "Thesis" add smith2018 --step 1`.
- **Assistant panel.** ⌘J (or the assistant button) opens a chat with your own **Claude Code** or **Codex**, signed in with your own account, so there's no API key to set up. The panel offers the agents you've connected in Settings ▸ AI Assistants; switch between them from its header (switching starts a new chat). It sees only your Paperlines library, through the same tools as the MCP server. It knows which paper, PDF or note you have open and suggests things to ask about it. Its steps fold into one line you can open, and `@citekey` and highlight links in its replies open the paper or the page. It's **Read only** until you switch it to **Can edit**; then it can write notes, highlights, connections and suggestions (it never deletes), and every change it makes is shown in the chat.
- **Appearance.** Settings ▸ Appearance: theme, accent colour (teal, blue, violet, green, amber, rose), layout (sidebar and assistant on either side: Classic, Mirrored, both left, both right), thin or regular icons, and optional labels under the top bar's icons.
- **AI assistants.** Settings → AI Assistants connects the built-in MCP server to Claude Code, Claude Desktop, Codex, Antigravity, Gemini CLI, Grok and Cursor with one click (it edits each assistant's own config, or uses its own `mcp add` command, keeping everything else), and installs three skills: **paperlines** (working with your papers), **paperlines-notes** (writing paper notes in your Key idea / Method / Why it matters format, or argument by argument: it highlights the sentence behind each argument in the PDF, in the colour for its meaning, and links each point of the note to its highlight; also project syntheses and related-work drafts; it shows the text and asks before saving, and never overwrites) and **paperlines-scout** (finding papers you're missing). The assistant sees your projects and what your library is about, reads a paper's PDF, highlights passages by quoting them (the reader places them on the page the next time the PDF is open), and can create notes or add to them. The app picks up what it changed whenever its window comes back to the front. Ask it what to read next: it suggests papers with reasons (cited by several of your project papers, citing several of them, related, or matching a topic) and puts them in the project's **Suggested papers** inbox, where you add or dismiss each one; nothing enters your library without your click, and dismissed papers never come back. Also `paperlines suggest --project NAME [--topic …] [--post]` and `paperlines projects`.
- **Tabs and layouts.** PDFs, notes and the graph open as tabs. Three layouts: library only, library with reader, and reader only.
- **Cite.** Copy a citation (⌘⇧C) or a bibliography entry (⌘⇧B) in any of about 80 built-in CSL styles (APA, Chicago, IEEE, Nature, Vancouver…). It pastes as rich text in Word or Google Docs. **Find open-access PDF** fetches a legal copy through OpenAlex.
- **Export.** BibTeX, CSL-JSON, RIS, a Markdown reference list, a formatted bibliography (HTML, in any style), and a folder of Markdown notes. **Whole library** writes one folder, `library.json` plus `pdfs/`, with everything: papers and their PDFs, notes, highlights, tags, projects with their colours and key papers, the citation graph (including links you set by hand) and typed connections with their evidence. **Add ▸ Import library…** brings it into another library (on another computer, or merged into an existing one: papers already there are skipped). Also `paperlines export-library DIR` and `paperlines import-dump FOLDER`. **Keep this file updated** rewrites a `.bib` (or other) file whenever the library changes, like Better BibTeX, so LaTeX projects stay current.
- **Help where you need it.** The ⓘ buttons in Settings and next to search, Trash and Duplicates explain each option.
- **Safety.** A daily backup with one-click restore, a backup before every schema upgrade, transactions everywhere, and `doctor`.
- **Command line and MCP.** The `paperlines` CLI, and an MCP server so Claude Code or Claude Desktop can search your library and add bullets to paper notes. It runs locally over stdio, never on the network.

The only network access is metadata, reference and citing-paper lookups (Crossref, OpenAlex, Semantic Scholar, arXiv), and only when you add papers or ask for them, plus one request to GitHub when the app opens to see whether a new version is out (Settings → General turns it off). Only identifiers (DOI, arXiv ID) are sent. A free OpenAlex API key (Settings → Citations) gives your own daily allowance; without one, lookups share a small one with your network. **Settings → Offline mode** turns all of it off.

</details>

## Build from source

Prerequisites:

- Node 26+, pnpm 12.21 (exact version in `package.json`), Rust via rustup (version pinned in `rust-toolchain.toml`)
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Debian/Ubuntu:** `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev patchelf build-essential curl file`
- **Fedora:** `sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel libsecret-devel openssl-devel`
- **Arch:** `sudo pacman -S webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg libsecret base-devel`

```sh
pnpm install
pnpm tauri dev        # run the app (builds the CLI sidecar first)
pnpm tauri build      # macOS: .app + .dmg; Linux: .deb, .rpm, AppImage
pnpm build:pkg        # macOS: the .pkg installer, from the .app built above
```

For a universal macOS build, run `rustup target add x86_64-apple-darwin aarch64-apple-darwin`, then `pnpm tauri build --target universal-apple-darwin`.

Checks, architecture and conventions are in [docs/development.md](docs/development.md) and [docs/architecture.md](docs/architecture.md).

## Learn more

- [What's new](docs/CHANGELOG.md): every version's changes
- [Development](docs/development.md): checks, releases, signing, Nix, Windows, renaming
- [Architecture](docs/architecture.md): how the code is organized and why
- [Contributing](.github/CONTRIBUTING.md): how to help

## Community

Bug reports, ideas and pull requests are welcome: [open an issue](https://github.com/Paperlines/paperlines/issues) or read [CONTRIBUTING.md](.github/CONTRIBUTING.md) to get started. Thanks to everyone who has contributed:

<a href="https://github.com/Paperlines/paperlines/graphs/contributors"><img src="https://contrib.rocks/image?repo=Paperlines/paperlines" alt="Contributors" /></a>

If Paperlines helps your research, a ⭐ on GitHub helps other researchers find it.

## Cite Paperlines

<details>
<summary>BibTeX</summary>

```bibtex
@software{paperlines,
  author  = {{The Paperlines contributors} and Yoav Yosif-Or},
  title   = {{Paperlines}: a local-first reference manager},
  year    = {2026},
  url     = {https://github.com/Paperlines/paperlines},
  license = {AGPL-3.0-or-later}
}
```

**Help & About → Cite Paperlines** in the app gives the entry with your exact version, and in APA.

</details>

## Licence

Copyright © 2026 the Paperlines contributors and Yoav Yosif-Or. Paperlines is free software under the [GNU Affero General Public License v3.0 or later](LICENSE): you may use, study, share and change it, and if you distribute a changed version (including running it as a network service), you must share your changes under the same licence.

<sub>Claude, Codex, Gemini, Antigravity, Grok and Cursor are trademarks of their respective owners. Their names and icons appear only to show which tools Paperlines works with, not an endorsement. The assistant icons come from [Lobe Icons](https://github.com/lobehub/lobe-icons) (MIT licence, see `src/assets/agents/LICENSE-lobe-icons.txt`).</sub>

---

<p align="center">
  Created by <a href="https://github.com/yoav-yosifor"><strong>Yoav Yosif-Or</strong></a>
</p>
