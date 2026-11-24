// Obsidian-style live preview: lines without the cursor render (headings, emphasis, bullets,
// [[links]], @cites, $math$, tables); the cursor's line shows the raw Markdown.
import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Range, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import katex from "katex";
import { type LinkInfo, type NoteLink, renderMarkdown } from "./markdown";

export interface LiveOptions {
  resolve(): ((target: string) => LinkInfo) | undefined;
  onLink(): ((link: NoteLink) => void) | undefined;
}

class LinkWidget extends WidgetType {
  constructor(
    readonly kind: "wikilink" | "cite",
    readonly target: string,
    readonly text: string,
    readonly exists: boolean,
  ) {
    super();
  }
  eq(o: LinkWidget) {
    return (
      o.kind === this.kind &&
      o.target === this.target &&
      o.text === this.text &&
      o.exists === this.exists
    );
  }
  toDOM() {
    const a = document.createElement("a");
    a.href = "#";
    a.className = `cm-lp-link ${this.kind}${this.exists ? "" : " unresolved"}`;
    a.dataset.kind = this.kind;
    a.dataset.target = this.target;
    a.textContent = this.text;
    return a;
  }
  ignoreEvent() {
    return false;
  }
}

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display = false,
  ) {
    super();
  }
  eq(o: MathWidget) {
    return o.tex === this.tex && o.display === this.display;
  }
  toDOM() {
    const s = document.createElement(this.display ? "div" : "span");
    s.className = this.display ? "cm-lp-math-block" : "cm-lp-math";
    s.innerHTML = katex.renderToString(this.tex, {
      throwOnError: false,
      output: "html",
      displayMode: this.display,
    });
    return s;
  }
  ignoreEvent() {
    return false;
  }
}

/** `$$` … `$$` over several lines: [from of the opening line, to of the closing line, tex]. */
export function mathBlocks(state: EditorState): [number, number, string][] {
  const out: [number, number, string][] = [];
  let open: { from: number; body: string[] } | null = null;
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const t = line.text.trim();
    if (!open) {
      // a fence alone ("$$") or with the first formula line ("$$ x = 1"), not a one-line $$x$$
      if (t.startsWith("$$") && !(t.length > 4 && t.endsWith("$$")))
        open = { from: line.from, body: [t.slice(2)] };
    } else if (t.endsWith("$$")) {
      open.body.push(t.slice(0, -2));
      out.push([open.from, line.to, open.body.join("\n").trim()]);
      open = null;
    } else open.body.push(line.text);
  }
  return out;
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Pipe tables: a header row and a separator row, then more "|" rows. [from, to, Markdown]. */
export function tableBlocks(state: EditorState): [number, number, string][] {
  const out: [number, number, string][] = [];
  const isRow = (n: number) => state.doc.line(n).text.trimStart().startsWith("|");
  let n = 1;
  while (n < state.doc.lines) {
    if (isRow(n) && isRow(n + 1) && TABLE_SEPARATOR.test(state.doc.line(n + 1).text)) {
      let last = n + 1;
      while (last < state.doc.lines && isRow(last + 1)) last++;
      const from = state.doc.line(n).from;
      const to = state.doc.line(last).to;
      out.push([from, to, state.sliceDoc(from, to)]);
      n = last + 1;
    } else n++;
  }
  return out;
}

class TableWidget extends WidgetType {
  constructor(readonly src: string) {
    super();
  }
  eq(o: TableWidget) {
    return o.src === this.src;
  }
  toDOM() {
    const d = document.createElement("div");
    d.className = "cm-lp-table";
    // the same renderer as the read view (raw HTML off), so the table looks the same in both
    d.innerHTML = renderMarkdown(this.src);
    return d;
  }
  ignoreEvent() {
    return false;
  }
}

const focusEffect = StateEffect.define<boolean>();

/**
 * Display math blocks (one centered formula) and tables rendered while the cursor is outside
 * them (a decoration that replaces line breaks has to come from a state field).
 */
