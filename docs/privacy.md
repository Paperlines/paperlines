# Privacy policy

This policy covers the Paperlines desktop app, its command-line tool, and the Paperlines browser extension.

## In short

Paperlines doesn't collect, sell or share any data about you. There is no account, no analytics and no telemetry. Your library stays on your own computer.

## The browser extension

- **When it runs:** only when you click its button. It then reads the current page to find the paper: its title, authors, year, journal, DOI, arXiv ID or PubMed ID, and the link to its PDF.
- **Where that goes:** only to the Paperlines app on the same computer, through the browser's native messaging (the browser starts Paperlines' command-line tool directly). The extension opens no network connection of its own to Paperlines and talks to no server.
- **The PDF:** if you leave "Include the PDF" on, the extension downloads the paper's PDF from the website you're on, using your own browser session (so subscriptions you have access to work), and hands it to Paperlines on your computer.
- **Permissions:**
  - `activeTab` and `scripting`: read the page you clicked the button on, and only that page.
  - `nativeMessaging`: talk to the Paperlines app on your computer.
  - Access to another site: asked for at the moment you save, and only when a paper's PDF is stored on a different site from the article.
- **What it doesn't do:** it doesn't read pages you don't click it on, track browsing, use cookies for anything but downloading the PDF you asked for, or send anything to the developers or to third parties.

## The desktop app and command-line tool

- **Your library:** your papers, PDFs, notes and highlights are stored in a folder on your computer that you choose.
- **Network requests**, made only for the features you use:
  - looking up a paper's details from its identifier (Crossref, OpenAlex, Semantic Scholar, arXiv, PubMed, Europe PMC, DataCite, DOAJ, OpenCitations): only the identifier or your search words are sent;
  - finding a free PDF through OpenAlex;
  - checking GitHub for a new version when the app opens (this can be turned off, and isn't done for Nix, .deb or .rpm installs).
- **What's sent:** requests use a generic program name, not your name, e-mail or anything about your library. **Offline mode** (Settings ▸ General) turns all of them off.
- **API keys** you enter are kept in your system's keychain.
- **AI assistants** you connect (such as Claude Code or Codex) run under your own accounts with those providers. Paperlines gives them access to your library only through the tools you see in Settings ▸ AI Assistants.

## Contact

Questions about privacy: open an issue at https://github.com/Paperlines/paperlines/issues.

_Last updated: November 27, 2026._
