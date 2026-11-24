import type {
  Item,
  ProjectInfo,
  ReadStatus,
  Relation,
  RelationType,
  SpineStep,
  TagInfo,
} from "@paperlines/backend-port";
import {
  DEFAULT_DISPLAY,
  DEFAULT_FORCES,
  type Direction,
  type Edge,
  type GraphDisplay,
  type GraphForces,
  type GraphNode,
  neighborhood,
  nodeSize,
} from "@paperlines/graph";

export type ColorBy = "status" | "tag" | "project";
export type LabelBy = "authorYear" | "citekey" | "title";
export type NodeStyle = "boxes" | "dots";

export interface GraphOptions {
  /** Live forces, layers by year, a tree grown from the spine, or one ring by project. */
  layout: "layered" | "force" | "tree" | "circle";
  /** Whose spine (key papers) to draw; null follows the project filter. */
  spineProjectId: number | null;
  colorBy: ColorBy;
  labelBy: LabelBy;
  yearMin: number | null;
  yearMax: number | null;
  tag: string | null;
  projectId: number | null;
  status: ReadStatus | null;
  showIsolated: boolean;
  /** Show only the selected paper's neighborhood. */
  focus: boolean;
  depth: 1 | 2;
  /** Overview map in the corner of the canvas. */
  minimap: boolean;
  /** Read status as a ring around each paper (when the fill shows something else). */
  statusRing: boolean;
  /** Only papers whose title, authors, citekey or tags contain this. */
  search: string;
  display: GraphDisplay;
  forces: GraphForces;
  /** Multiplies node sizes. */
  nodeScale: number;
  /** Rounded boxes labelled "Smith ’21", or Obsidian-style dots. */
  nodeStyle: NodeStyle;
  /** Which links to draw: citations, typed connections, and connection types left out. */
  showCitations: boolean;
  showRelations: boolean;
  hiddenRelationTypes: number[];
  /** The floating settings panel, and which of its sections are open. */
  panelOpen: boolean;
  /** The key on the canvas (what fill, border and gold mean). */
  legend: boolean;
  sections: { filters: boolean; groups: boolean; display: boolean; forces: boolean };
  direction: Direction;
}

export const DEFAULT_GRAPH_OPTIONS: GraphOptions = {
  layout: "force",
  spineProjectId: null,
  colorBy: "project",
  labelBy: "authorYear",
  yearMin: null,
  yearMax: null,
  tag: null,
  projectId: null,
  status: null,
  showIsolated: true,
  focus: false,
  depth: 1,
  minimap: true,
  statusRing: true,
  search: "",
  display: DEFAULT_DISPLAY,
  forces: DEFAULT_FORCES,
  nodeScale: 0.75,
  nodeStyle: "boxes",
  showCitations: true,
  showRelations: true,
  hiddenRelationTypes: [],
  panelOpen: false,
  legend: true,
  sections: { filters: true, groups: true, display: false, forces: false },
  direction: "both",
};

export interface Palette {
  status: Record<ReadStatus, string>;
  tag: Record<string, string>;
  projects: string[];
  none: string;
  /** The canvas background: box fills are the node color mixed toward it. */
  bg: string;
  /** Key papers (the spine): gold, and the fill of their boxes. */
  spine?: string;
  spineFill?: string;
}

export const SPINE_GOLD = "#D99A1E";

/** Circle layout switches to dots past this many papers (boxes would crowd the ring). */
export const CIRCLE_BOXES_MAX = 150;

