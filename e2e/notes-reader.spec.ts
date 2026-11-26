import { expect, type Page, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;
const mod = process.platform === "darwin" ? "Meta" : "Control";
const list = (page: Page) => page.getByRole("listbox", { name: "Library" });

test.beforeEach(async ({ page }) => {
  // these tests cover the rendered view with click-to-edit; live preview has its own test below
  await page.addInitScript(() => {
    if (!localStorage.getItem("ui-state"))
      localStorage.setItem(
        "ui-state",
        JSON.stringify({ state: { livePreview: false }, version: 2 }),
      );
  });
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
});

test("paper note: generated header, template, wikilinks and math", async ({ page }) => {
  await list(page).getByText("Deep Residual Learning for Image Recognition").click();
  await page
    .getByRole("tablist", { name: "Paper details" })
    .getByRole("tab", { name: "Notes" })
    .click();
  const pane = page.getByRole("tabpanel");
  await expect(
    pane.getByRole("heading", { name: "Deep Residual Learning for Image Recognition" }),
  ).toBeVisible();
  await expect(pane.getByText("Kaiming He, Xiangyu Zhang")).toBeVisible();
  await pane.getByRole("button", { name: "Add key points" }).click();
  const editor = pane.getByRole("textbox", { name: "Paper note" });
  await expect(editor).toContainText("Key idea:");
  await editor.press(`${mod}+a`);
  await editor.pressSequentially(
    "- Key idea: residual blocks ease $f(x) + x$ training\nbuilds on [[vaswa",
  );
  await expect(page.getByRole("option", { name: /vaswani2017attention/ })).toBeVisible();
  await page.waitForTimeout(150); // CodeMirror ignores Enter right after the list opens
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const preview = pane.getByRole("button", { name: "Click to edit. Escape to finish." });
  await expect(preview.locator(".katex")).toBeVisible();
  await expect(preview.getByRole("link", { name: "Attention Is All You Need" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/m3-paper-note.png` });

  await preview.getByRole("link", { name: "Attention Is All You Need" }).click();
  await expect(pane.getByRole("heading", { name: "Attention Is All You Need" })).toBeVisible();
  await expect(
    pane
      .getByRole("region", { name: "Linked from" })
      .getByText("Deep Residual Learning for Image Recognition"),
  ).toBeVisible();
});

test("reader: highlight a selection, quote it, jump back", async ({ page }) => {
  await list(page).getByText("Attention Is All You Need").dblclick();
  const reader = page.locator(".reader");
  await expect(reader.getByText("Page 1 of 3")).toBeVisible();
  const span = reader
    .locator(".pv-page[data-page='1'] .pv-text span", { hasText: "convolutional neural" })
    .first();
  await expect(span).toBeVisible();
  const box = await span.boundingBox();
  if (!box) throw new Error("no text span");
  await page.mouse.move(box.x - 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const popup = reader.getByRole("dialog", { name: "Highlight" });
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "Quote to note" }).click();
  await expect(reader.locator(".pv-hl.k-highlight")).toHaveCount(1);
  if (shots) await page.screenshot({ path: `${shots}/m3-reader.png` });

  await page
    .getByRole("tablist", { name: "Paper details" })
    .getByRole("tab", { name: "Notes" })
    .click();
  const pane = page.getByRole("tabpanel");
  const quote = pane.locator(".md-preview blockquote");
  await expect(quote).toContainText("neural networks");
  await page.getByRole("tab", { name: "Highlights" }).click();
  await expect(pane.locator(".hl-jump")).toContainText("neural networks");
  await page
    .getByRole("tablist", { name: "Paper details" })
    .getByRole("tab", { name: "Notes" })
    .click();
  await pane.getByRole("link", { name: "p. 1" }).click();
  await expect(reader.locator(".pv-hl.flash")).toHaveCount(1);
});

test("free note via the palette links back to a paper", async ({ page }) => {
  await page.keyboard.press(`${mod}+k`);
  await page.getByPlaceholder("Type a command or search…").fill("new note");
  await page.keyboard.press("Enter");
  const note = page.locator(".note-view");
  await note.getByRole("textbox", { name: "Note title" }).fill("Reading plan");
  await note.getByRole("textbox", { name: "Note title" }).press("Enter");
  await note.getByRole("button", { name: "Click to edit. Escape to finish." }).click();
  await expect(note.getByRole("textbox", { name: "Note text" })).toBeFocused();
  await page.keyboard.type("Start with @lecun2015deep then [[Ideas]]");
  await note.getByRole("textbox", { name: "Note title" }).click(); // clicking away finishes editing
  await expect(note.getByRole("link", { name: "@lecun2015deep" })).toBeVisible();
  await expect(note.locator("a.wikilink.unresolved")).toHaveText("Ideas");
  await note.getByRole("link", { name: "@lecun2015deep" }).click();
  const pane = page.getByRole("tabpanel");
  await expect(pane.getByRole("heading", { name: "Deep learning" })).toBeVisible();
  await expect(pane.getByRole("region", { name: "Linked from" })).toContainText("Reading plan");
  if (shots) await page.screenshot({ path: `${shots}/m3-backlinks.png` });
});

test("project notes open from the project dialog", async ({ page }) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Thesis chapter 2", exact: true })
    .hover();
  await page.getByRole("navigation").getByRole("button", { name: "Edit Thesis chapter 2" }).click();
  await page.getByRole("button", { name: "Project notes" }).click();
  const note = page.locator(".note-view");
  await expect(note.getByRole("textbox", { name: "Note title" })).toHaveValue(
    "Thesis chapter 2 notes",
  );
  await expect(note.getByText("Thesis chapter 2", { exact: true })).toBeVisible();
});

test("find in the PDF: count, next and previous, options, Escape", async ({ page }) => {
  await list(page).getByText("Attention Is All You Need").dblclick();
  const reader = page.locator(".reader");
  await expect(reader.getByText("Page 1 of 3")).toBeVisible();

  // outside the reader, mod+F still goes to the library search
  await list(page).getByText("Attention Is All You Need").click();
  await page.keyboard.press(`${mod}+f`);
  await expect(page.getByRole("combobox", { name: /^Search/ })).toBeFocused();

  await page.keyboard.press("Escape"); // closes the hover card from the list row
  await reader.getByText("Page 1 of 3").click();
  await page.keyboard.press(`${mod}+f`);
  const input = reader.getByRole("searchbox", { name: "Find in this PDF" });
  await expect(input).toBeFocused();
  await input.fill("neural");
  const count = reader.locator(".pv-find-count");
  await expect(count).toHaveText(/^1 of \d+$/);
  const total = Number((await count.textContent())?.split(" of ")[1]);
  expect(total).toBeGreaterThan(1);
  await expect(reader.locator(".pv-find.active").first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-find.png` });
  await input.press("Enter");
  await expect(count).toHaveText(`2 of ${total}`);
  await input.press("Shift+Enter");
  await input.press("Shift+Enter");
  await expect(count).toHaveText(`${total} of ${total}`);

  await reader.getByRole("button", { name: "Match case" }).click();
  await input.fill("NEURAL");
  await expect(count).toHaveText("No matches");
  await reader.getByRole("button", { name: "Match case" }).click();
  await expect(count).toHaveText(/of/);

  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(reader.locator(".pv-find")).toHaveCount(0);
});

test("notes: formulas, symbols and links between notes", async ({ page }) => {
  await page.keyboard.press(`${mod}+k`);
  await page.getByPlaceholder("Type a command or search…").fill("new note");
  await page.keyboard.press("Enter");
  const note = page.locator(".note-view");
  await note.getByRole("textbox", { name: "Note title" }).fill("Math notes");
  await note.getByRole("textbox", { name: "Note title" }).press("Enter");
  const edit = note.getByRole("button", { name: "Click to edit. Escape to finish." });
  if (await edit.isVisible()) await edit.click();
  const body = note.getByRole("textbox", { name: "Note text" });
  await body.click();
  await expect(body).toBeFocused();

  // the symbol palette: outside math a symbol comes wrapped in $…$
  const bar = note.getByRole("toolbar", { name: "Formatting" });
  await bar.getByRole("button", { name: "Symbols" }).click();
  await bar.getByRole("tab", { name: "Greek" }).click();
  await bar.getByRole("button", { name: "\\alpha", exact: true }).click();
  await expect(body).toBeFocused();
  await expect(body).toContainText("$\\alpha$");
  await bar.getByRole("button", { name: "Symbols" }).click();

  // inside math, \ completes LaTeX commands with their symbol
  await page.keyboard.type(" and $x \\le");
  const pick = page.getByRole("option", { name: /\\leq/ });
  await expect(pick).toBeVisible();
  await expect(pick).toContainText("≤");
  await pick.click();
  await page.keyboard.type(" y$");
  await expect(body).toContainText("$x \\leq y$");

  // a formula block from the toolbar
  await page.keyboard.press("End");
  await bar.getByRole("button", { name: "Formula block ($$…$$)" }).click();
  await page.keyboard.type("\\sum_{i=1}^n i");

  // [[ offers notes, papers, and a new note
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("\nSee [[Brand new id");
  await expect(page.getByRole("option", { name: /New note “Brand new id”/ })).toBeVisible();
  await page.keyboard.type("ea");
  await page.getByRole("option", { name: /New note “Brand new idea”/ }).click();

  // leave the editor: everything renders
  await note.getByRole("textbox", { name: "Note title" }).click();
  await expect(note.locator(".katex").first()).toBeVisible();
  await expect(note.locator(".katex")).toHaveCount(3);
  await expect(note.locator(".cm-lp-math-block, .math-block")).toHaveCount(1);
  await expect(note.getByText("Brand new idea")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/x-note-math.png` });
  // following the link creates the note
  await note.getByText("Brand new idea").click();
  await expect(page.locator(".note-view").getByRole("textbox", { name: "Note title" })).toHaveValue(
    "Brand new idea",
  );
});

test("highlight colours: the five stay, more come from the palette with a purpose", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Settings" });
  await dlg.getByRole("button", { name: "Notes", exact: true }).click();
  // the five standard colours, which can't be removed
  await expect(dlg.getByRole("textbox", { name: /^Meaning of / })).toHaveCount(5);
  await expect(dlg.getByRole("button", { name: /^Remove the .* colour$/ })).toHaveCount(0);
  // add pink: it comes with a suggested purpose, which can be renamed
  await dlg.getByRole("button", { name: "Add pink (Result)" }).click();
  const pink = dlg.getByRole("textbox", { name: "Meaning of pink" });
  await expect(pink).toHaveValue("Result");
  await pink.fill("Main finding");
  await pink.blur();
  await expect(dlg.getByRole("button", { name: "Add pink (Result)" })).toHaveCount(0);
  if (shots) await dlg.screenshot({ path: `${shots}/hl-colors.png` });
  await page.keyboard.press("Escape");

  // the new colour is offered when highlighting in the reader
  await list(page).getByText("Attention Is All You Need").dblclick();
  const reader = page.locator(".reader");
  const span = reader
    .locator(".pv-page[data-page='1'] .pv-text span", { hasText: "convolutional neural" })
    .first();
  await expect(span).toBeVisible();
  const box = await span.boundingBox();
  if (!box) throw new Error("no text span");
  await page.mouse.move(box.x - 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const popup = reader.getByRole("dialog", { name: "Highlight" });
  await expect(popup.getByRole("button", { name: "Main finding" })).toBeVisible();
  await popup.getByRole("button", { name: "Main finding" }).click();
  await expect(reader.locator(".pv-hl.k-highlight")).toHaveCount(1);

  // and it can be removed again; the five remain
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await dlg.getByRole("button", { name: "Notes", exact: true }).click();
  await dlg.getByRole("button", { name: "Remove the pink colour" }).click();
  await expect(dlg.getByRole("textbox", { name: /^Meaning of / })).toHaveCount(5);
  await expect(dlg.getByRole("button", { name: "Add pink (Result)" })).toBeVisible();
});

test("many tabs: the tab bar scrolls, with arrows and a slider", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 760 });
  const titles = [
    "Attention Is All You Need",
    "Deep Residual Learning for Image Recognition",
    "Language Models are Few-Shot Learners",
  ];
  for (const title of titles) await list(page).getByText(title).dblclick();
  await page.getByRole("button", { name: "Show citation graph" }).click();
  const strip = page.getByRole("tablist", { name: "Open tabs" });
  await expect(strip.getByRole("tab")).not.toHaveCount(0);
  const later = page.getByRole("button", { name: "Show later tabs" });
  const earlier = page.getByRole("button", { name: "Show earlier tabs" });
  await expect(earlier).toBeVisible();
  // the newest tab is active and scrolled into view: at the end, nothing more to the right
  await expect(later).toBeDisabled();
  const scroll = () => strip.evaluate((el) => el.scrollLeft);
  const end = await scroll();
  expect(end).toBeGreaterThan(0);
  await earlier.click();
  await expect.poll(scroll).toBeLessThan(end);
  await expect(later).toBeEnabled();
  if (shots) await page.locator(".tabstrip-wrap").screenshot({ path: `${shots}/tabs-scroll.png` });
  // the slider: drag its handle all the way left, then click near the end of its track
  const slider = page.getByRole("scrollbar", { name: "Scroll the tabs" });
  const thumb = slider.locator(".tab-slider-thumb");
  const tb = await thumb.boundingBox();
  const track = await slider.boundingBox();
  if (!tb || !track) throw new Error("no slider");
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x - 40, tb.y + tb.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(scroll).toBe(0);
  await expect(earlier).toBeDisabled();
  await page.mouse.click(track.x + track.width - 2, track.y + track.height / 2);
  await expect.poll(scroll).toBeGreaterThan(0);
  await expect(later).toBeDisabled();
  // the first tab can be reached with the arrow and opened; each click waits for the smooth
  // scroll to settle, so the arrow's state is read only when it's final
  const settled = async () => {
    let last = -1;
    await expect
      .poll(async () => {
        const now = await scroll();
        const same = now === last;
        last = now;
        return same;
      })
      .toBe(true);
  };
  await settled();
  for (let i = 0; i < 6 && (await earlier.isEnabled()); i++) {
    await earlier.click({ timeout: 5000 });
    await settled();
  }
  await expect(earlier).toBeDisabled();
  await strip.getByRole("tab").first().click();
  await expect(strip.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
});

test("tabs: right-click to close this, the others, those to the right, or all", async ({
  page,
}) => {
  for (const title of [
    "Attention Is All You Need",
    "Deep Residual Learning for Image Recognition",
    "Language Models are Few-Shot Learners",
  ])
    await list(page).getByText(title).dblclick();
  const strip = page.getByRole("tablist", { name: "Open tabs" });
  await expect(strip.getByRole("tab")).toHaveCount(3);
  const menu = page.getByRole("menu");
  // close the ones after the first
  await strip.getByRole("tab", { name: "vaswani2017attention" }).click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Close other tabs" })).toBeEnabled();
  if (shots) await page.screenshot({ path: `${shots}/tab-menu.png` });
  await menu.getByRole("menuitem", { name: "Close tabs to the right" }).click();
  await expect(strip.getByRole("tab")).toHaveCount(1);
  // open two more, keep only the middle one
  await list(page).getByText("Deep Residual Learning for Image Recognition").dblclick();
  await list(page).getByText("Language Models are Few-Shot Learners").dblclick();
  await strip.getByRole("tab", { name: "he2016deep" }).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Close other tabs" }).click();
  await expect(strip.getByRole("tab")).toHaveText(["he2016deep"]);
  await expect(strip.getByRole("tab", { name: "he2016deep" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // and all of them
  await strip.getByRole("tab", { name: "he2016deep" }).click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Close other tabs" })).toBeDisabled();
  await menu.getByRole("menuitem", { name: "Close all tabs" }).click();
  await expect(strip).toHaveCount(0);
});

test("reader: no title row; Export sits in the PDF toolbar", async ({ page }) => {
  await list(page).getByText("Attention Is All You Need").dblclick();
  const reader = page.locator(".reader");
  const toolbar = reader.getByRole("toolbar");
  await expect(toolbar.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Export PDF with highlights…" })).toBeVisible();
  await expect(reader.getByText("Attention Is All You Need", { exact: true })).toHaveCount(0);
  if (shots) await reader.getByRole("toolbar").screenshot({ path: `${shots}/reader-toolbar.png` });
});

test("reader: pinch, ctrl/⌘ + wheel and keys zoom the PDF around the pointer", async ({ page }) => {
  await page.goto("/");
  await list(page).getByText("Attention Is All You Need").dblclick();
  const reader = page.locator(".reader");
  await expect(reader.getByText("Page 1 of 3")).toBeVisible();
  const first = page.locator('.pv-page[data-page="1"]');
  const width = async () => (await first.boundingBox())?.width ?? 0;
  const before = await width();
  const box = await page.locator(".pv-scroll").boundingBox();
  if (!box) throw new Error("no scroll box");
  const x = box.x + box.width / 2;
  const y = box.y + 200;

  // Windows/Linux: a trackpad pinch arrives as ctrl + wheel; zooming in keeps the page under the
  // pointer, so the point there moves by at most a few pixels
  const pointAt = () =>
    page.evaluate(
      ([px, py]) => {
        const el = document.querySelector('.pv-page[data-page="1"]') as HTMLElement;
        const r = el.getBoundingClientRect();
        return { fx: (px - r.left) / r.width, fy: (py - r.top) / r.height };
      },
      [x, y],
    );
  const at = await pointAt();
  await page.mouse.move(x, y);
  await page.keyboard.down("Control");
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -20);
  await page.keyboard.up("Control");
  await expect.poll(width).toBeGreaterThan(before * 1.5);
  const after = await pointAt();
  expect(Math.abs(after.fx * (await width()) - at.fx * (await width()))).toBeLessThan(40);

  // macOS: WKWebView sends gesture events with the scale since the pinch began
  const zoomed = await width();
  await page.evaluate(
    ([px, py]) => {
      const sc = document.querySelector(".pv-scroll") as HTMLElement;
      const fire = (type: string, scale: number) => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(e, { scale, clientX: px, clientY: py });
        sc.dispatchEvent(e);
      };
      fire("gesturestart", 1);
      fire("gesturechange", 0.8);
      fire("gesturechange", 0.6);
      fire("gestureend", 0.6);
    },
    [x, y],
  );
  await expect.poll(width).toBeLessThan(zoomed * 0.7);

  // ⌘/Ctrl 0 fits the width again; ⌘/Ctrl + zooms in one step
  await first.click({ position: { x: 20, y: 20 } });
  await page.keyboard.press(`${mod}+0`);
  await expect.poll(width).toBeCloseTo(before, -1);
  await page.keyboard.press(`${mod}+Equal`);
  await expect.poll(width).toBeGreaterThan(before * 1.1);
});
