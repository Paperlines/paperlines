import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;
// the version being built (releases bump it); the fake backend offers the next minor as an update
const VERSION = (
  JSON.parse(readFileSync(new URL("../branding/branding.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
const [major, minor] = VERSION.split(".").map(Number);
const NEXT = `${major}.${minor + 1}.0`;
const mod = process.platform === "darwin" ? "Meta" : "Control";
const list = (page: Page) => page.getByRole("listbox", { name: "Library" });
const sideTab = (page: Page, name: string) =>
  page.getByRole("tablist", { name: "Views" }).getByRole("tab", { name, exact: true });

test("trash: undo from the toast, restore from the Trash view", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await list(page).getByText("Deep learning", { exact: true }).click();
  await page.keyboard.press(`${mod}+Backspace`);
  await expect(
    page.getByRole("status").filter({ hasText: "Moved 1 paper to the Trash" }),
  ).toBeVisible();
  await expect(list(page).getByRole("option")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(list(page).getByRole("option")).toHaveCount(5);

  await list(page).getByText("Deep learning", { exact: true }).click();
  await page.keyboard.press(`${mod}+Backspace`);
  await expect(list(page).getByRole("option")).toHaveCount(4);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^Trash/ })
    .click();
  const trash = page.getByRole("list", { name: "Trash" });
  await expect(trash.getByText("Deep learning")).toBeVisible();
  await page.getByRole("button", { name: "About the Trash" }).hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "deleted for good after 30 days" }),
  ).toBeVisible();
  await page.mouse.move(600, 5);
  if (shots) await page.screenshot({ path: `${shots}/x-trash.png` });
  await trash.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("The Trash is empty.")).toBeVisible();
  await sideTab(page, "Library").click();
  await expect(list(page).getByRole("option")).toHaveCount(5);
});

test("duplicates: merge keeps one paper", async ({ page }) => {
  await page.goto("/?dups");
  await expect(list(page).getByRole("option")).toHaveCount(6);
  await sideTab(page, "Duplicates").click();
  await expect(page.getByText("Similar title, same year")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-duplicates.png` });
  await page.getByRole("button", { name: "Merge 2 into one" }).click();
  await expect(page.getByText("No duplicates found.")).toBeVisible();
  await sideTab(page, "Library").click();
  await expect(list(page).getByRole("option")).toHaveCount(5);
});

test("copy citation in the chosen style", async ({ page }) => {
  await page.goto("/");
  await list(page).getByText("Attention Is All You Need").click();
  await page.keyboard.press(`${mod}+Shift+c`);
  await expect(page.getByRole("status").filter({ hasText: "Copied:" })).toBeVisible();
  const copied = await page.evaluate(
    () => (window as unknown as { __lastCopied?: string }).__lastCopied,
  );
  expect(copied).toContain("Vaswani");
});

test("import cards and Zotero", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Add a paper" }).press("Enter");
  const dlg = page.getByRole("dialog", { name: "Add to library" });
  await expect(dlg.getByRole("button", { name: /Files/ })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-import-cards.png` });
  await dlg.getByRole("button", { name: /Zotero/ }).click();
  await expect(dlg.getByText("/Users/demo/Zotero")).toBeVisible();
  await dlg.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dlg.getByText(/Added 1 papers/)).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(list(page).getByText("Imported from Zotero")).toBeVisible();
});

test("add menu opens the matching import step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More ways to add" }).click();
  await page.getByRole("menuitem", { name: /Paste DOIs/ }).click();
  await expect(page.getByRole("dialog").getByRole("textbox")).toBeVisible();
});

test("settings sections with (i) help", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Settings" });
  await dlg.getByRole("button", { name: "About Offline mode" }).click();
  await expect(page.getByRole("tooltip")).toContainText("No network requests");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(dlg).toBeVisible();
  await dlg.getByRole("navigation").getByRole("button", { name: "Citations" }).click();
  await expect(dlg.getByRole("combobox", { name: "Citation style" })).toBeVisible();
  await dlg.getByRole("navigation").getByRole("button", { name: "Library" }).click();
  await expect(dlg.getByRole("button", { name: "Change folder…" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-settings.png` });
});

test("export: formatted bibliography and an auto-updating file", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await page.keyboard.press(`${mod}+k`);
  await page.getByPlaceholder("Type a command or search…").fill("export");
  await page.keyboard.press("Enter");
  const dlg = page.getByRole("dialog", { name: "Export" });
  await dlg.getByRole("checkbox", { name: /Keep this file updated/ }).check();
  await dlg.getByRole("button", { name: "Save as…" }).click();
  await expect(
    dlg.getByText("Saved /demo/references.bib; it will be kept up to date."),
  ).toBeVisible();
  await dlg.getByRole("radio", { name: /Formatted bibliography/ }).check();
  await expect(dlg.getByRole("checkbox", { name: /Keep this file updated/ })).toHaveCount(0);
  await dlg.getByRole("button", { name: "Save as…" }).click();
  await expect(dlg.getByText("Saved /demo/references.html")).toBeVisible();
});

test("live preview renders Markdown off the cursor line and links are clickable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await page.keyboard.press(`${mod}+k`);
  await page.getByPlaceholder("Type a command or search…").fill("new note");
  await page.keyboard.press("Enter");
  const note = page.locator(".note-view");
  await note.getByRole("textbox", { name: "Note title" }).fill("Live");
  await note.getByRole("textbox", { name: "Note title" }).press("Enter");
  const text = note.getByRole("textbox", { name: "Note text" });
  await text.click();
  await page.keyboard.type("# Plan\n**bold** and $x^2$ with @lecun2015deep\n");
  await expect(note.locator(".cm-lp-h1")).toBeVisible();
  await expect(note.locator(".cm-lp-strong")).toHaveText("bold");
  await expect(note.locator(".cm-lp-math .katex")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-live-preview.png` });
  await note.getByRole("link", { name: "@lecun2015deep" }).click();
  await expect(
    page.getByRole("tabpanel").getByRole("heading", { name: "Deep learning" }),
  ).toBeVisible();
});

