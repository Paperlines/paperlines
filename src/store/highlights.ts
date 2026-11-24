import type { Highlight, HighlightColor, NewHighlight, Rect } from "@paperlines/backend-port";
import { quoteBullet } from "@paperlines/notes-editor";
import { create } from "zustand";
import { backend } from "../backend";
import { useLibrary } from "./library";
import { usePanes } from "./panes";
import { useUi } from "./ui";

// search results include highlight text, so refresh them after highlight edits
const useLibraryQuery = () => useUi.getState().query;

interface HighlightsState {
  byItem: Record<number, Highlight[]>;
  load(itemId: number): Promise<void>;
  create(h: NewHighlight, quote: boolean): Promise<Highlight>;
  update(h: Highlight, patch: { color?: HighlightColor; comment?: string }): Promise<void>;
  /** Saves where the reader found a highlight that only had its words. */
  place(itemId: number, id: number, page: number, rects: Rect[]): Promise<void>;
  /** Reloads every paper's highlights shown so far (another program may have added some). */
  reloadAll(): Promise<void>;
  remove(h: Highlight): Promise<void>;
  quote(h: Highlight): Promise<void>;
}

export const useHighlights = create<HighlightsState>()((set, get) => {
  const reload = async (itemId: number) => {
    await get().load(itemId);
    useLibrary.getState().runSearch(useLibraryQuery());
  };
  return {
    byItem: {},
    async load(itemId) {
      const list = await backend.listHighlights(itemId);
      set({ byItem: { ...get().byItem, [itemId]: list } });
    },
    async create(h, quote) {
      const created = await backend.createHighlight(h);
      if (quote) await get().quote(created);
      await reload(h.itemId);
      return created;
    },
    async place(itemId, id, page, rects) {
      await backend.placeHighlight(id, page, rects);
      await get().load(itemId);
    },
    async reloadAll() {
      await Promise.all(Object.keys(get().byItem).map((k) => get().load(Number(k))));
    },
    async update(h, patch) {
      await backend.updateHighlight(h.id, patch);
      await reload(h.itemId);
    },
    async remove(h) {
      await backend.deleteHighlight(h.id);
      await reload(h.itemId);
    },
    async quote(h) {
      const text = h.text ?? (h.kind === "rect" ? `Figure on page ${h.page}` : "");
      await backend.appendToPaperNote(h.itemId, quoteBullet(text, h.page, h.id));
      usePanes.getState().notesChanged();
    },
  };
});
