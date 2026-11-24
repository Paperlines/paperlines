// Markdown to HTML with KaTeX math ($...$, $$...$$), [[wikilinks]] and @citekey references.
// Raw HTML in notes is never rendered (html: false), so note content cannot inject markup.
import katex from "katex";
import markdownIt, { type MarkdownIt, type StateBlock, type StateInline } from "markdown-it";

export interface LinkInfo {
  exists: boolean;
  /** Display text when the link has no explicit label, e.g. a paper title for a citekey. */
  title?: string;
}

export interface RenderEnv {
  resolve?: (target: string) => LinkInfo;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function tex(src: string, display: boolean): string {
  return katex.renderToString(src, { throwOnError: false, displayMode: display, output: "html" });
}

function mathInline(state: StateInline, silent: boolean): boolean {
  const s = state.src;
  const start = state.pos;
  if (s[start] !== "$") return false;
  const display = s[start + 1] === "$";
  const open = display ? 2 : 1;
  if (!display && (s[start + 1] === " " || s[start + 1] === undefined)) return false;
  let end = start + open;
  while (end < s.length) {
    if (s[end] === "\\") {
      end += 2;
      continue;
    }
    if (s.startsWith(display ? "$$" : "$", end)) break;
    end++;
  }
  if (end >= s.length || end === start + open) return false;
  if (!display && s[end - 1] === " ") return false;
  if (!silent) {
    const tok = state.push(display ? "math_display" : "math_inline", "", 0);
    tok.content = s.slice(start + open, end);
  }
  state.pos = end + open;
  return true;
}

function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const lineText = (n: number) =>
    state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
  const first = lineText(startLine);
  if (!first.startsWith("$$")) return false;
  if (silent) return true;
  let content: string;
  let last = startLine;
  if (first.length > 4 && first.trimEnd().endsWith("$$")) {
    content = first.trim().slice(2, -2);
  } else {
    const lines = [first.slice(2)];
    for (last = startLine + 1; last < endLine; last++) {
      const l = lineText(last);
      if (l.trimEnd().endsWith("$$")) {
        lines.push(l.trimEnd().slice(0, -2));
        break;
      }
      lines.push(l);
    }
    content = lines.join("\n");
  }
  const tok = state.push("math_display", "", 0);
  tok.content = content;
  tok.block = true;
  state.line = last + 1;
  return true;
}

function wikilink(state: StateInline, silent: boolean): boolean {
  const s = state.src;
  if (!s.startsWith("[[", state.pos)) return false;
  const end = s.indexOf("]]", state.pos + 2);
  const nl = s.indexOf("\n", state.pos);
  if (end < 0 || (nl >= 0 && nl < end)) return false;
  const inner = s.slice(state.pos + 2, end);
  if (!inner.trim() || inner.includes("[")) return false;
  if (!silent) {
    const [targetPart, label] = inner.split("|");
    const tok = state.push("wikilink", "", 0);
    tok.meta = { target: targetPart.split("#")[0].trim(), label: label?.trim() };
  }
  state.pos = end + 2;
  return true;
}

function cite(state: StateInline, silent: boolean): boolean {
  const s = state.src;
  if (s[state.pos] !== "@") return false;
  const prev = state.pos > 0 ? s[state.pos - 1] : "";
  if (prev && /[\w@]/.test(prev)) return false;
  const m = /^@([A-Za-z](?:[\w:.-]*\w)?)/.exec(s.slice(state.pos));
  if (!m) return false;
  if (!silent) {
    const tok = state.push("cite", "", 0);
    tok.meta = { target: m[1] };
  }
  state.pos += m[0].length;
  return true;
}

export function createRenderer(): MarkdownIt {
  const md = markdownIt({ html: false, linkify: true, breaks: false });
  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.inline.ruler.before("link", "wikilink", wikilink);
  md.inline.ruler.after("emphasis", "cite", cite);
  md.block.ruler.after("blockquote", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  // tables scroll sideways inside their own box when wider than the pane
  md.renderer.rules.table_open = () => '<div class="md-table"><table>\n';
  md.renderer.rules.table_close = () => "</table></div>\n";
  md.renderer.rules.math_inline = (tokens, i) => tex(tokens[i].content, false);
  md.renderer.rules.math_display = (tokens, i) =>
    tokens[i].block
      ? `<div class="math-block">${tex(tokens[i].content, true)}</div>\n`
      : tex(tokens[i].content, true);
  md.renderer.rules.wikilink = (tokens, i, _o, env) => {
    const { target, label } = tokens[i].meta as { target: string; label?: string };
    const info = (env as RenderEnv | undefined)?.resolve?.(target) ?? { exists: true };
    const text = label || info.title || target;
    return `<a href="#" class="wikilink${info.exists ? "" : " unresolved"}" data-wikilink="${esc(target)}">${esc(text)}</a>`;
  };
  md.renderer.rules.cite = (tokens, i, _o, env) => {
    const { target } = tokens[i].meta as { target: string };
    const info = (env as RenderEnv | undefined)?.resolve?.(target) ?? { exists: true };
    const title = info.title ? ` title="${esc(info.title)}"` : "";
    return `<a href="#" class="cite${info.exists ? "" : " unresolved"}" data-cite="${esc(target)}"${title}>@${esc(target)}</a>`;
  };
  return md;
}

const shared = createRenderer();

export function renderMarkdown(src: string, env: RenderEnv = {}): string {
  return shared.render(src, env as Record<string, unknown>);
}

export type NoteLink =
  | { kind: "wikilink"; target: string }
  | { kind: "cite"; target: string }
  | { kind: "highlight"; id: number }
  | { kind: "external"; url: string };

/** Classifies a click inside rendered note HTML. Returns null for clicks that are not on links. */
export function linkFromClick(target: EventTarget | null): NoteLink | null {
  const a = (target as HTMLElement | null)?.closest?.("a");
  if (!a) return null;
  if (a.dataset.wikilink !== undefined) return { kind: "wikilink", target: a.dataset.wikilink };
  if (a.dataset.cite !== undefined) return { kind: "cite", target: a.dataset.cite };
  const href = a.getAttribute("href") ?? "";
  const hl = /^#hl-(\d+)$/.exec(href);
  if (hl) return { kind: "highlight", id: Number(hl[1]) };
  if (/^https?:\/\//i.test(href)) return { kind: "external", url: href };
  return null;
}

/** The Markdown for a quoted highlight bullet: "> text" plus a link back to the PDF location. */
export function quoteBullet(text: string, page: number, highlightId: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return `> ${clean} ([p. ${page}](#hl-${highlightId}))`;
}

/** A one-line plain-text preview of Markdown: link labels instead of link syntax, no list or quote markers. */
export function plainSnippet(md: string): string {
  return md
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .trim();
}