const mathBlockField = StateField.define<{ focused: boolean; deco: DecorationSet }>({
  create: (state) => ({ focused: false, deco: blockDeco(state, false) }),
  update(v, tr) {
    let focused = v.focused;
    for (const e of tr.effects) if (e.is(focusEffect)) focused = e.value;
    if (!tr.docChanged && !tr.selection && focused === v.focused) return v;
    return { focused, deco: blockDeco(tr.state, focused) };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

function blockDeco(state: EditorState, focused: boolean): DecorationSet {
  const active = focused ? activeLines(state) : new Set<number>();
  const deco: Range<Decoration>[] = [];
  const editing = (from: number, to: number) => {
    const a = state.doc.lineAt(from).number;
    const b = state.doc.lineAt(to).number;
    for (let n = a; n <= b; n++) if (active.has(n)) return true;
    return false;
  };
  const math = mathBlocks(state);
  for (const [from, to, tex] of math) {
    if (!editing(from, to) && tex)
      deco.push(
        Decoration.replace({ widget: new MathWidget(tex, true), block: true }).range(from, to),
      );
  }
  for (const [from, to, src] of tableBlocks(state)) {
    if (math.some(([a, b]) => from <= b && to >= a)) continue; // a "|" line inside $$ … $$
    if (!editing(from, to))
      deco.push(Decoration.replace({ widget: new TableWidget(src), block: true }).range(from, to));
  }
  return Decoration.set(deco, true);
}

class BulletWidget extends WidgetType {
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-lp-bullet";
    s.textContent = "•";
    return s;
  }
}

const hide = Decoration.replace({});
const markClass: Record<string, string> = {
  Emphasis: "cm-lp-em",
  StrongEmphasis: "cm-lp-strong",
  InlineCode: "cm-lp-code",
  ATXHeading1: "cm-lp-h1",
  ATXHeading2: "cm-lp-h2",
  ATXHeading3: "cm-lp-h3",
  Strikethrough: "cm-lp-strike",
};

/** Lines (numbers) touched by any selection range: those stay raw. */
function activeLines(state: EditorState): Set<number> {
  const s = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) s.add(n);
  }
  return s;
}

function build(view: EditorView, opts: LiveOptions): DecorationSet {
  const { state } = view;
  const active = view.hasFocus ? activeLines(state) : new Set<number>();
  const deco: Range<Decoration>[] = [];
  const raw = (from: number) => active.has(state.doc.lineAt(from).number);
  const resolve = opts.resolve();
  const blocks = mathBlocks(state);
  const inBlock = (pos: number) => blocks.some(([a, b]) => pos >= a && pos <= b);
  // a table out of focus is one widget; inline decorations inside it would overlap it
  const tables = tableBlocks(state).filter(([a, b]) => {
    for (let n = state.doc.lineAt(a).number; n <= state.doc.lineAt(b).number; n++)
      if (active.has(n)) return false;
    return true;
  });
  const inTable = (pos: number) => tables.some(([a, b]) => pos >= a && pos <= b);
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        // math is LaTeX, not Markdown: no emphasis or code marks inside it
        if (blocks.some(([a, b]) => node.from >= a && node.to <= b)) return false;
        if (inTable(node.from)) return;
        const cls = markClass[node.name];
        if (cls && node.to > node.from)
          deco.push(Decoration.mark({ class: cls }).range(node.from, node.to));
        if (raw(node.from)) return;
        if (
          node.name === "EmphasisMark" ||
          node.name === "CodeMark" ||
          node.name === "StrikethroughMark"
        ) {
          deco.push(hide.range(node.from, node.to));
        } else if (node.name === "HeaderMark") {
          const after = state.doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
          deco.push(hide.range(node.from, after));
        } else if (node.name === "ListMark") {
          const mark = state.doc.sliceString(node.from, node.to);
          if (mark === "-" || mark === "*" || mark === "+") {
            deco.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
          }
        }
      },
    });
    const text = state.doc.sliceString(from, to);
    const patterns: [RegExp, (m: RegExpExecArray, start: number) => void][] = [
      [
        /\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|([^\]\n]*))?\]\]/g,
        (m, start) => {
          const target = m[1].trim();
          const info = resolve?.(target) ?? { exists: true };
          deco.push(
            Decoration.replace({
              widget: new LinkWidget(
                "wikilink",
                target,
                m[2]?.trim() || info.title || target,
                info.exists,
              ),
            }).range(start, start + m[0].length),
          );
        },
      ],
      [
        /(^|[^\w@])@([A-Za-z](?:[\w:.-]*\w)?)/g,
        (m, start) => {
          const s = start + m[1].length;
          const info = resolve?.(m[2]) ?? { exists: true };
          deco.push(
            Decoration.replace({
              widget: new LinkWidget("cite", m[2], `@${m[2]}`, info.exists),
            }).range(s, s + m[2].length + 1),
          );
        },
      ],
      [
        /\$\$([^$\n]+?)\$\$/g,
        (m, start) => {
          // a block fence line is the state field's; this is $$x$$ written inline
          const line = state.doc.lineAt(start);
          if (inBlock(start)) return;
          const whole = line.text.trim() === m[0];
          deco.push(
            Decoration.replace({ widget: new MathWidget(m[1].trim(), whole) }).range(
              start,
              start + m[0].length,
            ),
          );
        },
      ],
      [
        /(?<![$\\])\$(?!\$)([^$\n]+?)(?<![\\$])\$(?!\$)/g,
        (m, start) => {
          if (/^\s|\s$/.test(m[1]) || inBlock(start)) return;
          deco.push(
            Decoration.replace({ widget: new MathWidget(m[1]) }).range(start, start + m[0].length),
          );
        },
      ],
    ];
    for (const [re, add] of patterns) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const start = from + m.index;
        if (!raw(start) && !inTable(start)) add(m, start);
      }
    }
  }
  return Decoration.set(deco, true);
}

