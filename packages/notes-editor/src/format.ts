// Formatting commands for the note toolbar and shortcuts: they toggle, so pressing a button
// twice undoes it, and they work on every selected line (lists, headings) or the selection
// (bold, italic, code).
import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";

export type LineFormat = "h1" | "h2" | "h3" | "bullet" | "number" | "task" | "quote";
export type InlineFormat = "bold" | "italic" | "strike" | "code";

/** Every line prefix the toolbar knows, so switching (bullet → numbered) replaces the old one. */
const PREFIX = /^(\s*)(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+[.)] |> )?/;

const MARK: Record<InlineFormat, string> = { bold: "**", italic: "*", strike: "~~", code: "`" };

/** The line format at the start of a line (what the toolbar shows as active). */
export function lineFormat(text: string): LineFormat | null {
  const p = text.match(PREFIX)?.[2] ?? "";
  if (p === "# ") return "h1";
  if (p === "## ") return "h2";
  if (p === "### ") return "h3";
  if (/^[-*+] \[[ xX]\] $/.test(p)) return "task";
  if (/^[-*+] $/.test(p)) return "bullet";
  if (/^\d+[.)] $/.test(p)) return "number";
  if (p === "> ") return "quote";
  return null;
}

function prefixFor(f: LineFormat, n: number): string {
  switch (f) {
    case "h1":
      return "# ";
    case "h2":
      return "## ";
    case "h3":
      return "### ";
    case "bullet":
      return "- ";
    case "number":
      return `${n}. `;
    case "task":
      return "- [ ] ";
    case "quote":
      return "> ";
  }
}

/**
 * Toggles a line format on every line the selection touches: if all of them already have it,
 * it comes off; otherwise each line gets it (replacing another heading or list marker).
 */
export function toggleLine(state: EditorState, f: LineFormat): TransactionSpec {
  const lines = new Map<number, { from: number; text: string }>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) {
      const l = state.doc.line(n);
      lines.set(n, { from: l.from, text: l.text });
    }
  }
  const all = [...lines.values()];
  const off = all.every((l) => lineFormat(l.text) === f);
  let count = 0;
  const changes = all.map((l) => {
    const m = l.text.match(PREFIX) as RegExpMatchArray;
    const indent = m[1].length;
    const old = m[2] ?? "";
    const insert = off ? "" : prefixFor(f, ++count);
    return { from: l.from + indent, to: l.from + indent + old.length, insert };
  });
  // a cursor at the start of a line moves past the new prefix, so typing goes into the line
  const set = state.changes(changes);
  return {
    changes: set,
    selection: state.selection.map(set, 1),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}

/**
 * Toggles an inline mark around each selection. With nothing selected it inserts the pair and
 * puts the cursor between; inside a pair (`**|**` or `**word|**`) it removes it.
 */
export function toggleInline(state: EditorState, f: InlineFormat): TransactionSpec {
  const mark = MARK[f];
  const k = mark.length;
  return state.changeByRange((r) => {
    const before = state.sliceDoc(r.from - k, r.from);
    const after = state.sliceDoc(r.to, r.to + k);
    // italic's * must not be half of a bold **
    const single =
      f !== "italic" ||
      (state.sliceDoc(r.from - 2, r.from) !== "**" && state.sliceDoc(r.to, r.to + 2) !== "**");
    if (before === mark && after === mark && single) {
      return {
        changes: [
          { from: r.from - k, to: r.from },
          { from: r.to, to: r.to + k },
        ],
        range: EditorSelection.range(r.from - k, r.to - k),
      };
    }
    const sel = state.sliceDoc(r.from, r.to);
    if (sel.length > 2 * k && sel.startsWith(mark) && sel.endsWith(mark)) {
      return {
        changes: { from: r.from, to: r.to, insert: sel.slice(k, -k) },
        range: EditorSelection.range(r.from, r.to - 2 * k),
      };
    }
    return {
      changes: { from: r.from, to: r.to, insert: mark + sel + mark },
      range: EditorSelection.range(r.from + k, r.to + k),
    };
  });
}

// ---- tables ----

