import type { Note } from "@paperlines/backend-port";
import { NoteEditor, renderMarkdown } from "@paperlines/notes-editor";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";
import { useCard } from "../../store/card";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { useFollowLink, useLinkTargets } from "../notes/links";
import { fullAuthors, timeLine } from "../notes/PaperNote";
import { useAutosave } from "../notes/useAutosave";
import { placeCard } from "./place";

/**
 * The paper card: generated header plus the paper note's bullets. Hover shows it read-only;
 * pinned, it scrolls and the bullets are editable inline. The PDF opens only from its button.
 */
export function PaperCard() {
  const { itemId, anchor, pinned, close, keep, hoverEnd } = useCard();
  const item = useLibrary((s) => s.items.find((i) => i.id === itemId));
  const version = usePanes((s) => s.notesVersion);
  const settings = useSettings((s) => s.settings);
  const [note, setNote] = useState<Note | null>(null);
  const [editing, setEditing] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { resolve, complete } = useLinkTargets();
  const follow = useFollowLink(itemId);
  const { body, change, flush } = useAutosave(note?.id ?? null, note?.body ?? null);

  useEffect(() => {
    setEditing(false);
    if (itemId === null) return setNote(null);
    let live = true;
    backend.getPaperNote(itemId).then((n) => live && setNote(n));
    return () => {
      live = false;
    };
  }, [itemId, version]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return setPos(null);
    setPos(
      placeCard(
        anchor,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor, note, body, pinned, editing]);

  useEffect(() => {
    if (itemId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing) {
        flush();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemId, editing, close, flush]);

  if (itemId === null || !item || !anchor) return null;

  const openPdf = () => {
    flush();
    close();
    usePanes.getState().openPdf(item.id);
  };
  const openPaper = () => {
    flush();
    close();
    useUi.getState().select(item.id);
    usePanes.getState().setDetailTab("note");
  };
  const empty = !body.trim();

  return (
    <div
      ref={ref}
      className={`paper-card${pinned ? " pinned" : ""}`}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}
      role={pinned ? "dialog" : "tooltip"}
      aria-label={item.title}
      onMouseEnter={keep}
      onMouseLeave={() => !pinned && hoverEnd()}
    >
      <header className="card-head">
        <div className="card-title">{item.title}</div>
        {pinned && (
          <button
            type="button"
            className="icon-btn"
            aria-label={t("common.close")}
            onClick={() => {
              flush();
              close();
            }}
          >
            ×
          </button>
        )}
      </header>
      {item.authors.length > 0 && <div className="card-authors">{fullAuthors(item)}</div>}
      <div className="muted small">{timeLine(item)}</div>
      <div className="card-body">
        {pinned ? (
          empty && !editing ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                change(settings?.paperNoteTemplate ?? "");
                setEditing(true);
              }}
            >
              {t("notes.addKeyPoints")}
            </button>
          ) : (
            <NoteEditor
              value={body}
              onChange={change}
              onLink={(l) => {
                flush();
                close();
                follow(l);
              }}
              resolve={resolve}
              complete={complete}
              vimMode={settings?.vimMode}
              editing={editing}
              onEditingChange={(e) => {
                setEditing(e);
                if (!e) flush();
              }}
              ariaLabel={t("notes.paperNote")}
              editHint={t("notes.editHint")}
            />
          )
        ) : empty ? (
          <div className="card-empty">{t("card.addKeyPoints")}</div>
        ) : (
          <div
            className="md-preview card-preview"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(body, { resolve }) }}
          />
        )}
      </div>
      <footer className="card-foot">
        {pinned ? (
          <>
            <button type="button" className="btn" onClick={openPaper}>
              {t("card.openPaper")}
            </button>
            <span className="spacer" />
            {item.hasPdf && (
              <button type="button" className="btn btn-primary" onClick={openPdf}>
                {t("reader.open")}
              </button>
            )}
          </>
        ) : (
          <span className="muted small">{t("card.hint")}</span>
        )}
      </footer>
    </div>
  );
}
