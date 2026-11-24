# Architecture

## Layers

- `crates/core`: domain model, SQLite access and migrations, paths, attachments, settings, and the `platform` module. No Tauri dependency, so the CLI and MCP server (M6) share it.
- `crates/search`: query parser and compiler to SQL + FTS5. `packages/search-query` is its TypeScript twin (autocomplete, fake backend); both are tested against `crates/search/fixtures/queries.json`.
- `crates/ops`: library operations shared by the app, the CLI and the MCP server (resolve, search, details, citations, add, fetch references, export, dump, notes folder, graph), so all three give identical results.
- `crates/cli`: the `paperlines` binary (clap). `paperlines mcp` runs the MCP server.
- `crates/mcp`: MCP over stdio (newline-delimited JSON-RPC 2.0, protocol 2025-06-18 with fallbacks). It has no network listener, and its tools wrap `ops`.
- `crates/agent`: the assistant panel's agents. `cli.rs` has the shared process runner (stdin prompt, JSON lines on stdout, stderr drained in a thread, Stop kills the process) and Claude Code (`claude -p --output-format=stream-json --include-partial-messages`, `--strict-mcp-config` with only our MCP server, `--allowedTools` limited to read-only Paperlines tools unless Can edit, `--resume`). `codex.rs` runs Codex (`codex exec --json --skip-git-repo-check --sandbox read-only`, our server via `-c mcp_servers.paperlines.*`, `enabled_tools` = read-only tools unless Can edit, `default_tools_approval_mode="approve"`, `exec … resume <thread_id> -`; the app's instructions go in the first message). Each agent's own steps are hidden; only Paperlines tool calls show. Settings (`agent`, `cliAllowWrites`) live in `assistant.json`. Chats are saved in the library (`assistant_chats`, migration 0010; `core::chats`): agent, its session id (resumed with `--resume` / `exec resume` after a restart), title, the paper or note it was about, and the panel's transcript as JSON; the library export carries them without the session id.
- `crates/citations`: reference fetching (OpenAlex, then Semantic Scholar, then an optional local GROBID), the reference cache, matching and edges.
- `crates/import`: identifier parsing, BibTeX, CSL-JSON, PDF metadata (lopdf), Crossref/OpenAlex lookups (ureq), and the import pipeline.
- `src-tauri`: thin IPC commands over the crates, native menu, window behavior (`src-tauri/src/platform.rs`).
- `packages/*`: TypeScript engines consumed as source. They depend only on ports, never on stores, Tauri or `src/`.
- `packages/pdf-viewer`: PDF.js (legacy build, for older WKWebView/webkit2gtk) with lazy page rendering, a text layer, a highlight layer and selection/area tools. Highlight geometry lives in pure functions (`geometry.ts`). Its text-layer CSS is a flattened copy of PDF.js's, because the stock file uses CSS nesting.
- `packages/graph`: Cytoscape.js directed graph (canvas). The static layouts (by year, tree, circle) are pure functions in `layout.ts` (tested); the force layout is a live d3-force simulation (see below). Above 600 nodes it draws a cached texture and hides edges while panning or zooming, and shows labels only when zoomed in.
- `packages/notes-editor`: CodeMirror 6 editor (Markdown, `[[`/`@` completion, optional Vim) and a markdown-it renderer with KaTeX, wikilinks and citations. Raw HTML in notes is never rendered.
- `src/`: app shell. `src/backend.ts` picks the adapter: `src/tauri.ts` inside the app, `src/fake-backend.ts` in a plain browser (dev, Playwright).

## Storage

One library folder. It is chosen in this order: `--library` / the env var, then `library_path` in `config.json` in the config dir (set from Settings → Library or `paths --set-library`), then the OS data dir (see `platform.rs`).

    library.sqlite   WAL, foreign keys, FTS5; schema in crates/core/migrations/
    pdfs/<sha256>.pdf  originals are copied in and never modified (EPUBs: <sha256>.epub)
    backups/

Moving the library (Settings) writes a `VACUUM INTO` copy plus the files to the new folder, points the config there and restarts. The old folder is never deleted.

**Trash.** `items.deleted_at` marks trashed papers. Every list, count, search, citation edge and the matcher excludes them; duplicate detection on import still sees them, because the DOI index is unique. The app purges papers older than `trash_days` (setting, default 30, 0 = never) at startup.

