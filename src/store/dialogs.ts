import { create } from "zustand";

export type DialogName =
  | "import"
  | "settings"
  | "palette"
  | "tagPicker"
  | "projectPicker"
  | "manageTags"
  | "project"
  | "saveSearch"
  | "export"
  | "updateDetails"
  | "connection"
  | "connectionTypes";

interface DialogState {
  open: DialogName | null;
  /** Dialog-specific argument: dropped paths for import, project id for project. */
  arg: unknown;
  show(name: DialogName, arg?: unknown): void;
  close(): void;
}

export const useDialogs = create<DialogState>()((set) => ({
  open: null,
  arg: null,
  show: (open, arg = null) => set({ open, arg }),
  close: () => set({ open: null, arg: null }),
}));
