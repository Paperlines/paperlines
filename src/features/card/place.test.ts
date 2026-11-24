import { expect, it } from "vitest";
import { placeCard } from "./place";

const view = { width: 1000, height: 700 };
const card = { width: 300, height: 200 };

it("prefers the right side, vertically centered", () => {
  expect(placeCard({ left: 100, top: 300, width: 20, height: 20 }, card, view)).toEqual({
    left: 130,
    top: 210,
  });
});

it("flips left near the right edge", () => {
  expect(placeCard({ left: 800, top: 300, width: 20, height: 20 }, card, view).left).toBe(490);
});

it("never leaves the viewport", () => {
  const corner = placeCard({ left: 990, top: 690, width: 5, height: 5 }, card, view);
  expect(corner.left + card.width).toBeLessThanOrEqual(view.width - 8);
  expect(corner.top + card.height).toBeLessThanOrEqual(view.height - 8);
  const top = placeCard({ left: 100, top: -50, width: 20, height: 20 }, card, view);
  expect(top.top).toBeGreaterThanOrEqual(8);
  const narrow = placeCard({ left: 150, top: 300, width: 20, height: 20 }, card, {
    width: 340,
    height: 700,
  });
  expect(narrow.left).toBeGreaterThanOrEqual(8);
  expect(narrow.left + card.width).toBeLessThanOrEqual(340 - 8);
});
