import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface TourState {
  /** The tour has been finished or skipped once: it doesn't start by itself again. */
  done: boolean;
  open: boolean;
  step: number;
  start(): void;
  go(step: number): void;
  finish(): void;
}

const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
});

export const useTour = create<TourState>()(
  persist(
    (set) => ({
      done: false,
      open: false,
      step: 0,
      start: () => set({ open: true, step: 0 }),
      go: (step) => set({ step }),
      finish: () => set({ open: false, done: true, step: 0 }),
    }),
    { name: "tour", storage: safeStorage, partialize: ({ done }) => ({ done }) },
  ),
);
