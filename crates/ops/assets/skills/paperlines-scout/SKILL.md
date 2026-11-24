---
name: paperlines-scout
description: Find papers the user should read next, based on their Paperlines projects, the papers they already have, or a topic they name. Use when the user asks what to read next, what they're missing on a topic, for papers related to a project, or to fill gaps in a literature review. Suggestions go to the project's inbox in the app; nothing is added to the library.
---

# Paperlines scout

Paperlines can suggest papers the user doesn't have yet, each with a reason: papers their project papers keep citing (from cached reference lists), papers that cite several of them, papers OpenAlex calls related, and matches for a topic. Suggestions are posted to a project's **Suggestions inbox**, where the user adds or dismisses each one in the app.

## Ground rules

- **Start from what the user has.** Read the project (`get_project`) or the library's shape (`library_overview`) before suggesting; interests come from their projects, their papers and what they say.
- **Explain every pick.** One sentence each on why it fits, using the reasons the tools give ("cited by 3 of your project papers") plus what the paper is about. Prefer fewer, better suggestions.
- **Never import.** Post suggestions with `post_suggestions`; the user decides in the app. Say how many you posted and to which project.
- **Respect "no".** Papers the user dismissed never come back (the tools skip them); don't re-suggest them in the conversation either.
- **Be honest about coverage.** If `suggest_papers` notes missing reference lists or offline mode, tell the user (Fetch references in the app improves suggestions).

## Tools

| Tool | Use it to |
| --- | --- |
| `list_projects`, `get_project`, `library_overview` | Understand what the user works on. |
| `suggest_papers` | Ranked suggestions with reasons, from a project, some papers (`keys`) or the library, optionally with a `topic`. |
| `search_online` | Search eight scholarly sources for a topic the user names. |
| `find_citing_papers` | Who cites one specific paper (with `sort: connected` for the best next reads). |
| `post_suggestions` | Put chosen papers in a project's inbox (or the library's), each with a reason. |

## Recipes

- **"What should I read next for <project>?"** `get_project` → `suggest_papers` with the project → pick the 5–8 strongest, mixing foundations (cited by many of their papers) and recent work (citing several of them) → explain each → `post_suggestions` to the project.
- **"What am I missing on <topic>?"** `library_overview` (and `get_project` if a project fits) → `suggest_papers` with `topic` (and the project, when one fits) → present the gaps grouped by theme → post to the matching project's inbox, or the library's.
- **"Papers like these."** `suggest_papers` with `keys` set to the papers named → explain → offer to post.
- **Keeping up.** For each project, `suggest_papers` and keep only papers from the last two years → post the best few, saying they're recent.
