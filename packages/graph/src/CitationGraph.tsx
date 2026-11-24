import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from "cytoscape";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useRef } from "react";
import {
  circleGroupLabels,
  circlePositions,
  type Edge,
  layeredPositions,
  treePositions,
} from "./layout";

/** How the graph looks (Obsidian's "Display" settings). */
export interface GraphDisplay {
  arrows: boolean;
  /** Labels fade in when zooming in past a threshold: -2 (early) .. 2 (late). */
  textFade: number;
  /** Link thickness in pixels. */
  linkWidth: number;
}

/** The live layout's physics (Obsidian's "Forces"), each 0..1 except distance (pixels). */
export interface GraphForces {
  center: number;
  repel: number;
  link: number;
  distance: number;
}

export const DEFAULT_DISPLAY: GraphDisplay = { arrows: true, textFade: 0, linkWidth: 1 };
export const DEFAULT_FORCES: GraphForces = { center: 0.5, repel: 0.5, link: 0.6, distance: 90 };

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
  /** Number of links: papers without any are pulled in harder so they don't drift away. */
  degree: number;
}
type SimLink = SimulationLinkDatum<SimNode>;

/** Label opacity at a zoom level: 0 when zoomed out, 1 past the fade threshold (0.1 steps). */
export function labelOpacity(zoom: number, textFade: number): number {
  const z0 = 1.3 * 2 ** textFade;
  const o = (zoom - z0 * 0.6) / (z0 * 0.6);
  return Math.round(Math.max(0, Math.min(1, o)) * 10) / 10;
}

/** Boxes are wider than dots: links get a bit more length so names don't touch. */
function withRoom(f: GraphForces, nodeStyle?: "boxes" | "dots"): GraphForces {
  return nodeStyle === "dots" ? f : { ...f, distance: f.distance + 45 };
}

function applyForces(sim: Simulation<SimNode, SimLink>, f: GraphForces, big: boolean) {
  sim.force(
    "charge",
    forceManyBody<SimNode>()
      .strength(-30 - 330 * f.repel)
      .theta(big ? 1.1 : 0.9)
      // repulsion reaches only so far, so lone papers and small clusters settle next to the
      // main cloud instead of being pushed to its far edge
      .distanceMax(big ? 520 : 380),
  );
  const link = sim.force("link") as ReturnType<typeof forceLink<SimNode, SimLink>> | undefined;
  link?.distance(f.distance).strength(f.link);
  // gravity toward the middle keeps separate clusters and lone papers in view, as in Obsidian
  const pull = (d: SimNode) => (0.01 + 0.2 * f.center) * (d.degree === 0 ? 3 : 1);
  sim.force("x", forceX<SimNode>(0).strength(pull));
  sim.force("y", forceY<SimNode>(0).strength(pull));
}

export interface GraphNode {
  id: number;
  label: string;
  year: number | null;
  color: string;
  size: number;
  /** A ring around the node (e.g. read status), or none. */
  ring?: string | null;
  /** Box style: the background (a tint of `color`). */
  fill?: string;
  /** Box style: about how wide the box is, for collision. */
  width?: number;
  /** Circle layout: papers of the same group (e.g. project) sit together. */
  group?: string;
}

