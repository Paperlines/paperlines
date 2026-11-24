import { expect, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;
const mod = process.platform === "darwin" ? "Meta" : "Control";

test("first-run tour: step by step, skippable, only once, and can be taken again", async ({
  page,
}) => {
  await page.goto("/?tour");
  const card = page.getByRole("dialog", { name: "Tour" });
  await expect(card).toContainText("Welcome to Paperlines");
  await expect(card).toContainText("1 of 10");
  if (shots) await page.screenshot({ path: `${shots}/tour-1.png` });
  await card.getByRole("button", { name: "Show me around" }).click();

  // each step outlines its part of the window, and the card sits next to it on screen
  const expected = [
    "Add papers",
    "Your library",
    "Papers",
    "Layout",
    "Citation graph",
    "Assistant",
    "Command palette",
    "Settings",
  ];
  for (const [i, title] of expected.entries()) {
    await expect(card.getByRole("heading")).toHaveText(title);
    await expect(card).toContainText(`${i + 2} of 10`);
    // once it has moved there, the outline frames exactly the part it's about (6px around it)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const spot = document.querySelector<HTMLElement>(".tour-spot");
          const el = spot?.dataset.target ? document.querySelector(spot.dataset.target) : null;
          if (!spot || !el) return 99;
          const a = spot.getBoundingClientRect();
          const b = el.getBoundingClientRect();
          // 6px around the part, but never past the window's edges
          const l = Math.max(2, b.left - 6);
          const t = Math.max(2, b.top - 6);
          const r = Math.min(window.innerWidth - 2, b.right + 6);
          const btm = Math.min(window.innerHeight - 2, b.bottom + 6);
          return Math.max(
            Math.abs(a.left - l),
            Math.abs(a.top - t),
            Math.abs(a.right - r),
            Math.abs(a.bottom - btm),
          );
        }),
      )
      .toBeLessThanOrEqual(1);
    const c = await card.boundingBox();
    // the card stays inside the window
    expect(c && c.x >= 0 && c.y >= 0 && c.x + c.width <= 1280 && c.y + c.height <= 800, title).toBe(
      true,
    );
    if (shots && (i === 0 || i === 1 || i === 5))
      await page.screenshot({ path: `${shots}/tour-${i + 2}.png` });
    await page.keyboard.press("ArrowRight");
  }
  // Back works too
  await expect(card.getByRole("heading")).toHaveText("You're ready");
  await card.getByRole("button", { name: "Back" }).click();
  await expect(card.getByRole("heading")).toHaveText("Settings");
  await page.keyboard.press("ArrowRight");
  await card.getByRole("button", { name: "Start using Paperlines" }).click();
  await expect(card).toHaveCount(0);

  // the app works again, and the tour doesn't start by itself a second time
  await page.reload();
  await expect(
    page.getByRole("listbox", { name: "Library" }).getByRole("option").first(),
  ).toBeVisible();
  await expect(card).toHaveCount(0);

  // taken again from the command palette; Escape ends it
  await page.keyboard.press(`${mod}+k`);
  await page.getByPlaceholder("Type a command or search…").fill("tour");
  await page.getByPlaceholder("Type a command or search…").press("Enter");
  await expect(card).toContainText("Welcome to Paperlines");
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);

  // and from Help & About
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Help & About" }).click();
  await page.getByRole("button", { name: /Take the tour/ }).click();
  await expect(card).toContainText("Welcome to Paperlines");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});

test("no tour in the browser preview unless asked for (keeps the other tests clear)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("listbox", { name: "Library" }).getByRole("option").first(),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Tour" })).toHaveCount(0);
});
