import type { NoteRef } from "@paperlines/backend-port";
import { plainSnippet } from "@paperlines/notes-editor";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";
import { usePanes } from "../../store/panes";
import { useUi } from "../../store/ui";

export function Backlinks({ itemId, noteId }: { itemId?: number; noteId?: number }) {
  const version = usePanes((s) => s.notesVersion);
  const [refs, setRefs] = useState<NoteRef[]>([]);
  useEffect(() => {
    const p =
      itemId !== undefined
        ? backend.itemBacklinks(itemId)
        : noteId !== undefined
          ? backend.noteBacklinks(noteId)
          : null;
    p?.then(setRefs);
  }, [itemId, noteId, version]);
  if (!refs.length) return null;
  const open = (r: NoteRef) => {
    if (r.kind === "paper_note" && r.itemId !== null) {
      useUi.getState().select(r.itemId);
      usePanes.getState().setDetailTab("note");
    } else usePanes.getState().openNote(r.noteId);
  };
  return (
    <section className="backlinks" aria-label={t("notes.backlinks")}>
      <h3 className="field-label">{t("notes.backlinks")}</h3>
      <ul>
        {refs.map((r) => (
          <li key={r.noteId}>
            <button type="button" className="backlink" onClick={() => open(r)}>
              <span className="backlink-title">{r.title}</span>
              <span className="backlink-snippet">{plainSnippet(r.snippet)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
