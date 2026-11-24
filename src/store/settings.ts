import type { Settings } from "@paperlines/backend-port";
import { create } from "zustand";
import { backend } from "../backend";

interface SettingsState {
  settings: Settings | null;
  load(): Promise<void>;
  update(patch: Partial<Settings>): Promise<void>;
}

export const useSettings = create<SettingsState>()((set) => ({
  settings: null,
  load: async () => set({ settings: await backend.getSettings() }),
  update: async (patch) => set({ settings: await backend.updateSettings(patch) }),
}));
