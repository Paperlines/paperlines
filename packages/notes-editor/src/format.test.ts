import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  insertTable,
  lineFormat,
  moveCell,
  tableMarkdown,
  toggleInline,
  toggleLine,
} from "./format";

/** Applies a command to a doc whose selection is marked with [ ] (or | for a cursor). */
function run(doc: string, cmd: (s: EditorState) => TransactionSpec) {
  const a = doc.indexOf("[");
  const cursor = doc.indexOf("|");
  const clean = doc.replace(/[[\]|]/g, "");
  const sel =
    a >= 0
      ? EditorSelection.single(a, doc.indexOf("]") - 1)
      : EditorSelection.single(cursor < 0 ? 0 : cursor);
  const state = EditorState.create({ doc: clean, selection: sel });
  const next = state.update(cmd(state)).state;
  const r = next.selection.main;
  const t = next.doc.toString();
  return r.empty
    ? `${t.slice(0, r.head)}|${t.slice(r.head)}`
    : `${t.slice(0, r.from)}[${t.slice(r.from, r.to)}]${t.slice(r.to)}`;
}

describe("line formats", () => {
  it("toggle on every selected line, and off again", () => {
    expect(run("[one\ntwo]", (s) => toggleLine(s, "bullet"))).toBe("- [one\n- two]");
    expect(run("- [one\n- two]", (s) => toggleLine(s, "bullet"))).toBe("[one\ntwo]");
  });
  it("number lines in order and switch between list kinds", () => {
    expect(run("[- a\n- b\n- c]", (s) => toggleLine(s, "number"))).toBe("[1. a\n2. b\n3. c]");
    expect(run("1. a|", (s) => toggleLine(s, "task"))).toBe("- [ ] a|");
  });
  it("headings replace each other and keep indentation of lists", () => {
    expect(run("## Old|", (s) => toggleLine(s, "h1"))).toBe("# Old|");
    expect(run("  - nested|", (s) => toggleLine(s, "quote"))).toBe("  > nested|");
  });
  it("puts the cursor after a new prefix, so typing goes into the line", () => {
    expect(run("|", (s) => toggleLine(s, "h1"))).toBe("# |");
    expect(run("|text", (s) => toggleLine(s, "bullet"))).toBe("- |text");
    expect(run("# |", (s) => toggleLine(s, "h1"))).toBe("|");
  });
  it("names the format of a line", () => {
    expect(lineFormat("### x")).toBe("h3");
    expect(lineFormat("- [x] done")).toBe("task");
    expect(lineFormat("12. x")).toBe("number");
    expect(lineFormat("plain")).toBeNull();
  });
});

describe("inline formats", () => {
  it("wrap a selection, and unwrap it again", () => {
    expect(run("a [word] b", (s) => toggleInline(s, "bold"))).toBe("a **[word]** b");
    expect(run("a **[word]** b", (s) => toggleInline(s, "bold"))).toBe("a [word] b");
    expect(run("a [**word**] b", (s) => toggleInline(s, "bold"))).toBe("a [word] b");
  });
  it("with no selection, put the cursor between the marks", () => {
    expect(run("x |", (s) => toggleInline(s, "code"))).toBe("x `|`");
    expect(run("x ~~|~~", (s) => toggleInline(s, "strike"))).toBe("x |");
  });
  it("italic inside bold adds a mark rather than eating the bold", () => {
    expect(run("**[w]**", (s) => toggleInline(s, "italic"))).toBe("***[w]***");
  });
});

/** Like run(), for tables: "^" marks the cursor; a selection comes back as «…». */
function runT(doc: string, cmd: (s: EditorState) => TransactionSpec | null) {
  const at = doc.indexOf("^");
  const state = EditorState.create({ doc: doc.replace("^", ""), selection: { anchor: at } });
  const spec = cmd(state);
  if (!spec) return null;
  const next = state.update(spec).state;
  const r = next.selection.main;
  const t = next.doc.toString();
  return r.empty
    ? `${t.slice(0, r.head)}^${t.slice(r.head)}`
    : `${t.slice(0, r.from)}«${t.slice(r.from, r.to)}»${t.slice(r.to)}`;
}

describe("tables", () => {
  it("builds a table with numbered headers and empty rows", () => {
    expect(tableMarkdown(2, 2)).toBe(
      "| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |\n|          |          |",
    );
  });
  it("inserts below a line of text, after a blank line, with the first header selected", () => {
    expect(runT("Te^xt", (s) => insertTable(s, 1, 2))).toBe(
      "Text\n\n| «Column 1» | Column 2 |\n| -------- | -------- |\n|          |          |",
    );
  });
  it("fills an empty line and keeps a blank line before the text after it", () => {
    expect(runT("^\nafter", (s) => insertTable(s, 1, 1, "A"))).toBe(
      "| «A 1» |\n| --- |\n|     |\n\nafter",
    );
  });
  it("Tab and Shift-Tab move between cells and skip the separator row", () => {
    const doc = (row1: string, row3: string) => `${row1}\n| - | - |\n${row3}`;
    expect(runT(doc("| a^ | b |", "| c | d |"), (s) => moveCell(s, 1))).toBe(
      doc("| a | «b» |", "| c | d |"),
    );
    expect(runT(doc("| a | b^ |", "| c | d |"), (s) => moveCell(s, 1))).toBe(
      doc("| a | b |", "| «c» | d |"),
    );
    expect(runT(doc("| a | b |", "| c^ | d |"), (s) => moveCell(s, -1))).toBe(
      doc("| a | «b» |", "| c | d |"),
    );
  });
  it("Tab into an empty cell puts the cursor inside it", () => {
    expect(runT("| a^ |   |", (s) => moveCell(s, 1))).toBe("| a | ^  |");
  });
  it("Tab in the last cell adds a row; outside a table it does nothing", () => {
    expect(runT("| ab | c |\n| - | - |\n| x | y^ |", (s) => moveCell(s, 1))).toBe(
      "| ab | c |\n| - | - |\n| x | y |\n| ^  |   |",
    );
    expect(runT("pla^in", (s) => moveCell(s, 1))).toBeNull();
    expect(runT("| a^ |\n| - |", (s) => moveCell(s, -1))).toBeNull();
  });
});
