import { create } from "zustand";

export interface ToastMsg {
  text: string;
  action?: { label: string; run(): void };
}

interface ToastState {
  toast: ToastMsg | null;
  show(t: ToastMsg, ms?: number): void;
  hide(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>()((set) => ({
  toast: null,
  show(toast, ms = 6000) {
    if (timer) clearTimeout(timer);
    set({ toast });
    timer = setTimeout(() => set({ toast: null }), ms);
  },
  hide() {
    if (timer) clearTimeout(timer);
    set({ toast: null });
  },
}));
