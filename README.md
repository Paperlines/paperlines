# Paperlines

[![CI](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml/badge.svg)](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Paperlines/paperlines)](https://github.com/Paperlines/paperlines/releases/latest)
[![Licence: AGPL v3+](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue)](LICENSE)

A local-first reference manager for macOS, Windows and Linux: a library like Zotero, notes like Obsidian, and a citation graph like Connected Papers, in one desktop app. No account, no cloud, no telemetry.

The name and icon are placeholders. See [Renaming](#renaming-and-icons).

## What it does

- **Library.** Add papers by dropping PDFs, EPUBs or folders, or from DOIs, arXiv IDs, and BibTeX, RIS or CSL-JSON files. Like Zotero, each file is listed by title and author, not file name. Metadata comes from the file (PDF info, EPUB package data) and is completed through Crossref or OpenAlex. A PDF without a DOI is matched by its first-page text. You review everything before it is saved. The library is a sortable table (title, creator, year, date added), and the full Zotero-style fields are editable: volume, issue, pages, publisher, place, ISBN/ISSN, edition, series and editors.
- **Import from Zotero.** Brings in papers with their PDFs, collections (as projects), tags, notes and highlights. Zotero's database is copied first and never changed. A JSON dump from this app imports too.
- **Duplicates and Trash.** A Duplicates view finds papers with the same PDF, or nearly the same title in the same year. Merge them into one, keeping every note, highlight, tag and file. Deleting moves papers to the Trash (with Undo); it empties itself after 30 days (configurable).
- **Search.** Full-text search covers titles, authors, abstracts, notes and highlights, with qualifiers: `tag:ml/nlp project:"Thesis" author:hinton year:>=2020 is:unread has:pdf cites:<citekey> cited-by:<citekey>`, and `-` excludes a term. Searches can be saved.
- **Organize.** Colored, hierarchical tags (rename and merge), projects, read status, ratings, and a command palette (⌘K / Ctrl+K).
- **Read.** A PDF.js reader with highlights, underlines and area selections. Highlight colors carry meanings (yellow = key idea, and so on). "Quote to note" copies a highlight into the paper note with a link back to the page. "Export annotated PDF" writes a copy; the original is never modified.
- **Quick add.** Paste a DOI, arXiv or PubMed ID, or a title into the box in the top bar and press Enter to review and add it; the button at its end has the other ways in (files, folders, BibTeX, Zotero, a library export, online search).
- **Paper notes.** Every paper has one note. Its header (title, authors, dates) is generated from the paper; the body is your bullets. Notes are Markdown with `[[links]]` to other notes and papers (typing `[[` suggests them, and offers a new note when nothing matches; following it creates the note), `@citekey`, math and backlinks. Math is LaTeX: `$…$` inline and `$$…$$` for a centered formula, also over several lines, rendered with KaTeX. Inside math, typing `\` completes commands with their symbol (`\al` → `\alpha` α), and the editor's toolbar has titles and headings, bold, italic, strikethrough and code, bullet, numbered and check lists and quotes (with shortcuts: ⌘B, ⌘I, ⌘E, ⌘⇧X, ⌘⇧8/7/9, ⌘⌥1–3; each button toggles, and Enter continues a list), a link button, inline and block formula buttons, and an **Ω** palette of Greek letters, operators, relations, arrows, set and logic symbols, and accents. Live preview works like Obsidian: Markdown and formulas render as you type, except where you are editing. Free notes and project notes work the same way.
- **Search online.** One search across OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC (life sciences, with free full text), DataCite (datasets, software and preprints) and DOAJ (open-access journals), merged into one ranked list; switch sources on and off, see which papers you already have, and map the results into a project graph. All free; only OpenAlex and Semantic Scholar take an optional key.
- **Citation graph.** Reference lists are fetched once (OpenAlex, then Semantic Scholar, or your own GROBID server) and cached; OpenCitations, an open citation index, adds references they missed and stands in when neither knows a paper. Only papers in your library appear in the graph. Papers you add later are linked offline from the cache. You can add or remove links by hand, and recomputation keeps those decisions.
- **Graph view, like Obsidian's.** Papers are rounded boxes labelled by first author and year ("Smith ’21"), or Obsidian-style dots. A live force layout: papers float and settle, dragging one pulls its neighbors along, labels fade in as you zoom, and hovering lights up a paper's citations (blue: it cites, orange: cites it) and dims the rest. Papers are filled with their project's color and bordered by read status; selection and keyboard focus draw an outline around the box, and a small legend on the canvas says what the colors mean. The gear docks Obsidian-style settings beside the graph (widening it first when the pane is narrow): **Filters** (search, unlinked papers, years, tag, project, status, local graph around the selected paper), **Groups** (color by project, tag or status; status ring; legend), **Display** (boxes or dots, force or by-year layout, labels, arrows, text fade, node size, link thickness, overview map) and **Forces** (center, repel, link force, link distance). Hovering a paper shows its note card; click to pin and edit it; double-click or Enter opens the PDF.
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

## Install

Download the latest version from **[Releases](https://github.com/Paperlines/paperlines/releases/latest)**:

| Platform | Files |
| --- | --- |
| macOS (Apple Silicon / Intel) | `Paperlines_<version>_aarch64.pkg` (installer) or `.dmg` (drag to Applications); `_x64` for Intel |
| Windows 10/11 (x64) | `Paperlines_<version>_x64-setup.exe` (per-user, no admin) or `.msi` |
| Linux x86_64 / aarch64 | `.AppImage`, `.deb`, `.rpm`, plus `paperlines-<triple>` (the CLI) |

**Updates.** When a new version is released, Paperlines tells you the next time it opens: what's new, who worked on it, and **Update now** or **Later**. Updates are signed, and the app checks the signature before installing. The macOS app, the Windows installers and the AppImage update themselves; with a `.deb`, `.rpm` or Nix install, update through your package manager (the app links to the download page). **Help & About → Check for updates** checks at any time; **Settings → General** turns the automatic check off, and offline mode never checks.

**macOS installer.** Open the `.pkg` and follow the steps. It installs Paperlines into Applications and the `paperlines` command into `/usr/local/bin`. To uninstall, delete the app and `/usr/local/bin/paperlines`; your library stays where it is.

**Unsigned macOS builds.** Right-click the app and choose **Open** the first time, then confirm. Builds signed in CI (see [Signing](#signing-and-notarization)) open normally.

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
- File dialogs are GTK's; the title bar is drawn by GTK too.

## Command line

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

## Claude Code / Claude Desktop (MCP)

```sh
claude mcp add paperlines -- paperlines mcp
```

Claude Desktop: add this to `claude_desktop_config.json`:

```json
{ "mcpServers": { "paperlines": { "command": "paperlines", "args": ["mcp"] } } }
```

Tools: `search_library`, `get_item`, `get_paper_note`, `list_citations`, `find_citing_papers`, `list_relations`, `export_bibliography` (all read-only; `find_citing_papers` uses the network unless its answer is cached), `add_bullet` (appends one bullet to a paper note) and `add_relation` (records a typed connection the user asked for). The server only talks over stdin and stdout.

## Where data lives

| | macOS | Linux |
| --- | --- | --- |
| Library (database, `pdfs/`, `backups/`; movable in **Settings → Library**) | `~/Library/Application Support/Paperlines/` | `$XDG_DATA_HOME/paperlines/` (default `~/.local/share/paperlines/`) |
| Config (API key fallback) | `~/Library/Application Support/Paperlines/` | `$XDG_CONFIG_HOME/paperlines/` |
| Cache | `~/Library/Caches/Paperlines/` | `$XDG_CACHE_HOME/paperlines/` |

- **The library** is one SQLite file (WAL, FTS5) plus PDFs stored by content hash. Original files are copied in, never changed.
- **Cloud folders.** If you keep the library in iCloud Drive or Dropbox, quit the app before syncing. A cloud client must not sync an open SQLite database.
- **API keys.** Keys (Semantic Scholar and OpenAlex, both optional) go to the macOS Keychain or the Linux Secret Service. Without a Secret Service they go to an encrypted file in the config folder.

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

## Signing and notarization

Unsigned builds work everywhere; signing is optional and driven by environment variables (GitHub secrets in CI):

| Variable | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE` | base64 of your "Developer ID Application" `.p12` (`base64 -i cert.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | notarization: Apple ID, an app-specific password, team ID |
| `APPLE_INSTALLER_IDENTITY` | signs the `.pkg`: `Developer ID Installer: Your Name (TEAMID)` (the certificate must be in your keychain) |
| `APPLE_INSTALLER_CERTIFICATE`, `APPLE_INSTALLER_CERTIFICATE_PASSWORD` | CI only: base64 `.p12` of that installer certificate and its password |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | release workflow: signs the in-app updates (the public key is `updaterPubkey` in `branding.json`) |

Locally, export them and run `pnpm tauri build`. The hardened runtime is enabled, as notarization requires. In CI, add them as repository secrets and the workflow picks them up. Linux packages are not signed.

## Renaming and icons

All brand strings live in `branding.json`.

```sh
node scripts/rename.mjs "New Name"     # rewrites branding.json, crate/package names, bundle ID, .desktop file, docs
pnpm install                           # refresh the lockfile
pnpm tauri icon branding/icon-1024.png # regenerate src-tauri/icons (icns, ico, Linux PNG sizes)
```

Colors are CSS variables in `src/tokens.css`. A rebrand only changes that palette.

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setting up, the checks to run and how releases are made, and [open an issue](https://github.com/Paperlines/paperlines/issues) for problems.

## Trademarks

Claude, Codex, Gemini, Antigravity, Grok and Cursor are trademarks of their respective owners. Their names and icons appear only to show which tools Paperlines works with, not an endorsement. The assistant icons come from [Lobe Icons](https://github.com/lobehub/lobe-icons) (MIT licence, see `src/assets/agents/LICENSE-lobe-icons.txt`).

## Licence

Copyright © 2026 the Paperlines contributors and Yoav Yosif-Or.

Paperlines is free software under the [GNU Affero General Public License v3.0 or later](LICENSE): you may use, study, share and change it, and if you distribute a changed version (including running it as a network service), you must share your changes under the same licence.
