import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  startCompletion,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Omega,
  Radical,
  SquareSigma,
  Strikethrough,
  Table,
  TextQuote,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  type InlineFormat,
  insertTable,
  type LineFormat,
  lineFormat,
  moveCell,
  toggleInline,
  toggleLine,
} from "./format";
import {
  commandOf,
  inMath,
  insertionOf,
  type LatexSymbol,
  SYMBOL_GROUPS,
  SYMBOLS,
  type SymbolGroup,
} from "./latex";
import { livePreview } from "./livePreview";
import type { LinkInfo, NoteLink } from "./markdown";

export interface CompletionOption {
  /** Shown in the list. */
  label: string;
  /** Secondary text, e.g. a paper title for a citekey. */
  detail?: string;
  /** Inserted text (without the closing "]]"). */
  insert: string;
}

export interface MarkdownEditorProps {
  value: string;
  onChange(value: string): void;
  /** Suggestions after "[[" (wikilink) or "@" (cite). */
  complete?(kind: "wikilink" | "cite", query: string): CompletionOption[];
  vimMode?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  onBlur?(): void;
  onEscape?(): void;
  ariaLabel?: string;
  /** Obsidian-style live preview; links and cites are clickable. */
  live?: boolean;
  resolve?(target: string): LinkInfo;
  onLink?(link: NoteLink): void;
  /** Buttons above the editor: formats, link, inline and block math, symbols, tables. */
  toolbar?: boolean;
  /** Toolbar wording (English by default). */
  labels?: Partial<ToolbarLabels>;
}

export interface ToolbarLabels {
  toolbar: string;
  h1: string;
  h2: string;
  h3: string;
  bold: string;
  italic: string;
  strike: string;
  code: string;
  bullet: string;
  number: string;
  task: string;
  quote: string;
  link: string;
  inlineMath: string;
  blockMath: string;
  symbols: string;
  table: string;
  /** Size picker cell, e.g. "{cols} × {rows}" (columns by body rows). */
  tableSize: string;
  /** Placeholder header text; cells read "Column 1", "Column 2" … */
  tableColumn: string;
  groups: Record<SymbolGroup, string>;
}

const LABELS: ToolbarLabels = {
  toolbar: "Formatting",
  h1: "Title",
  h2: "Heading",
  h3: "Subheading",
  bold: "Bold",
  italic: "Italic",
  strike: "Strikethrough",
  code: "Code",
  bullet: "Bullet list",
  number: "Numbered list",
  task: "Checklist",
  quote: "Quote",
  link: "Link to a note or paper ([[)",
  inlineMath: "Inline formula ($…$)",
  blockMath: "Formula block ($$…$$)",
  symbols: "Symbols",
  table: "Table",
  tableSize: "{cols} × {rows} table",
  tableColumn: "Column",
  groups: {
    greek: "Greek",
    operators: "Operators",
    relations: "Relations",
    arrows: "Arrows",
    sets: "Sets & logic",
    structure: "Accents & layout",
  },
};

const BS = "\\";

/** Functions and dots that complete after a backslash too (not in the palette). */
const MORE: LatexSymbol[] = [
  "sin",
  "cos",
  "tan",
  "log",
  "ln",
  "exp",
  "max",
  "min",
  "arg",
  "det",
  "ldots",
  "cdots",
  "vdots",
  "ddots",
].map((c) => ({ tex: BS + c, show: "", group: "operators" }));

/** Inserts a LaTeX snippet at the selection, inside $…$ when the cursor isn't in math. */
function insertTex(view: EditorView, tex: string) {
  const { from, to } = view.state.selection.main;
  const wrap = !inMath(view.state, from);
  const { text, cursor } = insertionOf(tex);
  const sel = view.state.sliceDoc(from, to);
  // a selection goes into the first argument (hat of the selection); otherwise it's replaced
  const hasSlot = tex.includes("#");
  const body = hasSlot && sel ? text.slice(0, cursor) + sel + text.slice(cursor) : text;
  const insert = wrap ? `$${body}$` : body;
  // a template waits in its slot; a plain symbol leaves the cursor after it (and after the $)
  const at = hasSlot ? (wrap ? 1 : 0) + cursor + sel.length : insert.length;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + at } });
  view.focus();
}

const COMMAND = /\\[A-Za-z]*/;

