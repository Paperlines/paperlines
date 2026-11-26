// Release helper, used by .github/workflows/release.yml (and runnable locally).
//
//   node scripts/release.mjs next <patch|minor|major|current|X.Y.Z>   prints the next version
//   node scripts/release.mjs apply <version> [--notes FILE]
//       sets the version everywhere (branding/branding.json, Cargo and npm manifests, Cargo.lock,
//       the README's download links),
//       regenerates the branded files, and turns "## Unreleased" in docs/CHANGELOG.md into
//       "## <version> (<date>)"; --notes writes that section to FILE
//   node scripts/release.mjs publish <tag>      (CI: needs gh, GH_TOKEN and GH_REPO)
//       writes latest.json for the in-app updater (signed bundles, notes, contributors),
//       uploads it, and publishes the draft release

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bumpCargoLock,
  bumpCargoToml,
  bumpReadme,
  changelogNotes,
  contributorsFrom,
  latestJson,
  nextVersion,
  releaseBody,
  stampChangelog,
} from "./release-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const write = (rel, text) => writeFileSync(join(root, rel), text);
const branding = () => JSON.parse(read("branding/branding.json"));
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20, ...opts });

function setJsonVersion(rel, version) {
  const j = JSON.parse(read(rel));
  j.version = version;
  write(rel, `${JSON.stringify(j, null, 2)}\n`);
}

function apply(version, notesFile) {
  const b = branding();
  const from = b.version;
  const today = new Date().toISOString().slice(0, 10);
  // the changelog first: without notes there is no release
  const { text, notes } = stampChangelog(read("docs/CHANGELOG.md"), version, today);
  if (from !== version) {
    setJsonVersion("branding/branding.json", version);
    setJsonVersion("package.json", version);
    setJsonVersion("extension/manifest.json", version);
    for (const p of readdirSync(join(root, "packages"))) {
      setJsonVersion(`packages/${p}/package.json`, version);
    }
    write("Cargo.toml", read("Cargo.toml").replace(/^version = ".*"$/m, `version = "${version}"`));
    const tomls = [
      "src-tauri/Cargo.toml",
      ...readdirSync(join(root, "crates")).map((c) => `crates/${c}/Cargo.toml`),
    ];
    for (const t of tomls) write(t, bumpCargoToml(read(t), from, version));
    write("Cargo.lock", bumpCargoLock(read("Cargo.lock"), b.cratePrefix, from, version));
    // the README and its translations (docs/readme/) link to this version's downloads
    const readmes = [
      "README.md",
      ...readdirSync(join(root, "docs", "readme"))
        .filter((f) => f.endsWith(".md"))
        .map((f) => `docs/readme/${f}`),
    ];
    for (const r of readmes) write(r, bumpReadme(read(r), from, version));
    run("node", ["scripts/gen-branding.mjs"], { stdio: "inherit" });
  }
  write("docs/CHANGELOG.md", text);
  if (notesFile) writeFileSync(notesFile, `${notes}\n`);
  console.log(`release ${version}${from !== version ? ` (was ${from})` : ""}`);
}

/** JSON lines from `gh api --paginate --jq …`. */
function ghLines(args) {
  return run("gh", ["api", "--paginate", ...args])
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function publish(tag) {
  const repo = process.env.GH_REPO;
  if (!repo) throw new Error("Set GH_REPO (owner/name)");
  const version = tag.replace(/^v/, "");
  const notes = changelogNotes(read("docs/CHANGELOG.md"), version);

  // who made it: commits since the previous release tag (or all of them, the first time)
  let prev = null;
  try {
    prev = run("git", ["describe", "--tags", "--abbrev=0", "--match", "v*", `${tag}^`]).trim();
  } catch {
    prev = null;
  }
  const pick =
    "{author: (.author // null | if . then {login, type} else null end), commit: {author: {name: .commit.author.name}}}";
  const commits = prev
    ? ghLines([`repos/${repo}/compare/${prev}...${tag}`, "--jq", `.commits[] | ${pick}`])
    : ghLines([`repos/${repo}/commits?sha=${tag}&per_page=100`, "--jq", `.[] | ${pick}`]);
  const contributors = contributorsFrom(commits);

  // the signed bundles tauri-action uploaded to the draft release, and their signatures
  const assets = ghLines([
    `repos/${repo}/releases`,
    "--jq",
    `.[] | select(.tag_name == "${tag}") | .assets[] | {name, url: .browser_download_url}`,
  ]).map((a) => ({
    ...a,
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(a.name)}`,
  }));
  const dir = mkdtempSync(join(tmpdir(), "sigs-"));
  run("gh", ["release", "download", tag, "--pattern", "*.sig", "--dir", dir]);
  const signatures = {};
  for (const f of readdirSync(dir)) {
    signatures[f.replace(/\.sig$/, "")] = readFileSync(join(dir, f), "utf8");
  }

  const latest = latestJson({
    version,
    notes,
    date: new Date().toISOString(),
    assets,
    signatures,
    contributors,
  });
  const platforms = Object.keys(latest.platforms);
  if (!platforms.length) throw new Error("No signed update bundles found on the release");
  const out = mkdtempSync(join(tmpdir(), "latest-"));
  writeFileSync(join(out, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);
  writeFileSync(join(out, "body.md"), `${releaseBody(notes, contributors)}\n`);
  run("gh", ["release", "upload", tag, join(out, "latest.json"), "--clobber"], {
    stdio: "inherit",
  });
  run(
    "gh",
    ["release", "edit", tag, "--notes-file", join(out, "body.md"), "--draft=false", "--latest"],
    { stdio: "inherit" },
  );
  console.log(`published ${tag}: ${platforms.join(", ")}; contributors: ${contributors.length}`);
}

const [cmd, arg, ...rest] = process.argv.slice(2);
try {
  if (cmd === "next" && arg) console.log(nextVersion(branding().version, arg));
  else if (cmd === "apply" && arg) {
    const i = rest.indexOf("--notes");
    apply(nextVersion(arg, "current"), i >= 0 ? rest[i + 1] : null);
  } else if (cmd === "publish" && arg) publish(arg);
  else {
    console.error(
      "usage: node scripts/release.mjs next <bump> | apply <version> [--notes FILE] | publish <tag>",
    );
    process.exit(2);
  }
} catch (e) {
  console.error(`release: ${e.message}`);
  process.exit(1);
}
