import type {
  Item,
  ItemInput,
  ProjectInfo,
  SavedSearch,
  SearchResult,
  TagInfo,
} from "@paperlines/backend-port";
import { create } from "zustand";
import { backend } from "../backend";

interface LibraryState {
  items: Item[];
  tags: TagInfo[];
  projects: ProjectInfo[];
  saved: SavedSearch[];
  /** null when the query is empty (show everything). */
  results: SearchResult | null;
  loaded: boolean;
  error: string | null;
  load(): Promise<void>;
  /** Reloads items and the sidebar data after a change. */
  refresh(): Promise<void>;
  runSearch(query: string): Promise<void>;
  save(id: number, input: ItemInput): Promise<Item>;
  /** Runs a mutation, then refreshes; errors land in `error`. */
  mutate(f: () => Promise<unknown>): Promise<boolean>;
}

let searchSeq = 0;
let lastQuery = "";

export const useLibrary = create<LibraryState>()((set, get) => ({
  items: [],
  tags: [],
  projects: [],
  saved: [],
  results: null,
  loaded: false,
  error: null,
  async load() {
    try {
      const [items, tags, projects, saved] = await Promise.all([
        backend.listItems(),
        backend.listTags(),
        backend.listProjects(),
        backend.listSavedSearches(),
      ]);
      set({ items, tags, projects, saved, loaded: true, error: null });
    } catch (e) {
      set({ error: String(e), loaded: true });
    }
  },
  async refresh() {
    await get().load();
    await get().runSearch(lastQuery);
  },
  async runSearch(query) {
    lastQuery = query;
    const seq = ++searchSeq;
    if (!query.trim()) {
      set({ results: null });
      return;
    }
    try {
      const results = await backend.search(query);
      if (seq === searchSeq) set({ results });
    } catch (e) {
      if (seq === searchSeq) set({ results: { ids: [], warnings: [String(e)] } });
    }
  },
  async save(id, input) {
    const updated = await backend.updateItem(id, input);
    set({ items: get().items.map((i) => (i.id === id ? updated : i)) });
    get().runSearch(lastQuery);
    return updated;
  },
  async mutate(f) {
    try {
      await f();
      await get().refresh();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },
}));
