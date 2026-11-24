# The desktop app and its command-line tool, built from source.
# cargo-tauri.hook runs `cargo tauri build` (which builds the UI and the CLI sidecar first) and
# installs the Linux bundle: bin/<app>, bin/<cli>, the .desktop entry and icons.
{
  lib,
  stdenv,
  rustPlatform,
  cargo-tauri,
  nodejs,
  pnpm,
  # nixpkgs renamed these; accept either generation
  fetchPnpmDeps ? null,
  pnpmConfigHook ? null,
  pkg-config,
  wrapGAppsHook3,
  webkitgtk_4_1,
  gtk3,
  glib-networking,
  libsoup_3,
  librsvg,
  libsecret,
  openssl,
  dbus,
  src,
  branding,
}:

let
  fetchDeps = if fetchPnpmDeps != null then fetchPnpmDeps else pnpm.fetchDeps;
  configHook = if pnpmConfigHook != null then pnpmConfigHook else pnpm.configHook;
in
rustPlatform.buildRustPackage (finalAttrs: {
  pname = branding.binaryName;
  inherit (branding) version;
  inherit src;

  cargoLock.lockFile = ../Cargo.lock;

  pnpmDeps = fetchDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 5;
    # After changing pnpm-lock.yaml: build once, copy the "got:" hash from the error here
    # (CI prints it too). See docs/development.md, "Nix".
    hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  };

  nativeBuildInputs = [
    cargo-tauri.hook
    nodejs
    pnpm
    configHook
    pkg-config
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [ wrapGAppsHook3 ];

  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    webkitgtk_4_1
    gtk3
    glib-networking
    libsoup_3
    librsvg
    libsecret
    openssl
    dbus
  ];

  env = {
    # package.json pins pnpm and Node versions for contributors; in the sandbox use nixpkgs' own
    # and never let pnpm try to download another version
    npm_config_manage_package_manager_versions = "false";
    npm_config_engine_strict = "false";
    COREPACK_ENABLE_STRICT = "0";
  };

  # the Tauri crate lives in src-tauri; the Cargo workspace (and lockfile) at the root
  buildAndTestSubdir = "src-tauri";

  # the desktop entry is named after the app ID so Wayland docks (COSMIC, GNOME) match the window
  postInstall = lib.optionalString stdenv.hostPlatform.isLinux ''
    for f in $out/share/applications/*.desktop; do
      [ "$f" = "$out/share/applications/${branding.appId}.desktop" ] || mv "$f" "$out/share/applications/${branding.appId}.desktop"
    done
  '';

  meta = {
    description = branding.description;
    longDescription = ''
      A local-first reference manager: a Zotero-like library, Obsidian-like Markdown notes with
      wikilinks, and a citation graph, plus the `${branding.cliCommand}` command-line tool and an
      MCP server for Claude.
    '';
    mainProgram = "${branding.binaryName}-app";
    platforms = lib.platforms.linux;
  };
})
