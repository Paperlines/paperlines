# Contributing to Paperlines

Thanks for helping. Paperlines is a local-first reference manager: a Tauri app (Rust + React/TypeScript), a command-line tool and an MCP server that share one library. This page covers setting up, the rules the code follows, and how changes become a release.

## Ways to help

- **Report a problem.** [Open an issue](https://github.com/Paperlines/paperlines/issues/new) with what happened, what you expected, and your version and system (Help & About → Copy info). Leave out your library path and paper titles if they're private.
- **Suggest something.** Open an issue first for anything larger than a small fix, so we can agree on the approach before you write it.
- **Send a pull request.** Small, focused PRs are easiest to review.

## Setting up

You need Node 26+, pnpm 12.21 (the exact version is in `package.json`) and Rust through rustup (the toolchain is pinned in `rust-toolchain.toml`). Linux needs the WebKitGTK libraries, and Windows needs WebView2; see [docs/development.md](../docs/development.md) for each system, and for Nix (`nix develop`).

```sh
pnpm install
pnpm tauri dev      # the app, with the CLI sidecar
pnpm dev            # the UI alone in a browser, on an in-memory fake backend
```

The browser build is the quickest way to work on the UI. `/?demo=2000` loads a big graph, `/?dups` adds a duplicate, `/?tour` starts the tour and `/?update` pretends a new version is out.

Read [docs/architecture.md](../docs/architecture.md) before larger changes. It explains the layers (crates, `src-tauri`, `packages/*`, `src/`) and the conventions.

## Making a change

1. Branch from `main`.
2. Follow the existing patterns. A new backend feature goes through these layers in order:
   1. a crate in `crates/*`, with tests;
   2. a command in `src-tauri`, registered in `src-tauri/src/lib.rs`;
   3. `BackendPort` in `packages/backend-port`;
   4. `src/tauri.ts` and `src/fake-backend.ts`;
   5. the CLI or MCP server, when that's useful;
   6. an end-to-end test in `e2e/`.
3. Keep explanations next to the setting in the UI (the ⓘ buttons, `components/InfoTip.tsx`), and user-facing text in `src/i18n/en.ts`.
4. Add a line about your change to the `## Unreleased` section at the top of [`docs/CHANGELOG.md`](../docs/CHANGELOG.md), written for users. Create the section if it isn't there. These lines become the release notes and the "What's new" text in the update dialog.

### Rules worth knowing

- **Privacy.** Network requests use the generic user agent (`paperlines_import::lookup::user_agent()`), send only identifiers, and never send anything personal, even if a service asks for it. Offline mode must stop every request.
- **The user's data comes first.** Library changes go through transactions, and schema changes are new migrations, which take a backup first. Original files are never modified.
- **The graph's visual encoding is fixed:** fill = project colour, border = read status, outline = selection/hover/focus, amber + step number = key paper.
- **Don't change the bundle ID or data folder** without migrating existing libraries.

## Checks

CI runs all of these on macOS, Linux and Windows. Please run them before you open a pull request:

```sh
pnpm lint && pnpm build && pnpm test
pnpm exec playwright install webkit && pnpm test:e2e
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

If you change `pnpm-lock.yaml`, also update `pnpmDeps.hash` in `nix/package.nix`. The `nix` CI job fails and prints the new hash.

## Pull requests

- Describe what changed and why, and how you tested it. Add screenshots for UI changes (`SCREENSHOT_DIR=… pnpm test:e2e` can take them).
- Keep commits readable. Use your own GitHub account, so you're credited as a contributor in the release notes and the in-app update dialog.
- By contributing, you agree that your contribution is licensed under the project's licence, the [GNU AGPL v3.0 or later](../LICENSE).

## Releases (maintainers)

Releases are made with the **Release** workflow: Actions → Release → Run workflow, from `main`, once CI has passed. Choose `patch`, `minor`, `major`, `current` or an exact version. The workflow:

- sets the version everywhere and dates the `## Unreleased` changelog section;
- tags the commit;
- builds and signs every platform;
- publishes the GitHub release with `latest.json`.

Installed apps then offer the update the next time they open. [docs/development.md](../docs/development.md#releasing) has the details and the secrets it needs.