**Duplicates.** `core::duplicates::find_groups` groups papers with the same PDF hash or a fuzzy-equal title within a year (token index plus union-find), skipping pairs in `dismissed_duplicates`. `merge` moves fields, tags, projects, notes, attachments, highlights, edges and note links onto the kept paper, then trashes the others.

**Auto-exports.** The `auto_exports` rows are files rewritten when the library changes (`ops::manage::refresh_auto_exports`). Each file is written only if its content changed. The app polls `total_changes()` every 3 s; the CLI refreshes after each mutating command.

Migrations are ordered SQL files tracked by `PRAGMA user_version`. Never edit a shipped migration; add a new one. Before migrating an existing library the app copies it to `backups/pre-migration-v<old>-<time>.sqlite`.

`items_fts` holds one document per item (rowid = item id: title, authors, abstract, notes, meta), kept current by SQL triggers on items, item_authors and notes.

Every item gets exactly one paper note (a partial unique index enforces it). Citation edges reference library items only.

## Import

Two steps so the user can review before anything is written:

1. `preview_paths` / `preview_text` build `Candidate`s (PDF metadata, then a Crossref or OpenAlex lookup unless offline mode is on), then `mark_duplicates` checks DOI, arXiv ID, fuzzy title within one year, and PDF content hash.
2. `commit` applies the user's add, merge or skip decisions, one transaction per candidate.

EPUB metadata comes from the OPF package (title, creators with roles, ISBN, publisher, language). For a PDF without a DOI or arXiv ID, the first page's text is searched on Crossref; the match is accepted only if its title appears on that page.

**Zotero import** (`import::zotero`) copies `zotero.sqlite` to a temp file and reads that copy, so Zotero can stay open and is never written to. Items, creators, tags, collections (as projects named by their path), stored and linked attachments, notes (HTML to Markdown) and annotations (highlight, underline, image) map onto the same `ItemInput`, then go through the regular duplicate check.

**Citing papers** (`citations::citing`). Who cites a library paper, from all of OpenAlex: `works?filter=cites:W…`, sorted by citation count, 200 per page with plain page numbers (cursor paging needs an API key), up to 2,000 works. Semantic Scholar is the fallback. Results are cached in `citing_cache` for a week. A trigger clears the cache and `items.openalex_id` when a paper's DOI or arXiv ID changes.
- **"Connected":** each OpenAlex work comes with `referenced_works`. Intersecting those with the library's OpenAlex IDs (looked up once, 50 DOIs per request; `''` means "not in OpenAlex") tells which other library papers it cites.
- **Lock discipline:** the app runs `prepare` (read), `download` (network, no lock) and `save` (write) separately; the CLI and MCP call `run`.
- **Library papers among the citing works:** they are matched by OpenAlex ID or the usual matcher. No citation link is created from this list, because automatic links come only from each paper's own reference list and would be lost on the next recompute. Instead the view offers to fetch those papers' references.

**Spine** (`core::spine`, migration 0008). A project's key papers in ordered steps: `spine_steps(project_id, position, label)` and `spine_items(step_id, item_id, position)`, so a step can hold several papers. `add` puts a paper into the project and takes it out of any other step of that spine (a paper is in one step per project); `None` creates a step at the end. Removing a paper from a project removes it from that spine (`forget_items`); duplicate merges move spine places (`move_to`); papers in the Trash are left out of `get`. The JSON dump carries each project's spine as steps of citekeys. In the graph, spine papers get `data(spine)` (amber fill from the `--graph-spine-fill` token, the step number before the label); the border is always read status and selection/hover/keyboard focus use Cytoscape's `outline`. Consecutive steps are joined by `edge.spine` (every paper of one step to every paper of the next), which also feed the force layout; in the Tree layout each step is instead a compound parent node (`node.step`, named "Step 2 · Origins") and the path runs box to box. Paper-only handlers use `node:childless` so step boxes never take hover or taps. Removing a paper from a step drops the step if that left it empty and unnamed. `treePositions` runs a breadth-first search from all spine papers at once and lays out a tidy left-to-right tree with the steps stacked along the trunk (without a spine, each connected group is rooted at its most linked paper); `circlePositions` spaces papers along one ring by width, grouped by project and sorted by year.

