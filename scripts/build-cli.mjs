// Builds the command-line tool and places it where Tauri expects the sidecar:
// src-tauri/binaries/<cli>-<target-triple>[.exe]. Run by the Tauri before-dev/before-build hooks.
// Usage: node scripts/build-cli.mjs [--debug] [--target <triple>]
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const b = JSON.parse(readFileSync(join(root, "branding.json"), "utf8"));
const args = process.argv.slice(2);
const debug = args.includes("--debug") || process.env.TAURI_ENV_DEBUG === "true";
const ti = args.indexOf("--target");
const host = /host: (\S+)/.exec(execFileSync("rustc", ["-vV"], { encoding: "utf8" }))[1];
const triple = (ti >= 0 ? args[ti + 1] : process.env.TAURI_ENV_TARGET_TRIPLE) || host;
const exe = triple.includes("windows") ? ".exe" : "";
const profile = debug ? "debug" : "release";
const dest = join(root, "src-tauri", "binaries", `${b.binaryName}-${triple}${exe}`);
mkdirSync(dirname(dest), { recursive: true });

function build(t) {
  const cargoArgs = ["build", "-p", `${b.cratePrefix}-cli`, ...(debug ? [] : ["--release"])];
  if (t !== host) cargoArgs.push("--target", t);
  execFileSync("cargo", cargoArgs, { cwd: root, stdio: "inherit" });
  return join(root, "target", ...(t !== host ? [t] : []), profile, `${b.binaryName}${exe}`);
}

if (triple === "universal-apple-darwin") {
  const parts = ["aarch64-apple-darwin", "x86_64-apple-darwin"].map(build);
  execFileSync("lipo", ["-create", "-output", dest, ...parts], { stdio: "inherit" });
} else {
  copyFileSync(build(triple), dest);
}
console.log(`command-line tool -> ${dest}`);
