import type { NoteRef } from "@paperlines/backend-port";
import type { CompletionOption, LinkInfo, NoteLink, ToolbarLabels } from "@paperlines/notes-editor";
import { useCallback, useEffect, useMemo, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";
import { useCard } from "../../store/card";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useUi } from "../../store/ui";
import { shortAuthors } from "../library/filter";

/** Free/project notes, reloaded when notes change anywhere. */
export function useNoteList(): NoteRef[] {
  const version = usePanes((s) => s.notesVersion);
  const [notes, setNotes] = useState<NoteRef[]>([]);
  useEffect(() => {
    backend.listNotes().then(setNotes);
  }, [version]);
  return notes;
}

/** Link resolution and autocomplete over library citekeys/titles and note titles. */
export function useLinkTargets() {
  const items = useLibrary((s) => s.items);
  const notes = useNoteList();
  const byKey = useMemo(() => new Map(items.map((i) => [i.citekey.toLowerCase(), i])), [items]);
  const byTitle = useMemo(() => new Map(items.map((i) => [i.title.toLowerCase(), i])), [items]);
  const noteByTitle = useMemo(() => new Map(notes.map((n) => [n.title.toLowerCase(), n])), [notes]);

  const resolve = useCallback(
    (target: string): LinkInfo => {
      const t = target.toLowerCase();
      const item = byKey.get(t);
      if (item) return { exists: true, title: item.title };
      if (noteByTitle.has(t)) return { exists: true };
      return { exists: byTitle.has(t) };
    },
    [byKey, byTitle, noteByTitle],
  );

  const complete = useCallback(
    (kind: "wikilink" | "cite", query: string): CompletionOption[] => {
      const q = query.toLowerCase();
      const papers = items
        .filter((i) => i.citekey.toLowerCase().includes(q) || i.title.toLowerCase().includes(q))
        .slice(0, 12)
        .map((i) => ({
          label: i.citekey,
          detail: `${i.title} · ${shortAuthors(i.authors)} ${i.year ?? ""}`.trim(),
          insert: i.citekey,
        }));
      if (kind === "cite") return papers;
      const ns = notes
        .filter((n) => n.title.toLowerCase().includes(q))
        .slice(0, 6)
        .map((n) => ({ label: n.title, detail: t("notes.linkNote"), insert: n.title }));
      // nothing called that yet: link it anyway; opening the link creates the note
      const exact =
        notes.some((n) => n.title.toLowerCase() === q) ||
        items.some((i) => i.citekey.toLowerCase() === q);
      const create =
        query.trim() && !exact
          ? [
              {
                label: t("notes.linkNew", { title: query.trim() }),
                detail: t("notes.linkNewHint"),
                insert: query.trim(),
              },
            ]
          : [];
      return [...ns, ...papers, ...create];
    },
    [items, notes],
  );

  return { resolve, complete, notes };
}

/** Navigates for a clicked link: papers open their paper note, notes open on the right, highlights in the reader. */
export function useFollowLink(contextItemId: number | null) {
  const items = useLibrary((s) => s.items);
  const { notes } = useLinkTargets();
  return useCallback(
    async (link: NoteLink) => {
      const panes = usePanes.getState();
      const ui = useUi.getState();
      const goItem = (id: number) => {
        const visible = useLibrary.getState().results?.ids;
        if (visible && !visible.includes(id)) ui.setQuery("");
        ui.select(id);
        panes.setDetailTab("note");
      };
      if (link.kind === "external") return backend.openExternal(link.url);
      if (link.kind === "highlight") {
        const itemId = contextItemId ?? (await findHighlightItem(link.id));
        if (itemId === null) return;
        const hl = (await backend.listHighlights(itemId)).find((h) => h.id === link.id);
        panes.openPdf(itemId, { page: hl?.page ?? 1, highlightId: link.id });
        return;
      }
      const t = link.target.toLowerCase();
      const item =
        items.find((i) => i.citekey.toLowerCase() === t) ??
        (link.kind === "wikilink" ? items.find((i) => i.title.toLowerCase() === t) : undefined);
      if (
        item &&
        (link.kind === "cite" ||
          !notes.some((n) => n.title.toLowerCase() === t) ||
          item.citekey.toLowerCase() === t)
      )
        return goItem(item.id);
      const note = notes.find((n) => n.title.toLowerCase() === t);
      if (note) return panes.openNote(note.noteId);
      if (link.kind === "wikilink") {
        // following a dangling [[link]] creates the note, like Obsidian
        const created = await backend.createNote({ kind: "free", title: link.target });
        panes.notesChanged();
        panes.openNote(created.id);
      }
    },
    [items, notes, contextItemId],
  );
}

async function findHighlightItem(highlightId: number): Promise<number | null> {
  for (const item of useLibrary.getState().items.filter((i) => i.hasPdf)) {
    if ((await backend.listHighlights(item.id)).some((h) => h.id === highlightId)) return item.id;
  }
  return null;
}

/** Shows the paper card when hovering a [[citekey]] or @citekey in rendered notes. */
export function useLinkHover() {
  const items = useLibrary((s) => s.items);
  return useCallback(
    (link: NoteLink, rect: DOMRect | null) => {
      if (link.kind !== "wikilink" && link.kind !== "cite") return;
      if (!rect) return useCard.getState().hoverEnd();
      const t = link.target.toLowerCase();
      const item =
        items.find((i) => i.citekey.toLowerCase() === t) ??
        items.find((i) => i.title.toLowerCase() === t);
      if (item)
        useCard
          .getState()
          .hoverStart(
            item.id,
            { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            "note",
          );
    },
    [items],
  );
}

/** The note editor's toolbar wording. */
export function toolbarLabels(): Partial<ToolbarLabels> {
  return {
    toolbar: t("notes.tb"),
    h1: t("notes.tb.h1"),
    h2: t("notes.tb.h2"),
    h3: t("notes.tb.h3"),
    bold: t("notes.tb.bold"),
    italic: t("notes.tb.italic"),
    strike: t("notes.tb.strike"),
    code: t("notes.tb.code"),
    bullet: t("notes.tb.bullet"),
    number: t("notes.tb.number"),
    task: t("notes.tb.task"),
    quote: t("notes.tb.quote"),
    link: t("notes.tb.link"),
    inlineMath: t("notes.tb.inline"),
    blockMath: t("notes.tb.block"),
    symbols: t("notes.tb.symbols"),
    table: t("notes.tb.table"),
    tableSize: t("notes.tb.tableSize"),
    tableColumn: t("notes.tb.tableColumn"),
    groups: {
      greek: t("notes.sym.greek"),
      operators: t("notes.sym.operators"),
      relations: t("notes.sym.relations"),
      arrows: t("notes.sym.arrows"),
      sets: t("notes.sym.sets"),
      structure: t("notes.sym.structure"),
    },
  };
}
