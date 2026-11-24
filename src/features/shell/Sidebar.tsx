import type { NoteRef } from "@paperlines/backend-port";
import { qualifier } from "@paperlines/search-query";
import {
  ChevronDown,
  FileDown,
  Files,
  FileText,
  Folder,
  Hash,
  Library,
  LibraryBig,
  MoreHorizontal,
  NotebookText,
  Plus,
  Search,
  Sparkles,
  Telescope,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { backend } from "../../backend";
import { TrashIcon } from "../../components/TrashIcon";
import { t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useTrashCount } from "../../store/trash";
import { useUi, type View } from "../../store/ui";
import { saveProjectBib } from "../export/projectBib";
import { useNoteList } from "../notes/links";
import { useSuggestionCounts, useSuggestionRefresh } from "../projects/suggestions";
import { tagTree } from "../tags/tree";

const readCollapsed = (): Record<string, boolean> => {
  try {
    return JSON.parse(window.localStorage.getItem("sidebar-collapsed") ?? "{}");
  } catch {
    return {};
  }
};

function Section(p: {
  id: string;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed()[p.id] ?? false);
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      window.localStorage.setItem(
        "sidebar-collapsed",
        JSON.stringify({ ...readCollapsed(), [p.id]: !collapsed }),
      );
    } catch {
      /* storage may be unavailable; the section still toggles */
    }
  };
  return (
    <section className="side-section">
      <div className="side-head">
        <button type="button" className="side-head-btn" aria-expanded={!collapsed} onClick={toggle}>
          {/* one arrow, turned to point right when collapsed (CSS) */}
          <ChevronDown size={13} aria-hidden="true" />
          <span>{p.title}</span>
        </button>
        {p.action}
        {p.count !== undefined && <span className="side-count">{p.count}</span>}
      </div>
      {!collapsed && <div className="side-body">{p.children}</div>}
    </section>
  );
}

