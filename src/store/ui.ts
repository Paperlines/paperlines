import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SortKey, StatusFilter } from "../features/library/filter";

export type Theme = "system" | "light" | "dark";
/** What the middle column shows. */
export type View = "library" | "notes" | "duplicates" | "trash" | "discover";
/** library: list + details; split: list + details + right pane; focus: right pane wide. */
export type Layout = "library" | "split" | "focus";
export type SortDir = "asc" | "desc";
export type Accent = "teal" | "blue" | "violet" | "green" | "amber" | "rose";
export const ACCENTS: Accent[] = ["teal", "blue", "violet", "green", "amber", "rose"];
export type Side = "left" | "right";

/** How the app looks: per computer, kept with the other window preferences. */
export interface Appearance {
  accent: Accent;
  /** Thin or regular icon strokes. */
  iconWeight: "light" | "regular";
  sidebarSide: Side;
  assistantSide: Side;
  /** Short labels under the top bar's icons. */
  topbarLabels: boolean;
}
export const DEFAULT_APPEARANCE: Appearance = {
  accent: "teal",
  iconWeight: "light",
  sidebarSide: "left",
  assistantSide: "right",
  topbarLabels: false,
};

export interface ColumnWidths {
  creator: number;
  year: number;
  added: number;
}
export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { creator: 160, year: 58, added: 96 };

interface UiState extends Appearance {
  theme: Theme;
  setAppearance(patch: Partial<Appearance>): void;
  query: string;
  status: StatusFilter;
  sort: SortKey;
  sortDir: SortDir;
  /** Library table column widths (px); the title takes the rest. */
  columnWidths: ColumnWidths;
  setColumnWidth(col: keyof ColumnWidths, px: number | null): void;
  view: View;
  layout: Layout;
  /** Obsidian-style live preview in the notes editor. */
  livePreview: boolean;
  /** Primary selection (shown in the detail pane when only one item is selected). */
  selectedId: number | null;
  selectedIds: number[];
  sidebarOpen: boolean;
  paneWidths: [number, number];
  setTheme(t: Theme): void;
  setQuery(q: string): void;
  setStatus(s: StatusFilter): void;
  setSort(s: SortKey, dir?: SortDir): void;
  setView(v: View): void;
  setLayout(l: Layout): void;
  setLivePreview(v: boolean): void;
  /** single: replace; toggle: mod+click; range: shift+click within `order`. */
  select(id: number | null, mode?: "single" | "toggle" | "range", order?: number[]): void;
  selectMany(ids: number[]): void;
  toggleSidebar(): void;
  setPaneWidths(w: [number, number]): void;
}

// localStorage can be missing or throw (private mode); the app works without it.
const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
});

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "system",
      ...DEFAULT_APPEARANCE,
      setAppearance: (patch) => set(patch),
      query: "",
      status: "all",
      sort: "dateAdded",
      sortDir: "desc",
      columnWidths: DEFAULT_COLUMN_WIDTHS,
      setColumnWidth: (col, px) =>
        set((st) => ({
          columnWidths: {
            ...st.columnWidths,
            [col]:
              px === null
                ? DEFAULT_COLUMN_WIDTHS[col]
                : Math.round(Math.max(40, Math.min(640, px))),
          },
        })),
      view: "library",
      layout: "library",
      livePreview: true,
      selectedId: null,
      selectedIds: [],
      sidebarOpen: true,
      paneWidths: [400, 340],
      setTheme: (theme) => set({ theme }),
      setQuery: (query) => set({ query }),
      setStatus: (status) => set({ status }),
      setSort: (sort, dir) =>
        set({ sort, sortDir: dir ?? (sort === "title" || sort === "author" ? "asc" : "desc") }),
      setView: (view) => set({ view }),
      setLayout: (layout) => set({ layout }),
      setLivePreview: (livePreview) => set({ livePreview }),
      select(id, mode = "single", order = []) {
        if (id === null) return set({ selectedId: null, selectedIds: [] });
        const { selectedId, selectedIds } = get();
        if (mode === "toggle") {
          const ids = selectedIds.includes(id)
            ? selectedIds.filter((x) => x !== id)
            : [...selectedIds, id];
          return set({
            selectedIds: ids,
            selectedId: ids.includes(id) ? id : (ids[ids.length - 1] ?? null),
          });
        }
        if (mode === "range" && selectedId !== null) {
          const a = order.indexOf(selectedId);
          const b = order.indexOf(id);
          if (a >= 0 && b >= 0) {
            return set({ selectedIds: order.slice(Math.min(a, b), Math.max(a, b) + 1) });
          }
        }
        set({ selectedId: id, selectedIds: [id] });
      },
      selectMany: (ids) => set({ selectedIds: ids, selectedId: ids[0] ?? null }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setPaneWidths: (paneWidths) => set({ paneWidths }),
    }),
    {
      name: "ui-state",
      storage: safeStorage,
      version: 2,
      migrate: (s) => s as UiState,
      partialize: ({ selectedIds: _s, ...rest }) => rest,
      onRehydrateStorage: () => (s) => {
        if (s?.selectedId != null) s.selectedIds = [s.selectedId];
      },
    },
  ),
);
