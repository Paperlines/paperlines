// TypeScript twin of crates/search/src/query.rs. Both are tested against
// crates/search/fixtures/queries.json so they cannot drift.

export interface Term {
  neg: boolean;
  /** Lowercased qualifier key, or null for free text. */
  key: string | null;
  value: string;
  phrase: boolean;
}

export const KEYS = [
  "tag",
  "project",
  "year",
  "author",
  "is",
  "has",
  "rating",
  "type",
  "venue",
  "cites",
  "cited-by",
];

export const IS_VALUES = [
  "unread",
  "reading",
  "read",
  "pdf",
  "doi",
  "abstract",
  "tagged",
  "untagged",
  "notes",
];

const ws = (c: string | undefined) => c !== undefined && /\s/.test(c);

export function parse(q: string): Term[] {
  const cs = [...q];
  const out: Term[] = [];
  let i = 0;
  const quoted = () => {
    i++;
    let s = "";
    while (i < cs.length && cs[i] !== '"') s += cs[i++];
    i++;
    return s;
  };
  while (i < cs.length) {
    if (ws(cs[i])) {
      i++;
      continue;
    }
    const neg = cs[i] === "-" && i + 1 < cs.length && !ws(cs[i + 1]);
    if (neg) i++;
    if (cs[i] === '"') {
      const text = quoted().trim();
      if (text) out.push({ neg, key: null, value: text, phrase: true });
      continue;
    }
    const start = i;
    while (i < cs.length && !ws(cs[i]) && cs[i] !== ":") i++;
    const key = cs.slice(start, i).join("").toLowerCase();
    if (cs[i] === ":" && KEYS.includes(key)) {
      i++;
      let value: string;
      if (cs[i] === '"') value = quoted();
      else {
        const s = i;
        while (i < cs.length && !ws(cs[i])) i++;
        value = cs.slice(s, i).join("");
      }
      if (value.trim()) out.push({ neg, key, value: value.trim(), phrase: false });
      continue;
    }
    while (i < cs.length && !ws(cs[i])) i++;
    out.push({ neg, key: null, value: cs.slice(start, i).join(""), phrase: false });
  }
  return out;
}

/** Builds `key:value`, quoting values with spaces. */
export function qualifier(key: string, value: string): string {
  return /[\s"]/.test(value) ? `${key}:"${value.replaceAll('"', "")}"` : `${key}:${value}`;
}

/** The token being typed at the end of `q`, for autocomplete: `tag:ml/` -> { key: "tag", partial: "ml/" }. */
export function tokenAtEnd(q: string): { key: string | null; partial: string; start: number } {
  const m = /(-?)([a-z-]+):(?:"([^"]*)|(\S*))$/i.exec(q);
  if (m && KEYS.includes(m[2].toLowerCase())) {
    return { key: m[2].toLowerCase(), partial: m[3] ?? m[4] ?? "", start: m.index + m[1].length };
  }
  const w = /(\S*)$/.exec(q);
  return { key: null, partial: w?.[1] ?? "", start: q.length - (w?.[1].length ?? 0) };
}

export type Range =
  | { op: "=" | ">" | ">=" | "<" | "<="; n: number }
  | { op: ".."; a: number; b: number };

export function parseRange(v: string): Range | null {
  const between = /^(\d+)\.\.(\d+)$/.exec(v);
  if (between) {
    const [a, b] = [Number(between[1]), Number(between[2])];
    return { op: "..", a: Math.min(a, b), b: Math.max(a, b) };
  }
  const m = /^(>=|<=|>|<)?\s*(-?\d+)$/.exec(v.trim());
  return m ? { op: (m[1] as ">" | ">=" | "<" | "<=" | undefined) ?? "=", n: Number(m[2]) } : null;
}

export function inRange(r: Range, x: number | null): boolean {
  if (x === null) return false;
  switch (r.op) {
    case "..":
      return x >= r.a && x <= r.b;
    case ">":
      return x > r.n;
    case ">=":
      return x >= r.n;
    case "<":
      return x < r.n;
    case "<=":
      return x <= r.n;
    default:
      return x === r.n;
  }
}
