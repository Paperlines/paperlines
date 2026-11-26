// The only TypeScript file that branches on the operating system.
import type { Os } from "@paperlines/backend-port";

export interface Platform {
  os: Os;
  modSymbol: string;
  /** The window has no system frame (Windows, Linux): the top bar draws minimize, maximize, close. */
  windowControls: boolean;
}

export function platformFor(os: Os): Platform {
  return { os, modSymbol: os === "macos" ? "⌘" : "Ctrl", windowControls: os !== "macos" };
}

/** Formats "mod+k" for display: ⌘K on macOS, Ctrl+K elsewhere. */
export function formatShortcut(p: Platform, shortcut: string): string {
  const parts = shortcut
    .split("+")
    .map((s) => (s === "mod" ? p.modSymbol : s.length === 1 ? s.toUpperCase() : s));
  return parts.join(p.os === "macos" ? "" : "+");
}

/** True when the platform's primary modifier (Cmd on macOS, Ctrl elsewhere) is held. */
export function isMod(p: Platform, e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return p.os === "macos" ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** Does a "mod+shift+k" style shortcut match this key event? */
export function matchesShortcut(p: Platform, shortcut: string, e: KeyboardEvent): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  const wantMod = parts.includes("mod");
  const modHeld = e.metaKey || e.ctrlKey;
  if (wantMod ? !isMod(p, e) : modHeld) return false;
  if (parts.includes("shift") && !e.shiftKey) return false;
  if (parts.includes("alt") !== e.altKey) return false;
  const k = e.key.toLowerCase();
  return k === key || (key === "backspace" && k === "delete");
}

/** True when focus is in a text field, where single-key shortcuts must not fire. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}
