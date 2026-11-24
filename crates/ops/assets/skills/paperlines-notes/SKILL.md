---
name: paperlines-notes
description: Write notes in the user's Paperlines library: a structured note on a paper, argument by argument with each point highlighted in the PDF and linked to its highlight, a synthesis of a project, a related-work draft, a reading summary. Use when the user asks to summarize or annotate a paper into their notes, map a paper's arguments, write up a project, draft related work from their papers, or record takeaways. Writes only after the user has seen the text and agreed.
---

# Paperlines notes

Notes in Paperlines are Markdown, stored with the user's library: one note per paper (its "paper note"), one per project, and free notes with titles. They support `[[citekey]]` and `[[note title]]` links, `@citekey` citations, `$…$` and `$$…$$` math, headings, lists and checklists.

## Ground rules

- **Show first, then write.** Draft the note in the conversation; call `create_note` or `append_to_note` only after the user agrees (or asked you to write it directly).
- **Never overwrite.** There is no tool to replace a note: add with `append_to_note`, so the user's own text stays.
- **Match their format.** Read a few of their paper notes first (`get_paper_note`) and write the same way. Their usual shape is three bullets: `- **Key idea:** …`, `- **Method:** …`, `- **Why it matters:** …`, short and specific, with numbers and conditions where the paper gives them.
- **Ground every claim.** Use the paper's metadata, abstract (`get_item`) and the user's highlights and notes; say "the abstract says" when that's all you have. Never invent results, numbers or citations.
- **Evidence, not paraphrase alone.** When a point comes from the PDF, highlight the passage that supports it (`add_highlights`, quoting it word for word from `read_pdf`) and end the point with that highlight's link `[p. N](#hl-ID)`. Clicking the link in the note opens the PDF at that highlight.
- **Colours mean something.** Yellow = key idea, green = method, blue = definition, red = disagree (a claim the user or you question), purple = open question. One highlight per argument, one to three sentences long.
- **Link and cite by citekey.** Write `[[citekey]]` for papers in the library so the note links into the graph; never link papers that aren't in it.

## Tools

| Tool | Use it to |
| --- | --- |
| `get_item`, `get_paper_note` | Read a paper's details, abstract and its current note. |
| `read_pdf` | The paper's text page by page, to find arguments and quote them exactly. |
| `list_highlights` | Existing highlights and their links `[p. N](#hl-ID)` (reuse one instead of adding a duplicate). |
| `add_highlights` | Highlight passages by quoting them with their page; returns each highlight's link. |
| `get_project`, `list_projects` | See a project's papers, key papers (spine) and its note. |
| `list_notes`, `get_note` | Find and read free and project notes. |
| `append_to_note` | Add Markdown to a paper note (citekey), a free note (title) or a project note (project name). |
| `create_note` | Start a free note, or a project's note (a project has one). |
| `list_citations`, `list_relations` | How papers connect, for syntheses. |

## Recipes

- **Argument by argument (the default for "annotate this paper").** `read_pdf` (all of it) → list the paper's arguments: the claim, the method that supports it, the key result, definitions it relies on, limits → for each, choose the sentence in the PDF that carries it and its page → show the user the plan (point + quote + colour) → after a yes: `add_highlights` with those quotes → `append_to_note` with one point per argument, each ending with its link, e.g. `- **Claim:** Woodpiles made by DLW in SU-8 have stop bands at telecom wavelengths [p. 1](#hl-41)`. Check `list_highlights` first and reuse what the user already highlighted.

- **"Write a note on this paper."** `get_item` and `get_paper_note` → draft the three bullets in the user's format (add a fourth, e.g. `- **Limits:**`, only when the paper gives one) → show it → `append_to_note` with the citekey.
- **Project synthesis.** `get_project` → read the key papers' notes in spine order → draft sections (*Where the field is*, *Methods compared*, *Open problems*), each claim followed by `[[citekey]]` → show it → `create_note` with the project (or `append_to_note` if it has a note).
- **Related-work draft.** Read the notes of the papers the user names (or a project's papers) → write flowing paragraphs citing `@citekey` → show it → offer to save it as a free note.
- **Reading summary.** For papers marked reading or read recently (`search_library` with `is:read`), collect one line per paper into a dated free note, after the user agrees.
