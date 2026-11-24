import type { SpineStep } from "@paperlines/backend-port";
import { create } from "zustand";
import { backend } from "../../backend";

/** Bumped whenever a spine changes, so views showing one reload it. */
export const useSpineVersion = create<{ version: number; bump(): void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

/** Every project's spine, for menus that offer its steps. */
export async function loadSpines(projectIds: number[]): Promise<Map<number, SpineStep[]>> {
  const all = await Promise.all(projectIds.map((id) => backend.spineGet(id).catch(() => [])));
  return new Map(projectIds.map((id, n) => [id, all[n]]));
}
