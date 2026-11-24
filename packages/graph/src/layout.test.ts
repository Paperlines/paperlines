import { describe, expect, it } from "vitest";
import { labelOpacity } from "./CitationGraph";
import {
  circleGroupLabels,
  circlePositions,
  layeredPositions,
  neighborhood,
  nodeSize,
  treePositions,
} from "./layout";

const edges: [number, number][] = [
  [3, 1], // 2019 cites 2017
  [3, 2],
  [2, 1],
  [4, 3],
];
const nodes = [
  { id: 1, year: 2017 },
  { id: 2, year: 2018 },
  { id: 3, year: 2019 },
  { id: 4, year: 2020 },
  { id: 5, year: null },
];

it("puts older papers left so arrows read as 'builds on'", () => {
  const p = layeredPositions(nodes, edges);
  const x = (id: number) => p.get(id)?.x ?? Number.NaN;
  expect(x(5)).toBeLessThan(x(1));
  expect(x(1)).toBeLessThan(x(2));
  expect(x(2)).toBeLessThan(x(3));
  expect(x(3)).toBeLessThan(x(4));
  for (const [a, b] of edges) expect(x(a)).toBeGreaterThan(x(b));
});

it("wraps crowded years into sub-columns without overlap", () => {
  const many = Array.from({ length: 70 }, (_, i) => ({ id: i, year: 2020 }));
  const p = layeredPositions(many, [], { maxPerColumn: 30 });
  const keys = new Set([...p.values()].map((v) => `${v.x},${v.y}`));
  expect(keys.size).toBe(70);
  expect(new Set([...p.values()].map((v) => v.x)).size).toBe(3);
});

it("finds neighborhoods by direction and depth", () => {
  expect([...neighborhood(edges, 3, 1, "cites")].sort()).toEqual([1, 2, 3]);
  expect([...neighborhood(edges, 3, 1, "citedBy")].sort()).toEqual([3, 4]);
  expect([...neighborhood(edges, 4, 2, "cites")].sort()).toEqual([1, 2, 3, 4]);
  expect([...neighborhood(edges, 1, 2, "both")].sort()).toEqual([1, 2, 3, 4]);
});

it("grows node size with citations, capped", () => {
  expect(nodeSize(0)).toBe(18);
  expect(nodeSize(4)).toBeGreaterThan(nodeSize(1));
  expect(nodeSize(10000)).toBe(64);
});

it("labels fade in with zoom, earlier or later with the threshold", () => {
  expect(labelOpacity(0.3, 0)).toBe(0);
  expect(labelOpacity(3, 0)).toBe(1);
  const mid = labelOpacity(1.2, 0);
  expect(mid).toBeGreaterThan(0);
  expect(mid).toBeLessThan(1);
  // a lower threshold shows labels sooner
  expect(labelOpacity(0.6, -1)).toBeGreaterThan(labelOpacity(0.6, 1));
});

const node = (id: number, year = 2020, group = "a") => ({ id, width: 80, year, group });

it("tree: the spine is the trunk, the rest hangs from its nearest spine paper", () => {
  // spine: [1, 2] then [3]; 4 links to 1, 5 links to 4 (two hops), 6 links to 3; 7 is alone
  const ns = [1, 2, 3, 4, 5, 6, 7].map((i) => node(i));
  const links: [number, number][] = [
    [4, 1],
    [5, 4],
    [6, 3],
    [1, 3],
  ];
  const p = treePositions(ns, links, [[1, 2], [3]]);
  const x = (id: number) => p.get(id)?.x ?? Number.NaN;
  const y = (id: number) => p.get(id)?.y ?? Number.NaN;
  expect([x(1), x(2), x(3)]).toEqual([40, 40, 40]);
  expect(x(4)).toBeGreaterThan(x(1));
  expect(x(5)).toBeGreaterThan(x(4));
  expect(x(6)).toBe(x(4));
  // step order top to bottom; the step-1 papers sit above step 2
  expect(y(1)).toBeLessThan(y(3));
  expect(y(2)).toBeLessThan(y(3));
  // the unlinked paper goes underneath everything
  expect(y(7)).toBeGreaterThan(Math.max(y(1), y(2), y(3), y(4), y(5), y(6)));
  // no two papers share a spot
  const spots = new Set([...p.values()].map((q) => `${q.x},${q.y}`));
  expect(spots.size).toBe(7);
});

it("tree without a spine roots each group at its most linked paper", () => {
  const p = treePositions(
    [node(1), node(2), node(3)],
    [
      [1, 2],
      [3, 2],
    ],
    [],
  );
  expect(p.get(2)?.x).toBe(40);
  expect(p.get(1)?.x).toBeGreaterThan(40);
});

it("circle: one ring, groups together, the ring grows with the papers", () => {
  const few = circlePositions([node(1), node(2), node(3, 2020, "b")]);
  const r = (q?: { x: number; y: number }) => Math.round(Math.hypot(q?.x ?? 0, q?.y ?? 0));
  expect(new Set([...few.values()].map(r)).size).toBe(1);
  const many = circlePositions(Array.from({ length: 200 }, (_, i) => node(i + 1, 2000 + (i % 20))));
  expect(r(many.get(1))).toBeGreaterThan(r(few.get(1)));
});

describe("circle labels", () => {
  const n = (id: number, group: string) => ({ id, width: 80, year: 2000 + id, group });
  it("names each project's arc outside the ring, at its middle", () => {
    const nodes = [n(1, "A"), n(2, "A"), n(3, "B"), n(4, "B"), n(5, "")];
    const pos = circlePositions(nodes);
    const labels = circleGroupLabels(nodes);
    expect(labels.map((l) => l.group).sort()).toEqual(["A", "B"]);
    const ring = Math.hypot(pos.get(1)!.x, pos.get(1)!.y);
    for (const l of labels) expect(Math.hypot(l.x, l.y)).toBeGreaterThan(ring + 30);
    // A's label sits between its two papers' angles
    const a = labels.find((l) => l.group === "A")!;
    const angles = [1, 2].map((id) => Math.atan2(pos.get(id)!.y, pos.get(id)!.x));
    expect(a.angle).toBeGreaterThanOrEqual(Math.min(...angles) - 1e-9);
    expect(a.angle).toBeLessThanOrEqual(Math.max(...angles) + 1e-9);
  });
  it("needs no labels without projects", () => {
    expect(circleGroupLabels([n(1, ""), n(2, "")])).toEqual([]);
  });
});
