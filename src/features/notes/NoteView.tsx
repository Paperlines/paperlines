import type { Note } from "@paperlines/backend-port";
import { NoteEditor } from "@paperlines/notes-editor";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { Backlinks } from "./Backlinks";
import { toolbarLabels, useFollowLink, useLinkHover, useLinkTargets } from "./links";
import { useAutosave } from "./useAutosave";

/** A free or project note in the right pane. */
const TOOLBAR = toolbarLabels();

export function NoteView({ noteId }: { noteId: number }) {
  const settings = useSettings((s) => s.settings);
  const livePreview = useUi((s) => s.livePreview);
  const { items, projects } = useLibrary();
  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState("");
  const { resolve, complete } = useLinkTargets();
  const linkHover = useLinkHover();
  const follow = useFollowLink(note?.itemId ?? null);
  const { body, change, flush, state } = useAutosave(note?.id ?? null, note?.body ?? null);

  // notes change elsewhere too (an AI assistant adding to them): reload the body when told,
  // the title only when another note opens (it may be being typed)
  const version = usePanes((s) => s.notesVersion);
  useEffect(() => {
    setMissing(false);
    backend
      .getNote(noteId)
      .then((n) => {
        setNote(n);
        setTitle(n.title ?? "");
      })
      .catch(() => setMissing(true));
  }, [noteId]);
  useEffect(() => {
    if (version === 0) return;
    backend
      .getNote(noteId)
      .then(setNote)
      .catch(() => {});
  }, [version]);

  if (missing) return <div className="empty muted">{t("notes.missing")}</div>;
  if (!note) return null;
  const item = items.find((i) => i.id === note.itemId);
  const project = projects.find((p) => p.id === note.projectId);

  const rename = async () => {
    if (title.trim() && title !== note.title) {
      setNote(await backend.renameNote(note.id, title));
      usePanes.getState().notesChanged();
    } else setTitle(note.title ?? "");
  };
  const remove = async () => {
    if (await backend.confirm(t("notes.deleteConfirm", { title: note.title ?? "" }))) {
      await flush();
      await backend.deleteNote(note.id);
      usePanes.getState().notesChanged();
      usePanes.getState().closeRight();
    }
  };

  return (
    <div className="note-view">
      <div className="toolbar">
        {item && (
          <button type="button" className="btn" onClick={() => useUi.getState().select(item.id)}>
            ← {item.citekey}
          </button>
        )}
        {project && <span className="badge">{project.name}</span>}
        <span className="spacer" />
        <span className="small muted" role="status">
          {state === "saving" ? t("detail.saving") : state === "saved" ? t("detail.saved") : ""}
        </span>
        <button type="button" className="btn btn-danger" onClick={remove}>
          {t("notes.delete")}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t("common.close")}
          onClick={() => usePanes.getState().closeRight()}
        >
          ×
        </button>
      </div>
      <div className="note-body">
        <input
          className="title-input note-title"
          aria-label={t("notes.title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <NoteEditor
          key={note.id}
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
          onEditingChange={(e) => !e && flush()}
          placeholder={t("notes.freePlaceholder")}
          ariaLabel={t("notes.body")}
          editHint={t("notes.editHint")}
        />
        <Backlinks noteId={note.id} />
      </div>
    </div>
  );
}
