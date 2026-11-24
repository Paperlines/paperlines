import { expect, type Page, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;
test.use({ deviceScaleFactor: 2 });

/** The darkest pixel (r, g, b) inside a box, from a screenshot. */
async function darkest(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const png = await page.screenshot({ clip: box });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    if (!g) return [255, 255, 255];
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let best = [255, 255, 255];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] < best[0] + best[1] + best[2])
        best = [d[i], d[i + 1], d[i + 2]];
    }
    return best;
  }, png.toString("base64"));
}

test("text under a highlight stays black, in every colour", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("listbox", { name: "Library" })
    .getByText("Attention Is All You Need")
    .dblclick();
  const reader = page.locator(".reader");
  const lines = reader.locator(".pv-page[data-page='1'] .pv-text span");
  await expect(lines.first()).toBeVisible();
  const colours = ["Key idea", "Disagree", "Method", "Definition", "Question"];
  for (const [n, colour] of colours.entries()) {
    const span = lines.nth(n + 1);
    const box = await span.boundingBox();
    if (!box) throw new Error("no text line");
    const before = await darkest(page, box);
    await page.mouse.move(box.x - 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await reader
      .getByRole("dialog", { name: "Highlight" })
      .getByRole("button", { name: colour })
      .click();
    await page.mouse.click(5, 400);
    await page.waitForTimeout(150);
    const after = await darkest(page, box);
    // multiplying can only darken: the text under the colour is never lighter than before
    for (const ch of [0, 1, 2])
      expect(after[ch], `${colour}: ${after} vs ${before}`).toBeLessThanOrEqual(before[ch] + 2);
  }
  await expect(reader.locator(".pv-hl.k-highlight")).not.toHaveCount(0);
  if (shots) {
    const first = await lines.nth(1).boundingBox();
    const last = await lines.nth(5).boundingBox();
    if (first && last)
      await page.screenshot({
        path: `${shots}/highlights-close.png`,
        clip: {
          x: first.x - 10,
          y: first.y - 8,
          width: 430,
          height: last.y + last.height - first.y + 16,
        },
      });
  }
});