/** A Markdown table: a header row of numbered placeholders, a separator and `rows` empty rows. */
export function tableMarkdown(rows: number, cols: number, header = "Column"): string {
  const names = Array.from({ length: cols }, (_, i) => `${header} ${i + 1}`);
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [
    row(names),
    row(names.map((n) => "-".repeat(n.length))),
    ...Array.from({ length: rows }, () => row(names.map((n) => " ".repeat(n.length)))),
  ].join("\n");
}

/**
 * Inserts a table on its own lines after the cursor's line (a table cannot interrupt a
 * paragraph, so a blank line separates it from text above and below) and selects the first
 * header cell, so typing replaces it.
 */
export function insertTable(
  state: EditorState,
  rows: number,
  cols: number,
  header = "Column",
): TransactionSpec {
  const line = state.doc.lineAt(state.selection.main.head);
  const table = tableMarkdown(rows, cols, header);
  const empty = !line.text.trim();
  const from = empty ? line.from : line.to;
  const to = empty ? line.to : line.to;
  const lead = empty ? "" : "\n\n";
  const next = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
  const trail = next && next.text.trim() ? "\n" : "";
  const start = from + lead.length + 2; // after "| "
  return {
    changes: { from, to, insert: lead + table + trail },
    selection: EditorSelection.single(start, start + `${header} 1`.length),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** A line that belongs to a table: starts with a pipe. */
export function isTableRow(text: string): boolean {
  return text.trimStart().startsWith("|");
}

/** Positions (in the line) of the cell borders: unescaped pipes, plus the line end if text follows the last pipe. */
function cellBorders(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "|" && text[i - 1] !== "\\") out.push(i);
  const last = out[out.length - 1] ?? -1;
  if (text.slice(last + 1).trim()) out.push(text.length);
  return out;
}

/** The cell's text without its padding, or a cursor after the opening "| " when it is empty. */
function cellSelection(lineFrom: number, text: string, a: number, b: number) {
  const inner = text.slice(a + 1, b);
  const lead = inner.length - inner.trimStart().length;
  const body = inner.trim();
  if (body)
    return EditorSelection.single(lineFrom + a + 1 + lead, lineFrom + a + 1 + lead + body.length);
  return EditorSelection.single(lineFrom + Math.min(a + 2, b));
}

/**
 * Tab / Shift-Tab inside a table: select the next (or previous) cell, skipping the separator
 * row. Tab in the last cell adds a new empty row. Returns null outside a table, so the key
 * keeps its normal meaning there.
 */
export function moveCell(state: EditorState, dir: 1 | -1): TransactionSpec | null {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  if (!isTableRow(line.text)) return null;
  const borders = cellBorders(line.text);
  if (borders.length < 2) return null;
  const col = head - line.from;
  // the cell the cursor is in: between borders[i] and borders[i + 1]
  let i = 0;
  while (i < borders.length - 2 && col > borders[i + 1]) i++;
  const target = i + dir;
  if (target >= 0 && target < borders.length - 1) {
    return {
      selection: cellSelection(line.from, line.text, borders[target], borders[target + 1]),
      scrollIntoView: true,
    };
  }
  // jump to the neighbouring row
  let n = line.number + dir;
  while (n >= 1 && n <= state.doc.lines && SEPARATOR.test(state.doc.line(n).text)) n += dir;
  if (n >= 1 && n <= state.doc.lines && isTableRow(state.doc.line(n).text)) {
    const l = state.doc.line(n);
    const bs = cellBorders(l.text);
    if (bs.length < 2) return null;
    const k = dir === 1 ? 0 : bs.length - 2;
    return { selection: cellSelection(l.from, l.text, bs[k], bs[k + 1]), scrollIntoView: true };
  }
  if (dir === -1) return null;
  // Tab in the last cell: a new row shaped like this one
  const widths = borders.slice(1).map((b, k) => Math.max(1, b - borders[k] - 3));
  const insert = `\n| ${widths.map((w) => " ".repeat(w)).join(" | ")} |`;
  return {
    changes: { from: line.to, insert },
    selection: EditorSelection.single(line.to + 3),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}