export function livePreview(opts: LiveOptions) {
  return [
    mathBlockField,
    EditorView.focusChangeEffect.of((_state, focusing) => focusEffect.of(focusing)),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = build(view, opts);
        }
        update(u: ViewUpdate) {
          if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged)
            this.decorations = build(u.view, opts);
        }
      },
      { decorations: (v) => v.decorations },
    ),
    EditorView.domEventHandlers({
      mousedown(e) {
        const a = (e.target as HTMLElement).closest?.("a.cm-lp-link") as HTMLElement | null;
        if (!a) return false;
        e.preventDefault();
        const kind = a.dataset.kind as "wikilink" | "cite";
        opts.onLink()?.({ kind, target: a.dataset.target ?? "" });
        return true;
      },
    }),
    EditorView.baseTheme({
      ".cm-lp-h1": { fontSize: "1.35em", fontWeight: "700" },
      ".cm-lp-h2": { fontSize: "1.18em", fontWeight: "650" },
      ".cm-lp-h3": { fontSize: "1.05em", fontWeight: "650" },
      ".cm-lp-em": { fontStyle: "italic" },
      ".cm-lp-strong": { fontWeight: "650" },
      ".cm-lp-strike": { textDecoration: "line-through" },
      ".cm-lp-code": {
        fontFamily: "var(--mono)",
        fontSize: "0.92em",
        background: "var(--bg-hover)",
        borderRadius: "4px",
        padding: "0 3px",
      },
      ".cm-lp-bullet": { color: "var(--fg-muted)", padding: "0 2px" },
      ".cm-lp-link": {
        color: "var(--accent)",
        background: "var(--accent-soft)",
        borderRadius: "4px",
        padding: "0 3px",
        textDecoration: "none",
        cursor: "pointer",
      },
      ".cm-lp-link.unresolved": {
        color: "var(--fg-muted)",
        background: "transparent",
        borderBottom: "1px dashed var(--fg-muted)",
      },
      ".cm-lp-math": { padding: "0 1px" },
      ".cm-lp-math-block": { textAlign: "center", padding: "6px 0", cursor: "text" },
    }),
  ];
}
