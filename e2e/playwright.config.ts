import { defineConfig } from "@playwright/test";

// Runs the UI against the in-memory fake backend. WebKit is closest to WKWebView and webkit2gtk.
export default defineConfig({
  testDir: ".",
  // GitHub's macOS Intel runner has 3 slow cores: a different timing-sensitive test misses its
  // deadline on each run there. More time per check, and up to 2 retries, on CI only; Playwright
  // still lists a test that needed a retry as "flaky" in the report.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://localhost:1420", viewport: { width: 1280, height: 800 } },
  projects: [{ name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    command: "pnpm dev",
    cwd: "..",
    url: "http://localhost:1420",
    reuseExistingServer: true,
  },
  outputDir: "../test-results",
});
