import { expect, type Page, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;
const mod = process.platform === "darwin" ? "Meta" : "Control";
const list = (page: Page) => page.getByRole("listbox", { name: "Library" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
});

test("sidebar tags and query syntax filter the list", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Collections" });
  await nav.getByRole("button", { name: "ml", exact: true }).click();
  await expect(page.getByRole("combobox", { name: /^Search/ })).toHaveValue("tag:ml");
  await expect(list(page).getByRole("option")).toHaveCount(3);
  await nav.getByRole("button", { name: "nlp", exact: true }).click();
  await expect(list(page).getByRole("option")).toHaveCount(2);

  const search = page.getByRole("combobox", { name: /^Search/ });
  await search.fill("year:>=2019 ta");
  await expect(page.getByRole("option", { name: "tag:" })).toBeVisible();
  await search.press("Tab");
  await search.pressSequentially("tra");
  await expect(page.getByRole("option", { name: "tag:transformers" })).toBeVisible();
  await search.press("Enter");
  await expect(search).toHaveValue("year:>=2019 tag:transformers ");
  await expect(list(page).getByRole("option")).toHaveCount(1);
  if (shots) await page.screenshot({ path: `${shots}/m2-query.png` });

  await search.fill("-tag:ml is:read");
  await expect(list(page).getByRole("option")).toHaveCount(1);
  await expect(list(page).getByText("Deep learning", { exact: true })).toBeVisible();
});

test("multi-select, bulk tag and status via keyboard", async ({ page }) => {
  await list(page).getByText("Deep learning", { exact: true }).click();
  await list(page)
    .getByText("Language Models are Few-Shot Learners")
    .click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 selected")).toBeVisible();
  await list(page).focus();
  await page.keyboard.press("t");
  const picker = page.getByRole("dialog", { name: "Tags for 2 items" });
  await picker.getByRole("combobox").fill("reading-group/2026");
  await picker.getByRole("combobox").press("Enter");
  await expect(picker.getByText("reading-group/2026")).toBeVisible();
  await picker.getByRole("button", { name: "Done" }).click();
  await page.keyboard.press("3");
  await expect(
    page.locator(".detail").getByRole("button", { name: "Read", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  if (shots) await page.screenshot({ path: `${shots}/m2-bulk.png` });
  await page.getByRole("navigation").getByRole("button", { name: "2026", exact: true }).click();
  await expect(list(page).getByRole("option")).toHaveCount(2);
});

test("command palette runs commands and opens items", async ({ page }) => {
  await page.keyboard.press(`${mod}+k`);
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByPlaceholder("Type a command or search…").fill("new proj");
  if (shots) await page.screenshot({ path: `${shots}/m2-palette.png` });
  await palette.getByPlaceholder("Type a command or search…").press("Enter");
  const dlg = page.getByRole("dialog", { name: "New project" });
  await dlg.getByLabel("Name").fill("Reading list");
  await dlg.getByRole("button", { name: "Create" }).click();
  await expect(
    page.getByRole("navigation").getByRole("button", { name: "Reading list", exact: true }),
  ).toBeVisible();

  await page.keyboard.press(`${mod}+k`);
  await palette.getByPlaceholder("Type a command or search…").fill("residual");
  await expect(palette.getByText("Deep Residual Learning for Image Recognition")).toBeVisible();
  await palette.getByText("Deep Residual Learning for Image Recognition").click();
  await page.getByRole("tab", { name: "Info" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Deep Residual Learning for Image Recognition",
  );
});
