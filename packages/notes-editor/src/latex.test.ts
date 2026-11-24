import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { commandOf, inMath, insertionOf, SYMBOLS } from "./latex";
import { mathBlocks } from "./livePreview";

const at = (doc: string) => {
  const pos = doc.indexOf("|");
  return { state: EditorState.create({ doc: doc.replace("|", "") }), pos };
};

describe("inMath", () => {
  it("knows inline and block math", () => {
    for (const [doc, yes] of [
      ["Energy $E=m|c^2$ here", true],
      ["Energy $E=mc^2$ he|re", false],
      ["costs \\$5 and |more", false],
      ["$$\nx = |1\n$$", true],
      ["$$\nx = 1\n$$\nafter|", false],
      ["one-line $$x|$$ display", true],
    ] as const) {
      const { state, pos } = at(doc);
      expect(inMath(state, pos), doc).toBe(yes);
    }
  });
});

describe("symbols", () => {
  it("place the cursor in the first argument", () => {
    expect(insertionOf("\\frac{#}{}")).toEqual({ text: "\\frac{}{}", cursor: 6 });
    expect(insertionOf("\\alpha")).toEqual({ text: "\\alpha", cursor: 6 });
    expect(commandOf({ tex: "\\hat{#}", show: "x̂", group: "structure" })).toBe("\\hat");
  });
  it("every symbol has a look and a unique command", () => {
    expect(SYMBOLS.every((s) => s.show.length > 0)).toBe(true);
    expect(new Set(SYMBOLS.map((s) => s.tex)).size).toBe(SYMBOLS.length);
  });
});

describe("mathBlocks", () => {
  it("finds $$ blocks over several lines, not one-line $$x$$", () => {
    const state = EditorState.create({
      doc: "intro\n$$\n\\int_0^1 x\\,dx\n= \\tfrac12\n$$\nthen $$a+b$$ inline\n$$ y = 2\n$$",
    });
    const blocks = mathBlocks(state);
    expect(blocks.map((b) => b[2])).toEqual(["\\int_0^1 x\\,dx\n= \\tfrac12", "y = 2"]);
  });
});