test("tabs: several PDFs side by side, closable", async ({ page }) => {
  // wide enough that the graph pane has room for its overview map (hidden below 420px)
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await list(page).getByText("Attention Is All You Need").dblclick();
  await list(page).getByText("Deep Residual Learning").dblclick();
  const strip = page.getByRole("tablist", { name: "Open tabs" });
  await expect(strip.getByRole("tab")).toHaveCount(2);
  await page.getByRole("button", { name: "Show citation graph" }).click();
  await expect(strip.getByRole("tab")).toHaveCount(3);
  await expect(page.locator(".cg-minimap")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-tabs-graph.png` });
  await page.locator(".cg-minimap").click({ position: { x: 20, y: 20 } });
  await strip
    .getByRole("button", { name: /^Close / })
    .first()
    .click();
  await expect(strip.getByRole("tab")).toHaveCount(2);
});

test("restores open tabs from the last session without crashing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem(
      "panes",
      JSON.stringify({ state: { tabs: [{ kind: "reader", itemId: 1 }], active: 0 }, version: 2 }),
    );
    localStorage.setItem(
      "ui-state",
      JSON.stringify({ state: { layout: "split", selectedId: 2 }, version: 2 }),
    );
  });
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await expect(page.locator(".reader").getByText("Page 1 of 3")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a .bib per project: save as, keep updated, every project at once", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  const nav = page.getByRole("navigation", { name: "Collections" });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Thesis chapter 2", exact: true })
    .hover();
  await nav.getByRole("button", { name: "Save .bib for Thesis chapter 2" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved /demo/Thesis chapter 2.bib" }),
  ).toBeVisible();

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Thesis chapter 2", exact: true })
    .hover();
  await nav.getByRole("button", { name: "Edit Thesis chapter 2" }).click();
  const dlg = page.getByRole("dialog", { name: "Edit project" });
  await dlg.getByRole("button", { name: "Keep a .bib updated…" }).click();
  await expect(dlg.getByText("/demo/Thesis chapter 2.bib")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-project-bib.png` });
  // renaming the project keeps the file attached to it
  await dlg.getByLabel("Name").fill("Thesis ch. 2");
  await dlg.getByRole("button", { name: "Save", exact: true }).click();
  await nav.getByRole("button", { name: "Thesis ch. 2", exact: true }).hover();
  await nav.getByRole("button", { name: "Edit Thesis ch. 2" }).click();
  await expect(dlg.getByText("/demo/Thesis chapter 2.bib")).toBeVisible();
  await dlg.getByRole("button", { name: "Stop updating" }).click();
  await expect(dlg.getByText("/demo/Thesis chapter 2.bib")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    (window as unknown as { __pickFolder?: string }).__pickFolder = "/demo/bibs";
  });
  await page.keyboard.press(`${mod}+k`);
  await page.getByPlaceholder("Type a command or search…").fill("bib for every");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved 1 .bib file to /demo/bibs" }),
  ).toBeVisible();
});

test("the Add menu lists import sources without trailing dots", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More ways to add" }).click();
  for (const name of ["Add files", "Add folder", "Import from Zotero", "Import library…"])
    await expect(page.getByRole("menuitem", { name, exact: true })).toBeVisible();
});

