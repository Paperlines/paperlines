import type { TagInfo } from "@paperlines/backend-port";

export interface TagNode {
  path: string;
  name: string;
  depth: number;
  tag: TagInfo | null;
}

/** Flattened tree in display order; parents that exist only as prefixes get `tag: null`. */
export function tagTree(tags: TagInfo[]): TagNode[] {
  const byPath = new Map(tags.map((t) => [t.path, t]));
  const all = new Set<string>();
  for (const t of tags) {
    const parts = t.path.split("/");
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/"));
  }
  return [...all]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((path) => ({
      path,
      name: path.split("/").pop() ?? path,
      depth: path.split("/").length - 1,
      tag: byPath.get(path) ?? null,
    }));
}
