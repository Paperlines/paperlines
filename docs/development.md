# Development

Prerequisites: Node 26+, pnpm 12.21, Rust via rustup (version pinned in `rust-toolchain.toml`). On macOS with Homebrew's rustup, add `/opt/homebrew/opt/rustup/bin` to `PATH`.

Linux also needs: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev patchelf` (Debian/Ubuntu), `webkit2gtk4.1-devel gtk3-devel libsecret-devel librsvg2-devel` (Fedora), `webkit2gtk-4.1 gtk3 libsecret librsvg` (Arch).

    pnpm install
    pnpm tauri dev                 # run the app
    pnpm dev                       # UI only, in a browser, on the fake backend

Checks (CI runs all of these):

    pnpm lint && pnpm build && pnpm test
    pnpm exec playwright install webkit && pnpm test:e2e
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets -- -D warnings
    cargo test --workspace     # includes crates/cli/tests/cli.rs: the real binary end to end, MCP over a pipe
    cargo test -p paperlines-import -- --ignored     # live Crossref/OpenAlex lookups (network)
    cargo test -p paperlines-citations -- --ignored  # live reference fetching, BERT -> Transformer end to end
    cargo test -p paperlines-core os_store -- --ignored  # writes and deletes a dummy key in the OS credential store

To check the production bundle under the app's Content-Security-Policy, serve `dist/` with `vite preview` and the CSP from `src-tauri/tauri.conf.json` as a header, then point Playwright at it.

`e2e/layout.spec.ts` opens every main screen (library, reader, graph and its settings, right-click menu, dialogs, Search online) at window sizes from the 960x600 minimum to 2560x1440 and fails on anything clipped, overlapping, off-screen, or making the page scroll; `SCREENSHOT_DIR=… pnpm test:e2e e2e/layout.spec.ts` also saves light and dark screenshots of each.

In the browser build, `/?dups` adds a duplicate paper (for the Duplicates view), and `/?demo=2000` adds 2,000 synthetic papers and about 6,000 citations for performance checks (`e2e/graph.spec.ts` measures them).

Release build: `pnpm tauri build` (builds the CLI sidecar via `scripts/build-cli.mjs` first), then `pnpm build:pkg` for the macOS installer. Use `CI=true pnpm tauri build` locally to skip the DMG window-layout AppleScript, which asks to control Finder. Rebrand: `node scripts/rename.mjs "New Name"`. Icons: the masters are `branding/icon.svg` (rounded tile) and `branding/icon-square.svg` (full-bleed, for app stores); both embed the raster artwork (1024 px, white background), so edit the artwork, not the SVG paths. After changing them, update `branding/icon-1024.png` and `src/assets/logo-64.png` / `logo-128.png`, run `pnpm tauri icon branding/icon-1024.png`, then delete what it makes that the app doesn't use: the `android/` and `ios/` folders, `64x64.png`, `icon.png`, `StoreLogo.png` and the `Square*Logo.png` Microsoft Store tiles (the bundle uses only the files listed in `tauri.conf.json`).

## Releasing

Releases are made by the **Release** workflow (Actions → Release → Run workflow) from `main`, after CI has passed on that commit:

1. Make sure `CHANGELOG.md` starts with a `## Unreleased` section describing the changes (the first release uses `## 0.1.0 (not released yet)`).
2. Run the workflow with `patch`, `minor`, `major`, `current` (release the version as it is) or an exact `X.Y.Z`.
3. It runs `node scripts/release.mjs apply <version>`: the version goes into `branding.json`, the Cargo and npm manifests and `Cargo.lock`, the branded files are regenerated, and `## Unreleased` becomes `## <version> (<date>)`. It commits `Release vX.Y.Z`, tags it and pushes.
4. Every platform is built and signed (tauri-action, with `src-tauri/release.conf.json` turning on the updater bundles) into a draft release, with the macOS `.pkg` and the command-line tools.
5. `node scripts/release.mjs publish vX.Y.Z` writes `latest.json` (the signed bundles for the in-app updater, the notes, and the contributors since the previous tag: bots and organization accounts are left out), adds the contributors to the release notes and publishes it. Running apps see it the next time they open.

Repository secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` sign the updates (the public key is `updaterPubkey` in `branding.json`); the optional `APPLE_*` secrets sign and notarize macOS builds. Keep a backup of the private key: without it, installed copies can't verify new versions and must be updated by hand. To try a version bump locally: `node scripts/release.mjs next minor`, then `apply` on a scratch copy.

The in-app updater can be tried in the browser build with `/?update` (the fake backend offers the next minor version).

## Adding an IPC command

1. Implement it in a crate (`crates/*`), with tests.
2. Expose it in `src-tauri/src/lib.rs` and register it in `generate_handler!`.
3. Add it to `BackendPort` in `packages/backend-port`, then to `src/tauri.ts` and `src/fake-backend.ts`.

## Nix

`flake.nix` builds the app and CLI (`nix/package.nix`, via nixpkgs' `cargo-tauri.hook`), and `nix develop` gives a shell with Rust, Node, pnpm, cargo-tauri and the WebKitGTK libraries. Then `pnpm install && pnpm tauri dev` as usual.

- Cargo dependencies come from `Cargo.lock` directly. pnpm dependencies need a fixed-output hash: after any change to `pnpm-lock.yaml`, run `nix build`; it fails with `got: sha256-…`. Put that value into `pnpmDeps.hash` in `nix/package.nix`. The `nix` CI job fails the same way, and its log shows the hash.
- Commit `flake.lock` (created by the first `nix build`); `nix flake update` moves nixpkgs forward.
- The package names the desktop entry `<identifier>.desktop`, matching the Wayland app ID that `app.enableGTKAppId` sets, so docks pick up the icon.

## Linux desktop integration

`src-tauri/src/linux.rs`:
- Reads `org.freedesktop.appearance color-scheme` from the XDG desktop portal and watches `SettingChanged`. GTK3 and WebKitGTK never read it, so on COSMIC and GNOME `prefers-color-scheme` would otherwise stay light. The UI gets it from `system_color_scheme` and the `system-theme` event, and the GTK title bar is themed to match.
- Sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on NVIDIA + Wayland, unless the user set it.
- `packaged()`: when the app runs from `/nix/store` or `/usr`, "Install command-line tool" reports the packaged CLI instead of linking a store path into `~/.local/bin`.

The module compiles on every Unix, so `cargo clippy` on macOS checks it; only Linux calls it. Desktop testing on COSMIC is manual: dark/light switching, the dock icon, file dialogs, drag and drop of PDFs, and "Open with".

## Windows

Windows 10/11 (x64). Install Rust (rustup, MSVC toolchain), Node 26 with pnpm, and the WebView2 runtime (preinstalled on Windows 11). Then `pnpm install && pnpm tauri dev`. `pnpm tauri build` makes `target/release/bundle/nsis/*-setup.exe` (per-user install, no admin) and `target/release/bundle/msi/*.msi`; the `paperlines.exe` command-line tool is installed next to the app (Settings ▸ Command Line shows its path; add that folder to PATH to use it in a terminal).

Where things live: library and settings in `%APPDATA%\Paperlines`, cache in `%LOCALAPPDATA%\Paperlines\cache`, API keys in Windows Credential Manager. Agents installed with npm are found as `claude.cmd` / `codex.cmd` in `%APPDATA%\npm`; background commands start without a console window. CI (`.github/workflows/ci.yml`) builds and tests on `windows-latest` alongside macOS and Linux. A Mac can't check Windows locally (`ring` and SQLite need the Windows SDK headers), so CI is where Windows is verified.
