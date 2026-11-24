// Find in PDF: page text from PDF.js text items, matched without the DOM, so pages that were never
// rendered are searched too. Matching ignores case (optional), accents and ligatures (ﬁ → fi),
// collapses whitespace, and joins words hyphenated across a line break.
import type { Rect } from "@paperlines/backend-port";

/** The parts of a PDF.js TextItem the search needs. */
export interface FindItem {
  str: string;
  /** [a, b, c, d, e, f] text-space to page-space transform. */
  transform: number[];
  /** Advance width and height in page units. */
  width: number;
  height: number;
  hasEOL?: boolean;
}

/** Searchable text of one page: `text[i]` comes from `items[item[i]].str[offset[i]]`. */
export interface PageText {
  text: string;
  item: Int32Array;
  offset: Int32Array;
}

export interface FindOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

const MARK = /\p{M}/u;
const WORD = /[\p{L}\p{N}_]/u;
const LETTER = /[\p{L}\p{N}]/u;

/** One searchable character sequence per source character (ligatures expand, accents drop). */
function fold(ch: string): string {
  if (/\s/.test(ch)) return " ";
  let out = "";
  for (const c of ch.normalize("NFKD")) if (!MARK.test(c)) out += c;
  return out;
}

export function buildPageText(items: FindItem[]): PageText {
  const text: string[] = [];
  const item: number[] = [];
  const offset: number[] = [];
  const push = (s: string, i: number, o: number) => {
    for (const c of s) {
      if (c === " " && (text.length === 0 || text[text.length - 1] === " ")) continue;
      text.push(c);
      item.push(i);
      offset.push(o);
    }
  };
  items.forEach((it, i) => {
    const s = it.str;
    // "atten-" + EOL + "tion": drop the hyphen so "attention" matches
    const hyphenated = it.hasEOL && /\p{L}-$/u.test(s);
    const end = hyphenated ? s.length - 1 : s.length;
    for (let o = 0; o < end; o++) push(fold(s[o]), i, o);
    if (it.hasEOL && !hyphenated) push(" ", i, Math.max(0, s.length - 1));
  });
  return { text: text.join(""), item: Int32Array.from(item), offset: Int32Array.from(offset) };
}

/** Normalizes a query the same way page text is built. */
export function normalizeQuery(q: string): string {
  let out = "";
  for (const ch of q.trim()) {
    const f = fold(ch);
    if (f === " " && out.endsWith(" ")) continue;
    out += f;
  }
  return out;
}

/** Start/end offsets (end exclusive) of every match in the page text. */
export function findInText(
  text: string,
  query: string,
  opts: FindOptions = {},
): [number, number][] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const hay = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? q : q.toLowerCase();
  const out: [number, number][] = [];
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) {
    const end = at + needle.length;
    if (opts.wholeWord) {
      const before = at > 0 && WORD.test(hay[at - 1]) && WORD.test(hay[at]);
      const after = end < hay.length && WORD.test(hay[end]) && WORD.test(hay[end - 1]);
      if (before || after) continue;
    }
    out.push([at, end]);
    // non-overlapping, as browsers count them
    at = end - 1;
  }
  return out;
}

/**
 * Rects (0-1 of the page, top-left origin) covering text[start, end). `toViewport` maps a PDF-space
 * rectangle [x1, y1, x2, y2] to viewport pixels (PDF.js `viewport.convertToViewportRectangle`).
 */
export function matchRects(
  page: PageText,
  items: FindItem[],
  start: number,
  end: number,
  toViewport: (r: number[]) => number[],
  size: { w: number; h: number },
): Rect[] {
  const spans = new Map<number, [number, number]>();
  for (let i = start; i < end; i++) {
    const it = page.item[i];
    const o = page.offset[i];
    const s = spans.get(it);
    spans.set(it, s ? [Math.min(s[0], o), Math.max(s[1], o + 1)] : [o, o + 1]);
  }
  const rects: Rect[] = [];
  for (const [i, [a, b]] of spans) {
    const it = items[i];
    const len = Math.max(it.str.length, 1);
    const [, , c, d, e, f] = it.transform;
    const h = it.height || Math.hypot(c, d) || 10;
    // characters are spaced evenly within an item: close enough for a highlight box
    const x1 = e + (it.width * a) / len;
    const x2 = e + (it.width * b) / len;
    const [vx1, vy1, vx2, vy2] = toViewport([x1, f - h * 0.22, x2, f + h * 0.9]);
    const left = Math.min(vx1, vx2);
    const top = Math.min(vy1, vy2);
    rects.push({
      x: left / size.w,
      y: top / size.h,
      w: Math.abs(vx2 - vx1) / size.w,
      h: Math.abs(vy2 - vy1) / size.h,
    });
  }
  return rects;
}

/**
 * Where a quoted passage is on a page, tolerant of how its text was extracted: an exact match
 * first, then one on letters and digits only (PDF text often splits or joins words, and dashes
 * and quotes differ), then
 * the quote's opening and closing words with whatever lies between. `[start, end)` or null.
 */
export function findPassage(page: PageText, quote: string): [number, number] | null {
  const exact = findInText(page.text, quote);
  if (exact.length) return exact[0];
  // letters and digits only (spaces, dashes and punctuation are where extractions disagree),
  // remembering where each came from
  const idx: number[] = [];
  let compact = "";
  for (let i = 0; i < page.text.length; i++) {
    const c = page.text[i];
    if (!LETTER.test(c)) continue;
    compact += c.toLowerCase();
    idx.push(i);
  }
  const q = [...normalizeQuery(quote)]
    .filter((c) => LETTER.test(c))
    .join("")
    .toLowerCase();
  if (q.length < 3) return null;
  const span = (a: number, b: number): [number, number] => [idx[a], idx[b - 1] + 1];
  const at = compact.indexOf(q);
  if (at >= 0) return span(at, at + q.length);
  // long quotes: the first and last words must match, the middle may differ a little
  if (q.length < 40) return null;
  const head = q.slice(0, 20);
  const tail = q.slice(-20);
  for (let a = compact.indexOf(head); a >= 0; a = compact.indexOf(head, a + 1)) {
    const b = compact.indexOf(tail, a + head.length);
    if (b >= 0 && b + tail.length - a <= q.length * 1.4) return span(a, b + tail.length);
  }
  return null;
}