function LibraryPanel() {
  const { tags, projects, saved, items, mutate } = useLibrary();
  const { query, setQuery, setView } = useUi();
  const show = useDialogs((s) => s.show);
  const waiting = useSuggestionCounts((s) => s.counts);
  useSuggestionRefresh();
  const [tagFilter, setTagFilter] = useState("");
  const go = (q: string) => {
    setView("library");
    setQuery(q);
  };
  const active = (q: string) => (query.trim() === q ? " active" : "");
  const counts = useMemo(() => {
    const c = { unread: 0, reading: 0, read: 0 };
    for (const i of items) c[i.readStatus]++;
    return c;
  }, [items]);
  const tree = tagTree(tags).filter(
    (n) => !tagFilter.trim() || n.path.toLowerCase().includes(tagFilter.trim().toLowerCase()),
  );
  return (
    <>
      <Section id="library" title={t("sidebar.library")}>
        <button type="button" className={`nav-item${active("")}`} onClick={() => go("")}>
          <Library size={14} aria-hidden="true" />
          <span className="nav-name">{t("sidebar.all")}</span>
          <span className="nav-count">{items.length}</span>
        </button>
        {(["unread", "reading", "read"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`nav-item${active(`is:${s}`)}`}
            onClick={() => go(`is:${s}`)}
          >
            <span className={`dot dot-${s}`} aria-hidden="true" />
            <span className="nav-name">{t(`status.${s}`)}</span>
            <span className="nav-count">{counts[s]}</span>
          </button>
        ))}
      </Section>
      <Section id="saved" title={t("sidebar.saved")} count={saved.length}>
        {saved.length === 0 && <div className="nav-empty">{t("sidebar.savedEmpty")}</div>}
        {saved.map((s) => (
          <div key={s.id} className={`nav-item${active(s.query)}`}>
            <Search size={14} aria-hidden="true" />
            <button type="button" className="nav-name" title={s.query} onClick={() => go(s.query)}>
              {s.name}
            </button>
            <button
              type="button"
              className="nav-action"
              aria-label={t("sidebar.deleteSaved", { name: s.name })}
              onClick={() => mutate(() => backend.deleteSavedSearch(s.id))}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
      </Section>
      <Section
        id="projects"
        title={t("sidebar.projects")}
        count={projects.length}
        action={
          <button
            type="button"
            className="nav-action shown"
            aria-label={t("projects.new")}
            onClick={() => show("project")}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        }
      >
        {projects.length === 0 && (
          <button type="button" className="nav-empty-btn" onClick={() => show("project")}>
            {t("sidebar.projectsCreate")}
          </button>
        )}
        {projects.map((p) => {
          const q = qualifier("project", p.name);
          return (
            <div key={p.id} className={`nav-item${active(q)}`} data-drop-project={p.id}>
              <Folder
                size={14}
                aria-hidden="true"
                className="project-folder"
                style={{ color: `var(--tag-${p.color})` }}
              />
              <button
                type="button"
                className="nav-name"
                title={p.description ?? p.name}
                onClick={() => go(q)}
              >
                {p.name}
              </button>
              {(waiting.get(p.id) ?? 0) > 0 && (
                <button
                  type="button"
                  className="sugg-badge"
                  aria-label={t("sugg.badge", { n: waiting.get(p.id) ?? 0, name: p.name })}
                  title={t("sugg.badge", { n: waiting.get(p.id) ?? 0, name: p.name })}
                  onClick={() => show("project", p.id)}
                >
                  <Sparkles size={11} aria-hidden="true" />
                  {waiting.get(p.id)}
                </button>
              )}
              <span className="nav-actions">
                <button
                  type="button"
                  className="nav-action"
                  aria-label={t("projects.saveBibFor", { name: p.name })}
                  title={t("projects.saveBib")}
                  onClick={() => saveProjectBib(p.name)}
                >
                  <FileDown size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="nav-action"
                  aria-label={t("projects.edit", { name: p.name })}
                  onClick={() => show("project", p.id)}
                >
                  <MoreHorizontal size={14} aria-hidden="true" />
                </button>
              </span>
              <span className="nav-count">{p.count}</span>
            </div>
          );
        })}
      </Section>
      <Section
        id="tags"
        title={t("sidebar.tags")}
        count={tags.length}
        action={
          tags.length > 0 ? (
            <button type="button" className="nav-link" onClick={() => show("manageTags")}>
              {t("sidebar.manage")}
            </button>
          ) : undefined
        }
      >
        {tags.length > 6 && (
          <input
            className="input side-filter"
            placeholder={t("sidebar.filterTags")}
            aria-label={t("sidebar.filterTags")}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
        )}
        {tags.length === 0 && <div className="nav-empty">{t("sidebar.tagsEmpty")}</div>}
        {tree.map((n) => {
          const q = qualifier("tag", n.path);
          return (
            <div
              key={n.path}
              className={`nav-item${active(q)}`}
              data-drop-tag={n.path}
              style={{ paddingLeft: 8 + n.depth * 14 }}
            >
              {n.tag?.color ? (
                <span className="chip-dot" style={{ background: `var(--tag-${n.tag.color})` }} />
              ) : (
                <Hash size={13} aria-hidden="true" />
              )}
              <button type="button" className="nav-name" onClick={() => go(q)}>
                {n.name}
              </button>
              {n.tag && n.tag.count > 0 && <span className="nav-count">{n.tag.count}</span>}
            </div>
          );
        })}
      </Section>
    </>
  );
}

function NotesPanel() {
  const notes = useNoteList();
  const [q, setQ] = useState("");
  const shown = notes.filter(
    (n: NoteRef) =>
      !q.trim() || `${n.title} ${n.snippet}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <Section
      id="notes"
      title={t("sidebar.notes")}
      count={notes.length}
      action={
        <button
          type="button"
          className="nav-action shown"
          aria-label={t("cmd.newNote")}
          onClick={async () => {
            const n = await backend.createNote({ kind: "free", title: t("notes.untitled") });
            usePanes.getState().notesChanged();
            usePanes.getState().openNote(n.id);
          }}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      }
    >
      <input
        className="input side-filter"
        placeholder={t("sidebar.filterNotes")}
        aria-label={t("sidebar.filterNotes")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {shown.length === 0 && <div className="nav-empty">{t("sidebar.notesEmpty")}</div>}
      {shown.map((n) => (
        <button
          key={n.noteId}
          type="button"
          className="nav-item note-link"
          onClick={() => usePanes.getState().openNote(n.noteId)}
        >
          <FileText size={14} aria-hidden="true" />
          <span className="nav-name">{n.title}</span>
        </button>
      ))}
    </Section>
  );
}

export function Sidebar() {
  const { view, setView } = useUi();
  const [dups, setDups] = useState(0);
  const trash = useTrashCount((s) => s.count);
  const items = useLibrary((s) => s.items);
  useEffect(() => {
    backend.duplicateGroups().then((d) => setDups(d.length));
    useTrashCount.getState().refresh();
  }, [items, view]);
  const counts = { trash, dups };
  const tabs: { id: View; icon: typeof LibraryBig; label: string; badge?: number }[] = [
    { id: "library", icon: LibraryBig, label: t("view.library") },
    { id: "notes", icon: NotebookText, label: t("view.notes") },
    { id: "discover", icon: Telescope, label: t("view.discover") },
    { id: "duplicates", icon: Files, label: t("view.duplicates"), badge: counts.dups },
  ];
  return (
    <nav className="sidebar" aria-label={t("sidebar.label")}>
      <div className="side-tabs" role="tablist" aria-label={t("sidebar.views")}>
        {tabs.map(({ id, icon: Icon, label, badge }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            aria-label={label}
            title={label}
            className={view === id ? "on" : ""}
            onClick={() => setView(id)}
          >
            <Icon size={16} aria-hidden="true" />
            <span className="side-tab-name" aria-hidden="true">
              {t(`view.short.${id}`)}
            </span>
            {badge ? <span className="badge-dot">{badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="side-scroll">{view === "notes" ? <NotesPanel /> : <LibraryPanel />}</div>
      {/* the Trash sits at the bottom, out of the way, like a Dock */}
      <div className="sidebar-foot">
        <button
          type="button"
          className={`nav-item side-trash${view === "trash" ? " active" : ""}`}
          aria-current={view === "trash" ? "page" : undefined}
          onClick={() => setView("trash")}
        >
          <TrashIcon full={counts.trash > 0} />
          <span className="nav-name">{t("view.trash")}</span>
          {counts.trash > 0 && <span className="nav-count">{counts.trash}</span>}
        </button>
      </div>
    </nav>
  );
}