export interface GraphTheme {
  fg: string;
  muted: string;
  edge: string;
  accent: string;
  incoming: string;
  bg: string;
  /** Key papers (the spine): step boxes and the path between steps. */
  spine?: string;
  /** Text on a key paper's box (its fill is bright in dark mode). */
  spineText?: string;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GraphApi {
  /** Node bounds in viewport (client) coordinates, or null when not rendered. */
  nodeBox(id: number): Box | null;
  center(id: number): void;
  fit(): void;
  /** Keyboard focus ring and neighborhood highlight, as on hover. */
  focus(id: number | null): void;
  /** `moving`: the live layout is still settling. */
  /** Circle layout: the project names shown outside the ring. */
  arcLabels(): string[];
  stats(): {
    nodes: number;
    edges: number;
    relations: number;
    spine: number;
    layoutMs: number;
    moving: boolean;
  };
  /** Fill and ring color of a node as drawn, or null when it isn't shown. */
  nodeStyle(id: number): {
    color: string;
    ring: string | null;
    shape: string;
    label: string;
    spine: boolean;
    x: number;
    y: number;
  } | null;
}

export interface CitationGraphProps {
  nodes: GraphNode[];
  edges: Edge[];
  /** Live forces, layers by year, a tree from the spine, or one ring. */
  layout: "layered" | "force" | "tree" | "circle";
  /** Key papers in steps (each step may hold several); drawn gold, numbered, joined by a path. */
  spine?: SpineStepView[];
  selectedId: number | null;
  theme: GraphTheme;
  onHover(id: number | null, box: Box | null): void;
  onTap(id: number | null, box: Box | null): void;
  onDoubleTap(id: number): void;
  /** Pan/zoom moved nodes; positioned overlays should re-anchor. */
  onViewport?(): void;
  onReady?(api: GraphApi): void;
  ariaLabel?: string;
  /** Overview in the corner: every node as a dot plus the visible area; click or drag to pan. */
  minimap?: boolean;
  minimapLabel?: string;
  display?: GraphDisplay;
  forces?: GraphForces;
  /** Rounded boxes with the label inside (default), or Obsidian-style dots. */
  nodeStyle?: "boxes" | "dots";
  /** Typed connections, drawn in their color with their label. */
  relations?: GraphRelationEdge[];
  /** ⌥/Alt-drag from one node onto another asks to connect them. */
  onConnect?(from: number, to: number): void;
}

export interface SpineStepView {
  /** Shown above the step in the Tree layout, e.g. "Step 1 · Origins". */
  label: string;
  items: number[];
}

/** "①".."⑳", then "21." and up: a key paper's step, before its name. */
export function stepMark(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `${n}.`;
}

export interface GraphRelationEdge {
  id: number;
  from: number;
  to: number;
  color: string;
  label: string;
}

/** Box geometry for a label: font size grows a little with citations (node `size`). */
export function boxOf(label: string, size: number, measure: (s: string, px: number) => number) {
  const fs = Math.round(Math.max(10, Math.min(14, 7 + size / 6)) * 10) / 10;
  return { fs, w: Math.ceil(measure(label, fs)) + 24, h: Math.round(fs + 14) };
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Text width in the app's font (an estimate where there is no canvas, e.g. in tests). */
function measureText(s: string, px: number): number {
  if (measureCtx === undefined)
    measureCtx =
      typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length * px * 0.56;
  const family =
    getComputedStyle(document.documentElement).getPropertyValue("--font").trim() || "sans-serif";
  measureCtx.font = `500 ${px}px ${family}`;
  return measureCtx.measureText(s).width;
}

const MINI_W = 168;
const MINI_H = 112;

/** Draws the overview: node dots scaled into the canvas and the current viewport as a rectangle. */
function drawMinimap(cy: Core, canvas: HTMLCanvasElement, t: GraphTheme) {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== MINI_W * dpr) {
    canvas.width = MINI_W * dpr;
    canvas.height = MINI_H * dpr;
  }
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, MINI_W, MINI_H);
  const nodes = cy.nodes(":childless").not(".arc-label");
  if (nodes.empty()) return null;
  const bb = nodes.boundingBox({ includeLabels: false });
  const ext = cy.extent();
  // frame both the graph and the viewport so the rectangle never leaves the map
  const x1 = Math.min(bb.x1, ext.x1);
  const y1 = Math.min(bb.y1, ext.y1);
  const w = Math.max(Math.max(bb.x2, ext.x2) - x1, 1);
  const h = Math.max(Math.max(bb.y2, ext.y2) - y1, 1);
  const pad = 6;
  const k = Math.min((MINI_W - 2 * pad) / w, (MINI_H - 2 * pad) / h);
  const ox = pad + (MINI_W - 2 * pad - w * k) / 2 - x1 * k;
  const oy = pad + (MINI_H - 2 * pad - h * k) / 2 - y1 * k;
  for (const n of nodes) {
    const p = n.position();
    g.fillStyle = n.data("color");
    g.beginPath();
    g.arc(
      ox + p.x * k,
      oy + p.y * k,
      Math.max(1.2, (n.data("size") as number) * k * 0.5),
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  g.strokeStyle = t.accent;
  g.lineWidth = 1.5;
  g.fillStyle = `${t.accent}22`;
  const rx = ox + ext.x1 * k;
  const ry = oy + ext.y1 * k;
  g.fillRect(rx, ry, ext.w * k, ext.h * k);
  g.strokeRect(rx, ry, ext.w * k, ext.h * k);
  return { k, ox, oy };
}

const BIG = 600;
const stepFont = () =>
  (typeof document !== "undefined" &&
    getComputedStyle(document.documentElement).getPropertyValue("--font").trim()) ||
  "sans-serif";
const SPINE_GOLD = "#D99A1E";

/**
 * Obsidian-like: plain dots, thin links, labels that fade in with zoom; hovering lights up a
 * node's links and neighbors (with their labels) and dims the rest.
 */
function style(
  t: GraphTheme,
  big: boolean,
  d: GraphDisplay,
  labels: number,
  boxes: boolean,
): cytoscape.StylesheetJson {
  const font =
    (typeof document !== "undefined" &&
      getComputedStyle(document.documentElement).getPropertyValue("--font").trim()) ||
    "sans-serif";
  const node: cytoscape.StylesheetJson = boxes
    ? [
        {
          // a rounded box with the name inside, filled with a tint of its color
          selector: "node",
          style: {
            shape: "round-rectangle",
            "corner-radius": "7",
            "background-color": "data(fill)",
            width: "data(w)",
            height: "data(h)",
            label: "data(label)",
            "font-family": font,
            "font-size": "data(fs)",
            "font-weight": 500,
            color: t.fg,
            "text-valign": "center",
            "text-halign": "center",
            "min-zoomed-font-size": big ? 8 : 4,
            "border-width": 1.5,
            "border-color": "data(color)",
            "transition-property": "opacity",
            "transition-duration": 120,
          },
        },
        { selector: "node[ring]", style: { "border-width": 2, "border-color": "data(ring)" } },
        { selector: ".faded", style: { opacity: 0.15 } },
        { selector: "node.lit", style: { "z-index": 10 } },
        { selector: "node.hl", style: { "z-index": 11 } },
      ]
    : [];
  if (boxes) return [...node, ...edgeAndStateRules(t, d, true)];
  return [
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        width: "data(size)",
        height: "data(size)",
        label: "data(label)",
        "font-size": 9,
        color: t.muted,
        "text-opacity": labels,
        "text-valign": "bottom",
        "text-margin-y": 4,
        "text-max-width": "140px",
        "text-wrap": "ellipsis",
        // large graphs skip drawing tiny labels at all
        "min-zoomed-font-size": big ? 9 : 5,
        "border-width": 0,
        "transition-property": "opacity, text-opacity",
        "transition-duration": 120,
      },
    },
    ...edgeAndStateRules(t, d, false),
  ];
}

