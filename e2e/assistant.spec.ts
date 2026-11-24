import { expect, type Page, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;
const mod = process.platform === "darwin" ? "Meta" : "Control";
const panel = (page: Page) => page.getByRole("complementary", { name: "Assistant" });
const list = (page: Page) => page.getByRole("listbox", { name: "Library" });

test("assistant: Claude Code answers about what's open, read-only until allowed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  const p = panel(page);
  await expect(p.getByRole("button", { name: "Agent: Claude Code. Switch agent" })).toBeVisible();
  await expect(p.getByText("Your whole library")).toBeVisible();
  await expect(p.getByRole("button", { name: "What should I read next?" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/as-start.png` });

  // selecting a paper changes what it's looking at, and the ideas with it
  await list(page).getByText("Attention Is All You Need").click();
  await expect(p.locator(".as-focus-title")).toHaveText("Attention Is All You Need");
  await expect(
    p.getByRole("button", { name: "Summarize this paper in five bullets" }),
  ).toBeVisible();
  await expect(p.locator(".as-ctx")).toContainText("@vaswani2017attention");
  if (shots) await page.screenshot({ path: `${shots}/as-paper.png` });

  // a question: its steps fold into one line, the answer links papers
  await p.getByRole("textbox", { name: "Message" }).fill("What is attention?");
  await p.getByRole("textbox", { name: "Message" }).press("Enter");
  await expect(p.getByText(/The closest match is/)).toBeVisible();
  await expect(p.getByRole("button", { name: "2 steps" })).toBeVisible();
  await page.mouse.move(5, 400);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await p.getByRole("button", { name: "2 steps" }).click();
  await expect(p.getByText("Library search")).toBeVisible();
  await expect(p.locator(".as-md a.cite").first()).toBeVisible();

  // read only: it gives the text instead of writing it
  await p.getByRole("textbox", { name: "Message" }).fill("Write a note on this");
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.getByText(/I can only read your library/)).toBeVisible();

  // allowed to edit: the note is written and the change stays visible
  await p.getByRole("button", { name: "Read only" }).click();
  await expect(p.getByRole("button", { name: "Can edit" })).toHaveAttribute("aria-pressed", "true");
  await p.getByRole("textbox", { name: "Message" }).fill("Write a note on this");
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.locator(".as-change").filter({ hasText: "Note created" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/as-chat.png` });
  await page.getByRole("tablist", { name: "Views" }).getByRole("tab", { name: "Notes" }).click();
  await expect(page.getByText("Reading summary").first()).toBeVisible();

  // a new chat starts over; the shortcut hides and shows the panel
  await p.getByRole("button", { name: "New chat" }).click();
  await expect(p.getByRole("list", { name: "Things to ask" })).toBeVisible();
  await page.keyboard.press(`${mod}+j`);
  await expect(p).toBeHidden();
  await page.keyboard.press(`${mod}+j`);
  await expect(p).toBeVisible();
});

test("assistant: without Claude Code it shows how to set it up", async ({ page }) => {
  await page.goto("/?noclaude");
  await page.getByRole("button", { name: "Assistant" }).click();
  const p = panel(page);
  await expect(p.getByRole("heading", { name: "Connect an agent" })).toBeVisible();
  await expect(p.getByRole("button", { name: "Agent: No agent. Switch agent" })).toBeVisible();
  await expect(p.getByRole("button", { name: "Check again" })).toBeVisible();
  await p.getByRole("button", { name: "Open AI Assistants settings" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Settings" })
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "AI Assistants" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(p.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/as-install.png` });
});

test("assistant: stops mid-reply and fits a small window", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  const p = panel(page);
  await p.getByRole("textbox", { name: "Message" }).fill("Tell me everything");
  await p.getByRole("textbox", { name: "Message" }).press("Enter");
  await p.getByRole("button", { name: "Stop" }).click();
  await expect(p.getByRole("button", { name: "Send" })).toBeVisible();
  const box = await p.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(1024);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("trash icon shows whether the Trash has papers in it", async ({ page }) => {
  await page.goto("/");
  const trash = page.getByRole("navigation").getByRole("button", { name: /^Trash/ });
  await expect(trash.locator("svg.trash-empty")).toBeVisible();
  await list(page).getByText("Deep learning", { exact: true }).click();
  await page.keyboard.press(`${mod}+Backspace`);
  await expect(trash.locator("svg.trash-full")).toBeVisible();
  if (shots) await page.locator(".sidebar-foot").screenshot({ path: `${shots}/trash-full.png` });
  // the Trash view says when each paper goes for good; emptying it turns the icon back at once
  await trash.click();
  await expect(page.getByText("Deleted for good in 30 days")).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Empty Trash" }).click();
  await expect(trash.locator("svg.trash-empty")).toBeVisible();
});

test("assistant: switch between Claude Code and Codex", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assistant" }).click();
  const p = panel(page);
  await p.getByRole("textbox", { name: "Message" }).fill("Hi");
  await p.getByRole("textbox", { name: "Message" }).press("Enter");
  await expect(p.getByText(/Claude Code here/)).toBeVisible();
  await p.getByRole("button", { name: "Agent: Claude Code. Switch agent" }).click();
  const menu = p.getByRole("menu");
  await expect(menu.getByRole("menuitemradio", { name: /Claude Code/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  if (shots) await page.screenshot({ path: `${shots}/as-switch.png` });
  await expect(menu.getByRole("menuitem", { name: /Connect more in Settings/ })).toBeVisible();
  await menu.getByRole("menuitemradio", { name: /Codex/ }).click();
  await expect(p.getByRole("button", { name: "Agent: Codex. Switch agent" })).toBeVisible();
  // a new agent starts a new chat
  await expect(p.getByRole("list", { name: "Things to ask" })).toBeVisible();
  await p.getByRole("textbox", { name: "Message" }).fill("Hi");
  await p.getByRole("textbox", { name: "Message" }).press("Enter");
  await expect(p.getByText(/Codex here/)).toBeVisible();
});

test("appearance: accent colour, layout, icons and top bar labels", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-accent", "teal");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("radio", { name: "Violet" }).click();
  await expect(root).toHaveAttribute("data-accent", "violet");
  // the papers' PDF icons take the accent colour
  await expect(page.locator(".att").first()).toHaveCSS("color", "rgb(112, 72, 232)");
  if (shots) await page.screenshot({ path: `${shots}/look-settings.png` });
  await page.getByRole("radio", { name: "Mirrored" }).click();
  await page.getByRole("button", { name: "Regular" }).click();
  await expect(root).toHaveAttribute("data-icons", "regular");
  await page.getByLabel("Labels under the top bar's icons").check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Assistant" }).click();
  // mirrored: the sidebar on the right, the assistant on the left
  const side = await page.getByRole("navigation").first().boundingBox();
  const chat = await panel(page).boundingBox();
  expect(side && chat && side.x > chat.x).toBe(true);
  await expect(page.locator(".topbar .tb-label", { hasText: "Graph" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/look-mirrored.png` });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("quick add: a DOI typed in the top bar goes straight to the import review", async ({
  page,
}) => {
  await page.goto("/");
  const box = page.getByRole("textbox", { name: "Add a paper" });
  await box.fill("10.48550/arXiv.1706.03762");
  if (shots) await page.locator(".topbar").screenshot({ path: `${shots}/quick-add.png` });
  await box.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(box).toHaveValue("");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More ways to add" }).click();
  await expect(page.getByRole("menuitem", { name: "Import from Zotero" })).toBeVisible();
});

test("projects: the + in the sidebar is visible and creates a project", async ({ page }) => {
  await page.goto("/");
  const plus = page.getByRole("button", { name: "New project…" });
  await expect(plus).toBeVisible();
  expect(await plus.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await plus.click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/new-project.png` });
});

test("assistant: chats are kept, listed by what they were about, and can be reopened", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("listbox", { name: "Library" })
    .getByText("Attention Is All You Need")
    .click();
  await page.getByRole("button", { name: "Assistant" }).click();
  const p = panel(page);
  await p.getByRole("textbox", { name: "Message" }).fill("What is attention?");
  await p.getByRole("textbox", { name: "Message" }).press("Enter");
  await expect(p.getByText(/The closest match is/)).toBeVisible();
  await expect(p.getByRole("button", { name: "Send" })).toBeVisible();

  // a new chat; the first one waits in the history, under the paper it was about
  await p.getByRole("button", { name: "New chat" }).click();
  await expect(p.getByText(/The closest match is/)).toHaveCount(0);
  await p.getByRole("button", { name: "Chat history" }).click();
  const here = p.getByRole("list", { name: "About @vaswani2017attention" });
  await expect(here.getByText("What is attention?")).toBeVisible();
  await expect(here).toContainText("Claude Code");
  if (shots) await page.screenshot({ path: `${shots}/as-history.png` });
  await here.locator(".as-hist-open", { hasText: "What is attention?" }).click();
  await expect(p.getByText(/The closest match is/)).toBeVisible();
  await expect(p.locator(".as-ask")).toHaveText(["What is attention?"]);

  // deleting it empties the history
  await p.getByRole("button", { name: "Chat history" }).click();
  await here.hover();
  await p.getByRole("button", { name: 'Delete the chat "What is attention?"' }).click();
  await expect(p.getByText(/No saved chats yet/)).toBeVisible();
});
