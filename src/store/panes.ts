import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_GRAPH_OPTIONS, type GraphOptions } from "../features/graph/model";

export type Tab =
  | { kind: "reader"; itemId: number }
  | { kind: "note"; noteId: number }
  | { kind: "graph" }
  /** Papers anywhere that cite a library paper. */
  | { kind: "citing"; itemId: number };
export type RightPane = Tab | null;
export type DetailTab = "note" | "citations" | "highlights" | "info";

const MAX_TABS = 8;

interface PanesState {
  /** Open tabs in the right pane (PDFs, notes, the graph), like editor tabs. */
  tabs: Tab[];
  active: number;
  /** The active tab, or null when none is open. */
  right: RightPane;
  graphWide: boolean;
  graph: GraphOptions;
  detailTab: DetailTab;
  /** Scroll request for the reader; `nonce` makes repeated requests distinct. */
  readerFocus: { itemId: number; page: number; highlightId?: number; nonce: number } | null;
  /** Bumped whenever notes change elsewhere so open note views reload. */
  notesVersion: number;
  /** Bumped when citation edges change. */
  citationsVersion: number;
  openPdf(itemId: number, focus?: { page: number; highlightId?: number }): void;
  openNote(noteId: number): void;
  openGraph(): void;
  openCiting(itemId: number): void;
  activate(index: number): void;
  closeTab(index: number): void;
  /** Keeps only this tab (and makes it the active one). */
  closeOtherTabs(index: number): void;
  /** Closes the tabs after this one. */
  closeTabsToRight(index: number): void;
  closeAllTabs(): void;
  /** Closes the active tab. */
  closeRight(): void;
  /** Goes to the graph tab (from a PDF opened in the graph). */
  goBack(): void;
  setGraphWide(wide: boolean): void;
  setGraph(patch: Partial<GraphOptions>): void;
  setDetailTab(t: DetailTab): void;
  notesChanged(): void;
  citationsChanged(): void;
}

const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
});

const same = (a: Tab, b: Tab) =>
  a.kind === b.kind &&
  (a.kind !== "reader" || a.itemId === (b as { itemId: number }).itemId) &&
  (a.kind !== "note" || a.noteId === (b as { noteId: number }).noteId) &&
  (a.kind !== "citing" || a.itemId === (b as { itemId: number }).itemId);

export const usePanes = create<PanesState>()(
  persist(
    (set, get) => {
      const view = (tabs: Tab[], active: number) => ({ tabs, active, right: tabs[active] ?? null });
      const open = (t: Tab, extra: Partial<PanesState> = {}) => {
        const { tabs } = get();
        const i = tabs.findIndex((x) => same(x, t));
        if (i >= 0) return set({ ...view(tabs, i), ...extra });
        let next = [...tabs, t];
        if (next.length > MAX_TABS) next = next.slice(next.length - MAX_TABS);
        set({ ...view(next, next.length - 1), ...extra });
      };
      return {
        tabs: [],
        active: -1,
        right: null,
        graphWide: false,
        graph: DEFAULT_GRAPH_OPTIONS,
        detailTab: "info",
        readerFocus: null,
        notesVersion: 0,
        citationsVersion: 0,
        openPdf: (itemId, focus) =>
          open(
            { kind: "reader", itemId },
            { readerFocus: focus ? { ...focus, itemId, nonce: Date.now() } : get().readerFocus },
          ),
        openNote: (noteId) => open({ kind: "note", noteId }),
        openGraph: () => open({ kind: "graph" }),
        openCiting: (itemId) => open({ kind: "citing", itemId }),
        activate: (i) => set(view(get().tabs, i)),
        closeTab: (i) => {
          const tabs = get().tabs.filter((_, n) => n !== i);
          const active = Math.min(
            get().active >= i ? get().active - 1 : get().active,
            tabs.length - 1,
          );
          set(view(tabs, Math.max(active, tabs.length ? 0 : -1)));
        },
        closeOtherTabs: (i) => {
          const t = get().tabs[i];
          if (t) set(view([t], 0));
        },
        closeTabsToRight: (i) => {
          const tabs = get().tabs.slice(0, i + 1);
          set(view(tabs, Math.min(get().active, tabs.length - 1)));
        },
        closeAllTabs: () => set(view([], -1)),
        closeRight: () => get().closeTab(get().active),
        goBack: () => {
          const i = get().tabs.findIndex((t) => t.kind === "graph");
          if (i >= 0) set(view(get().tabs, i));
        },
        setGraphWide: (graphWide) => set({ graphWide }),
        setGraph: (patch) => set({ graph: { ...get().graph, ...patch } }),
        setDetailTab: (detailTab) => set({ detailTab }),
        notesChanged: () => set({ notesVersion: get().notesVersion + 1 }),
        citationsChanged: () => set({ citationsVersion: get().citationsVersion + 1 }),
      };
    },
    {
      name: "panes",
      version: 5,
      storage: safeStorage,
      partialize: ({ tabs, active, detailTab, graphWide, graph }) => ({
        tabs,
        active,
        detailTab,
        graphWide,
        graph,
      }),
      migrate: (persisted, version) => {
        if (version < 2) return {};
        const p = (persisted ?? {}) as Partial<PanesState>;
        // v3: graphs color by project with a read-status ring and show every paper
        if (version < 3 && p.graph)
          p.graph = { ...p.graph, colorBy: "project", showIsolated: true, statusRing: true };
        // v4: the live, Obsidian-like force layout is the default
        if (version < 4 && p.graph) p.graph = { ...p.graph, layout: "force" };
        // v5: papers as rounded boxes labelled "Smith ’21"
        if (version < 5 && p.graph)
          p.graph = { ...p.graph, labelBy: "authorYear", nodeStyle: "boxes" };
        return p as PanesState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PanesState>;
        const tabs = Array.isArray(p.tabs) ? p.tabs : [];
        const active =
          typeof p.active === "number" && p.active < tabs.length ? p.active : tabs.length - 1;
        return {
          ...current,
          ...p,
          tabs,
          active,
          right: tabs[active] ?? null,
          graph: {
            ...DEFAULT_GRAPH_OPTIONS,
            ...(p.graph ?? {}),
            // nested settings gain new fields over time
            display: { ...DEFAULT_GRAPH_OPTIONS.display, ...(p.graph?.display ?? {}) },
            forces: { ...DEFAULT_GRAPH_OPTIONS.forces, ...(p.graph?.forces ?? {}) },
            sections: { ...DEFAULT_GRAPH_OPTIONS.sections, ...(p.graph?.sections ?? {}) },
          },
        };
      },
    },
  ),
);
