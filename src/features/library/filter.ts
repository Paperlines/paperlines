import type { Author, Item, ReadStatus } from "@paperlines/backend-port";

export type StatusFilter = "all" | ReadStatus;
export type SortKey = "relevance" | "dateAdded" | "title" | "year" | "author";

/**
 * Applies backend search results (`ids`, already in relevance order, or null for "everything"),
 * the read-status quick filter, and the chosen sort.
 */
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  relevance: "desc",
  dateAdded: "desc",
  title: "asc",
  year: "desc",
  author: "asc",
};

/** As orderDefault, reversed when `dir` is the opposite of the column's natural direction. */
export function orderItems(
  items: Item[],
  ids: number[] | null,
  status: StatusFilter,
  sort: SortKey,
  dir?: "asc" | "desc",
): Item[] {
  const sorted = orderDefault(items, ids, status, sort);
  return dir && dir !== DEFAULT_DIR[sort] && sort !== "relevance" ? sorted.reverse() : sorted;
}

function orderDefault(
  items: Item[],
  ids: number[] | null,
  status: StatusFilter,
  sort: SortKey,
): Item[] {
  let out: Item[];
  if (ids) {
    const byId = new Map(items.map((i) => [i.id, i]));
    out = ids.map((id) => byId.get(id)).filter((i): i is Item => i !== undefined);
  } else {
    out = [...items];
  }
  if (status !== "all") out = out.filter((i) => i.readStatus === status);
  const by: Record<Exclude<SortKey, "relevance">, (a: Item, b: Item) => number> = {
    dateAdded: (a, b) => b.dateAdded.localeCompare(a.dateAdded) || b.id - a.id,
    title: (a, b) => a.title.localeCompare(b.title),
    year: (a, b) => (b.year ?? -1) - (a.year ?? -1) || a.title.localeCompare(b.title),
    author: (a, b) => (a.authors[0]?.family ?? "￿").localeCompare(b.authors[0]?.family ?? "￿"),
  };
  if (sort === "relevance") return ids ? out : out.sort(by.dateAdded);
  return out.sort(by[sort]);
}

export function shortAuthors(authors: Author[]): string {
  if (authors.length === 0) return "";
  if (authors.length === 1) return authors[0].family;
  if (authors.length === 2) return `${authors[0].family} & ${authors[1].family}`;
  return `${authors[0].family} et al.`;
}

export function authorsToText(authors: Author[]): string {
  return authors.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join("\n");
}

export function textToAuthors(text: string): Author[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [family, ...rest] = l.split(",");
      return { family: family.trim(), given: rest.join(",").trim() };
    });
}
