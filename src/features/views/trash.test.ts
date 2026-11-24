import { describe, expect, it } from "vitest";
import { daysLeft } from "./TrashView";

describe("days left in the Trash", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  it("counts whole days until the paper goes", () => {
    expect(daysLeft("2026-11-22 12:00:00", 30, now)).toBe(30);
    expect(daysLeft("2026-11-01 13:00:00", 30, now)).toBe(10);
    expect(daysLeft("2026-10-24 11:00:00", 30, now)).toBe(1);
    expect(daysLeft("2026-10-23 11:00:00", 30, now)).toBe(0);
  });
  it("accepts ISO dates and missing ones", () => {
    expect(daysLeft("2026-11-21T12:00:00Z", 30, now)).toBe(29);
    expect(daysLeft(null, 30, now)).toBe(30);
    expect(daysLeft("not a date", 7, now)).toBe(7);
  });
});
