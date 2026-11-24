import { defineConfig } from "@playwright/test";

// Runs the UI against the in-memory fake backend. WebKit is closest to WKWebView and webkit2gtk.
export default defineConfig({
  testDir: ".",
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
