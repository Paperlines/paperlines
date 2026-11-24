import { expect, type Page, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;

/** Opens each (i) on screen and checks its bubble is wholly visible: inside the window, with
 *  nothing (a pane edge, a dialog) covering any of its corners. */
async function checkTips(page: Page, where: string) {
  const problems: string[] = [];
  const buttons = page.locator(".infotip-btn:visible");
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const name = (await b.getAttribute("aria-label")) ?? `#${i}`;
    await b.focus();
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await page.waitForTimeout(30);
    const bad = await tip.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const out: string[] = [];
      if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)
        out.push(
          `outside the window (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})`,
        );
      for (const [x, y] of [
        [r.left + 3, r.top + 3],
        [r.right - 3, r.top + 3],
        [r.left + 3, r.bottom - 3],
        [r.right - 3, r.bottom - 3],
      ]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !el.contains(hit)) out.push(`corner ${Math.round(x)},${Math.round(y)} hidden`);
      }
      return out;
    });
    for (const p of bad) problems.push(`${where} · ${name}: ${p}`);
    await b.blur();
    await page.mouse.move(2, 2);
  }
  return { n, problems };
}

for (const w of [1024, 1440]) {
  test(`help bubbles are never cut off (${w}px)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 760 });
    await page.goto("/");
    await page.getByRole("button", { name: "Library and reader" }).click();
    const problems: string[] = [];
    let total = 0;
    const main = await checkTips(page, "main");
    total += main.n;
    problems.push(...main.problems);
    if (shots && w === 1024) {
      await page.locator(".infotip-btn:visible").first().focus();
      await page.screenshot({ path: `${shots}/infotip-main.png` });
      await page.mouse.move(2, 2);
    }
    // every Settings section
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    for (const s of await nav.getByRole("button").allTextContents()) {
      await nav.getByRole("button", { name: s.trim(), exact: true }).click();
      const r = await checkTips(page, `Settings ▸ ${s.trim()}`);
      total += r.n;
      problems.push(...r.problems);
    }
    expect(total).toBeGreaterThan(5);
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
