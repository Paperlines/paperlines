import { expect, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;
const mod = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Library" }).getByRole("option")).toHaveCount(5);
});

test("export a project bibliography and the notes folder", async ({ page }) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Thesis chapter 2", exact: true })
    .hover();
  await page.getByRole("navigation").getByRole("button", { name: "Edit Thesis chapter 2" }).click();
  await page.getByRole("button", { name: "Export…" }).click();
  const dlg = page.getByRole("dialog", { name: "Export" });
  await expect(dlg.getByRole("radio", { name: /BibTeX/ })).toBeChecked();
  await expect(dlg.getByRole("radio", { name: /^Project/ })).toBeChecked();
  await dlg.getByRole("radio", { name: /RIS/ }).check();
  if (shots) await page.screenshot({ path: `${shots}/m6-export.png` });
  await dlg.getByRole("button", { name: "Save as…" }).click();
  await expect(dlg.getByRole("status")).toHaveText("Saved /demo/Thesis chapter 2.ris");
  // the whole library: a folder with library.json and the PDFs
  await dlg.getByRole("radio", { name: /Whole library/ }).check();
  await expect(dlg.getByText("Papers", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { __pickFolder?: string }).__pickFolder = "/Users/demo/Desktop";
  });
  await dlg.getByRole("button", { name: "Choose where to save…" }).click();
  await expect(dlg.getByRole("status")).toHaveText(
    "Exported 5 papers and 3 files to /Users/demo/Desktop/Paperlines library 2026-11-19",
  );
});

test("maintenance: backups, library check, command-line tool", async ({ page }) => {
  await page.keyboard.press(`${mod}+Comma`);
  const dlg = page.getByRole("dialog", { name: "Settings" });
  await dlg.getByRole("navigation").getByRole("button", { name: "Library" }).click();
  await expect(dlg.getByText("library-2026-11-18.sqlite")).toBeVisible();
  await dlg.getByRole("button", { name: "Check library" }).click();
  await expect(dlg.getByText("Everything looks good.")).toBeVisible();
  await expect(dlg.getByText("5 papers, 3 PDFs, 5 citation links")).toBeVisible();
  await dlg.getByRole("navigation").getByRole("button", { name: "Command Line" }).click();
  await dlg.getByRole("button", { name: "Install command-line tool" }).click();
  await expect(dlg.getByText("Installed at /Users/demo/.local/bin/paperlines.")).toBeVisible();
  await expect(dlg.getByText("claude mcp add paperlines -- paperlines mcp")).toBeVisible();
  await dlg.getByText("Command-line tool", { exact: true }).scrollIntoViewIfNeeded();
  if (shots) await page.screenshot({ path: `${shots}/m6-maintenance.png` });
});

test("settings: export the whole library, and import one, from Settings → Library", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const dlg = page.getByRole("dialog", { name: "Settings" });
  await dlg.getByRole("navigation").getByRole("button", { name: "Library" }).click();
  await page.evaluate(() => {
    (window as unknown as { __pickFolder?: string }).__pickFolder = "/Users/demo/Desktop";
  });
  await dlg.getByRole("button", { name: "Export whole library…" }).click();
  await expect(dlg.getByRole("status")).toContainText(
    "Exported 5 papers and 3 files to /Users/demo/Desktop/Paperlines library",
  );
  if (shots) await dlg.screenshot({ path: `${shots}/x-transfer.png` });
  // import opens the import flow for a library folder
  await dlg.getByRole("button", { name: "Import a library…" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});
