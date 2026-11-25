// Every screen at every window size: nothing clipped, overlapping or off-screen.
// Screenshots go to SCREENSHOT_DIR (when set) as layout-<w>x<h>-<scene>.png.
import { expect, type Page, test } from "@playwright/test";

const shots = process.env.SCREENSHOT_DIR;

/** From the smallest window the app allows (960x600) to a 1440p display. */
const SIZES = [
  [960, 600],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
] as const;

/** Layout problems in the current page state, as readable lines (empty: all good). */
function audit(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const name = (el: Element) => {
      const label =
        el.getAttribute("aria-label") ??
        el.getAttribute("title") ??
        (el.textContent ?? "").trim().slice(0, 30);
      const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
      return `<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}> "${label}"`;
    };
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let a: Element | null = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0)
          return false;
        // visually hidden on purpose (e.g. a row's buttons until it's hovered), still keyboard-reachable
        if (cs.clipPath === "inset(50%)") return false;
      }
      return true;
    };
    const se = document.scrollingElement as HTMLElement;
    if (se.scrollWidth > W + 1) out.push(`page scrolls sideways (${se.scrollWidth} > ${W})`);
    if (se.scrollHeight > H + 1) out.push(`page scrolls down (${se.scrollHeight} > ${H})`);

    const controls = document.querySelectorAll(
      "button, [role=tab], [role=menuitem], input, select, textarea, .wordmark, .graph-count, .graph-legend, .cg-minimap",
    );
    for (const el of controls) {
      if (!shown(el) || el.closest(".visually-hidden, .graph-a11y, .sr-nodes")) continue;
      const r = el.getBoundingClientRect();
      let scrolledY = false;
      let scrolledX = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const scrollsY = /auto|scroll/.test(cs.overflowY);
        const scrollsX = /auto|scroll/.test(cs.overflowX);
        const ar = a.getBoundingClientRect();
        // inside a scrolling list, rows out of view are fine; anything else must fit its box
        if (cs.overflowX !== "visible" && !scrollsX && !scrolledX) {
          if (r.left < ar.left - 1 || r.right > ar.right + 1)
            out.push(`${name(el)} cut off sideways by ${name(a)}`);
        }
        if (cs.overflowY !== "visible" && !scrollsY && !scrolledY) {
          if (r.top < ar.top - 1 || r.bottom > ar.bottom + 1)
            out.push(`${name(el)} cut off vertically by ${name(a)}`);
        }
        if (scrollsY) scrolledY = true;
        if (scrollsX) scrolledX = true;
      }
      if (!scrolledX && (r.left < -1 || r.right > W + 1))
        out.push(`${name(el)} off-screen sideways`);
      if (!scrolledY && (r.top < -1 || r.bottom > H + 1))
        out.push(`${name(el)} off-screen vertically`);
    }

    // words on buttons, tabs and headings must be whole (no "Libr…", no cut text)
    const whole = document.querySelectorAll(
      ".side-tab-name, .tabs button, .segmented button, .wordmark, .graph-count, .table-head .th, .btn, .panel-head, .panel-title, .dialog-head h2, .ctx-label, .lg-item, .graph-tab, .tab-label",
    );
    for (const el of whole) {
      if (!shown(el)) continue;
      const h = el as HTMLElement;
      if (h.scrollWidth > h.clientWidth + 1) out.push(`${name(el)} text doesn't fit`);
    }

    // short labels (choices, tabs, buttons) stay on one line
    for (const el of document.querySelectorAll(
      ".segmented button, .tabs button, .side-tab-name, .btn, [role=tab]",
    )) {
      if (!shown(el)) continue;
      // each run of text on its own: an icon above a caption is layout, not a wrapped label
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        if (tops.size > 1) out.push(`${name(el)} wraps onto ${tops.size} lines`);
      }
    }

    // round marks stay round (read status, tag and project colours), however narrow the column
    for (const el of document.querySelectorAll(".dot, .chip-dot, .hl-swatch")) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - r.height) > 0.5)
        out.push(`${name(el)} squashed to ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
    }

    // neighbours in bars must not overlap
    const bars = document.querySelectorAll(
      ".topbar, .top-actions, .graph-hud, .tabs-bar, .side-tabs, .dialog-foot, .list-toolbar .filters, .table-head",
    );
    for (const bar of bars) {
      const kids = [...bar.children].filter(
        (k) =>
          shown(k) &&
          !k.classList.contains("spacer") &&
          getComputedStyle(k).position !== "absolute",
      );
      for (let i = 0; i < kids.length; i++)
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect();
          const b = kids[j].getBoundingClientRect();
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 1 && oy > 1)
            out.push(`${name(kids[i])} overlaps ${name(kids[j])} in ${name(bar)}`);
        }
    }

    // floating things (dialogs, menus, cards) fit in the window
    for (const el of document.querySelectorAll("[role=dialog], [role=menu], [role=tooltip]")) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)
        out.push(`${name(el)} sticks out of the window`);
    }
    return [...new Set(out)];
  });
}

const scenes: { name: string; go(page: Page): Promise<void> }[] = [
  {
    name: "split",
    go: async (page) => {
      await page
        .getByRole("listbox", { name: "Library" })
        .getByText("Attention Is All You Need")
        .click();
    },
  },
  {
    name: "library-only",
    go: async (page) => {
      await page.getByRole("button", { name: "Library only" }).click();
    },
  },
  {
    name: "reader",
    go: async (page) => {
      await page
        .getByRole("listbox", { name: "Library" })
        .getByText("Attention Is All You Need")
        .dblclick();
      await expect(page.locator(".reader").getByText("Page 1 of 3")).toBeVisible();
    },
  },
  {
    name: "graph",
    go: async (page) => {
      await page.getByRole("button", { name: "Show citation graph" }).click();
      await page.waitForFunction(
        () => window.__paperlinesGraph?.stats().moving === false,
        undefined,
        {
          timeout: process.env.CI ? 60_000 : 20_000,
        },
      );
    },
  },
  {
    name: "graph-settings",
    go: async (page) => {
      await page.getByRole("button", { name: "Show citation graph" }).click();
      await page.getByRole("button", { name: "Graph settings" }).click();
      await page.getByRole("button", { name: "Display", exact: true }).click();
      // "By year" selected: the longest label, bold when chosen
      await page.getByRole("button", { name: "By year", exact: true }).click();
      await page.waitForFunction(() => window.__paperlinesGraph?.stats().moving === false);
    },
  },
  {
    name: "context-menu",
    go: async (page) => {
      // the last row, so the menu has to open upwards
      await page
        .getByRole("listbox", { name: "Library" })
        .getByText("Language Models are Few-Shot Learners")
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: "Add to spine" }).hover();
      await expect(page.getByRole("menu", { name: "Add to spine" })).toBeVisible();
    },
  },
  {
    name: "project-dialog",
    go: async (page) => {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Thesis chapter 2", exact: true })
        .hover();
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Edit Thesis chapter 2" })
        .click();
      await expect(page.getByRole("dialog", { name: "Edit project" })).toBeVisible();
    },
  },
  {
    name: "settings",
    go: async (page) => {
      await page.getByRole("button", { name: "Settings", exact: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "settings-ai",
    go: async (page) => {
      await page.getByRole("button", { name: "Settings", exact: true }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: "AI Assistants" }).click();
      await page.getByRole("button", { name: "Set up Codex by hand" }).click();
      await page.getByRole("button", { name: /What an assistant can do/ }).click();
    },
  },
  {
    name: "settings-about",
    go: async (page) => {
      await page.getByRole("button", { name: "Settings", exact: true }).first().click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Help & About", exact: true })
        .click();
    },
  },
  {
    name: "search-online",
    go: async (page) => {
      await page.getByRole("tab", { name: "Search online" }).click();
      await page.getByPlaceholder("Topic, title, author or question").fill("attention");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status").filter({ hasText: "papers for" })).toBeVisible();
    },
  },
];

for (const [w, h] of SIZES)
  test(`layout holds at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: w, height: h });
    // every scene starts from a fresh app: no layout or panel state carried over
    await page.addInitScript(() => localStorage.clear());
    const problems: string[] = [];
    for (const scene of scenes) {
      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto("/");
        await expect(page.getByRole("listbox", { name: "Library" })).toBeVisible();
        await scene.go(page);
        await page.waitForTimeout(250); // transitions settle
        if (scheme === "light")
          for (const p of await audit(page)) problems.push(`${w}x${h} ${scene.name}: ${p}`);
        if (shots)
          await page.screenshot({ path: `${shots}/layout-${w}x${h}-${scene.name}-${scheme}.png` });
        if (!shots) break; // dark only matters for the pictures
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

test("the layout switch sits in the middle of the window, and gives way on narrow ones", async ({
  page,
}) => {
  for (const w of [1920, 1440, 1280, 960]) {
    await page.setViewportSize({ width: w, height: 760 });
    await page.goto("/");
    const seg = await page.getByRole("group", { name: "Layout" }).boundingBox();
    const add = await page.getByRole("textbox", { name: "Add a paper" }).boundingBox();
    if (!seg || !add) throw new Error("no top bar");
    // never overlapping the actions
    expect(seg.x + seg.width, `${w}px`).toBeLessThanOrEqual(add.x - 8);
    // centred whenever the actions leave room
    if (w >= 1024) expect(Math.abs(seg.x + seg.width / 2 - w / 2), `${w}px`).toBeLessThanOrEqual(2);
  }
});
