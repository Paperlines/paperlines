// Usage: node scripts/rename.mjs <NewName>
// Rewrites branding/branding.json, then replaces old brand strings in tracked sources and regenerates.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
if (!name || !/^[A-Za-z][A-Za-z0-9 ]*$/.test(name)) {
  console.error(
    "usage: node scripts/rename.mjs <NewName>   (letters, digits, spaces; start with a letter)",
  );
  process.exit(1);
}
const old = JSON.parse(readFileSync(join(root, "branding", "branding.json"), "utf8"));
const bin = name.toLowerCase().replace(/\s+/g, "");
const next = {
  ...old,
  displayName: name,
  // a new name has no wordmark split yet: all of it is bold until one is chosen
  wordmarkBold: "",
  binaryName: bin,
  cliCommand: bin,
  cratePrefix: bin,
  npmScope: `@${bin}`,
  appId: old.appId.replace(/[^.]+$/, bin),
  dataFolder: name.replace(/\s+/g, ""),
};
const pairs = [
  [old.binaryName.toUpperCase(), next.binaryName.toUpperCase()],
  [old.npmScope, next.npmScope],
  [old.appId, next.appId],
  [old.cratePrefix.replace(/-/g, "_"), next.cratePrefix.replace(/-/g, "_")],
  [old.cratePrefix, next.cratePrefix],
  [old.displayName, next.displayName],
  [old.dataFolder, next.dataFolder],
].filter(([a, b]) => a && a !== b);

const skip = new Set([
  "node_modules",
  "target",
  ".git",
  "dist",
  "gen",
  "icons",
  "pnpm-lock.yaml",
  "Cargo.lock",
]);
const exts = /\.(rs|toml|ts|tsx|json|md|mjs|yml|yaml|html|css|svg|desktop|generated)$/;
let changed = 0;
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    if (skip.has(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (exts.test(f) && f !== "rename.mjs") {
      const t = readFileSync(p, "utf8");
      let u = t;
      for (const [a, b] of pairs) u = u.split(a).join(b);
      if (u !== t) {
        writeFileSync(p, u);
        changed++;
      }
    }
  }
})(root);

writeFileSync(join(root, "branding", "branding.json"), JSON.stringify(next, null, 2) + "\n");
execFileSync("node", [join(root, "scripts", "gen-branding.mjs")], { stdio: "inherit" });
// longer or shorter crate names change line lengths
try {
  execFileSync("cargo", ["fmt", "--all"], { cwd: root, stdio: "inherit" });
} catch {
  console.warn("cargo fmt failed; run it yourself");
}
console.log(
  `renamed ${old.displayName} -> ${name}; ${changed} files rewritten. Run \`pnpm install\` to refresh the lockfile.`,
);
