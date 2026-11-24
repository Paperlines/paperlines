import { create } from "zustand";
import { backend } from "../backend";

/** How many papers are in the Trash: the sidebar's icon and count. */
export const useTrashCount = create<{ count: number; refresh(): Promise<void> }>((set) => ({
  count: 0,
  async refresh() {
    try {
      set({ count: (await backend.listTrash()).length });
    } catch {
      // a failed count only leaves the icon as it was
    }
  },
}));
