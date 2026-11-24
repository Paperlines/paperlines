// Builds a macOS installer package (.pkg) from the bundled .app: installs into /Applications and
// links the command-line tool into /usr/local/bin. Run after `pnpm tauri build`.
// Usage: node scripts/build-pkg.mjs [--app <path/to/App.app>] [--out <dir>]
// Signing:      APPLE_INSTALLER_IDENTITY="Developer ID Installer: Name (TEAMID)"
// Notarization: APPLE_ID, APPLE_PASSWORD (app-specific password), APPLE_TEAM_ID
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  console.error("build-pkg: macOS only (needs pkgbuild and productbuild)");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const b = JSON.parse(readFileSync(join(root, "branding", "branding.json"), "utf8"));
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const run = (cmd, a) => execFileSync(cmd, a, { stdio: "inherit" });
const xml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const appName = `${b.displayName}.app`;
const candidates = [
  arg("--app"),
  join(root, "target", "release", "bundle", "macos", appName),
  join(root, "target", "universal-apple-darwin", "release", "bundle", "macos", appName),
].filter(Boolean);
const app = candidates.find((p) => existsSync(p));
if (!app) {
  console.error(`build-pkg: ${appName} not found; run \`pnpm tauri build\` first or pass --app`);
  process.exit(1);
}
const cliInApp = `/Applications/${appName}/Contents/MacOS/${b.binaryName}`;
if (!existsSync(join(app, "Contents", "MacOS", b.binaryName))) {
  console.warn(
    `build-pkg: warning: ${b.binaryName} is missing from the bundle; the CLI link will dangle`,
  );
}

const arch =
  arg("--arch") ??
  (app.includes("universal") ? "universal" : process.arch === "arm64" ? "aarch64" : "x64");
const outDir = resolve(arg("--out") ?? join(root, "target", "release", "bundle", "pkg"));
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${b.displayName}_${b.version}_${arch}.pkg`);

const work = mkdtempSync(join(tmpdir(), "paperlines-pkg-"));
try {
  // payload: <root>/Applications/App.app (ditto keeps symlinks, resource forks and signatures)
  const payload = join(work, "root");
  mkdirSync(join(payload, "Applications"), { recursive: true });
  run("ditto", [app, join(payload, "Applications", appName)]);

  // postinstall: put the CLI on PATH; never fail the install over it
  const scripts = join(work, "scripts");
  mkdirSync(scripts);
  writeFileSync(
    join(scripts, "postinstall"),
    `#!/bin/sh
# Links the ${b.cliCommand} command-line tool into /usr/local/bin.
mkdir -p /usr/local/bin 2>/dev/null
ln -sf "${cliInApp}" "/usr/local/bin/${b.cliCommand}" 2>/dev/null || true
exit 0
`,
  );
  chmodSync(join(scripts, "postinstall"), 0o755);

  // a component plist that turns off bundle relocation: always install to /Applications,
  // even if an older copy was moved elsewhere
  const comp = join(work, "component.plist");
  run("pkgbuild", ["--analyze", "--root", payload, comp]);
  run("plutil", ["-replace", "0.BundleIsRelocatable", "-bool", "NO", comp]);

  const component = join(work, `${b.binaryName}.pkg`);
  run("pkgbuild", [
    "--root",
    payload,
    "--component-plist",
    comp,
    "--identifier",
    `${b.appId}.pkg`,
    "--version",
    b.version,
    "--install-location",
    "/",
    "--scripts",
    scripts,
    component,
  ]);

  const resources = join(work, "resources");
  mkdirSync(resources);
  writeFileSync(
    join(resources, "welcome.html"),
    `<html><body style="font-family:-apple-system,sans-serif;font-size:13px">
<h2>${xml(b.displayName)}</h2>
<p>${xml(b.description)}.</p>
<p>This installs <b>${xml(appName)}</b> into Applications and the <code>${xml(b.cliCommand)}</code>
command-line tool into <code>/usr/local/bin</code>.</p>
<p>Your library is not touched: it stays in its folder and opens on first launch.</p>
</body></html>`,
  );
  writeFileSync(
    join(resources, "conclusion.html"),
    `<html><body style="font-family:-apple-system,sans-serif;font-size:13px">
<h2>Installed</h2>
<p>Open ${xml(b.displayName)} from Applications or Launchpad.</p>
<p>In a terminal: <code>${xml(b.cliCommand)} --help</code></p>
</body></html>`,
  );
  const dist = join(work, "distribution.xml");
  writeFileSync(
    dist,
    `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>${xml(b.displayName)}</title>
  <welcome file="welcome.html" mime-type="text/html"/>
  <conclusion file="conclusion.html" mime-type="text/html"/>
  <options customize="never" require-scripts="false" hostArchitectures="arm64,x86_64"/>
  <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
  <allowed-os-versions><os-version min="12.0"/></allowed-os-versions>
  <choices-outline><line choice="default"><line choice="app"/></line></choices-outline>
  <choice id="default"/>
  <choice id="app" visible="false"><pkg-ref id="${xml(b.appId)}.pkg"/></choice>
  <pkg-ref id="${xml(b.appId)}.pkg" version="${xml(b.version)}" onConclusion="none">${xml(b.binaryName)}.pkg</pkg-ref>
</installer-gui-script>
`,
  );

  const identity = process.env.APPLE_INSTALLER_IDENTITY;
  run("productbuild", [
    "--distribution",
    dist,
    "--package-path",
    work,
    "--resources",
    resources,
    ...(identity ? ["--sign", identity] : []),
    out,
  ]);
  if (!identity) console.log("build-pkg: unsigned (set APPLE_INSTALLER_IDENTITY to sign)");

  const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (identity && APPLE_ID && APPLE_PASSWORD && APPLE_TEAM_ID) {
    run("xcrun", [
      "notarytool",
      "submit",
      out,
      "--apple-id",
      APPLE_ID,
      "--password",
      APPLE_PASSWORD,
      "--team-id",
      APPLE_TEAM_ID,
      "--wait",
    ]);
    run("xcrun", ["stapler", "staple", out]);
  }
  console.log(`build-pkg: wrote ${out}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