test("right-click a paper: the app's menu, not the system one", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  const row = list(page).getByText("Attention Is All You Need");
  await row.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Attention Is All You Need" });
  await expect(menu).toBeVisible();
  await expect(list(page).getByRole("option", { selected: true })).toHaveCount(1);
  for (const name of ["Open PDF", "Show in Finder", "Copy citation", "Mark as", "Move to Trash"])
    await expect(menu.getByRole("menuitem", { name: new RegExp(`^${name}`) })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-context-menu.png` });

  // submenu: mark as Unread
  await menu.getByRole("menuitem", { name: /^Mark as/ }).hover();
  await page
    .getByRole("menu", { name: "Mark as" })
    .getByRole("menuitem", { name: "Unread" })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    list(page).getByRole("option", { name: /Attention Is All You Need.*Unread/ }),
  ).toBeVisible();

  // Show in Finder reveals the paper's file
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Show in Finder" }).click();
  expect(await page.evaluate(() => (window as unknown as { __revealed?: number }).__revealed)).toBe(
    1,
  );

  // keyboard: arrows and Escape
  await row.click({ button: "right" });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // right-click inside a multi-selection keeps it and acts on all of them
  await list(page)
    .getByText("Deep learning", { exact: true })
    .click({ modifiers: [mod === "Meta" ? "Meta" : "Control"] });
  await row.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: /^Move 2 papers to Trash/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /^Move 2 papers to Trash/ }).click();
  await expect(list(page).getByRole("option")).toHaveCount(3);
});

test("papers citing this: sort, filter, add, and in-library matching", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await list(page).getByText("Attention Is All You Need").click();
  await page.getByRole("tab", { name: "Citations" }).click();
  await page.getByRole("button", { name: "Papers citing this" }).click();

  const strip = page.getByRole("tablist", { name: "Open tabs" });
  await expect(strip.getByRole("tab", { name: "Cited by · vaswani2017attention" })).toBeVisible();
  const view = page.locator(".citing-view");
  await expect(
    view.getByText(/^148,749 papers cite this · showing the 7 most cited · OpenAlex/),
  ).toBeVisible();
  const rows = view.locator(".citing-row");
  await expect(rows).toHaveCount(7);
  const bert = rows.filter({ hasText: "BERT: Pre-training" });
  await expect(bert.getByRole("button", { name: "In library" })).toBeVisible();
  await expect(bert.getByRole("button", { name: /^Add .* to the library$/ })).toHaveCount(0);
  const vit = rows.filter({ hasText: "An Image is Worth" });
  await expect(
    vit.getByRole("button", { name: /^Add An Image is Worth.* to the library$/ }),
  ).toBeVisible();

  // preview: the abstract loads when the row is opened, and closes again
  await vit.getByRole("button", { name: /^Show the abstract of An Image is Worth/ }).click();
  await expect(vit.locator(".citing-abstract")).toContainText("demonstration abstract");
  if (shots) await page.screenshot({ path: `${shots}/x-citing-preview.png` });
  await vit.getByRole("button", { name: /^Hide the abstract of/ }).click();
  await expect(vit.locator(".citing-abstract")).toHaveCount(0);
  const untitled = rows.filter({ hasText: "An Untitled Workshop Note" });
  await untitled.getByRole("button", { name: /^Show the abstract of/ }).click();
  await expect(untitled.getByText("No abstract available")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-citing.png` });

  // most connected first: ViT cites BERT and ResNet from the library
  await view.getByRole("button", { name: "Most connected" }).click();
  await expect(rows.first()).toContainText("An Image is Worth 16x16 Words");
  await expect(rows.first().getByText("cites 2 of your papers")).toBeVisible();
  await view.getByRole("button", { name: "Newest" }).click();
  await expect(rows.first()).toContainText("A Survey of Efficient Transformers");

  // filters
  await view.getByRole("searchbox", { name: /Filter by title/ }).fill("swin");
  await expect(rows).toHaveCount(1);
  await view.getByRole("searchbox", { name: /Filter by title/ }).fill("");
  await view.getByRole("checkbox", { name: "Hide papers in my library" }).check();
  await expect(rows).toHaveCount(5);
  await view.getByRole("checkbox", { name: "Hide papers in my library" }).uncheck();
  await view.getByLabel("Since").fill("2023");
  await expect(rows).toHaveCount(2);
  await view.getByLabel("Since").fill("");
  await expect(
    view.getByRole("checkbox", { name: "Select An Untitled Workshop Note" }),
  ).toBeDisabled();

  // add two through the usual import review; they then show as in the library
  await view.getByRole("checkbox", { name: /^Select Swin Transformer/ }).check();
  await view.getByRole("checkbox", { name: "Select A Survey of Efficient Transformers" }).check();
  await view.getByRole("button", { name: "Add 2 papers…" }).click();
  await page.getByRole("button", { name: "Import 2" }).click();
  await expect(page.getByText("Added 2, merged 0, skipped 0")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(list(page).getByRole("option")).toHaveCount(7);
  // free PDFs are downloaded for papers added without a file
  await expect(
    page.getByRole("status").filter({ hasText: "Attached 2 open-access PDFs." }),
  ).toBeVisible();
  await expect(
    list(page)
      .getByRole("option", { name: /^Looked up 10\.5555\/swin/ })
      .getByLabel("PDF"),
  ).toBeVisible();
  await expect(
    rows.filter({ hasText: "Swin Transformer" }).getByRole("button", { name: "In library" }),
  ).toBeVisible();
  await expect(
    rows
      .filter({ hasText: "A Survey of Efficient Transformers" })
      .getByRole("button", { name: "In library" }),
  ).toBeVisible();

  // the right-click menu focuses the same tab rather than opening another
  await list(page).getByText("Attention Is All You Need").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Papers citing this" }).click();
  await expect(strip.getByRole("tab", { name: /^Cited by/ })).toHaveCount(1);
});

