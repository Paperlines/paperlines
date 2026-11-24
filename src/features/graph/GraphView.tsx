import type { ReadStatus, Relation, RelationType, SpineStep } from "@paperlines/backend-port";
import { CitationGraph, DEFAULT_FORCES, type Edge, type GraphApi } from "@paperlines/graph";
import { ChevronRight, Maximize2, Minimize2, Scan, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";
import { useCard } from "../../store/card";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useUi } from "../../store/ui";
import { useSpineVersion } from "../spine/store";
import { tagTree } from "../tags/tree";
import { useGraphColors } from "./colors";
import {
  buildGraphView,
  CIRCLE_BOXES_MAX,
  type ColorBy,
  type GraphOptions,
  type LabelBy,
} from "./model";

declare global {
  interface Window {
    /** Test hook in the browser build only (fake backend): node positions and timings. */
    __paperlinesGraph?: GraphApi;
  }
}

export function openPaperOrPdf(itemId: number) {
  const item = useLibrary.getState().items.find((i) => i.id === itemId);
  useCard.getState().close();
  if (item?.hasPdf) usePanes.getState().openPdf(itemId);
  else {
    useUi.getState().select(itemId);
    usePanes.getState().setDetailTab("note");
  }
}

/** A collapsible section of the settings panel (open state is remembered). */
function PanelSection(p: {
  id: keyof GraphOptions["sections"];
  title: string;
  o: GraphOptions;
  set(patch: Partial<GraphOptions>): void;
  children: React.ReactNode;
}) {
  const open = p.o.sections[p.id];
  return (
    <section className="panel-section">
      <button
        type="button"
        className="panel-head"
        aria-expanded={open}
        onClick={() => p.set({ sections: { ...p.o.sections, [p.id]: !open } })}
      >
        <ChevronRight size={13} aria-hidden="true" />
        {p.title}
      </button>
      {open && <div className="panel-body">{p.children}</div>}
    </section>
  );
}

