import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Shown in Settings → About: the version, and the commit and date it was built from. */
function buildInfo() {
  const version = JSON.parse(
    readFileSync(new URL("./branding/branding.json", import.meta.url), "utf8"),
  ).version as string;
  let commit: string | null = null;
  try {
    // builds without git history (e.g. Nix from a release tarball) have no commit to show
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    commit = null;
  }
  return { version, commit, date: new Date().toISOString().slice(0, 10) };
}

export default defineConfig({
  // the page is src/index.html; the build goes to dist/, which Tauri bundles
  root: "src",
  build: { outDir: "../dist", emptyOutDir: true },
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  define: { __BUILD__: JSON.stringify(buildInfo()) },
  test: {
    root: ".",
    include: ["src/**/*.test.ts", "packages/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