test("Delete or ⌫ in the list moves the selected papers to the Trash and selects the next", async ({
  page,
}) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  // typing in the search box never deletes papers
  await list(page).getByText("Deep learning", { exact: true }).click();
  await page.getByRole("combobox", { name: /^Search/ }).fill("x");
  await page.getByRole("combobox", { name: /^Search/ }).press("Backspace");
  await expect(list(page).getByRole("option")).toHaveCount(5);

  await list(page).getByText("Deep learning", { exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(list(page).getByRole("option")).toHaveCount(4);
  await expect(
    page.getByRole("status").filter({ hasText: "Moved 1 paper to the Trash" }),
  ).toBeVisible();
  await expect(list(page).getByRole("option", { selected: true })).toHaveCount(1);

  // two at once with ⌫, then Undo brings both back
  await list(page).getByText("Attention Is All You Need").click();
  await list(page)
    .getByText("Deep Residual Learning")
    .click({ modifiers: [mod === "Meta" ? "Meta" : "Control"] });
  await page.keyboard.press("Backspace");
  await expect(list(page).getByRole("option")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(list(page).getByRole("option")).toHaveCount(4);
});

test("a PDF for a paper already in the library is attached to it, not added twice", async ({
  page,
}) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  const pick = (files: string[]) =>
    page.evaluate((f) => {
      (window as unknown as { __pickFiles?: string[] }).__pickFiles = f;
    }, files);

  // "Deep learning" has no PDF yet; "Attention" already has its file
  await pick([
    "/Users/demo/Downloads/Deep learning.pdf",
    "/Users/demo/Downloads/Attention Is All You Need.pdf",
  ]);
  await page.getByRole("textbox", { name: "Add a paper" }).press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Files/ })
    .click();
  const dlg = page.getByRole("dialog", { name: "Add to library" });
  await expect(
    dlg.getByText(
      "Already in library: Deep learning. The file will be attached to it, no duplicate.",
    ),
  ).toBeVisible();
  await expect(
    dlg.getByText("Already in library with this file: Attention Is All You Need"),
  ).toBeVisible();
  const actions = dlg.getByRole("combobox", { name: "Action" });
  await expect(actions.nth(0)).toHaveValue("merge");
  await expect(actions.nth(0).locator("option:checked")).toHaveText("Attach to existing");
  await expect(actions.nth(1)).toHaveValue("skip");
  if (shots) await page.screenshot({ path: `${shots}/x-attach-existing.png` });
  await dlg.getByRole("button", { name: "Import 1" }).click();
  await expect(dlg.getByText("Added 0, merged 1, skipped 1")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await expect(
    list(page)
      .getByRole("option", { name: /^Deep learning/ })
      .getByLabel("PDF"),
  ).toBeVisible();

  // right-click: Attach PDF… for a paper without one
  await pick(["/Users/demo/Downloads/bert.pdf"]);
  await list(page).getByText("BERT: Pre-training").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Attach PDF…" }).click();
  await expect(
    list(page)
      .getByRole("option", { name: /^BERT: Pre-training/ })
      .getByLabel("PDF"),
  ).toBeVisible();
});

test("paper details tabs: Info, Notes, Highlights, Citations; Info first", async ({ page }) => {
  await page.goto("/");
  await list(page).getByText("Deep learning", { exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "Paper details" }).getByRole("tab");
  await expect(tabs).toHaveText(["Info", "Notes", "Highlights", "Citations"]);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
});

test("update details from PDF: shows old and new, keeps the rest", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await list(page).getByText("Attention Is All You Need").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Update details from PDF…" }).click();
  const dlg = page.getByRole("dialog", { name: "Update details from PDF" });
  await expect(dlg.getByText(/doesn't match this PDF, so it was ignored/)).toBeVisible();
  const table = dlg.getByRole("table");
  await expect(table.getByRole("row", { name: /^Authors/ })).toContainText("Fischer, Joachim");
  await expect(table.getByRole("row", { name: /^Venue/ })).toContainText("Optics Express");
  const key = dlg.getByRole("checkbox", {
    name: /Also change the citekey to fischer2013threedimensional/,
  });
  await expect(key).toBeChecked();
  if (shots) await page.screenshot({ path: `${shots}/x-update-details.png` });
  await dlg.getByRole("button", { name: "Update details" }).click();
  await expect(dlg).toBeHidden();
  await expect(
    list(page).getByText(
      "Three-dimensional multi-photon direct laser writing with variable repetition rate",
    ),
  ).toBeVisible();
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await page
    .getByRole("tablist", { name: "Paper details" })
    .getByRole("tab", { name: "Info" })
    .click();
  await expect(page.getByLabel("Citekey")).toHaveValue("fischer2013threedimensional");
  // tags are kept
  await expect(page.locator(".detail").getByText("transformers")).toBeVisible();
});

test("drag papers onto a project or a tag; drop files on a project", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  const nav = page.getByRole("navigation", { name: "Collections" });
  const project = nav.locator("[data-drop-project]").first();
  await expect(project).toContainText("Thesis chapter 2");
  await expect(project.locator(".nav-count")).toHaveText("1");

  const drag = async (from: ReturnType<typeof list>, to: typeof project) => {
    const a = await from.boundingBox();
    const b = await to.boundingBox();
    if (!a || !b) throw new Error("not visible");
    await page.mouse.move(a.x + 40, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 60, a.y + a.height / 2 + 10, { steps: 4 });
    await page.mouse.move(b.x + 30, b.y + b.height / 2, { steps: 8 });
    await expect(to).toHaveClass(/drop-over/);
    await page.mouse.up();
  };

  // one paper onto the project
  await drag(list(page).getByRole("option", { name: /^Deep learning/ }), project);
  await expect(
    page.getByRole("status").filter({ hasText: "Added to Thesis chapter 2" }),
  ).toBeVisible();
  await expect(project.locator(".nav-count")).toHaveText("2");

  // two selected papers onto a tag: pressing inside the selection keeps both
  await list(page).getByText("Attention Is All You Need").click();
  await list(page)
    .getByText("Deep Residual Learning")
    .click({ modifiers: [mod === "Meta" ? "Meta" : "Control"] });
  const survey = nav.locator('[data-drop-tag="survey"]');
  await drag(list(page).getByRole("option", { name: /^Attention Is All You Need/ }), survey);
  await expect(
    page.getByRole("status").filter({ hasText: "Tagged 2 papers survey" }),
  ).toBeVisible();
  await expect(survey.locator(".nav-count")).toHaveText("3");
  if (shots) await page.screenshot({ path: `${shots}/x-drag.png` });

  // files from Finder dropped on the project row go into that project
  const box = await project.boundingBox();
  if (!box) throw new Error("no project row");
  await page.evaluate(
    ([x, y]) =>
      (window as unknown as { __dropFiles(p: string[], x: number, y: number): void }).__dropFiles(
        ["/Users/demo/Downloads/A New Paper.pdf"],
        x,
        y,
      ),
    [box.x + 30, box.y + box.height / 2],
  );
  const dlg = page.getByRole("dialog", { name: "Add to library" });
  await dlg.getByRole("button", { name: "Import 1" }).click();
  await expect(dlg.getByText("Added to the project Thesis chapter 2.")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(project.locator(".nav-count")).toHaveText("3");
});

test("library columns can be resized; Year stays visible in a narrow pane", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  const yearHead = page.getByRole("columnheader", { name: /^Year/ });
  const before = (await yearHead.boundingBox())?.width ?? 0;
  const handle = page.getByRole("separator", { name: /Resize the Year column/ });
  const h = await handle.boundingBox();
  if (!h) throw new Error("no handle");
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x - 40, h.y + h.height / 2, { steps: 5 });
  await page.mouse.up();
  const after = (await yearHead.boundingBox())?.width ?? 0;
  expect(after).toBeGreaterThan(before + 30);
  await handle.dblclick();
  await expect
    .poll(async () => (await yearHead.boundingBox())?.width ?? 0)
    .toBeLessThan(before + 5);

  // squeeze the list: the year is still fully shown
  await page.setViewportSize({ width: 900, height: 700 });
  const year = list(page)
    .getByRole("option", { name: /^Attention/ })
    .locator(".c-year");
  await expect(year).toHaveText("2017");
  const fits = await year.evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
});