function latexCompletion(ctx: CompletionContext): CompletionResult | null {
  const m = ctx.matchBefore(COMMAND);
  if (!m || !inMath(ctx.state, m.from)) return null;
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const s of [...SYMBOLS, ...MORE]) {
    const label = commandOf(s);
    if (!label.startsWith(BS) || seen.has(s.tex)) continue;
    seen.add(s.tex);
    options.push({
      label,
      detail: s.show,
      apply: (view, _c, from, to) => {
        const { text, cursor } = insertionOf(s.tex);
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + cursor },
        });
      },
    });
  }
  return { from: m.from, options, validFor: /^\\[A-Za-z]*$/ };
}

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Shortcuts, shown in the buttons' tooltips. `Mod` is ⌘ on macOS, Ctrl elsewhere. */
const KEYS: Partial<Record<LineFormat | InlineFormat, string>> = {
  h1: "Mod-Alt-1",
  h2: "Mod-Alt-2",
  h3: "Mod-Alt-3",
  bold: "Mod-b",
  italic: "Mod-i",
  strike: "Mod-Shift-x",
  code: "Mod-e",
  bullet: "Mod-Shift-8",
  number: "Mod-Shift-7",
  task: "Mod-Shift-9",
};

function keyHint(key: string | undefined): string {
  if (!key) return "";
  const parts = key
    .split("-")
    .map((p) =>
      MAC
        ? (({ Mod: "⌘", Alt: "⌥", Shift: "⇧" } as Record<string, string>)[p] ?? p.toUpperCase())
        : (({ Mod: "Ctrl+", Alt: "Alt+", Shift: "Shift+" } as Record<string, string>)[p] ??
          p.toUpperCase()),
    );
  return ` (${parts.join("")})`;
}

const LINE_FORMATS: LineFormat[] = ["h1", "h2", "h3", "bullet", "number", "task", "quote"];
const INLINE_FORMATS: InlineFormat[] = ["bold", "italic", "strike", "code"];

/** Tab / Shift-Tab between table cells; outside a table the keys do what they did before. */
const tableKeymap = ([1, -1] as const).map((dir) => ({
  key: dir === 1 ? "Tab" : "Shift-Tab",
  run: (v: EditorView) => {
    const spec = moveCell(v.state, dir);
    if (!spec) return false;
    v.dispatch(spec);
    return true;
  },
}));

/** The keyboard side of the toolbar: ⌘B, ⌘I, ⌘⇧8 … */
const formatKeymap = [
  ...LINE_FORMATS.filter((f) => KEYS[f]).map((f) => ({
    key: KEYS[f] as string,
    run: (v: EditorView) => {
      v.dispatch(toggleLine(v.state, f));
      return true;
    },
  })),
  ...INLINE_FORMATS.map((f) => ({
    key: KEYS[f] as string,
    run: (v: EditorView) => {
      v.dispatch(toggleInline(v.state, f));
      return true;
    },
  })),
];

const ICON = 15;
/** The table size picker: up to this many columns and body rows. */
const TABLE_MAX = 6;
const LINE_ICON: Record<LineFormat, ReactNode> = {
  h1: <Heading1 size={ICON} />,
  h2: <Heading2 size={ICON} />,
  h3: <Heading3 size={ICON} />,
  bullet: <List size={ICON} />,
  number: <ListOrdered size={ICON} />,
  task: <ListTodo size={ICON} />,
  quote: <TextQuote size={ICON} />,
};
const INLINE_ICON: Record<InlineFormat, ReactNode> = {
  bold: <Bold size={ICON} />,
  italic: <Italic size={ICON} />,
  strike: <Strikethrough size={ICON} />,
  code: <Code size={ICON} />,
};

/**
 * Headings, text style, lists, then links and math: icon buttons in groups that act on the
 * editor without taking its focus. The format of the cursor's line shows as pressed.
 */
