import { expect, it } from "vitest";
import { tagTree } from "./tree";

it("builds a flat tree with implicit parents", () => {
  const tree = tagTree([
    { id: 1, path: "ml/nlp", color: null, count: 2 },
    { id: 2, path: "Survey", color: "red", count: 1 },
    { id: 3, path: "ml/vision/3d", color: null, count: 1 },
  ]);
  expect(tree.map((n) => [n.path, n.depth, n.tag?.id ?? null])).toEqual([
    ["ml", 0, null],
    ["ml/nlp", 1, 1],
    ["ml/vision", 1, null],
    ["ml/vision/3d", 2, 3],
    ["Survey", 0, 2],
  ]);
});
