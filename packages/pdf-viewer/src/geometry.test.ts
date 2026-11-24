import { expect, it } from "vitest";
import { hitTest, mergeLines, normalizeRects, rectFromPoints } from "./geometry";

const page = { left: 100, top: 50, width: 600, height: 800 };

it("normalizes, clips and merges selection rects per line", () => {
  const rects = normalizeRects(
    [
      { left: 160, top: 130, width: 120, height: 16 }, // line 1, span a
      { left: 279, top: 131, width: 90, height: 15 }, // line 1, span b (touching)
      { left: 160, top: 150, width: 200, height: 16 }, // line 2
      { left: 660, top: 170, width: 100, height: 16 }, // clipped at the right edge
      { left: 100, top: 50, width: 600, height: 800 }, // whole-page element box: dropped
      { left: 200, top: 300, width: 0.5, height: 16 }, // sliver: dropped
    ],
    page,
  );
  expect(rects).toHaveLength(3);
  expect(rects[0].x).toBeCloseTo(0.1);
  expect(rects[0].w).toBeCloseTo((369 - 160) / 600);
  expect(rects[2].x + rects[2].w).toBeCloseTo(1);
});

it("keeps separate lines apart", () => {
  expect(
    mergeLines([
      { x: 0.1, y: 0.1, w: 0.2, h: 0.02 },
      { x: 0.1, y: 0.13, w: 0.2, h: 0.02 },
    ]),
  ).toHaveLength(2);
});

it("builds drag rects in any direction", () => {
  expect(rectFromPoints({ x: 0.5, y: 0.6 }, { x: 0.2, y: 1.3 })).toEqual({
    x: 0.2,
    y: 0.6,
    w: 0.3,
    h: 0.4,
  });
});

it("hit-tests the smallest highlight under the point", () => {
  const hls = [
    { id: 1, page: 1, rects: [{ x: 0, y: 0, w: 1, h: 1 }] },
    { id: 2, page: 1, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.05 }] },
    { id: 3, page: 2, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.05 }] },
  ];
  expect(hitTest(hls, 1, 0.15, 0.12)?.id).toBe(2);
  expect(hitTest(hls, 1, 0.9, 0.9)?.id).toBe(1);
  expect(hitTest(hls, 3, 0.15, 0.12)).toBeNull();
});