**Suggestions and the assistant's research tools** (`ops::suggest`, `ops::research`, `core::suggestions`, migration 0009). `suggest` ranks papers the user doesn't have from a project, some papers or the library: references shared by several seed papers (offline, from the cached reference lists), works citing several seeds (OpenAlex `filter=cites:` with `referenced_works`), OpenAlex `related_works`, and an optional topic (`discover::search`); with three or more seeds a single shared link doesn't count. Papers in the library or already in that project's inbox (any status) are excluded. The inbox table keys each paper by DOI, arXiv ID or normalised title, unique per project; `mark_imported` turns suggestions whose paper is now in the library into "added". MCP tools: `list_projects`, `get_project`, `library_overview`, `suggest_papers`, `post_suggestions`, `list_notes`, `get_note`, `create_note`, `append_to_note` (append only; a project has one note). Three skills in `crates/ops/assets/skills/`; `ops::assistants` installs all of them; Grok uses `grok mcp add` or `~/.grok/config.toml`, skills in `~/.grok/skills`.

**AI assistants** (`ops::assistants`, Settings → AI assistants). One table of assistants with where each keeps its MCP servers and skills: Claude Code (through `claude mcp add/remove --scope user`, never editing `~/.claude.json` directly; status read from it), Claude Desktop (`claude_desktop_config.json`), Codex (`~/.codex/config.toml`, edited with `toml_edit` so comments and other tables stay), Antigravity (`~/.gemini/config/mcp_config.json`, and the older `~/.gemini/antigravity/mcp_config.json` when it exists), Gemini CLI (`~/.gemini/settings.json`) and Cursor (`~/.cursor/mcp.json`). JSON edits keep key order (`serde_json` `preserve_order`), refuse to touch a file that doesn't parse, and are written atomically. The skill is `crates/ops/assets/SKILL.md`, installed as `<skills dir>/paperlines/SKILL.md` (`~/.claude/skills`, `~/.agents/skills` for Codex, `~/.gemini/config/skills`, `~/.gemini/skills`); removing it deletes only that file. The registered program is `platform::mcp_command()`: the CLI inside the macOS bundle, the package's PATH link on Linux (never a `/nix/store` path), or the `~/.local/bin` copy for an AppImage. These paths follow each vendor's docs as of 2026-11 and may move; update the table in one place.

**Typed connections** (`core::relations`, migration 0007). `relation_types` holds the four built-in types (extends, contradicts, replicates, applies_method: renamable, not deletable) and the user's own; each has a label, an optional inverse label ("Extended by"; NULL means symmetric) and a color. `relations` links two papers with a type, a note and an optional evidence highlight (from either paper; `ON DELETE SET NULL`), unique per (from, to, type) so adding again updates. `for_item` words each connection from the paper's side. Papers in the Trash keep their connections but they aren't listed; duplicate merges move them (`move_to`); the JSON dump carries them by citekey and type key. In the graph they are extra edges (class `rel`, bezier, labelled, colored by type) that also feed the layout, "local graph" and unlinked-paper filtering; ⌥-drag between nodes (a ghost edge while dragging) opens the connection dialog.

**Citation styles.** `ops::cite` uses hayagriva with its about 80 bundled CSL styles. A style's id is its shortest alias (`apa`, `ieee`, `chicago-author-date`). The app copies both plain text and HTML to the clipboard from Rust, because WebKit allows clipboard writes only during the user gesture.

## Conventions

- Brand strings live only in `branding.json`. `scripts/gen-branding.mjs` generates the Tauri config, the `.desktop` file and the Rust/TS constants. `scripts/rename.mjs` rewrites crate and package names.
- OS differences live only in `crates/core/src/platform.rs`, `src-tauri/src/platform.rs` and `src/platform.ts`.
- UI strings go through `t()` with the English catalog in `src/i18n/en.ts`.
- Colors are CSS variables in `src/tokens.css`.

## Search syntax

    attention "graph neural" -survey
    tag:ml/nlp (includes subtags)  project:"My thesis"  author:hinton  venue:neurips  type:book
    year:2020  year:>=2018  year:2016..2020  rating:>=4
    is:unread|reading|read  is:pdf  has:doi  is:untagged  has:notes
    cites:<citekey>  cited-by:<citekey>
    -<qualifier> negates any term

