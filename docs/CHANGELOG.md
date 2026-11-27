# What's new

## Unreleased

### New: the Paperlines browser extension

Save the paper you're reading, and its PDF, to your library with one click, right from the article's page.

**👉 [Add Paperlines to your browser](https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf)** (Chrome Web Store)

- **Works in** Google Chrome, Microsoft Edge, Brave, Arc, Vivaldi and Chromium.
- **Set up once:** add the extension, then in Paperlines open Settings ▸ Browser extension and click **Connect**.
- **Finds the paper by itself:** on journal pages, arXiv, PubMed and DOI links it reads the title, authors and identifiers, and tells you when a paper is already in your library.
- **Brings the PDF:** downloaded with your own login, so papers from your subscriptions work too. Papers you already have get their missing PDF instead of a duplicate.
- **Works even when Paperlines is closed.**

### Also

- A new library can no longer be set up twice at once (for example by the app and the extension on the very first launch).
- Links in "What's new" and in the update window open in your browser.

## 0.1.3 (2026-11-26)

- **Zoom PDFs with your trackpad:** pinch to zoom in and out, around the spot under your fingers. Ctrl/⌘ + scroll wheel and ⌘/Ctrl + `+` / `−` / `0` work too.
- **Installed with Nix, a .deb or an .rpm?** Your package manager keeps Paperlines up to date, so the app no longer checks for new versions by itself there (Help & About ▸ Check for updates still works).
- Help & About shows where your API keys are kept again.

## 0.1.2 (2026-11-26)

- **Paperlines speaks your language:** Español, Français, Deutsch, 简体中文, 日本語 and हिन्दी, besides English. It follows your computer's language; change it in Settings ▸ General ▸ Language.
- **Linux: a cleaner window,** as on Windows: no separate title bar or File / Edit / View / Window menu. Paperlines' own top bar holds the minimize, maximize and close buttons, and you drag it to move the window.
- **The window fits small screens:** on a laptop with a 1366×768 screen (or smaller), Paperlines now opens sized to the screen and centered, instead of partly off-screen.

## 0.1.1 (2026-11-25)

### Windows
- **A cleaner window.** The separate title bar and the File / Edit / View / Window menu are gone: Paperlines' own top bar now holds the minimize, maximize and close buttons, and you drag it to move the window (double-click to maximize). Settings is still Ctrl+, or the gear button.

## 0.1.0 (2026-11-25)

The first version: everything below is new.

### Library
- **A short tour** the first time the app opens (skippable; take it again from Help & About or ⌘K).
- Add papers by dropping PDFs, EPUBs or folders, or from DOIs, arXiv IDs, PubMed IDs, BibTeX, RIS and CSL-JSON. Each PDF is identified by its own DOI or first-page text, and you review the details before saving.
- Import from Zotero (papers, PDFs, collections, tags, notes and highlights), with Zotero itself left untouched.
- **Quick add** in the top bar: paste a DOI, arXiv ID or title and press Enter.
- Search everything, with qualifiers like `tag:`, `project:`, `author:`, `year:>=2020` and `cites:`; save searches.
- Projects with colours, tags, read status, ratings, duplicates finder and a Trash with Undo. The Trash icon shows when it has papers in it, each paper says when it goes, and papers are deleted for good after 30 days (checked hourly; changeable in Settings).
- **Export a whole library** as one folder (PDFs included) and import it on another computer.

### Reading and notes
- PDF reader with highlights (Export with highlights sits in its toolbar), underlines and area selections, find in PDF, and annotated-PDF export. Highlights are a light, even wash that keeps the text crisp. Five standard highlight colours with your own names for them, plus up to six more from a palette (orange, pink, teal, lime, brown, gray), each with its purpose.
- One note per paper, plus free and project notes, with live preview.
- Formatting toolbar with titles, bold, italic, lists, checklists and quotes, with shortcuts.
- `[[links]]` between notes and papers, `@citekey` citations, backlinks.
- Formulas: `$…$` inline and `$$…$$` blocks, rendered as you type, with LaTeX completion and a symbol palette.
- Tables: pick a size from the toolbar, move between cells with Tab and Shift-Tab (Tab in the last cell adds a row); tables render in the note and in live preview.

### Citation graph
- Obsidian-style live graph: papers as boxes labelled "Author ’YY", coloured by project, bordered by read status.
- **Key papers (spine)** in steps (drag to reorder papers within a step), with Tree and Circle layouts; Circle names each project's arc.
- Typed connections between papers: extends, contradicts, replicates, applies the method of, and your own.
- Papers citing this: who cites a paper across OpenAlex, with the most connected first.

### Search online and AI
- Search OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC, DataCite and DOAJ at once, and map the results into a project graph.
- More complete citation graphs: OpenCitations adds references that OpenAlex and Semantic Scholar miss.
- Connect Claude Code, Claude Desktop, Codex, Antigravity, Gemini CLI, Grok or Cursor in one click (Settings ▸ AI Assistants), with three Paperlines skills: working with your papers, writing notes, and finding papers you're missing.
- **Assistant panel** (⌘J): chat with your own Claude Code or Codex about your library, and switch between them. It knows what you have open, shows its steps and every change it makes, and is read-only until you let it edit. Chats are saved with the paper or note they're about: reopen and continue them from the history, even after a restart; they travel with a library export.
- **Appearance settings**: accent colour, layout (sidebar and assistant on either side), thin or regular icons, labels under the top bar's icons. New icons throughout.
- Your assistant can read your projects and a paper's PDF, highlight the passage behind each argument and link every point of its note to that highlight, create notes and add to them (never overwriting), and suggest papers with reasons into a project's **Suggested papers** inbox, where you add or dismiss each one.

### Everywhere
- Copy citations and bibliographies in about 80 styles; BibTeX files that stay up to date.
- macOS, Windows (installer .exe and .msi) and Linux (NixOS flake, COSMIC and other Wayland desktops); a `paperlines` command line and an MCP server.
- Daily backups, one-click restore, and a library check.
- **Updates from inside the app**: when a new version is out, the app shows what's new and who made it, and updates itself when you click Update now (or later). Turn the check off in Settings ▸ General.
