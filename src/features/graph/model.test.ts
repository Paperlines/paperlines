import { emptyBiblio, type Item } from "@paperlines/backend-port";
import { expect, it } from "vitest";
import {
  authorYear,
  buildGraphView,
  DEFAULT_GRAPH_OPTIONS,
  type GraphOptions,
  isDark,
  mix,
  shortTitle,
} from "./model";

const item = (id: number, year: number, extra: Partial<Item> = {}): Item => ({
  id,
  year,
  title: `Paper ${id} about many interesting things`,
  citekey: `p${id}`,
  authors: [],
  itemType: "article",
  pubDate: null,
  venue: null,
  doi: null,
  arxivId: null,
  url: null,
  abstract: null,
  readStatus: "unread",
  rating: null,
  dateAdded: "",
  dateModified: "",
  hasPdf: false,
  tags: [],
  projectIds: [],
  hasEpub: false,
  deletedAt: null,
  ...emptyBiblio,
  ...extra,
});

const items = [
  item(1, 2015, { tags: ["ml/nlp"] }),
  item(2, 2017, { readStatus: "read", projectIds: [7] }),
  item(3, 2019),
  item(4, 2020),
  item(5, 2010),
];
const edges: [number, number][] = [
  [2, 1],
  [3, 2],
  [3, 1],
  [4, 3],
];
const palette = {
  status: { unread: "u", reading: "r", read: "d" },
  tag: { blue: "B" },
  projects: ["P0", "P1"],
  none: "-",
  bg: "#ffffff",
};
const tags = [{ id: 1, path: "ml/nlp", color: "blue" as const, count: 1 }];
const projects = [{ id: 7, name: "Thesis", description: null, count: 1, color: "blue" as const }];
const view = (o: Partial<GraphOptions>, sel: number | null = null) =>
  buildGraphView(items, edges, tags, projects, { ...DEFAULT_GRAPH_OPTIONS, ...o }, sel, palette);
const ids = (v: ReturnType<typeof view>) => v.nodes.map((n) => n.id).sort();

it("hides isolated papers unless asked", () => {
  expect(ids(view({ showIsolated: false }))).toEqual([1, 2, 3, 4]);
  expect(ids(view({ showIsolated: true }))).toEqual([1, 2, 3, 4, 5]);
});

it("filters by year, tag subtree, project and status", () => {
  expect(ids(view({ yearMin: 2016 }))).toEqual([2, 3, 4]);
  expect(ids(view({ tag: "ml", showIsolated: true }))).toEqual([1]);
  expect(ids(view({ projectId: 7, showIsolated: true }))).toEqual([2]);
  expect(ids(view({ status: "read", showIsolated: true }))).toEqual([2]);
});

it("focuses on a paper's neighborhood", () => {
  expect(ids(view({ focus: true, depth: 1, direction: "cites" }, 3))).toEqual([1, 2, 3]);
  expect(ids(view({ focus: true, depth: 1, direction: "citedBy" }, 3))).toEqual([3, 4]);
  expect(ids(view({ focus: true, depth: 1, direction: "citedBy" }, 1))).toEqual([1, 2, 3]);
  expect(ids(view({ focus: true, depth: 2, direction: "citedBy" }, 1))).toEqual([1, 2, 3, 4]);
});

it("colors, sizes and labels nodes", () => {
  const v = view({ colorBy: "tag" });
  const n1 = v.nodes.find((n) => n.id === 1);
  expect(n1?.color).toBe("B");
  const byProject = view({ colorBy: "project" });
  expect(byProject.nodes.find((n) => n.id === 2)?.color).toBe("B");
  expect(byProject.nodes.find((n) => n.id === 2)?.ring).toBe("d");
  expect(byProject.nodes.find((n) => n.id === 1)?.color).toBe("-");
  expect(view({ colorBy: "status" }).nodes[0].ring).toBeNull();
  expect(view({ statusRing: false }).nodes[0].ring).toBeNull();
  // by default: project fill, read-status ring
  expect(view({}).nodes.find((n) => n.id === 2)?.color).toBe("B");
  expect(view({}).nodes.find((n) => n.id === 2)?.ring).toBe("d");
  expect(v.citedBy.get(1)).toBe(2);
  expect((n1?.size ?? 0) > (v.nodes.find((n) => n.id === 4)?.size ?? 0)).toBe(true);
  expect(view({ labelBy: "citekey" }).nodes.find((n) => n.id === 1)?.label).toBe("p1");
  expect(view({ labelBy: "title" }).nodes[0].label).toBe("Paper 1 about many");
  expect(shortTitle("Extraordinarily lengthy unbelievable superlative words")).toHaveLength(28);
});

it("labels papers by first author and year, boxes get a tint of their color", () => {
  expect(authorYear({ authors: [{ family: "Smith", given: "A" }], year: 2021, title: "T" })).toBe(
    "Smith ’21",
  );
  expect(authorYear({ authors: [{ family: "Chen", given: "B" }], year: null, title: "T" })).toBe(
    "Chen",
  );
  expect(authorYear({ authors: [], year: 2019, title: "Attention Is All You Need" })).toBe(
    "Attention Is All You ’19",
  );
  expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  expect(mix("rgb(255, 0, 0)", "#000000", 0.5)).toBe("#800000");
  expect(mix("var(--x)", "#fff", 0.5)).toBe("var(--x)");
  expect(isDark("#15171b")).toBe(true);
  expect(isDark("#ffffff")).toBe(false);
  // defaults: boxes labelled by author and year
  const n = view({}).nodes.find((x) => x.id === 2);
  expect(n?.label).toMatch(/’17$/);
  const real = { ...palette, tag: { blue: "#2f6df6" } };
  const boxed = buildGraphView(items, edges, tags, projects, DEFAULT_GRAPH_OPTIONS, null, real);
  const b = boxed.nodes.find((x) => x.id === 2);
  expect(b?.color).toBe("#2f6df6");
  expect(b?.fill).toBe(mix("#2f6df6", "#ffffff", 0.8));
});

it("draws typed connections, which count as links and can be filtered", () => {
  const types = [
    {
      id: 1,
      key: "extends",
      label: "Extends",
      inverseLabel: "Extended by",
      color: "blue" as const,
      builtin: true,
      count: 1,
    },
    {
      id: 2,
      key: "contradicts",
      label: "Contradicts",
      inverseLabel: null,
      color: "red" as const,
      builtin: true,
      count: 1,
    },
  ];
  const rel = (id: number, from: number, to: number, typeId: number) => ({
    id,
    fromItemId: from,
    toItemId: to,
    typeId,
    note: null,
    evidenceHighlightId: null,
    createdAt: "",
  });
  const rels = [rel(10, 5, 1, 1), rel(11, 2, 3, 2)];
  const v = (o: Partial<GraphOptions>) =>
    buildGraphView(
      items,
      edges,
      tags,
      projects,
      { ...DEFAULT_GRAPH_OPTIONS, ...o },
      null,
      palette,
      rels,
      types,
    );
  expect(v({}).relations.map((r) => [r.id, r.label])).toEqual([
    [10, "Extends"],
    [11, "Contradicts"],
  ]);
  // paper 5 has no citations: its connection keeps it in a graph without unlinked papers
  expect(ids(view({ showIsolated: false }))).not.toContain(5);
  expect(v({ showIsolated: false }).nodes.map((n) => n.id)).toContain(5);
  expect(v({ hiddenRelationTypes: [1] }).relations.map((r) => r.id)).toEqual([11]);
  expect(v({ showRelations: false }).relations).toEqual([]);
  expect(v({ showCitations: false }).edges).toEqual([]);
});
