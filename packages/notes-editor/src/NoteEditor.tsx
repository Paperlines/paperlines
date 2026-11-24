import { useMemo, useState } from "react";
import { type CompletionOption, MarkdownEditor, type ToolbarLabels } from "./MarkdownEditor";
import { type LinkInfo, linkFromClick, type NoteLink, renderMarkdown } from "./markdown";

export interface NoteEditorProps {
  value: string;
  onChange(value: string): void;
  onLink(link: NoteLink): void;
  resolve?(target: string): LinkInfo;
  complete?(kind: "wikilink" | "cite", query: string): CompletionOption[];
  vimMode?: boolean;
  placeholder?: string;
  /** Start in edit mode (e.g. right after "Add key points"). */
  editing?: boolean;
  onEditingChange?(editing: boolean): void;
  ariaLabel?: string;
  editHint?: string;
  /** Always-editable live preview instead of rendered view + click to edit. */
  live?: boolean;
  /** Pointer entered (rect) or left (null) a rendered [[link]] or @cite. */
  onLinkHover?(link: NoteLink, rect: DOMRect | null): void;
  /** Link / formula / symbol buttons while editing. */
  toolbar?: boolean;
  toolbarLabels?: Partial<ToolbarLabels>;
}

/** Rendered Markdown that turns into a CodeMirror editor on click; Escape or leaving returns to the rendered view. */
export function NoteEditor(p: NoteEditorProps) {
  const [ownEditing, setOwnEditing] = useState(false);
  const editing = p.editing ?? ownEditing;
  const setEditing = (e: boolean) => {
    setOwnEditing(e);
    p.onEditingChange?.(e);
  };
  const html = useMemo(() => renderMarkdown(p.value, { resolve: p.resolve }), [p.value, p.resolve]);

  if (p.live) {
    return (
      <div
        className="md-live"
        onMouseOver={(e) => {
          const el = (e.target as HTMLElement).closest?.("a.cm-lp-link") as HTMLElement | null;
          if (el)
            p.onLinkHover?.(
              { kind: el.dataset.kind as "wikilink" | "cite", target: el.dataset.target ?? "" },
              el.getBoundingClientRect(),
            );
        }}
        onMouseOut={(e) => {
          const el = (e.target as HTMLElement).closest?.("a.cm-lp-link") as HTMLElement | null;
          if (el)
            p.onLinkHover?.(
              { kind: el.dataset.kind as "wikilink" | "cite", target: el.dataset.target ?? "" },
              null,
            );
        }}
      >
        <MarkdownEditor
          value={p.value}
          onChange={p.onChange}
          complete={p.complete}
          vimMode={p.vimMode}
          placeholder={p.placeholder}
          ariaLabel={p.ariaLabel}
          autoFocus={p.editing}
          live
          resolve={p.resolve}
          onLink={p.onLink}
          toolbar={p.toolbar}
          labels={p.toolbarLabels}
          onBlur={() => p.onEditingChange?.(false)}
        />
      </div>
    );
  }
  if (editing) {
    return (
      <MarkdownEditor
        value={p.value}
        onChange={p.onChange}
        complete={p.complete}
        vimMode={p.vimMode}
        placeholder={p.placeholder}
        ariaLabel={p.ariaLabel}
        autoFocus
        toolbar={p.toolbar}
        labels={p.toolbarLabels}
        onBlur={() => setEditing(false)}
        onEscape={p.vimMode ? undefined : () => setEditing(false)}
      />
    );
  }
  return (
    <div
      className={`md-preview${p.value.trim() ? "" : " md-empty"}`}
      role="button"
      tabIndex={0}
      aria-label={p.editHint ?? "Edit note"}
      onClick={(e) => {
        const link = linkFromClick(e.target);
        if (link) {
          e.preventDefault();
          p.onLink(link);
          return;
        }
        if ((e.target as HTMLElement).closest("a")) {
          e.preventDefault();
          return;
        }
        if (!window.getSelection()?.toString()) setEditing(true);
      }}
      onMouseOver={(e) => {
        const link = linkFromClick(e.target);
        if (link && (link.kind === "wikilink" || link.kind === "cite")) {
          p.onLinkHover?.(
            link,
            ((e.target as HTMLElement).closest("a") as HTMLElement).getBoundingClientRect(),
          );
        }
      }}
      onMouseOut={(e) => {
        const link = linkFromClick(e.target);
        if (link && (link.kind === "wikilink" || link.kind === "cite")) p.onLinkHover?.(link, null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          setEditing(true);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html || `<p>${p.placeholder ?? ""}</p>` }}
    />
  );
}
