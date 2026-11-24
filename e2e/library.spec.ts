import { expect, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;

test("browse, edit, filter and import", async ({ page }) => {
  await page.goto("/");
  const list = page.getByRole("listbox", { name: "Library" });
  await expect(list.getByRole("option")).toHaveCount(5);

  await list.getByText("Attention Is All You Need").click();
  await page.getByRole("tab", { name: "Info" }).click();
  const title = page.getByLabel("Title", { exact: true });
  await expect(title).toHaveValue("Attention Is All You Need");
  if (shots) await page.screenshot({ path: `${shots}/library-light.png` });

  await title.fill("Attention Is All You Need (edited)");
  await page.getByLabel("Venue").click();
  await expect(page.locator(".detail").getByRole("status")).toHaveText("Saved");
  await expect(list.getByText("Attention Is All You Need (edited)")).toBeVisible();

  await page.locator(".filters").getByRole("button", { name: "Reading" }).click();
  await expect(list.getByRole("option")).toHaveCount(1);
  await page.locator(".filters").getByRole("button", { name: "All" }).click();
  await page.getByRole("combobox", { name: /^Search/ }).fill("lecun");
  await expect(list.getByRole("option")).toHaveCount(1);
  await page.getByRole("combobox", { name: /^Search/ }).fill("");

  await page.getByRole("textbox", { name: "Add a paper" }).press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /DOI, arXiv or BibTeX/ })
    .click();
  await page.getByRole("dialog").getByRole("textbox").fill("10.1000/new.paper");
  await page.getByRole("button", { name: "Look up" }).click();
  if (shots) await page.screenshot({ path: `${shots}/import-review.png` });
  await page.getByRole("button", { name: "Import 1" }).click();
  await expect(page.getByText("Added 1, merged 0, skipped 0")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(list.getByRole("option")).toHaveCount(6);
});

test("settings opens with the mod+, shortcut and switches theme", async ({ page, browserName }) => {
  await page.goto("/");
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();
  const mod = process.platform === "darwin" && browserName === "webkit" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+Comma`);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Appearance" }).click();
  await dialog.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("listbox").getByText("Deep learning", { exact: true }).click();
  await page.getByRole("tab", { name: "Info" }).click();
  if (shots) await page.screenshot({ path: `${shots}/library-dark.png` });
});
