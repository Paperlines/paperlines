import { describe, expect, it } from "vitest";
import {
  buildPageText,
  type FindItem,
  findInText,
  findPassage,
  matchRects,
  normalizeQuery,
} from "./find";

const item = (str: string, x: number, y: number, hasEOL = false): FindItem => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  width: str.length * 5,
  height: 10,
  hasEOL,
});

describe("find in PDF", () => {
  it("joins items, lines and hyphenated words", () => {
    const p = buildPageText([
      item("Deep  residual atten-", 0, 700, true),
      item("tion works", 0, 688, true),
      item("next line", 0, 676),
    ]);
    expect(p.text).toBe("Deep residual attention works next line");
    expect(findInText(p.text, "attention works")).toEqual([[14, 29]]);
    expect(findInText(p.text, "works  next")).toEqual([[24, 34]]);
  });

  it("ignores case, accents and ligatures unless asked", () => {
    const p = buildPageText([item("Naïve eﬃcient NAIVE", 0, 0)]);
    expect(findInText(p.text, "naive")).toHaveLength(2);
    expect(findInText(p.text, "efficient")).toHaveLength(1);
    expect(findInText(p.text, "naive", { caseSensitive: true })).toHaveLength(0);
    expect(findInText(p.text, "Naive", { caseSensitive: true })).toHaveLength(1);
    expect(normalizeQuery("  a   b ")).toBe("a b");
  });

  it("whole words and non-overlapping counts", () => {
    const p = buildPageText([item("net network nets net aaaa", 0, 0)]);
    expect(findInText(p.text, "net")).toHaveLength(4);
    expect(findInText(p.text, "net", { wholeWord: true })).toEqual([
      [0, 3],
      [17, 20],
    ]);
    expect(findInText(p.text, "aa")).toHaveLength(2);
    expect(findInText(p.text, "")).toEqual([]);
  });

  it("maps a match to page rects, one per text item", () => {
    const items = [item("hello world", 100, 700, true), item("again", 100, 680)];
    const p = buildPageText(items);
    const [[s, e]] = findInText(p.text, "world again");
    // PDF space (origin bottom-left, 600x800) to viewport (origin top-left)
    const toVp = ([x1, y1, x2, y2]: number[]) => [x1, 800 - y1, x2, 800 - y2];
    const rects = matchRects(p, items, s, e, toVp, { w: 600, h: 800 });
    expect(rects).toHaveLength(2);
    expect(rects[0].x).toBeCloseTo((100 + 30) / 600);
    expect(rects[0].w).toBeCloseTo(25 / 600);
    expect(rects[1].x).toBeCloseTo(100 / 600);
    expect(rects[1].y).toBeLessThan(1);
    expect(rects[1].y).toBeGreaterThan(rects[0].y);
  });
});

describe("findPassage", () => {
  const page = (strs: string[]) =>
    buildPageText(
      strs.map((str) => ({
        str,
        transform: [1, 0, 0, 1, 0, 0],
        width: 1,
        height: 1,
        hasEOL: true,
      })),
    );
  it("finds a quote however its spaces were extracted", () => {
    const p = page([
      "Direct laser writing by multiphoton po-",
      "lymerization of a photoresist has emerged",
    ]);
    // the assistant's text had a space inside a word and none between two
    const q = "multiphoton po lymerization ofa photoresist";
    const r = findPassage(p, q);
    expect(r).not.toBeNull();
    const [a, b] = r as [number, number];
    expect(p.text.slice(a, b)).toBe("multiphoton polymerization of a photoresist");
  });
  it("matches a long quote by its first and last words", () => {
    const p = page([
      "In this letter, we report the fabrication through direct laser writing of",
      "high-quality woodpile photonic crystals with stop bands at telecom wavelengths.",
    ]);
    const q =
      "we report the fabrication — through direct laser writing — of high quality woodpile photonic crystals with stop bands at telecom wavelengths";
    const r = findPassage(p, q);
    expect(r).not.toBeNull();
    expect(findPassage(p, "something not on this page at all, quite long indeed")).toBeNull();
  });
});
