import type { GraphTheme } from "@paperlines/graph";
import { useEffect, useState } from "react";
import { useUi } from "../../store/ui";
import type { Palette } from "./model";

const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

function read(): { palette: Palette; theme: GraphTheme } {
  const tag = Object.fromEntries(
    ["red", "orange", "yellow", "green", "teal", "blue", "purple", "gray"].map((c) => [
      c,
      css(`--tag-${c}`),
    ]),
  );
  return {
    palette: {
      status: {
        unread: css("--status-unread"),
        reading: css("--status-reading"),
        read: css("--status-read"),
      },
      tag,
      projects: ["blue", "orange", "teal", "purple", "red", "green", "yellow", "gray"].map(
        (c) => tag[c],
      ),
      none: css("--status-unread"),
      bg: css("--bg"),
      spine: css("--graph-spine"),
      spineFill: css("--graph-spine-fill"),
    },
    theme: {
      fg: css("--fg"),
      muted: css("--fg-muted"),
      edge: css("--graph-edge"),
      accent: css("--accent"),
      incoming: css("--graph-incoming"),
      bg: css("--bg"),
      spine: css("--graph-spine"),
      spineText: css("--graph-spine-text"),
    },
  };
}

/** Graph colors from the CSS design tokens, refreshed when the theme changes. */
export function useGraphColors() {
  const theme = useUi((s) => s.theme);
  const [c, setC] = useState(read);
  useEffect(() => {
    // after the data-theme attribute has been applied
    const id = requestAnimationFrame(() => setC(read()));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setC(read());
    mq.addEventListener("change", on);
    return () => {
      cancelAnimationFrame(id);
      mq.removeEventListener("change", on);
    };
  }, [theme]);
  return c;
}