Free text is prefix-matched and ranked with bm25 (title weighted highest). Unknown or malformed qualifiers become warnings, never errors.

## UI conventions

- Commands live in `src/contributions/commands.ts` and are registered in `@paperlines/registry`; the palette (mod+K) and keyboard shortcuts both read the registry. Single-key shortcuts (t, p, 1-3) never fire while typing.
- Sidebar entries (saved searches, projects, tags) only set the search query, so every view is a query.
- Dialog state lives in `src/store/dialogs.ts`.
- Shell: `features/shell` holds the top bar (brand, layout switch, Add split button, quick actions) and the sidebar (view tabs: library, notes, duplicates, trash; collapsible sections with counts). The right pane is a tab strip (`store/panes.ts`: `tabs`, `active`); inactive tabs stay mounted but hidden, so a PDF keeps its scroll position.
- Help: `components/InfoTip.tsx` is the (i) button. Hover or focus shows the text, a click pins it, Escape closes it. Put the explanation next to the setting, not in docs.
- Look: Paperlines' own. White surfaces, one accent colour (`--accent`, teal by default; Settings ▸ Appearance offers others), thin-line icons, pill segmented controls, uppercase section labels, large-radius dialogs with a subtitle. The styles are all tokens in `tokens.css`; `app.css` ends with the shell layer.
- Notes live preview (`notes-editor/src/livePreview.ts`): CodeMirror decorations hide Markdown marks, and render headings, emphasis, bullets, `[[links]]`, `@cites` and `$math$` everywhere except the lines holding the cursor. Off in Settings → Notes, which brings back the rendered view plus click to edit.

## Notes and highlights

- Every item has exactly one paper note. Its header (title, authors, dates) is rendered from the item and never stored; the body is the user's Markdown. `notes::paper_note_markdown` exports it with the header as YAML front matter.
- Links: `[[citekey]]`, `[[Note title]]`, `[[target|label]]`, `@citekey`. On save they are written to `note_links` with the raw target, so links written before a paper or note exists resolve once it does. Following a dangling `[[link]]` creates that note.
- Highlights store page-normalized rects (0..1, top-left origin of the displayed page). "Quote to note" appends `- > text ([p. N](#hl-ID))`; clicking that link opens the reader at the highlight.
- "Export annotated PDF" writes a copy with standard Highlight/Underline/Square annotations (rotation-aware); the stored original is never modified.
- PDFs reach the webview as raw binary IPC (`read_pdf`), not through a file-system scope.

## Citation graph

Only library items are nodes. An edge A -> B means "A cites B".

1. Each paper's full reference list is fetched once and cached in `reference_cache` (DOI, arXiv ID, title, year per reference), matched or not. Fetching never holds the DB lock during network calls.
2. `LibIndex` matches references: DOI, then arXiv ID, then fuzzy title (word-set similarity >= 0.85, years within 1; titles under four words must match exactly). An inverted index on distinctive title words keeps this fast at 10k items.
3. `recompute_item` rebuilds one paper's automatic outgoing edges. `link_new_items` scans every cached list for newly added papers, so older papers link to them offline. Import commits call it; editing a paper's metadata calls `relink_items`.
4. Manual decisions are rows with `is_manual = 1`: added edges (`source = manual`) or hidden ones (`is_suppressed = 1`). Automatic inserts use `ON CONFLICT DO NOTHING`, so recomputation never overrides them. "Restore" deletes the decision and recomputes.
5. Unmatched references only show up as a count ("N references outside your library").

## Secrets

API keys (Semantic Scholar, OpenAlex) go to the OS credential store through `keyring` (macOS Keychain, Secret Service on Linux). When no store is available they go to `secrets.enc` in the config folder, encrypted with ChaCha20-Poly1305 under a random key in `secrets.key` (mode 0600). That keeps keys out of plain config and library backups, but not away from someone who can read your files. The UI can set, clear and check where a key is stored, never read it.

## Graph view and the paper card

Nodes are rounded boxes by default: the label ("Author ’YY", `authorYear` in `features/graph/model.ts`) sits inside, the box is measured to fit it (`boxOf` with canvas text metrics), filled with the node color mixed toward the canvas background (`mix`), and outlined in the read-status color. Collisions use about half the box width. Dots remain an option (`nodeStyle`).

