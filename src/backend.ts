import type { BackendPort } from "@paperlines/backend-port";
import { createFakeBackend } from "./fake-backend";
import { tauriBackend } from "./tauri";

/** Running as the desktop app (not the browser preview used for development and tests). */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The one place the app picks a backend adapter. */
export const backend: BackendPort = inTauri ? tauriBackend : createFakeBackend();
