import { create } from "zustand";
import type { Rect } from "../features/card/place";

export const SHOW_DELAY = 200;
const HIDE_DELAY = 180;

interface CardState {
  itemId: number | null;
  anchor: Rect | null;
  pinned: boolean;
  /** Where the card came from; the graph re-anchors cards while panning. */
  origin: string | null;
  /** Hover intent: show after the delay unless the pointer leaves first. */
  hoverStart(itemId: number, anchor: Rect, origin: string): void;
  hoverEnd(): void;
  /** Pointer moved into the card: keep it open. */
  keep(): void;
  show(itemId: number, anchor: Rect, origin: string): void;
  pin(itemId: number, anchor: Rect, origin: string): void;
  reanchor(anchor: Rect | null): void;
  close(): void;
}

let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const clear = () => {
  if (showTimer) clearTimeout(showTimer);
  if (hideTimer) clearTimeout(hideTimer);
  showTimer = hideTimer = null;
};

export const useCard = create<CardState>()((set, get) => ({
  itemId: null,
  anchor: null,
  pinned: false,
  origin: null,
  hoverStart(itemId, anchor, origin) {
    if (get().pinned) return;
    clear();
    if (get().itemId !== null) {
      // a card is already open: switch immediately, like tooltips do
      set({ itemId, anchor, origin });
      return;
    }
    showTimer = setTimeout(() => set({ itemId, anchor, origin, pinned: false }), SHOW_DELAY);
  },
  hoverEnd() {
    if (get().pinned) return;
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => set({ itemId: null, anchor: null, origin: null }), HIDE_DELAY);
  },
  keep() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  },
  show(itemId, anchor, origin) {
    clear();
    if (!get().pinned) set({ itemId, anchor, origin });
  },
  pin(itemId, anchor, origin) {
    clear();
    set({ itemId, anchor, origin, pinned: true });
  },
  reanchor(anchor) {
    if (anchor) set({ anchor });
    else if (!get().pinned) set({ itemId: null, anchor: null });
  },
  close() {
    clear();
    set({ itemId: null, anchor: null, pinned: false, origin: null });
  },
}));

/** Hover/focus handlers that show the paper card for `itemId` anchored to the element. */
export function cardTriggers(itemId: number, origin: string) {
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };
  return {
    onMouseEnter: (e: React.MouseEvent) =>
      useCard.getState().hoverStart(itemId, rect(e.currentTarget), origin),
    onMouseLeave: () => useCard.getState().hoverEnd(),
  };
}