function Toolbar({
  view,
  labels,
  active,
}: {
  view: React.RefObject<EditorView | null>;
  labels: ToolbarLabels;
  active: LineFormat | null;
}) {
  const [panel, setPanel] = useState<"symbols" | "table" | null>(null);
  const [group, setGroup] = useState<SymbolGroup>("greek");
  const [size, setSize] = useState<[number, number]>([0, 0]); // [cols, rows] under the pointer
  const toggle = (p: "symbols" | "table") => setPanel(panel === p ? null : p);
  const keep = (e: React.MouseEvent) => e.preventDefault(); // clicking doesn't blur the editor
  const act = (f: (v: EditorView) => void) => () => {
    const v = view.current;
    if (!v) return;
    f(v);
    v.focus();
  };
  const button = (key: string, label: string, icon: ReactNode, run: () => void, on = false) => (
    <button
      key={key}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={on ? "on" : ""}
      onMouseDown={keep}
      onClick={run}
    >
      {icon}
    </button>
  );
  const lineButton = (f: LineFormat) =>
    button(
      f,
      labels[f] + keyHint(KEYS[f]),
      LINE_ICON[f],
      act((v) => v.dispatch(toggleLine(v.state, f))),
      active === f,
    );
  const inlineButton = (f: InlineFormat) =>
    button(
      f,
      labels[f] + keyHint(KEYS[f]),
      INLINE_ICON[f],
      act((v) => v.dispatch(toggleInline(v.state, f))),
    );
  const wrap = (v: EditorView, before: string, after: string) => {
    const { from, to } = v.state.selection.main;
    const sel = v.state.sliceDoc(from, to);
    v.dispatch({
      changes: { from, to, insert: before + sel + after },
      selection: sel
        ? { anchor: from + before.length, head: from + before.length + sel.length }
        : { anchor: from + before.length },
    });
    v.focus();
  };
  // groups wrap as a whole in a narrow pane: headings | text style | lists | links & math
  return (
    <div className="md-toolbar" role="toolbar" aria-label={labels.toolbar}>
      <span className="md-group">{(["h1", "h2", "h3"] as const).map(lineButton)}</span>
      <span className="md-group">{INLINE_FORMATS.map(inlineButton)}</span>
      <span className="md-group">
        {(["bullet", "number", "task", "quote"] as const).map(lineButton)}
      </span>
      <span className="md-group">
        {button(
          "link",
          labels.link,
          <Link size={ICON} />,
          act((v) => {
            const { from, to } = v.state.selection.main;
            if (from !== to) return wrap(v, "[[", "]]");
            v.dispatch({ changes: { from, insert: "[[" }, selection: { anchor: from + 2 } });
            v.focus();
            startCompletion(v);
          }),
        )}
        {button(
          "inline-math",
          labels.inlineMath,
          <Radical size={ICON} />,
          act((v) => wrap(v, "$", "$")),
        )}
        {button(
          "block-math",
          labels.blockMath,
          <SquareSigma size={ICON} />,
          act((v) => {
            const { from } = v.state.selection.main;
            const lead = v.state.doc.lineAt(from).text.trim() ? "\n" : "";
            wrap(v, `${lead}$$\n`, "\n$$\n");
          }),
        )}
        <button
          type="button"
          title={labels.symbols}
          aria-label={labels.symbols}
          aria-expanded={panel === "symbols"}
          className={panel === "symbols" ? "on" : ""}
          onMouseDown={keep}
          onClick={() => toggle("symbols")}
        >
          <Omega size={ICON} />
        </button>
        <button
          type="button"
          title={labels.table}
          aria-label={labels.table}
          aria-expanded={panel === "table"}
          className={panel === "table" ? "on" : ""}
          onMouseDown={keep}
          onClick={() => toggle("table")}
        >
          <Table size={ICON} />
        </button>
      </span>
      {panel === "table" && (
        <div className="md-table-picker" role="group" aria-label={labels.table} onMouseDown={keep}>
          <div className="md-table-grid" onMouseLeave={() => setSize([0, 0])}>
            {Array.from({ length: TABLE_MAX * TABLE_MAX }, (_, i) => {
              const cols = (i % TABLE_MAX) + 1;
              const rows = Math.floor(i / TABLE_MAX) + 1;
              const name = labels.tableSize
                .replace("{cols}", String(cols))
                .replace("{rows}", String(rows));
              return (
                <button
                  key={i}
                  type="button"
                  title={name}
                  aria-label={name}
                  className={cols <= size[0] && rows <= size[1] ? "on" : ""}
                  onMouseEnter={() => setSize([cols, rows])}
                  onFocus={() => setSize([cols, rows])}
                  onClick={act((v) => {
                    v.dispatch(insertTable(v.state, rows, cols, labels.tableColumn));
                    setPanel(null);
                  })}
                />
              );
            })}
          </div>
          <span className="md-table-size" aria-live="polite">
            {size[0]
              ? labels.tableSize
                  .replace("{cols}", String(size[0]))
                  .replace("{rows}", String(size[1]))
              : labels.table}
          </span>
        </div>
      )}
      {panel === "symbols" && (
        <div className="md-symbols" role="group" aria-label={labels.symbols} onMouseDown={keep}>
          <div className="md-symbol-groups" role="tablist">
            {SYMBOL_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={group === g}
                className={group === g ? "on" : ""}
                onClick={() => setGroup(g)}
              >
                {labels.groups[g]}
              </button>
            ))}
          </div>
          <div className="md-symbol-grid">
            {SYMBOLS.filter((s) => s.group === group).map((s) => (
              <button
                key={s.tex}
                type="button"
                title={s.tex.replace("#", "…")}
                aria-label={s.tex.replace("#", "…")}
                onClick={act((v) => insertTex(v, s.tex))}
              >
                {s.show}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const theme = EditorView.theme({
  "&": { fontSize: "13px", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { fontFamily: "var(--font)", padding: "6px 0", caretColor: "var(--fg)" },
  ".cm-line": { padding: "0 2px" },
  ".cm-scroller": { lineHeight: "1.55" },
  ".cm-placeholder": { color: "var(--fg-muted)" },
  ".cm-tooltip": {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    background: "var(--bg-selected)",
    color: "var(--fg)",
  },
  ".cm-completionDetail": { color: "var(--fg-muted)", marginLeft: "8px", fontStyle: "normal" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    background: "var(--bg-selected) !important",
  },
  ".cm-fat-cursor": { background: "var(--accent) !important" },
});

export function MarkdownEditor(props: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const vimSlot = useRef(new Compartment());
  const [active, setActive] = useState<LineFormat | null>(null);
  const liveSlot = useRef(new Compartment());
  const liveExt = () =>
    livePreview({ resolve: () => latest.current.resolve, onLink: () => latest.current.onLink });

  useEffect(() => {
    const source = (ctx: CompletionContext): CompletionResult | null => {
      const complete = latest.current.complete;
      if (!complete) return null;
      const wl = ctx.matchBefore(/\[\[[^\]\n]*/);
      if (wl) {
        return {
          from: wl.from + 2,
          filter: false,
          options: complete("wikilink", wl.text.slice(2)).map((o) => ({
            label: o.label,
            detail: o.detail,
            apply: `${o.insert}]]`,
          })),
        };
      }
      const ct = ctx.matchBefore(/(?:^|[^\w@])@[\w:.-]*/);
      if (ct) {
        const at = ct.text.indexOf("@");
        return {
          from: ct.from + at + 1,
          filter: false,
          options: complete("cite", ct.text.slice(at + 1)).map((o) => ({
            label: o.label,
            detail: o.detail,
            apply: o.insert,
          })),
        };
      }
      return null;
    };
    const v = new EditorView({
      parent: host.current as HTMLDivElement,
      state: EditorState.create({
        doc: props.value,
        extensions: [
          vimSlot.current.of(props.vimMode ? vim() : []),
          liveSlot.current.of(props.live ? liveExt() : []),
          history(),
          drawSelection(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          autocompletion({ override: [latexCompletion, source], icons: false }),
          placeholderExt(props.placeholder ?? ""),
          keymap.of([
            {
              key: "Escape",
              run: () => {
                latest.current.onEscape?.();
                return !!latest.current.onEscape;
              },
            },
            ...tableKeymap,
            ...formatKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
            if (u.docChanged || u.selectionSet) {
              const line = u.state.doc.lineAt(u.state.selection.main.head);
              setActive(lineFormat(line.text));
            }
          }),
          EditorView.domEventHandlers({
            // Close only if focus really left the editor (not to its autocomplete popup, and not
            // a transient blur from the click that opened it, which WebKit produces).
            blur: () => {
              setTimeout(() => {
                const v = view.current;
                if (v && !v.hasFocus && !v.dom.contains(document.activeElement))
                  latest.current.onBlur?.();
              }, 120);
            },
          }),
          EditorView.contentAttributes.of({ "aria-label": props.ariaLabel ?? "Note" }),
          theme,
        ],
      }),
    });
    view.current = v;
    let raf = 0;
    if (props.autoFocus) {
      v.dispatch({ selection: { anchor: v.state.doc.length } });
      v.focus();
      raf = requestAnimationFrame(() => v.focus());
    }
    return () => {
      cancelAnimationFrame(raf);
      view.current = null;
      v.destroy();
    };
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: vimSlot.current.reconfigure(props.vimMode ? vim() : []) });
  }, [props.vimMode]);

  useEffect(() => {
    view.current?.dispatch({ effects: liveSlot.current.reconfigure(props.live ? liveExt() : []) });
  }, [props.live]);

  // re-render link labels when what they resolve to changes
  useEffect(() => {
    const v = view.current;
    if (v && props.live) v.dispatch({});
  }, [props.resolve, props.live]);

  // external value changes (e.g. quote-to-note while the editor is open)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== props.value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: props.value } });
    }
  }, [props.value]);

  const editor = <div className="md-editor" ref={host} />;
  if (!props.toolbar) return editor;
  return (
    <div className="md-with-toolbar">
      <Toolbar
        view={view}
        active={active}
        labels={{
          ...LABELS,
          ...props.labels,
          groups: { ...LABELS.groups, ...props.labels?.groups },
        }}
      />
      {editor}
    </div>
  );
}
