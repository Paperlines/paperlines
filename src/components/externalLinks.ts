import type { MouseEvent } from "react";
import { backend } from "../backend";

/**
 * For rendered Markdown (release notes, the changelog): a click on an http(s) link opens it in the
 * system browser instead of navigating the app's own window away.
 */
export function openLinksExternally(e: MouseEvent<HTMLElement>) {
  const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
  if (href && /^https?:\/\//i.test(href)) {
    e.preventDefault();
    backend.openExternal(href);
  }
}
