import { EditorState } from "@codemirror/state";
import { expect, it } from "vitest";
import { tableBlocks } from "./livePreview";

it("finds pipe tables: header, separator, rows; not a lone pipe line", () => {
  const doc = "intro\n\n| a | b |\n| - | :-: |\n| 1 | 2 |\n\n| not a table |\ntext";
  const state = EditorState.create({ doc });
  const blocks = tableBlocks(state);
  expect(blocks).toHaveLength(1);
  expect(blocks[0][2]).toBe("| a | b |\n| - | :-: |\n| 1 | 2 |");
  expect(state.sliceDoc(blocks[0][0], blocks[0][1])).toBe(blocks[0][2]);
});
