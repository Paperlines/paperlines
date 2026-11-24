# What's new

## 0.1.0 (not released yet)

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
