import type { Rect } from "@paperlines/backend-port";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Merges rects on the same text line that touch or overlap horizontally. */
export function mergeLines(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    const sameLine =
      last && Math.abs(last.y + last.h / 2 - (r.y + r.h / 2)) < Math.min(last.h, r.h) / 2;
    if (last && sameLine && r.x <= last.x + last.w + 0.01) {
      const x = Math.min(last.x, r.x);
      const y = Math.min(last.y, r.y);
      const right = Math.max(last.x + last.w, r.x + r.w);
      const bottom = Math.max(last.y + last.h, r.y + r.h);
      out[out.length - 1] = { x, y, w: right - x, h: bottom - y };
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Client rects (viewport pixels) to rects normalized to `page`, clipped, de-noised and merged. */
export function normalizeRects(client: Box[], page: Box): Rect[] {
  const rects: Rect[] = [];
  for (const c of client) {
    const l = Math.max(c.left, page.left);
    const t = Math.max(c.top, page.top);
    const r = Math.min(c.left + c.width, page.left + page.width);
    const b = Math.min(c.top + c.height, page.top + page.height);
    if (r <= l || b <= t) continue;
    const n = {
      x: (l - page.left) / page.width,
      y: (t - page.top) / page.height,
      w: (r - l) / page.width,
      h: (b - t) / page.height,
    };
    if (n.w < 0.002 || n.h < 0.004 || n.h > 0.12) continue;
    rects.push(n);
  }
  return mergeLines(rects);
}

export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x = clamp(Math.min(a.x, b.x));
  const y = clamp(Math.min(a.y, b.y));
  return { x, y, w: clamp(Math.max(a.x, b.x)) - x, h: clamp(Math.max(a.y, b.y)) - y };
}

/** The smallest highlight on `page` containing the normalized point, if any. */
export function hitTest<T extends { id: number; page: number; rects: Rect[] }>(
  hls: T[],
  page: number,
  x: number,
  y: number,
): T | null {
  let best: T | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const h of hls) {
    if (h.page !== page) continue;
    for (const r of h.rects) {
      const pad = 0.002;
      if (
        x >= r.x - pad &&
        x <= r.x + r.w + pad &&
        y >= r.y - pad &&
        y <= r.y + r.h + pad &&
        r.w * r.h < bestArea
      ) {
        best = h;
        bestArea = r.w * r.h;
      }
    }
  }
  return best;
}
