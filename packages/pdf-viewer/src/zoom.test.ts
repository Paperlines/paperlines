import { describe, expect, it } from "vitest";
import { anchoredScroll, clampZoom, MAX_ZOOM, MIN_ZOOM, wheelFactor } from "./zoom";

describe("zoom", () => {
  it("keeps zoom within limits", () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it("zooms in when scrolling up and out when scrolling down", () => {
    expect(wheelFactor(-10)).toBeGreaterThan(1);
    expect(wheelFactor(10)).toBeLessThan(1);
    // pinching out and back in returns to where it was
    expect(wheelFactor(-7) * wheelFactor(7)).toBeCloseTo(1);
    // a mouse notch is capped, and line-based deltas count like pixels
    expect(wheelFactor(-1000)).toBeCloseTo(wheelFactor(-50));
    expect(wheelFactor(-3, 1)).toBeCloseTo(wheelFactor(-48));
  });

  it("keeps the point under the pointer still", () => {
    // pointer 100 px into the box, scrolled 300: content point 400 doubles to 800
    expect(anchoredScroll(300, 100, 2)).toBe(700);
    // with 16 px of padding that doesn't scale
    expect(anchoredScroll(300, 100, 2, 16)).toBe(684);
    // zooming out near the top can't scroll above 0
    expect(anchoredScroll(10, 400, 0.5)).toBe(0);
  });
});