test("typed connections: add, own types, edit, remove", async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await list(page).getByText("Attention Is All You Need").click();
  await page
    .getByRole("tablist", { name: "Paper details" })
    .getByRole("tab", { name: "Citations" })
    .click();
  const section = page.getByRole("region", { name: "Connections" });
  await expect(section.getByText(/No connections yet/)).toBeVisible();
  await section.getByRole("button", { name: "Add connection" }).click();

  const dlg = page.getByRole("dialog", { name: "New connection" });
  await dlg
    .getByRole("combobox", { name: "Connection type" })
    .selectOption({ label: "Extended by" });
  await dlg.getByRole("textbox", { name: "The other paper" }).fill("bert");
  await dlg.getByRole("button", { name: /^BERT: Pre-training/ }).click();
  await dlg.getByRole("textbox", { name: "Note" }).fill("masked LM on the same encoder");
  if (shots) await page.screenshot({ path: `${shots}/x-connection-dialog.png` });
  await dlg.getByRole("button", { name: "Add connection" }).click();
  await expect(dlg).toBeHidden();
  const row = section.getByRole("listitem").filter({ hasText: "Extended by" });
  await expect(row).toContainText("Devlin ’19");
  await expect(row).toContainText("masked LM on the same encoder");

  // the other paper sees it the other way round
  await row.getByRole("button", { name: /^Devlin ’19/ }).click();
  await expect(section.getByRole("listitem").filter({ hasText: "Extends" })).toContainText(
    "Vaswani ’17",
  );

  // a type of your own
  await section.getByRole("button", { name: "Add connection" }).click();
  await page.getByRole("button", { name: "Connection types…" }).click();
  const types = page.getByRole("dialog", { name: "Connection types" });
  await types.getByRole("textbox", { name: "New type" }).fill("Supports");
  await types.getByRole("textbox", { name: "Its reverse wording" }).fill("Supported by");
  await types.getByRole("button", { name: "Add type" }).click();
  await expect(types.getByRole("textbox", { name: "Name of Supports" })).toBeVisible();
  await types.getByRole("button", { name: "Done" }).click();
  const back = page.getByRole("dialog", { name: "New connection" });
  await back.getByRole("combobox", { name: "Connection type" }).selectOption({ label: "Supports" });
  await back.getByRole("textbox", { name: "The other paper" }).fill("residual");
  await back.getByRole("button", { name: /^Deep Residual Learning/ }).click();
  await back.getByRole("button", { name: "Add connection" }).click();
  await expect(section.getByRole("listitem").filter({ hasText: "Supports" })).toContainText(
    "He ’16",
  );

  // edit: flip "Extends" to "Contradicts", then remove it
  await section.getByRole("button", { name: /^Edit “Extends”/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit connection" });
  await edit
    .getByRole("combobox", { name: "Connection type" })
    .selectOption({ label: "Contradicts" });
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(section.getByRole("listitem").filter({ hasText: "Contradicts" })).toContainText(
    "Vaswani ’17",
  );
  await section.getByRole("button", { name: /^Edit “Contradicts”/ }).click();
  await page
    .getByRole("dialog", { name: "Edit connection" })
    .getByRole("button", { name: "Remove connection" })
    .click();
  await expect(section.getByRole("listitem")).toHaveCount(1); // only "Supports" is left
});

test("search online: merged results, add (also by PubMed ID), map into a project graph", async ({
  page,
}) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
  await sideTab(page, "Search online").click();
  const box = page.getByRole("searchbox", { name: "Topic, title, author or question" });
  await box.fill("graph neural networks");
  await box.press("Enter");
  const results = page.getByRole("list", { name: "Search results" }).getByRole("listitem");
  await expect(results).toHaveCount(5);
  await expect(page.getByText(/Semantic Scholar didn't answer/)).toBeVisible();
  const att = results.filter({ hasText: "Attention Is All You Need" });
  await expect(att.getByRole("button", { name: "In library" })).toBeVisible();
  await expect(att.getByText("arXiv", { exact: true })).toBeVisible();
  await expect(results.first()).toContainText("a review of methods and applications");
  if (shots) await page.screenshot({ path: `${shots}/x-search-online.png` });
  await page.getByRole("button", { name: "Most cited" }).click();
  await expect(results.first()).toContainText("Attention Is All You Need");
  await expect(results.filter({ hasText: "unidentifiable" }).getByRole("checkbox")).toBeDisabled();

  // a PubMed-only paper is added by its PMID
  const clinical = results.filter({ hasText: "A clinical study of" });
  await clinical.getByRole("button", { name: /^Add .* to the library$/ }).click();
  await expect(page.getByRole("dialog").locator("input.cand-title")).toHaveValue(
    "Looked up PMID:31234567",
  );
  await page.getByRole("button", { name: "Import 1" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(clinical.getByRole("button", { name: "In library" })).toBeVisible();

  // map: a new project named after the search, opened as a graph
  await page.getByRole("button", { name: "Relevance" }).click();
  await results.filter({ hasText: "a review of methods" }).getByRole("checkbox").check();
  await results.filter({ hasText: "at scale" }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Map 2 papers" }).click();
  await page.getByRole("button", { name: "Import 2" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(
    page.getByRole("tablist", { name: "Open tabs" }).getByRole("tab", { name: /Graph/ }),
  ).toBeVisible();
  await page.waitForFunction(() => window.__paperlinesGraph?.stats().nodes === 2);
  const nav = page.getByRole("navigation", { name: "Collections" });
  await sideTab(page, "Library").click();
  await expect(
    nav.locator("[data-drop-project]").filter({ hasText: "graph neural networks" }),
  ).toContainText("2");

  // one source only
  await sideTab(page, "Search online").click();
  for (const name of [
    "OpenAlex",
    "Semantic Scholar",
    "arXiv",
    "Crossref",
    "Europe PMC",
    "DataCite",
    "DOAJ",
  ])
    await page.getByRole("group", { name: "Sources" }).getByRole("button", { name }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(results).toHaveCount(1);
  await expect(page.getByText(/didn't answer/)).toHaveCount(0);
});

test("settings: connect AI assistants and add the skill", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "AI Assistants" }).click();
  const here = dlg.getByRole("list", { name: "AI assistants on this computer" });
  const claude = here.getByRole("listitem", { name: "Claude Code" });
  await expect(claude.getByText("Not connected")).toBeVisible();
  await claude.getByRole("button", { name: "Connect" }).click();
  await expect(claude.getByText("Connected", { exact: true })).toBeVisible();
  await expect(dlg.getByRole("status")).toContainText("Claude Code is connected.");
  await claude.getByRole("button", { name: "Add skills" }).click();
  await expect(claude.getByRole("button", { name: "Skills" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // pointing at an older copy of the program: offered as an update
  const desktop = here.getByRole("listitem", { name: "Claude Desktop" });
  await expect(desktop.getByText("Connected to an older copy")).toBeVisible();
  await desktop.getByRole("button", { name: "Update" }).click();
  await expect(desktop.getByText("Connected", { exact: true })).toBeVisible();
  // no skills folder: no skill button
  await expect(desktop.getByRole("button", { name: /skill/i })).toHaveCount(0);
  // not installed: set up by hand
  const missing = dlg.getByRole("list", { name: "Not found on this computer" });
  const codex = missing.getByRole("listitem", { name: "Codex" });
  await expect(codex.getByRole("button", { name: "Connect" })).toHaveCount(0);
  await codex.getByRole("button", { name: "Set up Codex by hand" }).click();
  await expect(codex.locator("pre")).toContainText("[mcp_servers.paperlines]");
  // the skills Paperlines brings, and what each does
  const skills = dlg.getByRole("region", { name: "Skills in Paperlines" });
  // three skills, folded to one line each; a click opens what it does
  const cards = skills.locator("details.skill-card");
  await expect(cards).toHaveCount(3);
  const skill = cards.filter({ has: page.getByText("paperlines", { exact: true }) });
  await expect(skill).toContainText("installed in 1 assistant");
  await expect(skill.getByText("What do I have on X?")).toBeHidden();
  await skill.locator("summary").click();
  await expect(skill.getByText("What do I have on X?")).toBeVisible();
  await expect(skill).toContainText("Ask before writing");
  const scout = cards.filter({ has: page.getByText("paperlines-scout", { exact: true }) });
  await scout.locator("summary").click();
  await expect(scout).toContainText("Never import");
  if (shots) await dlg.screenshot({ path: `${shots}/x-skills.png` });
  // and folds again
  await scout.locator("summary").click();
  await expect(scout.getByText(/Never import/)).toBeHidden();
  // what the assistant gets
  await dlg.getByRole("button", { name: /What an assistant can do/ }).click();
  const tools = dlg.getByRole("list", { name: "Tools the assistant gets" });
  await expect(tools.getByRole("listitem")).toHaveCount(3);
  await expect(tools.getByRole("listitem").filter({ hasText: "add_bullet" })).toContainText(
    "writes",
  );
  if (shots) await dlg.screenshot({ path: `${shots}/x-settings-ai.png` });
});

test("live preview: $$ blocks render in place and open for editing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("listbox", { name: "Library" }).getByText("Deep learning").waitFor();
  await page.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+k`);
  await page.getByPlaceholder("Type a command or search…").fill("new note");
  await page.keyboard.press("Enter");
  const note = page.locator(".note-view");
  await note.getByRole("textbox", { name: "Note title" }).fill("Live math");
  await note.getByRole("textbox", { name: "Note title" }).press("Enter");
  const body = note.getByRole("textbox", { name: "Note text" });
  await body.click();
  // the toolbar stays above the live editor
  await expect(note.getByRole("toolbar", { name: "Formatting" })).toBeVisible();
  await page.keyboard.type("Before\n$$\n\\frac{a}{b} = c\n$$\nAfter $$x^2$$ and $y$");
  // the cursor is on the last line: the block renders as one formula, the inline ones too
  await expect(note.locator(".cm-lp-math-block")).toHaveCount(1);
  await expect(note.locator(".cm-lp-math-block .katex-display")).toBeVisible();
  await expect(note.locator(".cm-lp-math")).toHaveCount(0); // the cursor's line stays raw
  await page.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+Home`);
  await expect(note.locator(".cm-lp-math")).toHaveCount(2); // $$x^2$$ and $y$
  // clicking into the block shows its LaTeX again
  await note.locator(".cm-lp-math-block").click();
  await expect(note.locator(".cm-lp-math-block")).toHaveCount(0);
  await expect(body).toContainText("\\frac{a}{b} = c");
  if (shots) await page.screenshot({ path: `${shots}/x-live-math.png` });
});

test("note toolbar: titles, text style, lists and shortcuts", async ({ page }) => {
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.goto("/");
  await page.getByRole("listbox", { name: "Library" }).getByText("Deep learning").waitFor();
  await page.keyboard.press(`${mod}+k`);
  await page.getByPlaceholder("Type a command or search…").fill("new note");
  await page.keyboard.press("Enter");
  const note = page.locator(".note-view");
  await note.getByRole("textbox", { name: "Note title" }).fill("Plan");
  await note.getByRole("textbox", { name: "Note title" }).press("Enter");
  const body = note.getByRole("textbox", { name: "Note text" });
  await body.click();
  const bar = note.getByRole("toolbar", { name: "Formatting" });
  const btn = (name: RegExp) => bar.getByRole("button", { name });

  await btn(/^Title/).click();
  await expect(btn(/^Title/)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.type("Reading plan\n");
  await btn(/^Bullet list/).click();
  await expect(btn(/^Bullet list/)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.type("first\nsecond"); // Enter continues the list
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // an empty item ends the list
  await page.keyboard.press(`${mod}+b`);
  await page.keyboard.type("important");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type(" and ");
  await btn(/^Italic/).click();
  await page.keyboard.type("subtle");
  // the shortcut is in the tooltip
  await expect(btn(/^Bold/)).toHaveAttribute("title", /Bold \((⌘B|Ctrl\+B)\)/);
  // rendered (live preview): the heading and bold show, the marks don't
  await note.getByRole("textbox", { name: "Note title" }).click();
  await expect(note.locator(".cm-lp-h1")).toHaveText("Reading plan");
  await expect(note.locator(".cm-lp-strong")).toContainText("important");
  await expect(note.locator(".cm-lp-em")).toContainText("subtle");
  // two list items (each drawn with a bullet), and the list ended before the bold line
  await expect(note.locator(".cm-lp-bullet")).toHaveCount(2);
  await expect(note.locator(".cm-line").filter({ hasText: "first" })).toHaveText("• first");
  await expect(note.locator(".cm-line").filter({ hasText: "important" })).toHaveText(
    "important and subtle",
  );
  if (shots) await page.screenshot({ path: `${shots}/x-note-toolbar.png` });
});

test("note toolbar: insert a table, fill it with Tab, see it rendered", async ({ page }) => {
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.goto("/");
  await page.getByRole("listbox", { name: "Library" }).getByText("Deep learning").waitFor();
  await page.keyboard.press(`${mod}+k`);
  await page.getByPlaceholder("Type a command or search…").fill("new note");
  await page.keyboard.press("Enter");
  const note = page.locator(".note-view");
  await note.getByRole("textbox", { name: "Note title" }).fill("Spacing");
  await note.getByRole("textbox", { name: "Note title" }).press("Enter");
  const body = note.getByRole("textbox", { name: "Note text" });
  await body.click();
  await page.keyboard.type("Woodpile spacings");
  const bar = note.getByRole("toolbar", { name: "Formatting" });
  await bar.getByRole("button", { name: "Table", exact: true }).click();
  // the size picker: 2 columns × 1 body row
  await bar.getByRole("button", { name: "2 × 1 table" }).click();
  await expect(bar.getByRole("group", { name: "Table" })).toHaveCount(0);
  // the first header is selected, so typing replaces it; Tab moves on, skipping the separator
  await page.keyboard.type("Paper");
  await page.keyboard.press("Tab");
  await page.keyboard.type("dz");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Oakdale");
  await page.keyboard.press("Tab");
  await page.keyboard.type("1 µm");
  // Tab in the last cell adds a row
  await page.keyboard.press("Tab");
  await page.keyboard.type("Dong");
  // out of focus, the table renders
  await note.getByRole("textbox", { name: "Note title" }).click();
  const table = note.locator(".cm-lp-table table");
  await expect(table).toBeVisible();
  await expect(table.locator("th")).toHaveText(["Paper", "dz"]);
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table.locator("tbody tr").first().locator("td")).toHaveText(["Oakdale", "1 µm"]);
  await expect(table.locator("tbody tr").nth(1).locator("td").first()).toHaveText("Dong");
  await expect(note.locator(".cm-line").filter({ hasText: "Woodpile spacings" })).toBeVisible();
  // clicking the table shows its Markdown again
  await table.click();
  await expect(note.locator(".cm-lp-table")).toHaveCount(0);
  await expect(body).toContainText("| Paper");
  if (shots) await page.screenshot({ path: `${shots}/x-note-table.png` });
});

test("settings: Help & About: build, what's new, citing, shortcuts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Help & About", exact: true }).click();
  const card = dlg.getByRole("region", { name: "Paperlines", exact: true });
  await expect(card.getByRole("heading")).toContainText("Paperlines");
  await expect(card).toContainText(`v${VERSION}`);
  // the contributors first, then who started it
  await expect(card).toContainText(
    "Made by the Paperlines contributors, started by Yoav Yosif-Or.",
  );
  await expect(card).toContainText(
    "the Paperlines contributors and Yoav Yosif-Or · AGPL-3.0-or-later",
  );
  // the GitHub repository: project row, and an update check that finds nothing new here
  await expect(dlg.getByRole("region", { name: "Project" })).toContainText(
    "Star and explore on GitHub",
  );
  await dlg.getByRole("button", { name: "Check for updates" }).click();
  await expect(dlg.getByRole("status")).toHaveText(`You have the latest version (${VERSION}).`);
  // how to cite it
  const cite = dlg.getByRole("region", { name: "Cite Paperlines in your paper" });
  await expect(cite.getByLabel("BibTeX", { exact: true })).toContainText("@software{paperlines,");
  await expect(cite.getByLabel("BibTeX", { exact: true })).toContainText(`version = {${VERSION}}`);
  await expect(cite.getByLabel("BibTeX", { exact: true })).toContainText(
    "{{The Paperlines contributors} and Yoav Yosif-Or}",
  );
  await cite.getByRole("button", { name: "Copy in APA" }).click();
  await expect(cite.getByRole("button", { name: "Copied" })).toBeVisible();
  if (shots) await dlg.screenshot({ path: `${shots}/x-about.png` });
  // what's new opens the changelog inside Settings
  await dlg
    .getByRole("region", { name: "Help" })
    .getByRole("button", { name: /What's new/ })
    .click();
  const log = dlg.getByRole("article", { name: "What's new" });
  await expect(log.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(log).toContainText("Export a whole library");
  await dlg.getByRole("button", { name: "Back" }).click();
  // keyboard shortcuts: the command palette
  await dlg.getByRole("button", { name: /Keyboard shortcuts/ }).click();
  await expect(page.getByPlaceholder("Type a command or search…")).toBeVisible();
});

test("suggestions inbox: assistant's picks wait on the project, to add or dismiss", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation");
  const badge = nav.getByRole("button", { name: "2 suggested papers for Thesis chapter 2" });
  await expect(badge).toBeVisible();
  await badge.click();
  const dlg = page.getByRole("dialog", { name: "Edit project" });
  const inbox = dlg.getByRole("region", { name: "Suggested papers" });
  await expect(inbox.getByRole("listitem")).toHaveCount(2);
  await expect(inbox.getByRole("listitem", { name: "Long Short-Term Memory" })).toContainText(
    "Cited by 3 of your project papers",
  );
  if (shots) await dlg.screenshot({ path: `${shots}/x-suggestions.png` });
  // dismiss: gone for good, and the badge counts down
  await inbox.getByRole("button", { name: "Dismiss “Long Short-Term Memory”" }).click();
  await expect(inbox.getByRole("listitem")).toHaveCount(1);
  await expect(
    nav.getByRole("button", { name: "1 suggested paper for Thesis chapter 2" }),
  ).toBeVisible();
  // add: the usual import review, into this project
  await inbox.getByRole("button", { name: /^Add “Neural Machine Translation/ }).click();
  await expect(page.getByRole("dialog", { name: "Add to library" })).toBeVisible();
});

test("a highlight made from the PDF's text is placed when the PDF opens", async ({ page }) => {
  await page.goto("/?pending");
  const list = page.getByRole("listbox", { name: "Library" });
  await list.getByText("Attention Is All You Need").click();
  // before opening: listed, not placed yet
  await page
    .getByRole("tablist", { name: "Paper details" })
    .getByRole("tab", { name: "Highlights" })
    .click();
  await expect(page.getByText("placed when you open the PDF")).toBeVisible();
  // opening the PDF finds the words and highlights them
  await list.getByText("Attention Is All You Need").dblclick();
  const reader = page.locator(".reader");
  await expect(reader.getByText("Page 1 of 3")).toBeVisible();
  await expect(reader.locator(".pv-page[data-page='2'] .pv-hl.k-highlight").first()).toBeAttached({
    timeout: 10_000,
  });
  await expect(page.getByText("placed when you open the PDF")).toHaveCount(0);
  if (shots) {
    await reader.locator(".pv-page[data-page='2']").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/x-placed.png` });
  }
});

test("a new version: offered when the app opens, with its changes and who made it", async ({
  page,
}) => {
  await page.goto("/?update");
  const dlg = page.getByRole("dialog", { name: `Paperlines ${NEXT} is available` });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText(`You have version ${VERSION}`);
  const notes = dlg.getByRole("region", { name: "What's new" });
  await expect(notes.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(notes).toContainText("Faster search");
  const people = dlg.getByRole("region", { name: "Made by" });
  await expect(people.getByRole("link", { name: "Ada Lovelace" })).toBeVisible();
  await expect(people).toContainText("Grace Hopper");
  if (shots) await dlg.screenshot({ path: `${shots}/x-update.png` });
  // Later: closes, nothing installed
  await dlg.getByRole("button", { name: "Later" }).click();
  await expect(dlg).toHaveCount(0);
  // Help & About finds it again; Update now downloads and installs
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Help & About", exact: true }).click();
  await settings.getByRole("button", { name: "Check for updates" }).click();
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Update now" }).click();
  await expect(dlg.getByRole("status")).toContainText(/Downloading… \d+%|Installing/);
  await expect(dlg.getByRole("status")).toContainText("Installing, then Paperlines restarts…");
  await expect(dlg.getByRole("button", { name: "Later" })).toBeDisabled();
});
