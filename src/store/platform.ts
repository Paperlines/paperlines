import { create } from "zustand";
import type { Platform } from "../platform";

export const usePlatform = create<{ platform: Platform | null }>()(() => ({ platform: null }));