function rgb(c: string): [number, number, number] | null {
  const h = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (h) {
    const x = h[1].length === 3 ? [...h[1]].map((d) => d + d).join("") : h[1];
    return [0, 2, 4].map((i) => Number.parseInt(x.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** `color` moved toward `toward` by `t` (0..1), as hex; unparsable colors come back unchanged. */
export function mix(color: string, toward: string, t: number): string {
  const a = rgb(color);
  const b = rgb(toward);
  if (!a || !b) return color;
  const hex = a.map((v, i) =>
    Math.round(v + (b[i] - v) * t)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${hex.join("")}`;
}

/** Whether a background is dark (by perceived brightness). */
export function isDark(bg: string): boolean {
  const c = rgb(bg);
  return !!c && 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 128;
}

/** "Smith ’21": the first author's family name and a two-digit year (title words without an author). */
export function authorYear(i: Pick<Item, "authors" | "year" | "title">): string {
  const who = i.authors[0]?.family?.trim() || i.authors[0]?.given?.trim() || shortTitle(i.title);
  return i.year ? `${who} ’${String(i.year).slice(-2)}` : who;
}

export function shortTitle(title: string): string {
  const words = title.split(/\s+/).slice(0, 4).join(" ");
  return words.length > 28 ? `${words.slice(0, 27)}…` : words;
}

/** A typed connection as drawn: colored and labelled, from `from` to `to`. */
export interface GraphRelation {
  id: number;
  from: number;
  to: number;
  color: string;
  label: string;
}

export interface GraphView {
  nodes: GraphNode[];
  edges: Edge[];
  relations: GraphRelation[];
  /** The spine's steps, limited to papers in view (a step may end up empty; numbering holds). */
  spine: { label: string; items: number[] }[];
  citedBy: Map<number, number>;
  cites: Map<number, number>;
}

export function buildGraphView(
  items: Item[],
  allEdges: Edge[],
  tags: TagInfo[],
  projects: ProjectInfo[],
  o: GraphOptions,
  selectedId: number | null,
  palette: Palette,
  relations: Relation[] = [],
  relationTypes: RelationType[] = [],
  spineSteps: SpineStep[] = [],
): GraphView {
  const citedBy = new Map<number, number>();
  const cites = new Map<number, number>();
  for (const [a, b] of allEdges) {
    citedBy.set(b, (citedBy.get(b) ?? 0) + 1);
    cites.set(a, (cites.get(a) ?? 0) + 1);
  }
  const tagLower = o.tag?.toLowerCase() ?? null;
  const needle = o.search.trim().toLowerCase();
  const haystack = (i: Item) =>
    `${i.title} ${i.citekey} ${i.authors.map((a) => a.family).join(" ")} ${i.tags.join(" ")}`.toLowerCase();
  let keep = new Set(
    items
      .filter((i) => o.yearMin === null || (i.year !== null && i.year >= o.yearMin))
      .filter((i) => o.yearMax === null || (i.year !== null && i.year <= o.yearMax))
      .filter(
        (i) =>
          !tagLower ||
          i.tags.some(
            (t) => t.toLowerCase() === tagLower || t.toLowerCase().startsWith(`${tagLower}/`),
          ),
      )
      .filter((i) => o.projectId === null || i.projectIds.includes(o.projectId))
      .filter((i) => !o.status || i.readStatus === o.status)
      .filter((i) => !needle || haystack(i).includes(needle))
      .map((i) => i.id),
  );
  // typed connections count as links (for "local graph" and unlinked papers) like citations
  const typeOf = new Map(relationTypes.map((t) => [t.id, t]));
  const shownRels = o.showRelations
    ? relations.filter((r) => typeOf.has(r.typeId) && !o.hiddenRelationTypes.includes(r.typeId))
    : [];
  const cite = o.showCitations ? allEdges : [];
  const links: Edge[] = [...cite, ...shownRels.map((r): Edge => [r.fromItemId, r.toItemId])];
  let edges = links.filter(([a, b]) => keep.has(a) && keep.has(b));
  if (o.focus && selectedId !== null && keep.has(selectedId)) {
    keep = neighborhood(edges, selectedId, o.depth, o.direction);
    edges = edges.filter(([a, b]) => keep.has(a) && keep.has(b));
  }
  if (!o.showIsolated) {
    const linked = new Set(edges.flat());
    if (selectedId !== null) linked.add(selectedId);
    keep = new Set([...keep].filter((id) => linked.has(id)));
  }
  const tagColor = new Map(
    tags.filter((t) => t.color).map((t) => [t.path, palette.tag[t.color as string]]),
  );
  const projColor = new Map(projects.map((p) => [p.id, palette.tag[p.color] ?? palette.none]));
  const color = (i: Item): string => {
    if (o.colorBy === "status") return palette.status[i.readStatus];
    if (o.colorBy === "tag")
      return i.tags.map((t) => tagColor.get(t)).find(Boolean) ?? palette.none;
    // a paper in several projects takes its first project's color
    return i.projectIds.map((id) => projColor.get(id)).find(Boolean) ?? palette.none;
  };
  const ring = (i: Item): string | null =>
    o.statusRing && o.colorBy !== "status" ? palette.status[i.readStatus] : null;
  // boxes: a tint of the color, deep on a dark canvas, pale on a light one
  const tintBy = isDark(palette.bg) ? 0.58 : 0.8;
  const label = (i: Item) =>
    o.labelBy === "citekey"
      ? i.citekey
      : o.labelBy === "title"
        ? shortTitle(i.title)
        : authorYear(i);
  const onSpine = new Set(spineSteps.flatMap((st) => st.items));
  const gold = palette.spine ?? SPINE_GOLD;
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  const nodes = items
    .filter((i) => keep.has(i.id))
    .map((i) => {
      const c = color(i);
      const text = label(i);
      return {
        group: i.projectIds.map((id) => projName.get(id)).find(Boolean) ?? "",
        id: i.id,
        label: text,
        year: i.year,
        color: c,
        // key papers: an amber box whatever their project
        fill: onSpine.has(i.id)
          ? (palette.spineFill ?? mix(gold, palette.bg, tintBy - 0.12))
          : mix(c, palette.bg, tintBy),
        ring: ring(i),
        size: nodeSize(citedBy.get(i.id) ?? 0) * o.nodeScale,
        // rough box width for the layout's collision (about 6.5px a character plus padding)
        width: text.length * 6.5 + 26,
      };
    });
  const inView = (a: number, b: number) => keep.has(a) && keep.has(b);
  return {
    nodes,
    edges: cite.filter(([a, b]) => inView(a, b)),
    relations: shownRels
      .filter((r) => inView(r.fromItemId, r.toItemId))
      .map((r) => {
        const ty = typeOf.get(r.typeId) as RelationType;
        return {
          id: r.id,
          from: r.fromItemId,
          to: r.toItemId,
          color: palette.tag[ty.color] ?? palette.none,
          label: ty.label,
        };
      }),
    spine: spineSteps.map((st) => ({
      label: st.label ?? "",
      items: st.items.filter((id) => keep.has(id)),
    })),
    citedBy,
    cites,
  };
}
