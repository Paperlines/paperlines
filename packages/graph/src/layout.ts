export type Edge = [number, number];
export type Direction = "cites" | "citedBy" | "both";

export interface Positioned {
  x: number;
  y: number;
}

/**
 * Columns by year (older left, unknown year leftmost), rows ordered by the barycenter of
 * already-placed neighbors to reduce crossings. Large years wrap into sub-columns.
 */
export function layeredPositions(
  nodes: { id: number; year: number | null }[],
  edges: Edge[],
  opts: { colGap?: number; rowGap?: number; maxPerColumn?: number } = {},
): Map<number, Positioned> {
  const colGap = opts.colGap ?? 180;
  const rowGap = opts.rowGap ?? 56;
  const maxPer = opts.maxPerColumn ?? 30;
  const neighbors = new Map<number, number[]>();
  const degree = new Map<number, number>();
  for (const [a, b] of edges) {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const list = neighbors.get(x) ?? [];
      list.push(y);
      neighbors.set(x, list);
    }
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  const byYear = new Map<number, number[]>();
  for (const n of nodes) {
    const key = n.year ?? Number.NEGATIVE_INFINITY;
    byYear.set(key, [...(byYear.get(key) ?? []), n.id]);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const pos = new Map<number, Positioned>();
  let col = 0;
  for (const y of years) {
    const ids = byYear.get(y) ?? [];
    const placedY = (id: number) => {
      const ys = (neighbors.get(id) ?? [])
        .map((n) => pos.get(n)?.y)
        .filter((v): v is number => v !== undefined);
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
    };
    const ordered = ids
      .map((id) => ({ id, bary: placedY(id), deg: degree.get(id) ?? 0 }))
      .sort((a, b) => (a.bary ?? 0) - (b.bary ?? 0) || b.deg - a.deg || a.id - b.id);
    const chunks = Math.ceil(ordered.length / maxPer);
    for (let c = 0; c < chunks; c++) {
      const part = ordered.slice(c * maxPer, (c + 1) * maxPer);
      const top = -((part.length - 1) * rowGap) / 2;
      part.forEach((n, i) => {
        pos.set(n.id, {
          x: col * colGap + c * (colGap * 0.45),
          y: top + i * rowGap + (c % 2) * (rowGap / 2),
        });
      });
    }
    col += 1 + (chunks - 1) * 0.45;
  }
  return pos;
}

/** Ids within `depth` hops of `start`, following edges in the given direction. */
export function neighborhood(
  edges: Edge[],
  start: number,
  depth: number,
  direction: Direction,
): Set<number> {
  const out = new Map<number, number[]>();
  const inc = new Map<number, number[]>();
  for (const [a, b] of edges) {
    out.set(a, [...(out.get(a) ?? []), b]);
    inc.set(b, [...(inc.get(b) ?? []), a]);
  }
  const seen = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (const id of frontier) {
      const step = [
        ...(direction !== "citedBy" ? (out.get(id) ?? []) : []),
        ...(direction !== "cites" ? (inc.get(id) ?? []) : []),
      ];
      for (const n of step) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

/** Node diameter from the number of in-library citations. */
export function nodeSize(citedBy: number): number {
  return Math.min(64, 18 + 7 * Math.sqrt(citedBy));
}

export interface LayoutNode {
  id: number;
  /** Box width (or dot size) in pixels. */
  width: number;
  year: number | null;
  /** Circle: papers of a group sit together on the ring (e.g. a project). */
  group?: string;
}

type Pos = Map<number, { x: number; y: number }>;

/**
 * Tree growing left to right from a spine. The spine's papers form the trunk (x = 0), step by step
 * from the top, papers of the same step one under the other. Every other paper hangs from the
 * spine paper it is closest to through links (breadth-first), one column further right per hop,
 * in rows that don't overlap. Papers no link reaches go in a block underneath. Without a spine
 * each connected group is rooted at its most linked paper.
 */
export function treePositions(nodes: LayoutNode[], links: Edge[], steps: number[][]): Pos {
  const ids = new Set(nodes.map((n) => n.id));
  const width = new Map(nodes.map((n) => [n.id, n.width]));
  const adj = new Map<number, number[]>();
  for (const [a, b] of links) {
    if (!ids.has(a) || !ids.has(b) || a === b) continue;
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  const degree = (id: number) => adj.get(id)?.length ?? 0;
  let trunk = steps.map((s) => s.filter((id) => ids.has(id))).filter((s) => s.length);
  if (!trunk.length) {
    // no spine: one root per connected group, most linked first
    const seen = new Set<number>();
    const roots: number[] = [];
    for (const n of [...nodes].sort((a, b) => degree(b.id) - degree(a.id))) {
      if (seen.has(n.id) || degree(n.id) === 0) continue;
      roots.push(n.id);
      const queue = [n.id];
      seen.add(n.id);
      while (queue.length) {
        const c = queue.shift() as number;
        for (const m of adj.get(c) ?? [])
          if (!seen.has(m)) {
            seen.add(m);
            queue.push(m);
          }
      }
    }
    trunk = roots.map((r) => [r]);
  }
  // breadth-first from the whole trunk at once: each paper's parent is one hop closer to it
  const children = new Map<number, number[]>();
  const placed = new Set(trunk.flat());
  let frontier = trunk.flat();
  while (frontier.length) {
    const next: number[] = [];
    for (const p of frontier)
      for (const c of [...(adj.get(p) ?? [])].sort((a, b) => degree(b) - degree(a)))
        if (!placed.has(c)) {
          placed.add(c);
          children.set(p, [...(children.get(p) ?? []), c]);
          next.push(c);
        }
    frontier = next;
  }
  const colW = Math.max(120, ...nodes.map((n) => n.width)) + 70;
  const rowH = 46;
  const out: Pos = new Map();
  let cursor = 0;
  const place = (id: number, depth: number): number => {
    const kids = children.get(id) ?? [];
    let y: number;
    if (!kids.length) {
      y = cursor;
      cursor += rowH;
    } else {
      const ys = kids.map((k) => place(k, depth + 1));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    // boxes are centred: shift so their left edges line up in a column
    out.set(id, { x: depth * colW + (width.get(id) ?? 0) / 2, y });
    return y;
  };
  for (const step of trunk) {
    for (const id of step) place(id, 0);
    cursor += rowH * 1.3; // room between step boxes for the next one's name
  }
  // papers no link reaches: a block underneath, oldest first
  const rest = nodes
    .filter((n) => !out.has(n.id))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.id - b.id);
  cursor += rowH;
  rest.forEach((n, i) => {
    const col = i % 5;
    if (i && col === 0) cursor += rowH;
    out.set(n.id, { x: col * colW + n.width / 2, y: cursor });
  });
  return out;
}

/** The ring for `circlePositions`: radius, each paper's angle, and each group's angular span. */
function circleRing(nodes: LayoutNode[]) {
  const sorted = [...nodes].sort(
    (a, b) =>
      (a.group ?? "").localeCompare(b.group ?? "") || (a.year ?? 0) - (b.year ?? 0) || a.id - b.id,
  );
  const gap = 18;
  const groupGap = 60;
  const groups = new Set(sorted.map((n) => n.group ?? "")).size;
  const total =
    sorted.reduce((s, n) => s + n.width * 0.6 + gap, 0) + (groups > 1 ? groups * groupGap : 0);
  const r = Math.max(140, total / (2 * Math.PI));
  const angles = new Map<number, number>();
  const spans = new Map<string, { from: number; to: number }>();
  let along = 0;
  let prevGroup: string | undefined;
  for (const n of sorted) {
    if (prevGroup !== undefined && n.group !== prevGroup && groups > 1) along += groupGap;
    prevGroup = n.group;
    const w = n.width * 0.6 + gap;
    const a = -Math.PI / 2 + ((along + w / 2) / total) * 2 * Math.PI;
    angles.set(n.id, a);
    const g = n.group ?? "";
    const span = spans.get(g);
    spans.set(g, span ? { from: span.from, to: a } : { from: a, to: a });
    along += w;
  }
  return { r, angles, spans, groups };
}

/**
 * Every paper on one ring: grouped (by project) into arcs, oldest to newest within each, and
 * spaced by their widths so boxes don't touch. The ring grows with the number of papers.
 */
export function circlePositions(nodes: LayoutNode[]): Pos {
  const { r, angles } = circleRing(nodes);
  const out: Pos = new Map();
  for (const [id, a] of angles) out.set(id, { x: r * Math.cos(a), y: r * Math.sin(a) });
  return out;
}

/**
 * Where to name each project's arc in the Circle layout: outside the ring at the middle of the
 * arc, far enough out to clear the boxes. Papers without a project get no label, and a ring that
 * is all one project needs none.
 */
export function circleGroupLabels(
  nodes: LayoutNode[],
): { group: string; x: number; y: number; angle: number }[] {
  const { r, spans, groups } = circleRing(nodes);
  if (groups < 2 && !(groups === 1 && nodes[0]?.group)) return [];
  const widest = Math.max(0, ...nodes.map((n) => n.width));
  const out = r + widest * 0.45 + 34;
  return [...spans]
    .filter(([g]) => g !== "")
    .map(([group, { from, to }]) => {
      const angle = (from + to) / 2;
      return { group, angle, x: out * Math.cos(angle), y: out * Math.sin(angle) };
    });
}