/** Links, and the hover/selection states shared by boxes and dots. */
function edgeAndStateRules(
  t: GraphTheme,
  d: GraphDisplay,
  boxes: boolean,
): cytoscape.StylesheetJson {
  return [
    {
      selector: "edge",
      style: {
        width: d.linkWidth,
        "line-color": t.edge,
        "target-arrow-color": t.edge,
        "target-arrow-shape": d.arrows ? "triangle" : "none",
        "arrow-scale": 0.6,
        "curve-style": "straight",
        opacity: 0.55,
        "transition-property": "opacity",
        "transition-duration": 120,
      },
    },
    // dots: rings, fading and hover (boxes set their own above)
    ...(boxes
      ? []
      : ([
          { selector: "node[ring]", style: { "border-width": 2.5, "border-color": "data(ring)" } },
          { selector: "node[spine]", style: { "background-color": t.spine ?? SPINE_GOLD } },
          { selector: ".faded", style: { opacity: 0.12, "text-opacity": 0 } },
          { selector: "node.lit", style: { "text-opacity": 1, color: t.fg, "z-index": 10 } },
          {
            selector: "node.hl",
            style: { "text-opacity": 1, color: t.fg, "font-size": 10, "z-index": 11 },
          },
        ] as cytoscape.StylesheetJson)),
    {
      selector: "edge.out",
      style: {
        "line-color": t.accent,
        "target-arrow-color": t.accent,
        width: Math.max(1.5, d.linkWidth * 1.8),
        opacity: 1,
        "z-index": 9,
      },
    },
    {
      selector: "edge.in",
      style: {
        "line-color": t.incoming,
        "target-arrow-color": t.incoming,
        width: Math.max(1.5, d.linkWidth * 1.8),
        opacity: 1,
        "z-index": 9,
      },
    },
    // no grey "pressed" box while clicking or dragging (Cytoscape's default); the outline shows it
    { selector: "node:active, edge:active", style: { "overlay-opacity": 0 } },
    // (the canvas itself: no grey circle when pressing the background; not in Cytoscape's types)
    {
      selector: "core",
      style: { "active-bg-opacity": 0, "selection-box-opacity": 0 },
    } as unknown as cytoscape.StylesheetJsonBlock,
    // the border is the paper's read status; selection, hover and focus draw an outline around it
    {
      selector: "node:childless.hl",
      style: {
        "outline-width": 2,
        "outline-color": t.accent,
        "outline-offset": 2,
        "outline-style": "solid",
        "outline-opacity": 0.7,
      },
    },
    {
      selector: "node:childless.selected",
      style: {
        "outline-width": 3,
        "outline-color": t.accent,
        "outline-offset": 2,
        "outline-style": "solid",
        "outline-opacity": 1,
        "text-opacity": 1,
      },
    },
    {
      selector: "node:childless.kbd",
      style: {
        "outline-width": 3,
        "outline-color": t.accent,
        "outline-offset": 3,
        "outline-style": "dashed",
        "outline-opacity": 1,
      },
    },
    {
      // typed connections: their own color and label, curved so they don't hide a citation
      selector: "edge.rel",
      style: {
        "line-color": "data(color)",
        "target-arrow-color": "data(color)",
        "target-arrow-shape": "triangle",
        width: Math.max(1.8, d.linkWidth * 1.8),
        opacity: 0.95,
        "curve-style": "bezier",
        "control-point-step-size": 36,
        label: "data(label)",
        "font-size": 9,
        "font-weight": 600,
        color: "data(color)",
        "text-rotation": "autorotate",
        "text-background-color": t.bg,
        "text-background-opacity": 0.9,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "min-zoomed-font-size": 7,
        "z-index": 8,
      },
    },
    {
      selector: "edge.rel.out, edge.rel.in",
      style: {
        "line-color": "data(color)",
        "target-arrow-color": "data(color)",
        width: Math.max(2.5, d.linkWidth * 2.4),
      },
    },
    { selector: "node.ghost", style: { width: 1, height: 1, opacity: 0, label: "" } },
    {
      selector: "edge.ghost",
      style: {
        "line-color": t.accent,
        "target-arrow-color": t.accent,
        "target-arrow-shape": "triangle",
        "line-style": "dashed",
        width: 2,
        opacity: 1,
        "curve-style": "straight",
      },
    },
    {
      selector: "node.connect-target",
      style: {
        "outline-width": 3,
        "outline-color": t.accent,
        "outline-offset": 2,
        "outline-style": "solid",
      },
    },
    // the spine: amber boxes (fill from the caller) numbered by step; the border stays the status
    { selector: "node[spine]", style: { "font-weight": 700, color: t.spineText ?? t.fg } },
    { selector: "node[spine][ring]", style: { "border-width": 2.5 } },
    {
      // Circle: a project's name outside its arc; text only, never clicked or counted
      selector: "node.arc-label",
      style: {
        width: 1,
        height: 1,
        "background-opacity": 0,
        "border-width": 0,
        "overlay-opacity": 0,
        events: "no",
        label: "data(label)",
        color: "data(color)",
        "font-size": 13,
        "font-weight": 700,
        "font-family": stepFont(),
        "text-valign": "center",
        "text-halign": "data(halign)" as "center",
        "text-outline-color": t.bg,
        "text-outline-width": 3,
        "text-max-width": "180px",
        "text-wrap": "ellipsis",
      },
    },
    {
      // Tree: each step is a box around its papers, named at its top left
      selector: "node.step",
      style: {
        shape: "round-rectangle",
        "corner-radius": "10",
        "background-color": t.spine ?? SPINE_GOLD,
        "background-opacity": 0.08,
        "border-width": 1.5,
        "border-style": "dashed",
        "border-color": t.spine ?? SPINE_GOLD,
        padding: "10px",
        label: "data(label)",
        "font-size": 12,
        "font-weight": 700,
        "font-family": stepFont(),
        "text-wrap": "none",
        "text-max-width": "600px",
        color: t.spine ?? SPINE_GOLD,
        // top right, clear of the path that runs down the middle
        "text-valign": "top",
        "text-halign": "right",
        "text-margin-x": -14,
        "text-margin-y": -2,
        "min-zoomed-font-size": 5,
        events: "no",
      },
    },
    {
      selector: "edge.spine",
      style: {
        "line-color": t.spine ?? SPINE_GOLD,
        "target-arrow-shape": "none",
        width: Math.max(3.5, d.linkWidth * 3),
        opacity: 0.75,
        "curve-style": "straight",
        "z-index": 7,
      },
    },
  ];
}