The force layout is live, as in Obsidian: `packages/graph` runs a d3-force simulation (many-body repulsion with a limited reach, links, a gentle pull to the center that is stronger for papers without links, collision for small graphs) and writes positions into Cytoscape once per animation frame. Most of the settling happens synchronously before the first frame (90 ticks for big graphs); the rest animates, and the view fits once when it comes to rest unless the user has panned or zoomed. Dragging a node pins it (fx/fy) and reheats the simulation. A rebuilt graph (a filter changed) starts from the previous positions, so it doesn't jump. Forces and display settings change live; label opacity follows the zoom in 0.1 steps (`labelOpacity`). The "By year" layout is static (`layeredPositions`). `GraphApi.stats().moving` tells tests when the layout is still moving.


- The graph lives in the right pane (or, expanded, in the middle and right panes). Filters, focus (depth 1-2, cites / cited by / both), color, label and layout are pure functions in `src/features/graph/model.ts`; options persist.
- One card component (`src/features/card/PaperCard.tsx`), one store (`src/store/card.ts`): hover shows it after 200 ms, read-only; click (or Space on a focused node) pins it, scrollable and editable inline with autosave. The PDF opens only from its button, a double-click on the node, or Enter on a focused node. `placeCard` keeps it inside the window; graph cards re-anchor while panning.
- Triggers: graph nodes, library rows, Cites / Cited by rows, and [[citekey]] / @citekey links in rendered notes.
- Keyboard: the canvas has no focus model, so a visually hidden list of buttons mirrors the visible nodes (ordered by year). Focusing one rings the node, highlights its edges and shows the card.
- Opening a PDF or note from the graph remembers it; the reader shows "← Graph".

## Safety and maintenance

- **Backups:** `core::backup` takes a `VACUUM INTO` snapshot daily (`library-YYYY-MM-DD.sqlite`) and keeps 14. Pre-migration and pre-restore snapshots are never pruned. Restore checks the file (integrity, schema version, that it is a library), snapshots the current state, closes the connection, swaps the file and reopens with migrations.
- **Doctor:** `core::doctor` checks SQLite integrity and foreign keys, missing and orphaned PDFs, dangling edges, the search index and missing paper notes. `--fix` only repairs safely: orphaned PDFs move to `pdfs/orphaned/`, nothing is deleted.

## Packaging

- `scripts/build-cli.mjs` builds the CLI for the target being bundled (lipo for universal macOS) into `src-tauri/binaries/<cli>-<triple>`. Tauri ships it as a sidecar: `Contents/MacOS/` on macOS, `/usr/bin` in deb/rpm. "Install command-line tool" symlinks it into `~/.local/bin`, or copies it when running from an AppImage.
- macOS installer: `scripts/build-pkg.mjs` (`pnpm build:pkg`) wraps the built `.app` with `pkgbuild` and `productbuild`. Relocation is off, so it always installs into `/Applications`, and a postinstall links the bundled CLI into `/usr/local/bin`. It is signed with `APPLE_INSTALLER_IDENTITY` and notarized when the `APPLE_ID` variables are set. The DMG gets a drag-to-Applications window layout from `bundle.macOS.dmg`.
- **Updates** (`src-tauri/src/updater.rs`, tauri-plugin-updater). When the app opens (Settings → General, never in offline mode) it fetches `latest.json` from the latest GitHub release with the generic user agent, and shows the version, its changelog section and contributors (`features/updates/UpdateDialog.tsx`). Update now downloads the bundle, checks its minisign signature against `plugins.updater.pubkey` (from `branding.json` `updaterPubkey`), installs and restarts. Only the macOS `.app`, the Windows installers and the AppImage replace themselves; deb, rpm and Nix installs get a link to the release page. The release workflow builds with `src-tauri/release.conf.json` (`createUpdaterArtifacts`), so local and CI builds need no signing key; `scripts/release.mjs publish` writes `latest.json` from the uploaded `.sig` files.
- File associations (PDF, BibTeX, RIS) use the Viewer role with Alternate rank, so the app is offered in "Open with" but never becomes the default.
- Files opened from the OS arrive as macOS `RunEvent::Opened` (Dock, Finder), command-line arguments on Linux, or a second launch through the single-instance plugin. They are queued until the UI asks for them, then go to the import review.
