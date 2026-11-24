// Pure helpers for scripts/release.mjs (tested in scripts/release.test.ts).

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** The next version: "patch" | "minor" | "major" | "current" (unchanged) | an exact "X.Y.Z". */
export function nextVersion(current, bump) {
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`branding/branding.json has an invalid version: ${current}`);
  const [maj, min, pat] = m.slice(1).map(Number);
  switch (bump) {
    case "current":
      return current;
    case "patch":
      return `${maj}.${min}.${pat + 1}`;
    case "minor":
      return `${maj}.${min + 1}.0`;
    case "major":
      return `${maj + 1}.0.0`;
    default: {
      const v = String(bump).replace(/^v/, "");
      if (!SEMVER.test(v)) {
        throw new Error(`Unknown version "${bump}": use patch, minor, major, current or X.Y.Z`);
      }
      return v;
    }
  }
}

const UNRELEASED = /^## +(unreleased\b.*|.*\(not released yet\))\s*$/i;

/**
 * Turns the changelog's "## Unreleased" section into "## <version> (<date>)" and returns the new
 * text with that section's notes. Fails when there is nothing unreleased to describe.
 */
export function stampChangelog(text, version, date) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith("## "));
  if (at < 0 || !UNRELEASED.test(lines[at])) {
    throw new Error(
      'docs/CHANGELOG.md needs a "## Unreleased" section at the top with what changed in this version.',
    );
  }
  lines[at] = `## ${version} (${date})`;
  const out = lines.join("\n");
  return { text: out, notes: changelogNotes(out, version) };
}

/** The body of the "## <version> …" section, without its heading. */
export function changelogNotes(text, version) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) =>
    new RegExp(`^## +v?${version.replaceAll(".", "\\.")}\\b`).test(l),
  );
  if (at < 0) return "";
  const end = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  return lines
    .slice(at + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
}

/** Replaces the version of the workspace's own crates in Cargo.lock. */
export function bumpCargoLock(text, prefix, from, to) {
  const re = new RegExp(
    `(\\[\\[package\\]\\]\\nname = "${prefix}(?:-[\\w-]+)?"\\nversion = ")${from.replaceAll(".", "\\.")}(")`,
    "g",
  );
  return text.replace(re, `$1${to}$2`);
}

/** Path dependencies that also pin a version: `{ version = "X", path = … }`. */
export function bumpCargoToml(text, from, to) {
  return text.replaceAll(`version = "${from}", path`, `version = "${to}", path`);
}

/**
 * Which updater platforms a release asset serves (tauri-plugin-updater keys). Only the
 * self-updating bundles count: macOS .app.tar.gz, the AppImage, and the Windows installers.
 */
export function updaterPlatforms(name) {
  const arm = /aarch64|arm64/.test(name);
  if (name.endsWith(".app.tar.gz")) return [arm ? "darwin-aarch64" : "darwin-x86_64"];
  if (name.endsWith(".AppImage")) return [arm ? "linux-aarch64" : "linux-x86_64"];
  if (name.endsWith("-setup.exe")) return ["windows-x86_64", "windows-x86_64-nsis"];
  if (name.endsWith(".msi")) return ["windows-x86_64-msi"];
  return [];
}

/** latest.json for tauri-plugin-updater, plus the contributors the update dialog shows. */
export function latestJson({ version, notes, date, assets, signatures, contributors }) {
  const platforms = {};
  for (const a of assets) {
    const sig = signatures[a.name];
    if (!sig) continue;
    for (const key of updaterPlatforms(a.name)) {
      platforms[key] = { signature: sig.trim(), url: a.url };
    }
  }
  return { version, notes, pub_date: date, platforms, contributors };
}

/**
 * People from the GitHub commits API, first-time order kept, one entry each. Bots, organizations
 * (such as the project's own account) and commits without a linked account but with a bot-like
 * name are left out.
 */
export function contributorsFrom(commits) {
  const seen = new Set();
  const out = [];
  for (const c of commits) {
    const a = c.author;
    if (a && (a.type === "Bot" || a.type === "Organization" || a.login?.endsWith("[bot]")))
      continue;
    const login = a?.login ?? null;
    const name = (c.commit?.author?.name ?? "").trim();
    if (!login && (!name || /\[bot\]|github-actions/i.test(name))) continue;
    const key = login ? `@${login.toLowerCase()}` : name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ login, name: name || login });
  }
  return out;
}

/** The GitHub release body: the notes, then thanks to everyone by @login. */
export function releaseBody(notes, contributors) {
  if (!contributors.length) return notes;
  const who = contributors.map((c) => (c.login ? `@${c.login}` : c.name)).join(", ");
  return `${notes}\n\n**Contributors:** ${who}`;
}

/** Points the README's download links (and the version next to them) at the new release. */
export function bumpReadme(text, from, to) {
  return text
    .split("\n")
    .map((l) =>
      l.includes("/releases/download/") || l.startsWith("Download Paperlines")
        ? l.replaceAll(from, to)
        : l,
    )
    .join("\n");
}
