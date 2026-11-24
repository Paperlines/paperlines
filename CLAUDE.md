# Paperlines: notes for Claude Code

`docs/architecture.md` and `docs/development.md` are the reference. If a local `docs/session-log.md` exists (private handoff notes, not in the repository), read it first.

## Rules
- Network requests use the generic user agent `Paperlines/0.1 (local reference manager)`. Never send the user's e-mail or personal data to any service, even if an API response asks for it.
- The graph encoding is settled: fill = project colour, border = read status, outline = selection/hover/focus, amber + step number = key paper (spine). Don't reuse the border for anything else.
- Before changing the bundle ID or data folder, migrate the user's library.

## Workflow
- New backend feature: crate (with tests) → `src-tauri` command, registered in `lib.rs` → `packages/backend-port` → `src/tauri.ts` and `src/fake-backend.ts` → CLI/MCP if useful → e2e test.
- Checks before committing: `pnpm lint && pnpm build && pnpm test`, `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `pnpm test:e2e`.
- `pnpm dev` runs the UI on the fake backend (`/?demo=2000` for a big graph, `/?dups` for duplicates).
- On NixOS: `nix develop`, then `pnpm install && pnpm tauri dev`. After changing `pnpm-lock.yaml`, update `pnpmDeps.hash` in `nix/package.nix` from the `nix build` error.
- Back up the real library (`paperlines backup`) before installing a build that adds a migration.