/**
 * Large graphs use a cached texture and hide edges while panning or zooming (Cytoscape only reads
 * these at creation), so the instance is recreated when the graph crosses the size threshold.
 */
/** Fit the graph, but never zoom in past 1.4x (small graphs would get giant labels). */
function fitCapped(cy: Core) {
  cy.fit(undefined, 30);
  if (cy.zoom() > 1.4) {
    cy.zoom(1.4);
    cy.center();
  }
}

/** Moves nodes to the simulation's positions (except one being dragged) and remembers them. */
function writePositions(cy: Core, nodes: SimNode[], last: Map<string, { x: number; y: number }>) {
  cy.batch(() => {
    for (const n of nodes) {
      const el = cy.getElementById(n.id);
      const at = { x: n.x ?? 0, y: n.y ?? 0 };
      last.set(n.id, at);
      if (el.nonempty() && !el.grabbed()) el.position(at);
    }
  });
}

/**
 * Where a live layout starts: nodes keep their last place; a new node starts next to a neighbor
 * that has one, else on a spiral around the middle (so the first frames aren't a pile).
 */
function startPositions(
  nodes: GraphNode[],
  edges: Edge[],
  last: Map<string, { x: number; y: number }>,
): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  const nbr = new Map<number, number[]>();
  for (const [a, b] of edges) {
    nbr.set(a, [...(nbr.get(a) ?? []), b]);
    nbr.set(b, [...(nbr.get(b) ?? []), a]);
  }
  for (const n of nodes) {
    const prev = last.get(String(n.id));
    if (prev) out.set(n.id, prev);
  }
  nodes.forEach((n, i) => {
    if (out.has(n.id)) return;
    const near = (nbr.get(n.id) ?? []).map((m) => out.get(m)).find(Boolean);
    if (near)
      return out.set(n.id, {
        x: near.x + (Math.random() - 0.5) * 40,
        y: near.y + (Math.random() - 0.5) * 40,
      });
    // a sunflower spiral: even spread, deterministic
    const r = 12 * Math.sqrt(i + 1);
    const a = i * 2.39996;
    out.set(n.id, { x: r * Math.cos(a), y: r * Math.sin(a) });
  });
  return out;
}

