import type { Item, Note, NoteRef } from "@paperlines/backend-port";
import { NoteEditor, plainSnippet } from "@paperlines/notes-editor";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";
import { usePanes } from "../../store/panes";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { Backlinks } from "./Backlinks";
import { toolbarLabels, useFollowLink, useLinkHover, useLinkTargets } from "./links";
import { useAutosave } from "./useAutosave";

const TOOLBAR = toolbarLabels();

export function fullAuthors(item: Item): string {
  return item.authors.map((a) => (a.given ? `${a.given} ${a.family}` : a.family)).join(", ");
}

export function timeLine(item: Item): string {
  const published = item.pubDate ?? (item.year ? String(item.year) : null);
  return [published, t("detail.added", { date: item.dateAdded.slice(0, 10) })]
    .filter(Boolean)
    .join(" · ");
}

/** The paper note: generated header (never stored) plus the user's bullets. */
export function PaperNote({ item }: { item: Item }) {
  const version = usePanes((s) => s.notesVersion);
  const settings = useSettings((s) => s.settings);
  const livePreview = useUi((s) => s.livePreview);
  const [note, setNote] = useState<Note | null>(null);
  const [editing, setEditing] = useState(false);
  const { resolve, complete } = useLinkTargets();
  const linkHover = useLinkHover();
  const follow = useFollowLink(item.id);
  const { body, change, flush, state } = useAutosave(note?.id ?? null, note?.body ?? null);

  useEffect(() => {
    backend.getPaperNote(item.id).then(setNote);
  }, [item.id, version]);

  const start = () => {
    change(body.trim() ? body : (settings?.paperNoteTemplate ?? ""));
    setEditing(true);
  };

  return (
    <div className="paper-note">
      <header className="note-header">
        <h2>{item.title}</h2>
        {item.authors.length > 0 && <div className="note-authors">{fullAuthors(item)}</div>}
        <div className="muted small">{timeLine(item)}</div>
      </header>
      {!body.trim() && !editing ? (
        <div className="note-empty">
          <span className="muted">{t("notes.empty")}</span>
          <button type="button" className="btn btn-primary" onClick={start}>
            {t("notes.addKeyPoints")}
          </button>
        </div>
      ) : (
        <NoteEditor
          value={body}
          onChange={change}
          toolbar
          toolbarLabels={TOOLBAR}
          onLink={follow}
          onLinkHover={linkHover}
          resolve={resolve}
          complete={complete}
          vimMode={settings?.vimMode}
          live={livePreview}
          editing={editing}
          onEditingChange={(e) => {
            setEditing(e);
            if (!e) flush();
          }}
          placeholder={t("notes.placeholder")}
          ariaLabel={t("notes.paperNote")}
          editHint={t("notes.editHint")}
        />
      )}
      <div className="note-status small muted" role="status">
        {state === "saving"
          ? t("detail.saving")
          : state === "saved"
            ? t("detail.saved")
            : state === "error"
              ? t("notes.saveFailed")
              : ""}
      </div>
      <Backlinks itemId={item.id} />
      <ItemNotes item={item} />
    </div>
  );
}

function ItemNotes({ item }: { item: Item }) {
  const version = usePanes((s) => s.notesVersion);
  const [list, setList] = useState<NoteRef[]>([]);
  useEffect(() => {
    backend.listNotes(item.id).then(setList);
  }, [item.id, version]);
  const create = async () => {
    const n = await backend.createNote({
      kind: "free",
      itemId: item.id,
      title: t("notes.untitled"),
    });
    usePanes.getState().notesChanged();
    usePanes.getState().openNote(n.id);
  };
  return (
    <section className="item-notes">
      <div className="row">
        <h3 className="field-label">{t("notes.otherNotes")}</h3>
        <span className="spacer" />
        <button type="button" className="btn" onClick={create}>
          + {t("notes.new")}
        </button>
      </div>
      <ul>
        {list.map((n) => (
          <li key={n.noteId}>
            <button
              type="button"
              className="backlink"
              onClick={() => usePanes.getState().openNote(n.noteId)}
            >
              <span className="backlink-title">{n.title}</span>
              <span className="backlink-snippet">{plainSnippet(n.snippet)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
