import type { Item, NoteRef } from "@paperlines/backend-port";
import { fuzzyScore } from "@paperlines/registry";
import { useEffect, useMemo, useState } from "react";
import { backend } from "../../backend";
import { registry } from "../../contributions/commands";
import { t } from "../../i18n";
import { formatShortcut } from "../../platform";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { usePlatform } from "../../store/platform";
import { useUi } from "../../store/ui";
import { shortAuthors } from "../library/filter";
import { useNoteList } from "../notes/links";

type Row =
  | { kind: "command"; id: string; title: string; hint?: string; run(): void }
  | { kind: "item"; item: Item }
  | { kind: "note"; note: NoteRef }
  | { kind: "search"; query: string };

export function CommandPalette({ onClose }: { onClose(): void }) {
  const platform = usePlatform((s) => s.platform);
  const items = useLibrary((s) => s.items);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<number[]>([]);
  const notes = useNoteList();

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    let live = true;
    const h = setTimeout(() => {
      backend.search(q).then((r) => live && setHits(r.ids.slice(0, 6)));
    }, 80);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [q]);

  const rows: Row[] = useMemo(() => {
    const cmds = registry
      .listCommands()
      .filter((c) => c.id !== "palette")
      .map((c) => ({ c, s: fuzzyScore(q, [c.title, ...(c.keywords ?? [])].join(" ")) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
      .slice(0, q ? 8 : 20)
      .map(({ c }) => ({
        kind: "command" as const,
        id: c.id,
        title: c.title,
        hint: c.shortcut && platform ? formatShortcut(platform, c.shortcut) : undefined,
        run: c.run,
      }));
    const byId = new Map(items.map((i) => [i.id, i]));
    const found = hits
      .map((id) => byId.get(id))
      .filter((i): i is Item => !!i)
      .map((item) => ({ kind: "item" as const, item }));
    const noteRows = q.trim()
      ? notes
          .map((note) => ({ note, s: fuzzyScore(q, note.title) }))
          .filter((x) => x.s !== null)
          .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
          .slice(0, 5)
          .map(({ note }) => ({ kind: "note" as const, note }))
      : [];
    const search = q.trim() ? [{ kind: "search" as const, query: q.trim() }] : [];
    return [...cmds, ...noteRows, ...found, ...search];
  }, [q, hits, items, platform, notes]);

  const run = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    if (row.kind === "command") row.run();
    else if (row.kind === "search") useUi.getState().setQuery(row.query);
    else if (row.kind === "note") usePanes.getState().openNote(row.note.noteId);
    else {
      const ui = useUi.getState();
      const visible = useLibrary.getState().results?.ids;
      if (visible && !visible.includes(row.item.id)) ui.setQuery("");
      ui.select(row.item.id);
    }
  };

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("cmd.palette")}>
        <input
          className="palette-input"
          autoFocus
          placeholder={t("palette.placeholder")}
          aria-label={t("palette.placeholder")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive(Math.min(rows.length - 1, active + 1));
            else if (e.key === "ArrowUp") setActive(Math.max(0, active - 1));
            else if (e.key === "Enter") run(rows[active]);
            else if (e.key === "Escape") onClose();
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        <ul className="palette-list" role="listbox">
          {rows.length === 0 && <li className="muted palette-empty">{t("palette.empty")}</li>}
          {rows.map((r, i) => (
            <li
              key={
                r.kind === "command"
                  ? r.id
                  : r.kind === "item"
                    ? `i${r.item.id}`
                    : r.kind === "note"
                      ? `n${r.note.noteId}`
                      : "search"
              }
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseMove={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                run(r);
              }}
            >
              {r.kind === "command" && (
                <>
                  <span>{r.title}</span>
                  <span className="spacer" />
                  {r.hint && <kbd>{r.hint}</kbd>}
                </>
              )}
              {r.kind === "item" && (
                <>
                  <span className="palette-item-title">{r.item.title}</span>
                  <span className="muted small">
                    {[shortAuthors(r.item.authors), r.item.year].filter(Boolean).join(" · ")}
                  </span>
                </>
              )}
              {r.kind === "note" && (
                <>
                  <span className="palette-item-title">{r.note.title}</span>
                  <span className="muted small">{t("palette.note")}</span>
                </>
              )}
              {r.kind === "search" && <span>{t("palette.searchFor", { q: r.query })}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
