import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

// opt-in: needs Playwright's Chromium (`pnpm exec playwright install chromium`) and the CLI built
// with `cargo build -p paperlines-cli`. Run: CHROME_EXTENSION_TEST=1 pnpm test:e2e extension
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const S = mkdtempSync(join(tmpdir(), "paperlines-extension-"));
const ID = "nalppkjoajknnmhpgfbdinkjmgnggdnk";
/** The extension API, inside the extension's own page. */
declare const chrome: { tabs: { query(q: { url: string }): Promise<{ id: number }[]> } };
const CLI = join(ROOT, "target/debug/paperlines" + (process.platform === "win32" ? ".exe" : ""));
// Chrome reads user-level hosts from <user data dir>/NativeMessagingHosts (for real Chrome: the
// folder browser::install writes to); the test browser has its own user data dir
const HOSTS = join(S, "profile", "NativeMessagingHosts");
const MANIFEST = join(HOSTS, "dev.example.paperlines.json");

test.skip(
  !process.env.CHROME_EXTENSION_TEST,
  "opt-in: CHROME_EXTENSION_TEST=1 (see the top of this file)",
);

test("the extension saves a paper and its PDF through native messaging, in real Chrome", async () => {
  test.setTimeout(120_000);
  const lib = join(S, "lib");
  // the extension, allowed to read any page so a test can drive it without a click
  const ext = join(S, "ext");
  cpSync(join(ROOT, "extension"), ext, { recursive: true });
  const m = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
  m.host_permissions = ["<all_urls>"];
  writeFileSync(join(ext, "manifest.json"), JSON.stringify(m));
  // register the development CLI as the native messaging host, as Settings ▸ Connect does
  mkdirSync(HOSTS, { recursive: true });
  writeFileSync(
    MANIFEST,
    JSON.stringify({
      name: "dev.example.paperlines",
      description: "test",
      path: CLI,
      type: "stdio",
      allowed_origins: [`chrome-extension://${ID}/`],
    }),
  );
  // a journal-style page and its PDF
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  const server = createServer((req, res) => {
    if (req.url === "/paper.pdf") {
      res.writeHead(200, { "content-type": "application/pdf" });
      res.end(pdf);
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<html><head><title>Journal</title>
      <meta name="citation_title" content="Native Messaging for Reference Managers">
      <meta name="citation_author" content="Lovelace, Ada">
      <meta name="citation_author" content="Hopper, Grace">
      <meta name="citation_publication_date" content="2024/03/01">
      <meta name="citation_journal_title" content="Journal of Tests">
      <meta name="citation_pdf_url" content="/paper.pdf"></head><body>Article</body></html>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const ctx = await chromium.launchPersistentContext(join(S, "profile"), {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    env: { ...process.env, PAPERLINES_LIBRARY: lib },
  });
  try {
    const article = await ctx.newPage();
    await article.goto(`http://127.0.0.1:${port}/article`);
    const popup = await ctx.newPage();
    // a tab that doesn't exist: this visit only finds the article's tab id, without asking Paperlines
    await popup.goto(`chrome-extension://${ID}/popup.html?tab=999999`);
    const tabId = await popup.evaluate(
      async (url) => (await chrome.tabs.query({ url }))[0].id,
      `http://127.0.0.1:${port}/article`,
    );
    await popup.goto(`chrome-extension://${ID}/popup.html?tab=${tabId}`);
    // the first request creates the test library
    await expect(popup.getByText("Native Messaging for Reference Managers")).toBeVisible({
      timeout: 30_000,
    });
    await expect(popup.getByText("Lovelace, Ada et al.")).toHaveCount(0); // two authors: both shown
    await expect(
      popup.getByText("Lovelace, Ada, Hopper, Grace · 2024 · Journal of Tests"),
    ).toBeVisible();
    await expect(popup.getByRole("checkbox")).toBeChecked();
    await popup.screenshot({ path: join(S, "popup-before.png") });
    await popup.getByRole("button", { name: "Save to Paperlines" }).click();
    await expect(popup.getByText(/Saved as @\S+, with its PDF/)).toBeVisible({ timeout: 30_000 });
    await popup.screenshot({ path: join(S, "popup-after.png") });
    // opening it again: already in the library
    await popup.reload();
    await expect(popup.getByText(/Already in your library as @/)).toBeVisible();
  } finally {
    await ctx.close();
    server.close();
    rmSync(MANIFEST, { force: true });
  }
  // and the paper is in the library, with its PDF
  const out = execFileSync(CLI, ["--library", lib, "--json", "search", "native"], {
    encoding: "utf8",
  });
  const hit = JSON.parse(out).results[0];
  expect(hit.title).toBe("Native Messaging for Reference Managers");
  expect(hit.hasPdf).toBe(true);
  rmSync(S, { recursive: true, force: true, maxRetries: 3 });
});
