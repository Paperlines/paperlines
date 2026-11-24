import { expect, type Page, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;
const ATTENTION = 1;

async function openGraph(page: Page, query = "") {
  await page.goto(`/${query}`);
  await page.getByRole("button", { name: "Show citation graph" }).click();
  await expect(page.locator(".cg-canvas canvas").first()).toBeVisible();
  await page.waitForFunction(
    () => !!window.__paperlinesGraph && window.__paperlinesGraph.stats().nodes > 0,
  );
  await settled(page);
}

/** The live layout has come to rest (nodes stay where they are measured). */
async function settled(page: Page) {
  await page.waitForFunction(() => window.__paperlinesGraph?.stats().moving === false, undefined, {
    timeout: 20_000,
  });
}

/** Opens the graph settings panel (Filters, Groups, Display, Forces). */
async function openSettings(page: Page) {
  const gear = page.getByRole("button", { name: "Graph settings" });
  if ((await gear.getAttribute("aria-expanded")) !== "true") await gear.click();
}

async function nodeCenter(page: Page, id: number) {
  const box = await page.evaluate((n) => window.__paperlinesGraph?.nodeBox(n), id);
  if (!box) throw new Error(`node ${id} not rendered`);
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

test("hover node shows note, double-click opens PDF", async ({ page }) => {
  await openGraph(page);
  const c = await nodeCenter(page, ATTENTION);
  await page.mouse.move(c.x, c.y);
  const card = page.getByRole("tooltip", { name: "Attention Is All You Need" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Ashish Vaswani, Noam Shazeer, Niki Parmar");
  await expect(card).toContainText("self-attention replaces recurrence");
  await expect(card.locator(".katex")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/m5-hover.png` });
  // hovering does not open the PDF
  await expect(page.locator(".reader")).toHaveCount(0);

  await page.mouse.dblclick(c.x, c.y);
  await expect(page.locator(".reader")).toBeVisible();
  await expect(page.locator(".reader").getByText("Page 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "← Graph" }).click();
  await expect(page.locator(".graph-view")).toBeVisible();
});

test("click pins the card; bullets are editable inline; Escape closes", async ({ page }) => {
  await openGraph(page);
  const c = await nodeCenter(page, ATTENTION);
  await page.mouse.click(c.x, c.y);
  const card = page.getByRole("dialog", { name: "Attention Is All You Need" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Click to edit. Escape to finish." }).click();
  const editor = card.getByRole("textbox", { name: "Paper note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+End`);
  await page.keyboard.type("\nCaveat: quadratic memory");
  await page.keyboard.press("Escape");
  await expect(card).toContainText("Caveat: quadratic memory");
  await expect(page.locator(".reader")).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/m5-pinned.png` });
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  // the edit was saved to the paper note
  await page
    .getByRole("tablist", { name: "Paper details" })
    .getByRole("tab", { name: "Notes" })
    .click();
  await expect(page.getByRole("tabpanel")).toContainText("Caveat: quadratic memory");
});

test("keyboard: focus shows the card, Enter opens the PDF, Escape closes", async ({ page }) => {
  await openGraph(page);
  const node = page.getByRole("button", { name: /^Attention Is All You Need, 2017/ });
  await node.focus();
  await expect(page.getByRole("tooltip", { name: "Attention Is All You Need" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".reader")).toBeVisible();
});

test("the same card appears on library rows, citation lists and wikilinks", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("listbox", { name: "Library" })
    .getByText("Attention Is All You Need")
    .hover();
  await expect(page.getByRole("tooltip", { name: "Attention Is All You Need" })).toContainText(
    "self-attention",
  );
  await page.mouse.move(5, 790);
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.getByRole("listbox", { name: "Library" }).getByText("BERT: Pre-training").click();
  await page.getByRole("tab", { name: "Citations" }).click();
  await page.getByRole("region", { name: "Cites" }).getByText("Attention Is All You Need").hover();
  await expect(page.getByRole("tooltip", { name: "Attention Is All You Need" })).toBeVisible();
  await page.mouse.move(5, 790);

  await page
    .getByRole("listbox", { name: "Library" })
    .getByText("Attention Is All You Need")
    .click();
  await page
    .getByRole("tablist", { name: "Paper details" })
    .getByRole("tab", { name: "Notes" })
    .click();
  await page.getByRole("tabpanel").getByRole("link", { name: /BERT/ }).hover();
  await expect(page.getByRole("tooltip", { name: /BERT: Pre-training/ })).toBeVisible();
});

test("layout, filters and focus", async ({ page }) => {
  await openGraph(page);
  // every paper by default, unlinked ones included
  await expect(page.getByRole("status").filter({ hasText: "papers" })).toHaveText(
    "5 papers, 5 links",
  );
  await openSettings(page);
  await page.getByRole("checkbox", { name: "Show unlinked papers" }).uncheck();
  await expect(page.getByRole("status").filter({ hasText: "papers" })).toHaveText(
    "4 papers, 5 links",
  );
  await page.getByRole("checkbox", { name: "Show unlinked papers" }).check();
  await expect(page.getByRole("status").filter({ hasText: "papers" })).toHaveText(
    "5 papers, 5 links",
  );

  // fill = project color, ring = read status; the legend says so
  const legend = page.getByRole("group", { name: "Legend" });
  await expect(legend.getByText("Thesis chapter 2")).toBeVisible();
  await expect(legend.getByText("No project")).toBeVisible();
  await expect(legend.getByText("Reading")).toBeVisible();
  const ringOf = (id: number) =>
    page.evaluate((n) => window.__paperlinesGraph?.nodeStyle(n)?.ring ?? null, id);
  expect(await ringOf(1)).not.toBeNull();
  await page.getByRole("checkbox", { name: "Read status as border" }).uncheck();
  await expect(legend.getByText("Reading")).toHaveCount(0);
  await expect.poll(() => ringOf(1)).toBeNull();
  await page.getByRole("checkbox", { name: "Read status as border" }).check();

  // a project's color is chosen in its dialog
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Thesis chapter 2", exact: true })
    .hover();
  await page.getByRole("navigation").getByRole("button", { name: "Edit Thesis chapter 2" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "purple" }).click();
  await page.keyboard.press("Escape");
  await expect(legend.locator(".lg-dot").first()).toHaveAttribute("style", /--tag-purple/);
  // layouts live under Display; physics sliders under Forces
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await page.getByRole("button", { name: "By year" }).click();
  await expect(page.getByRole("button", { name: "Forces", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Force", exact: true }).click();
  await page.getByRole("button", { name: "Forces", exact: true }).click();
  await page.getByRole("slider", { name: "Repel force" }).fill("0.9");
  await settled(page);
  await page.getByLabel("From year").fill("2017");
  await page.getByLabel("From year").blur();
  await expect(page.getByRole("status").filter({ hasText: "papers" })).toHaveText(
    "3 papers, 3 links",
  );
  await page.getByLabel("From year").fill("");
  await page.getByLabel("From year").blur();
  // in a narrow pane the settings widened the graph; closing them brings the library back
  await expect(page.getByRole("listbox", { name: "Library" })).toBeHidden();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page
    .getByRole("listbox", { name: "Library" })
    .getByText("Deep Residual Learning for Image Recognition")
    .click();
  await openSettings(page);
  await page.getByRole("checkbox", { name: "Focus on selected" }).check();
  await expect(page.getByRole("status").filter({ hasText: "papers" })).toHaveText(
    "3 papers, 3 links",
  );
  // the canvas, not just the counter, shows the focused neighborhood
  await page.waitForFunction(
    () =>
      window.__paperlinesGraph?.stats().nodes === 3 &&
      window.__paperlinesGraph?.stats().edges === 3,
  );
  await page.waitForTimeout(100);
  if (shots) await page.screenshot({ path: `${shots}/m5-graph.png` });
});

test("about 2,000 papers stay responsive", async ({ page }) => {
  test.setTimeout(90_000);
  await openGraph(page, "?demo=2000");
  const stats = await page.evaluate(() => window.__paperlinesGraph?.stats());
  console.log("graph stats", JSON.stringify(stats));
  expect(stats?.nodes).toBeGreaterThan(1900);
  const id = await page.getByRole("button", { name: /study 1500,/ }).getAttribute("data-node");
  const c = await nodeCenter(page, Number(id));
  // hover highlight + card: measure time from pointer move to the card being visible
  const t0 = Date.now();
  await page.mouse.move(c.x, c.y);
  await expect(page.getByRole("tooltip")).toBeVisible();
  const hoverMs = Date.now() - t0;
  // pan and zoom frames
  const t1 = Date.now();
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, i % 2 ? 120 : -120);
  await page.mouse.move(c.x + 200, c.y + 50, { steps: 20 });
  const panMs = Date.now() - t1;
  console.log("hover->card ms", hoverMs, "10 zooms + move ms", panMs);
  expect(hoverMs).toBeLessThan(1500);
  if (shots) await page.screenshot({ path: `${shots}/m5-2000.png` });
});

test("papers are rounded boxes labelled by author and year; dots on request", async ({ page }) => {
  await openGraph(page);
  const style = (id: number) => page.evaluate((n) => window.__paperlinesGraph?.nodeStyle(n), id);
  await expect.poll(async () => (await style(1))?.shape).toBe("round-rectangle");
  expect((await style(1))?.label).toBe("Vaswani ’17");
  await openSettings(page);
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Text fade threshold" })).toHaveCount(0);
  await page.getByRole("group", { name: "Nodes" }).getByRole("button", { name: "Dots" }).click();
  await expect.poll(async () => (await style(1))?.shape).toBe("ellipse");
  await expect(page.getByRole("slider", { name: "Text fade threshold" })).toBeVisible();
  await page.getByRole("group", { name: "Nodes" }).getByRole("button", { name: "Boxes" }).click();
  await expect.poll(async () => (await style(1))?.shape).toBe("round-rectangle");
});

test("connections in the graph: colored links, filters, ⌥-drag to connect", async ({ page }) => {
  await openGraph(page);
  const stats = () => page.evaluate(() => window.__paperlinesGraph?.stats());
  expect((await stats())?.relations).toBe(0);
  const a = await nodeCenter(page, 2);
  const b = await nodeCenter(page, 4);
  await page.keyboard.down("Alt");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const dlg = page.getByRole("dialog", { name: "New connection" });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText("Deep learning")).toBeVisible();
  await dlg.getByRole("button", { name: "Add connection" }).click();
  await expect.poll(async () => (await stats())?.relations).toBe(1);
  await settled(page);
  if (shots) await page.screenshot({ path: `${shots}/x-graph-connection.png` });

  await openSettings(page);
  await page
    .getByRole("group", { name: "Connections" })
    .getByRole("button", { name: "Extends" })
    .click();
  await expect.poll(async () => (await stats())?.relations).toBe(0);
  await page
    .getByRole("group", { name: "Connections" })
    .getByRole("button", { name: "Extends" })
    .click();
  await expect.poll(async () => (await stats())?.relations).toBe(1);
  await page.getByRole("checkbox", { name: "Citations" }).uncheck();
  await expect.poll(async () => (await stats())?.edges).toBe(0);
  await page.getByRole("checkbox", { name: "Citations" }).check();
});

test("key papers: a spine in steps, gold in the graph, Tree and Circle layouts", async ({
  page,
}) => {
  await openGraph(page);
  const list = page.getByRole("listbox", { name: "Library" });
  const addToSpine = async (title: string, step: string | RegExp) => {
    await list.getByText(title).click({ button: "right" });
    // one project: its steps are right in the submenu
    await page.getByRole("menuitem", { name: "Add to spine" }).hover();
    await page
      .getByRole("menu", { name: "Add to spine" })
      .getByRole("menuitem", { name: step })
      .click();
    await expect(page.getByRole("menu")).toHaveCount(0);
  };
  // right-click → Add to spine: a new step, then a second paper in the same step
  await addToSpine("Attention Is All You Need", "New step");
  await addToSpine("Deep Residual Learning for Image Recognition", /^Step 1 · Vaswani ’17/);

  // the project dialog edits the steps: name one, add another with the project's own paper
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Thesis chapter 2", exact: true })
    .hover();
  await page.getByRole("navigation").getByRole("button", { name: "Edit Thesis chapter 2" }).click();
  const dlg = page.getByRole("dialog", { name: "Edit project" });
  const steps = dlg.getByRole("list", { name: "Key papers (spine)" });
  await expect(steps.getByRole("listitem")).toHaveCount(1);
  await expect(steps.locator(".spine-chip")).toHaveText(["Vaswani ’17", "He ’16"]);
  // drag He before Vaswani within the step…
  const chip = (name: string) => steps.locator(".spine-chip", { hasText: name });
  const from = await chip("He ’16").boundingBox();
  const to = await chip("Vaswani ’17").boundingBox();
  if (!from || !to) throw new Error("no chips");
  await page.mouse.move(from.x + 8, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 6, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(steps.locator(".spine-chip")).toHaveText(["He ’16", "Vaswani ’17"]);
  // …and back with the keyboard
  await chip("He ’16").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(steps.locator(".spine-chip")).toHaveText(["Vaswani ’17", "He ’16"]);
  await dlg.getByRole("textbox", { name: "Name of step 1" }).fill("Origins");
  await dlg.getByRole("button", { name: "Add step" }).click();
  await expect(steps.getByRole("listitem")).toHaveCount(2);
  await dlg.getByRole("combobox", { name: "Add a paper to step 2" }).selectOption("3");
  await expect(steps.getByRole("listitem").nth(1).locator(".spine-chip")).toHaveText([
    "Devlin ’19",
  ]);
  if (shots) await dlg.screenshot({ path: `${shots}/spine-editor.png` });
  // moving Devlin into step 1 leaves step 2 empty and unnamed: it goes
  await dlg.getByRole("combobox", { name: "Add a paper to step 1" }).selectOption("3");
  await expect(steps.getByRole("listitem")).toHaveCount(1);
  await expect(steps.locator(".spine-chip")).toHaveText(["Vaswani ’17", "He ’16", "Devlin ’19"]);
  // …and back into a step of its own
  await dlg.getByRole("button", { name: "Add step" }).click();
  await dlg.getByRole("combobox", { name: "Add a paper to step 2" }).selectOption("3");
  await expect(steps.getByRole("listitem").nth(1).locator(".spine-chip")).toHaveText([
    "Devlin ’19",
  ]);
  await page.keyboard.press("Escape");

  // the graph draws the chosen project's spine: gold boxes and a path between steps
  await openSettings(page);
  await page.getByRole("combobox", { name: "Key papers" }).selectOption({
    label: "Thesis chapter 2",
  });
  const stat = () => page.evaluate(() => window.__paperlinesGraph?.stats().spine ?? 0);
  await expect.poll(stat).toBe(3);
  await expect(page.getByRole("status").filter({ hasText: "papers" })).toContainText(
    "3 key papers",
  );
  await expect(
    page.locator(".graph-legend").getByText("Key paper, numbered by step"),
  ).toBeVisible();
  const at = (id: number) => page.evaluate((n) => window.__paperlinesGraph?.nodeStyle(n), id);
  expect((await at(1))?.spine).toBe(true);
  expect((await at(5))?.spine).toBe(false);

  // Tree: the spine is the trunk on the left, step 1 above step 2
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await page.getByRole("button", { name: "Tree", exact: true }).click();
  const box = (id: number) => page.evaluate((n) => window.__paperlinesGraph?.nodeBox(n), id);
  const [b1, b2, b3] = [await box(1), await box(2), await box(3)];
  // (a selected paper's outline makes its box a little wider)
  expect(Math.abs((b1?.left ?? 0) - (b2?.left ?? 1))).toBeLessThan(8);
  expect(Math.abs((b1?.left ?? 0) - (b3?.left ?? 1))).toBeLessThan(8);
  expect(b1?.top ?? 0).toBeLessThan(b3?.top ?? 0);
  expect(b2?.top ?? 0).toBeLessThan(b3?.top ?? 0);
  if (shots) await page.screenshot({ path: `${shots}/spine-tree.png` });

  // Circle: every paper on one ring
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await expect
    .poll(async () => {
      const r = [];
      for (const id of [1, 2, 3, 4, 5]) {
        const q = await at(id);
        r.push(Math.round(Math.hypot(q?.x ?? 0, q?.y ?? 0)));
      }
      return new Set(r).size;
    })
    .toBe(1);
  // the project's arc is named outside the ring; papers without a project get no label
  await expect
    .poll(() => page.evaluate(() => window.__paperlinesGraph?.arcLabels()))
    .toEqual(["Thesis chapter 2"]);
  if (shots) await page.screenshot({ path: `${shots}/spine-circle.png` });

  // taking a paper off the spine in the dialog updates the graph
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Thesis chapter 2", exact: true })
    .hover();
  await page.getByRole("navigation").getByRole("button", { name: "Edit Thesis chapter 2" }).click();
  await dlg.getByRole("button", { name: "Take He ’16 off the spine" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(stat).toBe(2);
});

test("circle switches to dots for a large graph", async ({ page }) => {
  await openGraph(page, "?demo=200");
  await openSettings(page);
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__paperlinesGraph?.nodeStyle(1)?.shape))
    .toBe("ellipse");
  await page.getByRole("button", { name: "Force", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__paperlinesGraph?.nodeStyle(1)?.shape))
    .toBe("round-rectangle");
});
