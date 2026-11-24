import { emptyBiblio, type Item } from "@paperlines/backend-port";
import { describe, expect, it } from "vitest";
import { authorsToText, orderItems, shortAuthors, textToAuthors } from "./filter";

const item = (
  id: number,
  title: string,
  family: string,
  year: number,
  readStatus: Item["readStatus"],
): Item => ({
  id,
  title,
  authors: [{ family, given: "A" }],
  year,
  readStatus,
  citekey: `${family.toLowerCase()}${year}`,
  itemType: "article",
  pubDate: null,
  venue: null,
  doi: null,
  arxivId: null,
  url: null,
  abstract: null,
  rating: null,
  dateAdded: `2026-01-0${id} 00:00:00`,
  dateModified: "",
  hasPdf: false,
  tags: [],
  projectIds: [],
  hasEpub: false,
  deletedAt: null,
  ...emptyBiblio,
});

const items = [
  item(1, "Attention Is All You Need", "Vaswani", 2017, "read"),
  item(2, "Deep Residual Learning", "He", 2016, "unread"),
  item(3, "Über Sprachmodelle", "Müller", 2021, "reading"),
];

describe("orderItems", () => {
  it("keeps backend relevance order and drops unknown ids", () => {
    expect(orderItems(items, [3, 99, 1], "all", "relevance").map((i) => i.id)).toEqual([3, 1]);
  });
  it("filters by status and sorts", () => {
    expect(orderItems(items, null, "unread", "title").map((i) => i.id)).toEqual([2]);
    expect(orderItems(items, null, "all", "dateAdded").map((i) => i.id)).toEqual([3, 2, 1]);
    expect(orderItems(items, null, "all", "year").map((i) => i.id)).toEqual([3, 1, 2]);
    expect(orderItems(items, [1, 2], "all", "title").map((i) => i.id)).toEqual([1, 2]);
    expect(orderItems(items, null, "all", "relevance").map((i) => i.id)).toEqual([3, 2, 1]);
    expect(orderItems(items, null, "all", "year", "asc").map((i) => i.id)).toEqual([2, 1, 3]);
    expect(orderItems(items, null, "all", "title", "desc").map((i) => i.id)).toEqual([3, 2, 1]);
  });
});

it("formats and parses authors", () => {
  expect(
    shortAuthors([
      { family: "A", given: "" },
      { family: "B", given: "" },
    ]),
  ).toBe("A & B");
  expect(textToAuthors(authorsToText(items[0].authors))).toEqual(items[0].authors);
  expect(textToAuthors("Plato\n\nDoe, Jane, Jr")).toEqual([
    { family: "Plato", given: "" },
    { family: "Doe", given: "Jane, Jr" },
  ]);
});