export function CitationGraph(p: CitationGraphProps) {
  const big = p.nodes.length > BIG;
  return <GraphInstance key={big ? "big" : "small"} {...p} big={big} />;
}

function GraphInstance(p: CitationGraphProps & { big: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const latest = useRef(p);
  latest.current = p;
  const shapeKey = useRef("");
  const layoutMs = useRef(0);
  const sim = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodes = useRef(new Map<string, SimNode>());
  /** Where nodes were last, so a rebuilt graph (a filter changed) doesn't jump around. */
  const lastPos = useRef(new Map<string, { x: number; y: number }>());
  const moving = useRef(false);
  /** The user panned or zoomed: stop fitting the view as the layout settles. */
  const userMoved = useRef(false);
  const labels = useRef(1);
  const display = () => latest.current.display ?? DEFAULT_DISPLAY;
  const restyle = () =>
    cyRef.current?.style(
      style(
        latest.current.theme,
        latest.current.big,
        display(),
        labels.current,
        latest.current.nodeStyle !== "dots",
      ),
    );
  const mini = useRef<HTMLCanvasElement>(null);
  const miniXf = useRef<{ k: number; ox: number; oy: number } | null>(null);
  const miniFrame = useRef(0);
  const redrawMini = () => {
    if (miniFrame.current) return;
    miniFrame.current = requestAnimationFrame(() => {
      miniFrame.current = 0;
      const cy = cyRef.current;
      if (cy && mini.current) miniXf.current = drawMinimap(cy, mini.current, latest.current.theme);
    });
  };

  useEffect(() => {
    const cy = cytoscape({
      container: host.current,
      style: style(p.theme, p.big, p.display ?? DEFAULT_DISPLAY, 1, p.nodeStyle !== "dots"),
      minZoom: 0.05,
      maxZoom: 4,
      boxSelectionEnabled: false,
      autounselectify: true,
      pixelRatio: "auto",
      textureOnViewport: p.big,
      hideEdgesOnViewport: p.big,
    });
    cyRef.current = cy;
    // a fresh instance is empty, whatever the previous one held
    shapeKey.current = "";
    const box = (n: NodeSingular): Box => {
      const r = host.current?.getBoundingClientRect();
      const b = n.renderedBoundingBox({ includeLabels: false });
      return { left: (r?.left ?? 0) + b.x1, top: (r?.top ?? 0) + b.y1, width: b.w, height: b.h };
    };
    const highlight = (n: NodeSingular | null) => {
      cy.batch(() => {
        cy.elements().removeClass("faded hl out in lit");
        if (!n) return;
        // step boxes never fade: their opacity would carry over to the papers inside
        cy.elements().not(":parent").addClass("faded");
        n.closedNeighborhood().removeClass("faded");
        n.closedNeighborhood("node").addClass("lit");
        n.addClass("hl");
        n.outgoers("edge").addClass("out");
        n.incomers("edge").addClass("in");
      });
    };
    cy.on("mouseover", "node:childless", (e) => {
      highlight(e.target);
      latest.current.onHover(Number(e.target.id()), box(e.target));
    });
    cy.on("mouseout", "node:childless", () => {
      highlight(null);
      latest.current.onHover(null, null);
    });
    cy.on("tap", (e) => {
      if (e.target === cy) latest.current.onTap(null, null);
      else if (e.target.isNode?.() && e.target.isChildless())
        latest.current.onTap(Number(e.target.id()), box(e.target));
    });
    cy.on("dbltap", "node:childless", (e) => latest.current.onDoubleTap(Number(e.target.id())));
    // ⌥/Alt held: dragging from a node draws a dashed link; dropping it on another node connects
    let connectFrom: string | null = null;
    const altMode = (on: boolean) => {
      if (!latest.current.onConnect) return;
      cy.autoungrabify(on);
      cy.userPanningEnabled(!on);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Alt" && !connectFrom) altMode(e.type === "keydown");
    };
    const onBlur = () => altMode(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    const nodeAt = (pos: { x: number; y: number }) =>
      cy
        .nodes()
        .filter((n) => {
          if (n.hasClass("ghost") || n.isParent() || n.id() === connectFrom) return false;
          const b = n.boundingBox({ includeLabels: false });
          return pos.x >= b.x1 && pos.x <= b.x2 && pos.y >= b.y1 && pos.y <= b.y2;
        })
        .first();
    cy.on("tapstart", "node", (e) => {
      const oe = e.originalEvent as MouseEvent | undefined;
      if (!oe?.altKey || !latest.current.onConnect) return;
      altMode(true);
      connectFrom = e.target.id();
      cy.add([
        { group: "nodes", data: { id: "__ghost" }, position: { ...e.position }, classes: "ghost" },
        {
          group: "edges",
          data: { id: "__ghost_edge", source: connectFrom, target: "__ghost" },
          classes: "ghost",
        },
      ]);
    });
    cy.on("tapdrag", (e) => {
      if (!connectFrom) return;
      cy.getElementById("__ghost").position({ ...e.position });
      cy.nodes(".connect-target").removeClass("connect-target");
      nodeAt(e.position).addClass("connect-target");
    });
    cy.on("tapend", (e) => {
      if (!connectFrom) return;
      const from = connectFrom;
      const target = nodeAt(e.position);
      connectFrom = null;
      cy.remove("#__ghost");
      cy.nodes(".connect-target").removeClass("connect-target");
      altMode((e.originalEvent as MouseEvent | undefined)?.altKey ?? false);
      if (target.nonempty()) latest.current.onConnect?.(Number(from), Number(target.id()));
    });
    cy.on("viewport", () => {
      latest.current.onViewport?.();
      redrawMini();
      const o = labelOpacity(cy.zoom(), display().textFade);
      if (o !== labels.current) {
        labels.current = o;
        restyle();
      }
    });
    const touched = () => {
      userMoved.current = true;
    };
    host.current?.addEventListener("wheel", touched, { passive: true });
    // leaving the canvas quickly can skip the node's mouseout
    const left = () => {
      highlight(null);
      latest.current.onHover(null, null);
    };
    host.current?.addEventListener("mouseleave", left);
    host.current?.addEventListener("pointerdown", touched);
    // dragging a node pulls its neighbors along while the layout is live
    cy.on("grab", "node", (e) => {
      const n = simNodes.current.get(e.target.id());
      if (!n || !sim.current) return;
      const pos = e.target.position();
      n.fx = pos.x;
      n.fy = pos.y;
      sim.current.alphaTarget(0.25).restart();
      moving.current = true;
    });
    cy.on("drag", "node", (e) => {
      const n = simNodes.current.get(e.target.id());
      if (!n) return;
      const pos = e.target.position();
      n.fx = pos.x;
      n.fy = pos.y;
    });
    cy.on("free", "node", (e) => {
      const n = simNodes.current.get(e.target.id());
      if (!n || !sim.current) return;
      n.fx = null;
      n.fy = null;
      sim.current.alphaTarget(0);
    });
    cy.on("position", "node", redrawMini);
    // panes resize and tabs hide/show the graph; Cytoscape only measures its container on demand
    const ro = new ResizeObserver(() => {
      if (!host.current?.offsetWidth) return;
      cy.resize();
      redrawMini();
    });
    if (host.current) ro.observe(host.current);
    const api: GraphApi = {
      nodeBox: (id) => {
        const n = cy.getElementById(String(id));
        return n.nonempty() ? box(n as NodeSingular) : null;
      },
      center: (id) => {
        const n = cy.getElementById(String(id));
        if (n.nonempty()) cy.animate({ center: { eles: n }, duration: 200 });
      },
      fit: () => fitCapped(cy),
      focus: (id) => {
        cy.nodes().removeClass("kbd");
        const n = id === null ? null : (cy.getElementById(String(id)) as NodeSingular);
        if (n?.nonempty()) {
          n.addClass("kbd");
          const ext = cy.extent();
          const pos = n.position();
          if (pos.x < ext.x1 || pos.x > ext.x2 || pos.y < ext.y1 || pos.y > ext.y2) cy.center(n);
        }
        highlight(n?.nonempty() ? n : null);
      },
      nodeStyle: (id) => {
        const n = cy.getElementById(String(id));
        return n.nonempty()
          ? {
              color: n.data("color"),
              ring: n.data("ring") ?? null,
              shape: String(n.style("shape")),
              label: n.data("label"),
              spine: Boolean(n.data("spine")),
              x: n.position("x"),
              y: n.position("y"),
            }
          : null;
      },
      arcLabels: () => cy.nodes(".arc-label").map((n) => String(n.data("label"))),
      stats: () => ({
        nodes: cy.nodes(":childless").not(".ghost").not(".arc-label").length,
        edges: cy.edges().not(".rel, .ghost, .spine").length,
        relations: cy.edges(".rel").length,
        spine: cy.nodes("[spine]").length,
        layoutMs: layoutMs.current,
        moving: moving.current,
      }),
    };
    p.onReady?.(api);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      ro.disconnect();
      sim.current?.stop();
      sim.current = null;
      host.current?.removeEventListener("wheel", touched);
      host.current?.removeEventListener("pointerdown", touched);
      host.current?.removeEventListener("mouseleave", left);
      cancelAnimationFrame(miniFrame.current);
      miniFrame.current = 0;
      shapeKey.current = "";
      cyRef.current = null;
      cy.destroy();
    };
  }, []);

  useEffect(() => {
    restyle();
    redrawMini();
  }, [p.theme, p.display?.arrows, p.display?.linkWidth, p.nodeStyle]);

  // the fade threshold moved: labels may need to appear or vanish at the current zoom
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    labels.current = labelOpacity(cy.zoom(), display().textFade);
    restyle();
  }, [p.display?.textFade]);

  // forces changed: reheat the live layout so it settles into the new shape
  useEffect(() => {
    const s = sim.current;
    if (!s) return;
    applyForces(s, withRoom(p.forces ?? DEFAULT_FORCES, latest.current.nodeStyle), p.big);
    s.alpha(0.5).restart();
    moving.current = true;
  }, [p.forces, p.big]);

  // rebuild only when the node set, edges or layout change; otherwise patch data in place
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const shown = new Set(p.nodes.map((n) => n.id));
    // steps in view, numbered as on the spine (an emptied step keeps the others' numbers)
    const spine = (p.spine ?? [])
      .map((st, i) => ({ ...st, n: i + 1, items: st.items.filter((id) => shown.has(id)) }))
      .filter((st) => st.items.length);
    const stepOf = new Map(spine.flatMap((st) => st.items.map((id) => [id, st.n] as const)));
    const labelOf = (n: GraphNode) => {
      const st = stepOf.get(n.id);
      return st ? `${stepMark(st)} ${n.label}` : n.label;
    };
    const tree = p.layout === "tree";
    const key = `${p.layout}|${p.nodeStyle ?? "boxes"}|${spine.map((st) => `${st.label}:${st.items.join("+")}`).join(">")}|${p.nodes.map((n) => n.group ?? "").join(",")}|${(p.relations ?? []).map((r) => `${r.id}:${r.from}>${r.to}:${r.color}:${r.label}`).join(",")}|${p.nodes.map((n) => n.id).join(",")}|${p.edges.map((e) => e.join(">")).join(",")}`;
    if (key === shapeKey.current) {
      cy.batch(() => {
        for (const n of p.nodes)
          cy.getElementById(String(n.id)).data({
            label: labelOf(n),
            color: n.color,
            size: n.size,
            ring: n.ring ?? undefined,
            fill: n.fill ?? n.color,
            ...boxOf(labelOf(n), n.size, measureText),
          });
      });
      return;
    }
    shapeKey.current = key;
    const big = p.nodes.length > BIG;
    const t0 = performance.now();
    const t0Color = "#888";
    const ids = new Set(p.nodes.map((n) => n.id));
    sim.current?.stop();
    sim.current = null;
    moving.current = false;
    simNodes.current = new Map();
    const widthOf = (n: GraphNode) =>
      p.nodeStyle === "dots" ? n.size : boxOf(labelOf(n), n.size, measureText).w;
    const allLinks: Edge[] = [...p.edges, ...(p.relations ?? []).map((r): Edge => [r.from, r.to])];
    // the gold path: every paper of a step to every paper of the next (in the Tree, step box to
    // step box instead, so it runs straight down the trunk)
    const steps = spine.map((st) => st.items);
    const spineLinks: Edge[] = steps
      .slice(1)
      .flatMap((st, i) => steps[i].flatMap((a) => st.map((b): Edge => [a, b])));
    const stepId = (n: number) => `step:${n}`;
    const asLayout = () =>
      p.nodes.map((n) => ({ id: n.id, width: widthOf(n), year: n.year, group: n.group }));
    const pos =
      p.layout === "layered"
        ? layeredPositions(p.nodes, p.edges)
        : p.layout === "tree"
          ? treePositions(asLayout(), allLinks, steps)
          : p.layout === "circle"
            ? circlePositions(asLayout())
            : startPositions(p.nodes, p.edges, lastPos.current);
    // Circle: each project's arc is named outside the ring, in the project's colour
    const arcLabels =
      p.layout === "circle"
        ? circleGroupLabels(asLayout()).map((l) => ({
            group: "nodes" as const,
            classes: "arc-label",
            data: {
              id: `arc:${l.group}`,
              label: l.group,
              color: p.nodes.find((n) => n.group === l.group)?.color ?? t0Color,
              // text leans away from the ring: right half left-aligned, left half right-aligned
              halign:
                Math.cos(l.angle) > 0.2 ? "right" : Math.cos(l.angle) < -0.2 ? "left" : "center",
            },
            position: { x: l.x, y: l.y },
            selectable: false,
            grabbable: false,
          }))
        : [];
    const els: ElementDefinition[] = [
      ...arcLabels,
      ...(tree
        ? spine.map((st) => ({
            group: "nodes" as const,
            classes: "step",
            data: { id: stepId(st.n), label: st.label },
          }))
        : []),
      ...p.nodes.map((n) => ({
        group: "nodes" as const,
        data: {
          id: String(n.id),
          label: labelOf(n),
          color: n.color,
          size: n.size,
          fill: n.fill ?? n.color,
          ...boxOf(labelOf(n), n.size, measureText),
          ...(n.ring ? { ring: n.ring } : {}),
          ...(stepOf.has(n.id) ? { spine: 1 } : {}),
          ...(tree && stepOf.has(n.id) ? { parent: stepId(stepOf.get(n.id) as number) } : {}),
        },
        position: pos.get(n.id) ?? { x: 0, y: 0 },
      })),
      ...p.edges
        .filter(([a, b]) => ids.has(a) && ids.has(b))
        .map(([a, b]) => ({
          group: "edges" as const,
          data: { id: `${a}>${b}`, source: String(a), target: String(b) },
        })),
      ...(p.relations ?? [])
        .filter((r) => ids.has(r.from) && ids.has(r.to))
        .map((r) => ({
          group: "edges" as const,
          classes: "rel",
          data: {
            id: `rel${r.id}`,
            source: String(r.from),
            target: String(r.to),
            color: r.color,
            label: r.label,
          },
        })),
      ...(tree
        ? spine.slice(1).map((st, i) => ({
            group: "edges" as const,
            classes: "spine",
            data: {
              id: `spine${spine[i].n}>${st.n}`,
              source: stepId(spine[i].n),
              target: stepId(st.n),
            },
          }))
        : spineLinks.map(([a, b]) => ({
            group: "edges" as const,
            classes: "spine",
            data: { id: `spine${a}>${b}`, source: String(a), target: String(b) },
          }))),
    ];
    cy.batch(() => {
      cy.elements().remove();
      cy.add(els);
    });
    if (p.layout === "force") {
      const nodes: SimNode[] = p.nodes.map((n) => {
        const at = pos.get(n.id) ?? { x: 0, y: 0 };
        // boxes collide about where their sides are; dots by their radius
        const r = p.nodeStyle === "dots" ? n.size / 2 : widthOf(n) * 0.42;
        return { id: String(n.id), x: at.x, y: at.y, r, degree: 0 };
      });
      for (const n of nodes) simNodes.current.set(n.id, n);
      const links: SimLink[] = [...allLinks, ...spineLinks]
        .filter(([a, b]) => ids.has(a) && ids.has(b))
        .map(([a, b]) => ({ source: String(a), target: String(b) }));
      for (const l of links) {
        const a = simNodes.current.get(l.source as string);
        const b = simNodes.current.get(l.target as string);
        if (a) a.degree++;
        if (b) b.degree++;
      }
      const s = forceSimulation<SimNode, SimLink>(nodes)
        .force(
          "link",
          forceLink<SimNode, SimLink>(links).id((d) => d.id),
        )
        .alphaDecay(big ? 0.045 : 0.025)
        .velocityDecay(0.35)
        .stop();
      if (!big)
        s.force(
          "collide",
          forceCollide<SimNode>((d) => d.r + 3),
        );
      applyForces(s, withRoom(p.forces ?? DEFAULT_FORCES, p.nodeStyle), big);
      // settle most of the way before the first frame; the rest happens live
      const reused =
        nodes.filter((n) => lastPos.current.has(n.id)).length / Math.max(nodes.length, 1);
      s.alpha(reused > 0.8 ? 0.3 : 1);
      s.tick(big ? 90 : reused > 0.8 ? 10 : 80);
      writePositions(cy, nodes, lastPos.current);
      sim.current = s;
      moving.current = true;
      userMoved.current = false;
      let frame = 0;
      s.on("tick", () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (sim.current !== s) return;
          writePositions(cy, nodes, lastPos.current);
          redrawMini();
        });
      });
      s.on("end", () => {
        moving.current = false;
        writePositions(cy, nodes, lastPos.current);
        if (!userMoved.current) fitCapped(cy);
        redrawMini();
      });
      s.restart();
    }
    fitCapped(cy);
    layoutMs.current = Math.round(performance.now() - t0);
    redrawMini();
  }, [p.nodes, p.edges, p.layout, p.spine]);

  useEffect(() => {
    if (p.minimap) redrawMini();
  }, [p.minimap]);

  const panTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cy = cyRef.current;
    const xf = miniXf.current;
    if (!cy || !xf) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - r.left - xf.ox) / xf.k;
    const my = (e.clientY - r.top - xf.oy) / xf.k;
    const z = cy.zoom();
    cy.pan({ x: cy.width() / 2 - mx * z, y: cy.height() / 2 - my * z });
  };

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("selected");
    if (p.selectedId !== null) cy.getElementById(String(p.selectedId)).addClass("selected");
  }, [p.selectedId, p.nodes]);

  return (
    <>
      <div
        ref={host}
        className="cg-canvas"
        role="img"
        aria-label={p.ariaLabel ?? "Citation graph"}
      />
      {p.minimap && (
        <canvas
          ref={mini}
          className="cg-minimap"
          style={{ width: MINI_W, height: MINI_H }}
          aria-label={p.minimapLabel ?? "Overview"}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            panTo(e);
          }}
          onPointerMove={(e) => e.buttons & 1 && panTo(e)}
        />
      )}
    </>
  );
}