function Slider(p: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange(v: number): void;
}) {
  return (
    <label className="panel-slider">
      <span>{p.label}</span>
      <input
        type="range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        aria-label={p.label}
        onChange={(e) => p.onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** What the fill and the ring mean: the projects in view, and the read statuses. */
function GraphLegend({
  nodes,
  options: o,
  spine,
  onHide,
}: {
  nodes: number[];
  options: GraphOptions;
  spine: boolean;
  onHide(): void;
}) {
  const { items, projects } = useLibrary();
  const shown = new Set(nodes);
  const inView = items.filter((i) => shown.has(i.id));
  const used = new Set(
    inView.map((i) => i.projectIds.find((id) => projects.some((p) => p.id === id))),
  );
  const listed = projects.filter((p) => used.has(p.id));
  const ring = o.statusRing && o.colorBy !== "status";
  if (!inView.length || (o.colorBy === "tag" && !ring && !spine)) return null;
  return (
    <div className="graph-legend" role="group" aria-label={t("graph.legend")}>
      <button
        type="button"
        className="lg-hide"
        aria-label={t("graph.legendHide")}
        title={t("graph.legendHide")}
        onClick={onHide}
      >
        <X size={12} aria-hidden="true" />
      </button>
      {o.colorBy === "status" && (
        <div className="lg-group">
          {(["unread", "reading", "read"] as const).map((s) => (
            <span key={s} className="lg-item">
              <i className="lg-dot" style={{ background: `var(--status-${s})` }} />
              {t(`status.${s}`)}
            </span>
          ))}
        </div>
      )}
      {o.colorBy === "project" && (
        <div className="lg-group">
          {listed.map((p) => (
            <span key={p.id} className="lg-item">
              <i className="lg-dot" style={{ background: `var(--tag-${p.color})` }} />
              {p.name}
            </span>
          ))}
          {used.has(undefined) && (
            <span className="lg-item">
              <i className="lg-dot lg-none" />
              {t("graph.noProject")}
            </span>
          )}
        </div>
      )}
      {spine && (
        <div className="lg-group">
          <span className="lg-item">
            <i className="lg-spine">1</i>
            {t("graph.spineLegend")}
          </span>
        </div>
      )}
      {ring && (
        <div className="lg-group">
          {(["unread", "reading", "read"] as const).map((s) => (
            <span key={s} className="lg-item">
              <i className="lg-ring" style={{ borderColor: `var(--status-${s})` }} />
              {t(`status.${s}`)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Opening settings widened the graph (it remounts when it moves), so closing them narrows it. */
let panelWidened = false;

export function GraphView() {
  const { items, tags, projects } = useLibrary();
  const selectedId = useUi((s) => s.selectedId);
  const { graph: o, setGraph, citationsVersion } = usePanes();
  const { layout, setLayout } = useUi();
  const graphWide = layout === "focus";
  const setGraphWide = (w: boolean) => setLayout(w ? "focus" : "split");
  const { palette, theme } = useGraphColors();
  const [edges, setEdges] = useState<Edge[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [relationTypes, setRelationTypes] = useState<RelationType[]>([]);
  const [spine, setSpine] = useState<SpineStep[]>([]);
  const spineVersion = useSpineVersion((s) => s.version);
  const spineProject = o.spineProjectId ?? o.projectId;
  const api = useRef<GraphApi | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    backend.graphEdges().then(setEdges);
    backend.allRelations().then(setRelations);
    backend.relationTypes().then(setRelationTypes);
  }, [citationsVersion, items]);

  useEffect(() => {
    if (spineProject === null || !projects.some((p) => p.id === spineProject)) {
      setSpine([]);
      return;
    }
    let live = true;
    backend.spineGet(spineProject).then((s) => live && setSpine(s));
    return () => {
      live = false;
    };
  }, [spineProject, spineVersion, items, projects]);

  const view = useMemo(
    () =>
      buildGraphView(
        items,
        edges,
        tags,
        projects,
        o,
        selectedId,
        palette,
        relations,
        relationTypes,
        spine,
      ),
    [items, edges, tags, projects, o, selectedId, palette, relations, relationTypes, spine],
  );
  const spineCount = view.spine.reduce((s, st) => s + st.items.length, 0);
  // step names as the Tree shows them: "Step 2 · Origins"
  const spineView = useMemo(
    () =>
      view.spine.map((st, i) => ({
        items: st.items,
        label: st.label
          ? t("spine.stepNamed", { n: i + 1, name: st.label })
          : t("spine.stepN", { n: i + 1 }),
      })),
    [view.spine],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const ordered = useMemo(
    () =>
      [...view.nodes].sort(
        (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.label.localeCompare(b.label),
      ),
    [view.nodes],
  );

  const onReady = useCallback((a: GraphApi) => {
    api.current = a;
    if (!("__TAURI_INTERNALS__" in window)) window.__paperlinesGraph = a;
  }, []);

  // keep a graph-anchored card attached to its node while panning and zooming
  const onViewport = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const c = useCard.getState();
      if (c.origin === "graph" && c.itemId !== null)
        c.reanchor(api.current?.nodeBox(c.itemId) ?? null);
    });
  }, []);

  useEffect(
    () => () => {
      if (useCard.getState().origin === "graph") useCard.getState().close();
    },
    [],
  );

  const set = (patch: Partial<GraphOptions>) => setGraph(patch);
  // settings sit beside the graph; in a narrow pane, opening them widens the graph first
  const viewEl = useRef<HTMLDivElement>(null);
  const togglePanel = (open: boolean) => {
    if (open && !graphWide && (viewEl.current?.offsetWidth ?? 1000) < 640) {
      panelWidened = true;
      setGraphWide(true);
    }
    if (!open && panelWidened) {
      panelWidened = false;
      setGraphWide(false);
    }
    set({ panelOpen: open });
  };
  const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

  return (
    <div ref={viewEl} className={`graph-view${o.panelOpen ? " panel-open" : ""}`}>
      <div className="graph-hud" role="toolbar" aria-label={t("graph.title")}>
        <span className="graph-count" role="status">
          {t("graph.count", { n: view.nodes.length, e: view.edges.length })}
          {spineCount > 0 && ` · ${t("graph.countSpine", { n: spineCount })}`}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="icon-btn"
          title={t("graph.fit")}
          aria-label={t("graph.fit")}
          onClick={() => api.current?.fit()}
        >
          <Scan size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={graphWide}
          title={graphWide ? t("graph.narrow") : t("graph.wide")}
          aria-label={graphWide ? t("graph.narrow") : t("graph.wide")}
          onClick={() => setGraphWide(!graphWide)}
        >
          {graphWide ? (
            <Minimize2 size={15} aria-hidden="true" />
          ) : (
            <Maximize2 size={15} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={`icon-btn${o.panelOpen ? " on" : ""}`}
          aria-expanded={o.panelOpen}
          aria-controls="graph-settings"
          title={t("graph.settings")}
          aria-label={t("graph.settings")}
          onClick={() => togglePanel(!o.panelOpen)}
        >
          <Settings2 size={15} aria-hidden="true" />
        </button>
      </div>
      {o.panelOpen && (
        <aside id="graph-settings" className="graph-panel" aria-label={t("graph.settings")}>
          <div className="panel-title">
            <strong>{t("graph.settings")}</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label={t("graph.settingsClose")}
              title={t("graph.settingsClose")}
              onClick={() => togglePanel(false)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <PanelSection id="filters" title={t("graph.s.filters")} o={o} set={set}>
            <input
              className="input"
              type="search"
              placeholder={t("graph.search")}
              aria-label={t("graph.search")}
              value={o.search}
              onChange={(e) => set({ search: e.target.value })}
            />
            <div className="panel-row panel-links">
              <label className="check inline-check">
                <input
                  type="checkbox"
                  checked={o.showCitations}
                  onChange={(e) => set({ showCitations: e.target.checked })}
                />
                {t("graph.showCitations")}
              </label>
              <label className="check inline-check">
                <input
                  type="checkbox"
                  checked={o.showRelations}
                  onChange={(e) => set({ showRelations: e.target.checked })}
                />
                {t("graph.showConnections")}
              </label>
            </div>
            {o.showRelations && relationTypes.length > 0 && (
              <div className="panel-types" role="group" aria-label={t("graph.showConnections")}>
                {relationTypes.map((ty) => {
                  const on = !o.hiddenRelationTypes.includes(ty.id);
                  return (
                    <button
                      key={ty.id}
                      type="button"
                      aria-pressed={on}
                      className={`type-chip${on ? " on" : ""}`}
                      style={{ "--chip": `var(--tag-${ty.color})` } as React.CSSProperties}
                      onClick={() =>
                        set({
                          hiddenRelationTypes: on
                            ? [...o.hiddenRelationTypes, ty.id]
                            : o.hiddenRelationTypes.filter((x) => x !== ty.id),
                        })
                      }
                    >
                      {ty.label}
                    </button>
                  );
                })}
              </div>
            )}
            <span className="muted small">{t("graph.connectHint")}</span>
            <label className="check inline-check">
              <input
                type="checkbox"
                checked={o.showIsolated}
                onChange={(e) => set({ showIsolated: e.target.checked })}
              />
              {t("graph.isolated")}
            </label>
            <div className="panel-row">
              <span>{t("graph.years")}</span>
              <input
                className="input input-year"
                aria-label={t("graph.yearFrom")}
                placeholder="1990"
                defaultValue={o.yearMin ?? ""}
                onBlur={(e) => set({ yearMin: num(e.target.value) })}
              />
              –
              <input
                className="input input-year"
                aria-label={t("graph.yearTo")}
                placeholder="2026"
                defaultValue={o.yearMax ?? ""}
                onBlur={(e) => set({ yearMax: num(e.target.value) })}
              />
            </div>
            <select
              className="select"
              aria-label={t("sidebar.tags")}
              value={o.tag ?? ""}
              onChange={(e) => set({ tag: e.target.value || null })}
            >
              <option value="">{t("graph.anyTag")}</option>
              {tagTree(tags).map((n) => (
                <option key={n.path} value={n.path}>
                  {"  ".repeat(n.depth)}
                  {n.name}
                </option>
              ))}
            </select>
            <select
              className="select"
              aria-label={t("sidebar.projects")}
              value={o.projectId ?? ""}
              onChange={(e) => set({ projectId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">{t("graph.anyProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="select"
              aria-label={t("detail.status")}
              value={o.status ?? ""}
              onChange={(e) => set({ status: (e.target.value || null) as ReadStatus | null })}
            >
              <option value="">{t("graph.anyStatus")}</option>
              {(["unread", "reading", "read"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
            <label className="check inline-check">
              <input
                type="checkbox"
                checked={o.focus}
                disabled={selectedId === null}
                onChange={(e) => set({ focus: e.target.checked })}
              />
              {t("graph.focus")}
            </label>
            {o.focus && (
              <div className="panel-row">
                <select
                  className="select"
                  aria-label={t("graph.depth")}
                  value={o.depth}
                  onChange={(e) => set({ depth: Number(e.target.value) as 1 | 2 })}
                >
                  <option value={1}>{t("graph.depth1")}</option>
                  <option value={2}>{t("graph.depth2")}</option>
                </select>
                <select
                  className="select"
                  aria-label={t("graph.direction")}
                  value={o.direction}
                  onChange={(e) => set({ direction: e.target.value as GraphOptions["direction"] })}
                >
                  <option value="both">{t("graph.dir.both")}</option>
                  <option value="cites">{t("citations.cites")}</option>
                  <option value="citedBy">{t("citations.citedBy")}</option>
                </select>
              </div>
            )}
          </PanelSection>
          <PanelSection id="groups" title={t("graph.s.groups")} o={o} set={set}>
            <label className="panel-row">
              <span>{t("graph.colorBy")}</span>
              <select
                className="select"
                value={o.colorBy}
                onChange={(e) => set({ colorBy: e.target.value as ColorBy })}
              >
                <option value="status">{t("graph.color.status")}</option>
                <option value="tag">{t("graph.color.tag")}</option>
                <option value="project">{t("graph.color.project")}</option>
              </select>
            </label>
            {o.colorBy !== "status" && (
              <label className="check inline-check">
                <input
                  type="checkbox"
                  checked={o.statusRing}
                  onChange={(e) => set({ statusRing: e.target.checked })}
                />
                {t("graph.statusRing")}
              </label>
            )}
            <label className="panel-row">
              <span>{t("graph.spine")}</span>
              <select
                className="select"
                value={o.spineProjectId ?? ""}
                onChange={(e) =>
                  set({ spineProjectId: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">{t("graph.spineFollow")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </PanelSection>
          <PanelSection id="display" title={t("graph.s.display")} o={o} set={set}>
            <div className="segmented" role="group" aria-label={t("graph.layout")}>
              {(["force", "layered", "tree", "circle"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={o.layout === l}
                  className={o.layout === l ? "on" : ""}
                  onClick={() => set({ layout: l })}
                >
                  {t(`graph.layout.${l}`)}
                </button>
              ))}
            </div>
            <div className="panel-row">
              <span>{t("graph.nodeStyle")}</span>
              <div className="segmented" role="group" aria-label={t("graph.nodeStyle")}>
                {(["boxes", "dots"] as const).map((ns) => (
                  <button
                    key={ns}
                    type="button"
                    aria-pressed={o.nodeStyle === ns}
                    className={o.nodeStyle === ns ? "on" : ""}
                    onClick={() => set({ nodeStyle: ns })}
                  >
                    {t(`graph.nodeStyle.${ns}`)}
                  </button>
                ))}
              </div>
            </div>
            <label className="panel-row">
              <span>{t("graph.label")}</span>
              <select
                className="select"
                value={o.labelBy}
                onChange={(e) => set({ labelBy: e.target.value as LabelBy })}
              >
                <option value="authorYear">{t("graph.labelAuthorYear")}</option>
                <option value="citekey">{t("detail.citekey")}</option>
                <option value="title">{t("graph.shortTitle")}</option>
              </select>
            </label>
            <label className="check inline-check">
              <input
                type="checkbox"
                checked={o.display.arrows}
                onChange={(e) => set({ display: { ...o.display, arrows: e.target.checked } })}
              />
              {t("graph.arrows")}
            </label>
            {o.nodeStyle === "dots" && (
              <Slider
                label={t("graph.textFade")}
                min={-2}
                max={2}
                step={0.1}
                value={o.display.textFade}
                onChange={(v) => set({ display: { ...o.display, textFade: v } })}
              />
            )}
            <Slider
              label={t("graph.nodeSize")}
              min={0.4}
              max={2.5}
              step={0.05}
              value={o.nodeScale}
              onChange={(v) => set({ nodeScale: v })}
            />
            <Slider
              label={t("graph.linkWidth")}
              min={0.3}
              max={4}
              step={0.1}
              value={o.display.linkWidth}
              onChange={(v) => set({ display: { ...o.display, linkWidth: v } })}
            />
            <label className="check inline-check">
              <input
                type="checkbox"
                checked={o.minimap}
                onChange={(e) => set({ minimap: e.target.checked })}
              />
              {t("graph.minimap")}
            </label>
          </PanelSection>
          {o.layout === "force" && (
            <PanelSection id="forces" title={t("graph.s.forces")} o={o} set={set}>
              <Slider
                label={t("graph.f.center")}
                min={0}
                max={1}
                step={0.01}
                value={o.forces.center}
                onChange={(v) => set({ forces: { ...o.forces, center: v } })}
              />
              <Slider
                label={t("graph.f.repel")}
                min={0}
                max={1}
                step={0.01}
                value={o.forces.repel}
                onChange={(v) => set({ forces: { ...o.forces, repel: v } })}
              />
              <Slider
                label={t("graph.f.link")}
                min={0}
                max={1}
                step={0.01}
                value={o.forces.link}
                onChange={(v) => set({ forces: { ...o.forces, link: v } })}
              />
              <Slider
                label={t("graph.f.distance")}
                min={20}
                max={400}
                step={1}
                value={o.forces.distance}
                onChange={(v) => set({ forces: { ...o.forces, distance: v } })}
              />
              <button
                type="button"
                className="nav-link"
                onClick={() => set({ forces: DEFAULT_FORCES })}
              >
                {t("graph.f.reset")}
              </button>
            </PanelSection>
          )}
        </aside>
      )}
      <div className="graph-area">
        {o.legend ? (
          <GraphLegend
            nodes={view.nodes.map((n) => n.id)}
            options={o}
            spine={view.spine.some((st) => st.items.length > 0)}
            onHide={() => set({ legend: false })}
          />
        ) : (
          <button type="button" className="lg-show" onClick={() => set({ legend: true })}>
            {t("graph.legend")}
          </button>
        )}
        <CitationGraph
          nodes={view.nodes}
          edges={view.edges}
          layout={o.layout}
          spine={spineView}
          selectedId={selectedId}
          theme={theme}
          ariaLabel={t("graph.aria", { n: view.nodes.length })}
          onReady={onReady}
          onViewport={onViewport}
          minimap={o.minimap}
          minimapLabel={t("graph.minimapAria")}
          display={o.display}
          forces={o.forces}
          nodeStyle={
            o.layout === "circle" && view.nodes.length > CIRCLE_BOXES_MAX ? "dots" : o.nodeStyle
          }
          relations={view.relations}
          onConnect={(from, to) => useDialogs.getState().show("connection", { from, to })}
          onHover={(id, box) =>
            id !== null && box
              ? useCard.getState().hoverStart(id, box, "graph")
              : useCard.getState().hoverEnd()
          }
          onTap={(id, box) => {
            if (id === null || !box) {
              if (useCard.getState().origin === "graph") useCard.getState().close();
              return;
            }
            useUi.getState().select(id);
            useCard.getState().pin(id, box, "graph");
          }}
          onDoubleTap={openPaperOrPdf}
        />
        {view.nodes.length === 0 && (
          <div className="graph-empty">
            <strong>{t("graph.empty")}</strong>
            <span className="muted small">{t("graph.emptyHint")}</span>
          </div>
        )}
        <ul className="sr-nodes" aria-label={t("graph.nodesList")}>
          {ordered.map((n) => {
            const item = byId.get(n.id);
            if (!item) return null;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  data-node={n.id}
                  aria-label={t("graph.nodeLabel", {
                    title: item.title,
                    year: item.year ?? "?",
                    cites: view.cites.get(n.id) ?? 0,
                    citedBy: view.citedBy.get(n.id) ?? 0,
                  })}
                  onFocus={() => {
                    api.current?.focus(n.id);
                    requestAnimationFrame(() => {
                      const box = api.current?.nodeBox(n.id);
                      if (box) useCard.getState().show(n.id, box, "graph");
                    });
                  }}
                  onBlur={() => {
                    api.current?.focus(null);
                    if (!useCard.getState().pinned) useCard.getState().close();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      openPaperOrPdf(n.id);
                    } else if (e.key === " ") {
                      e.preventDefault();
                      const box = api.current?.nodeBox(n.id);
                      if (box) useCard.getState().pin(n.id, box, "graph");
                    }
                  }}
                >
                  {item.title}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
