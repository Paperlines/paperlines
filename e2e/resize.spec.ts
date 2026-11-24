// Dragging a pane edge is seamless: the edge stays under the pointer, the neighbouring
// space gives way by the same amount, no pane drops below its minimum and nothing overflows.
import { expect, type Page, test } from "@playwright/test";

/** Smallest widths the app promises (SplitPanes MIN, .split > .pane-fill, the assistant clamp). */
const MIN: Record<string, number> = {
  "pane-first": 240,
  "pane-second": 240,
  "pane-fill": 280,
  "as-panel": 320,
};

type Pane = { name: string; left: number; right: number; width: number };

const panes = (page: Page): Promise<Pane[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll(".main > *")]
      .flatMap((el) => (el.classList.contains("split") ? [...el.children] : [el]))
      .filter((el) => !el.classList.contains("split-handle"))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const name = ["pane-first", "pane-second", "pane-fill", "as-panel", "sidebar"].find((c) =>
          el.classList.contains(c),
        );
        return { name: name ?? el.className, left: r.left, right: r.right, width: r.width };
      }),
  );

/** Problems at one point of a drag (empty: all good). */
function check(ps: Pane[], viewport: number, edge: number, pointer: number, atLimit: boolean) {
  const out: string[] = [];
  for (const p of ps)
    if (MIN[p.name] && p.width < MIN[p.name] - 1)
      out.push(`${p.name} is ${Math.round(p.width)}px, below its ${MIN[p.name]}px minimum`);
  const right = Math.max(...ps.map((p) => p.right));
  if (right > viewport + 1)
    out.push(`panes overflow the window by ${Math.round(right - viewport)}px`);
  if (!atLimit && Math.abs(edge - pointer) > 2)
    out.push(
      `edge at ${Math.round(edge)} but pointer at ${Math.round(pointer)} (lags ${Math.round(pointer - edge)}px)`,
    );
  return out;
}

/**
 * Drags a grip by dx in small steps. `edgeOf` says which pane edge the grip moves; that edge
 * must follow the pointer until some pane reaches its limit, and then simply stop.
 */
async function drag(
  page: Page,
  grip: string,
  dx: number,
  edgeOf: (ps: Pane[]) => number,
  max: number,
) {
  const h = await page.locator(grip).boundingBox();
  if (!h) throw new Error(`no ${grip}`);
  const vw = page.viewportSize()?.width ?? 0;
  const x0 = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  const start = edgeOf(await panes(page));
  const problems: string[] = [];
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const px = x0 + (dx * i) / 10;
    await page.mouse.move(px, y);
    const ps = await panes(page);
    // a pane at its limit is allowed to stop the edge (the list/detail max is 900, the assistant's 760)
    const atLimit =
      ps.some((p) => MIN[p.name] && p.width <= MIN[p.name] + 1) ||
      ps.some((p) => p.width >= max - 1);
    for (const msg of check(ps, vw, edgeOf(ps), start + (px - x0), atLimit))
      problems.push(`${grip} +${Math.round(px - x0)}px: ${msg}`);
  }
  await page.mouse.up();
  return problems;
}

const byName = (ps: Pane[], n: string) => {
  const p = ps.find((q) => q.name === n);
  if (!p) throw new Error(`no ${n}`);
  return p;
};

const SCENES = [
  { w: 1920, layout: "Library and reader", assistant: true },
  { w: 1280, layout: "Library only", assistant: false },
  { w: 1280, layout: "Library and reader", assistant: false },
  { w: 1280, layout: "Library only", assistant: true },
  { w: 1280, layout: "Library and reader", assistant: true },
] as const;

for (const s of SCENES)
  test(`panes resize seamlessly: ${s.layout}${s.assistant ? " + assistant" : ""} at ${s.w}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: s.w, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: s.layout }).click();
    if (s.assistant) await page.getByRole("button", { name: "Assistant", exact: true }).click();
    await expect(page.locator(".split-handle").first()).toBeVisible();

    const problems: string[] = [];
    const edges: [string, (ps: Pane[]) => number][] = [
      [".split-handle >> nth=0", (ps) => byName(ps, "pane-first").right],
    ];
    if (s.layout === "Library and reader")
      edges.push([".split-handle >> nth=1", (ps) => byName(ps, "pane-second").right]);
    for (const [grip, edgeOf] of edges)
      for (const dx of [150, -150, -150, 150])
        problems.push(...(await drag(page, grip, dx, edgeOf, 900)));
    if (s.assistant)
      for (const dx of [-300, 300])
        problems.push(
          ...(await drag(page, ".as-grip", dx, (ps) => byName(ps, "as-panel").left, 760)),
        );

    expect(problems, problems.join("\n")).toEqual([]);
  });
