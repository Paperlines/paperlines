import { expect, type Page, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;
const list = (page: Page) => page.getByRole("listbox", { name: "Library" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(list(page).getByRole("option")).toHaveCount(5);
});

test("cites, cited by and outside count come from cached references", async ({ page }) => {
  await list(page).getByText("BERT: Pre-training").click();
  await page.getByRole("tab", { name: "Citations" }).click();
  const cites = page.getByRole("region", { name: "Cites" });
  await expect(cites.getByRole("heading")).toHaveText("Cites (2)");
  await expect(cites.getByText("Attention Is All You Need")).toBeVisible();
  await expect(cites.getByText("Deep Residual Learning for Image Recognition")).toBeVisible();
  await expect(cites.getByText("12 references outside your library")).toBeVisible();
  const citedBy = page.getByRole("region", { name: "Cited by" });
  await expect(citedBy.getByText("Language Models are Few-Shot Learners")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/m4-citations.png` });

  // the query syntax sees the same edges
  await page.getByRole("combobox", { name: /^Search/ }).fill("cited-by:devlin2019bert");
  await expect(list(page).getByRole("option")).toHaveCount(2);
});

test("manual remove survives refetch and can be restored; manual add", async ({ page }) => {
  await list(page).getByText("BERT: Pre-training").click();
  await page.getByRole("tab", { name: "Citations" }).click();
  const cites = page.getByRole("region", { name: "Cites" });
  await cites.getByRole("button", { name: /Remove link to Deep Residual/ }).click();
  await expect(cites.getByRole("heading")).toHaveText("Cites (1)");
  await page.getByRole("button", { name: "Fetch again" }).click();
  await expect(cites.getByRole("heading")).toHaveText("Cites (1)");
  await page.getByText("1 removed link").click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(cites.getByRole("heading")).toHaveText("Cites (2)");

  await cites.getByRole("button", { name: "Add a paper this one cites" }).click();
  await page
    .getByRole("dialog")
    .getByPlaceholder("Find a paper in your library")
    .fill("lecun deep");
  await page.keyboard.press("Enter");
  await expect(cites.getByRole("heading")).toHaveText("Cites (3)");
  await expect(cites.getByText("manual")).toBeVisible();
});

test("fetching an unfetched paper and linking a paper added later", async ({ page }) => {
  await list(page).getByText("Deep learning", { exact: true }).click();
  await page.getByRole("tab", { name: "Citations" }).click();
  await expect(page.getByText("Reference list not fetched yet.")).toBeVisible();
  await page.getByRole("button", { name: "Fetch references" }).click();
  await expect(page.getByText("40 references, 0 in your library.", { exact: false })).toBeVisible();

  // importing a paper that GPT-3's cached list mentions links it without any fetch
  await page.getByRole("textbox", { name: "Add a paper" }).press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /DOI, arXiv or BibTeX/ })
    .click();
  await page.getByRole("dialog").getByRole("textbox").fill("10.1/old");
  await page.getByRole("button", { name: "Look up" }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("An Old Paper Not Yet Imported");
  await page.getByRole("dialog").getByLabel("Year").fill("2019");
  await page.getByRole("button", { name: "Import 1" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await list(page).getByText("An Old Paper Not Yet Imported").click();
  await expect(
    page
      .getByRole("region", { name: "Cited by" })
      .getByText("Language Models are Few-Shot Learners"),
  ).toBeVisible();
});

test("settings: references and write-only API keys", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Settings" });
  await dlg.getByRole("navigation").getByRole("button", { name: "Citations" }).click();
  await expect(dlg.getByText("Fetch reference lists when papers are added")).toBeVisible();
  const key = dlg.getByLabel("Semantic Scholar API key");
  await key.fill("secret-123");
  await dlg.getByRole("button", { name: "Save" }).first().click();
  await expect(dlg.getByText("Stored in macOS Keychain.")).toBeVisible();
  await expect(key).toHaveValue("");
  if (shots) await page.screenshot({ path: `${shots}/m4-settings.png` });
});
