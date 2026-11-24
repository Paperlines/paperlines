import type { HighlightColorLabel } from "@paperlines/backend-port";

/** The five colours every library starts with; mirrors `BASE_HIGHLIGHT_COLORS` in
 *  crates/core/src/settings.rs. They can be renamed, never removed. */
export const BASE_COLORS = ["yellow", "red", "green", "blue", "purple"] as const;

/** Colours a user can add, each with a suggested purpose; mirrors `EXTRA_HIGHLIGHT_COLORS`. */
export const EXTRA_COLORS: HighlightColorLabel[] = [
  { color: "orange", label: "To check" },
  { color: "pink", label: "Result" },
  { color: "teal", label: "Example" },
  { color: "lime", label: "Idea to try" },
  { color: "brown", label: "Background" },
  { color: "gray", label: "Not relevant" },
];

export const isBase = (color: string) => (BASE_COLORS as readonly string[]).includes(color);
