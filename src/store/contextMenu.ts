import type { ReactNode } from "react";
import { create } from "zustand";

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  /** Registry-style shortcut ("mod+shift+c"), shown on the right. */
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  run?: () => void;
  /** A flyout submenu instead of an action. */
  items?: MenuEntry[];
  /** Marks the current choice in a submenu (e.g. the read status). */
  checked?: boolean;
}
export type MenuEntry = MenuAction | "separator";

interface ContextMenuState {
  menu: { x: number; y: number; items: MenuEntry[]; label: string } | null;
  open(x: number, y: number, items: MenuEntry[], label: string): void;
  close(): void;
}

export const useContextMenu = create<ContextMenuState>((set) => ({
  menu: null,
  open: (x, y, items, label) => set({ menu: { x, y, items, label } }),
  close: () => set({ menu: null }),
}));
