import { useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { useUi } from "../../store/ui";

/** Toggle project membership for the selection; typing a new name offers to create it. */
export function ProjectPickerDialog({ onClose }: { onClose(): void }) {
  const { items, projects, mutate } = useLibrary();
  const ids = useUi((s) => s.selectedIds);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const selected = items.filter((i) => ids.includes(i.id));
  const shown = projects.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const canCreate =
    q.trim() && !projects.some((p) => p.name.toLowerCase() === q.trim().toLowerCase());
  const rows = [
    ...shown.map((p) => ({ kind: "project" as const, p })),
    ...(canCreate ? [{ kind: "create" as const }] : []),
  ];

  const state = (pid: number) => {
    const n = selected.filter((i) => i.projectIds.includes(pid)).length;
    return n === 0 ? "none" : n === selected.length ? "all" : "some";
  };
  const activate = (i: number) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === "create") {
      mutate(async () => backend.addToProject(await backend.createProject(q, null), ids));
      setQ("");
    } else if (state(row.p.id) === "all") mutate(() => backend.removeFromProject(row.p.id, ids));
    else mutate(() => backend.addToProject(row.p.id, ids));
  };

  return (
    <Dialog
      title={t("projects.pickerTitle", { n: selected.length })}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t("settings.close")}
        </button>
      }
    >
      <input
        className="input"
        placeholder={t("projects.filter")}
        aria-label={t("projects.filter")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive(Math.min(rows.length - 1, active + 1));
          else if (e.key === "ArrowUp") setActive(Math.max(0, active - 1));
          else if (e.key === "Enter") activate(active);
          else return;
          e.preventDefault();
        }}
      />
      <ul className="pick-list" role="listbox">
        {rows.map((row, i) => (
          <li
            key={row.kind === "create" ? "create" : row.p.id}
            role="option"
            aria-selected={i === active}
          >
            <button
              type="button"
              className={i === active ? "active" : ""}
              onClick={() => activate(i)}
            >
              {row.kind === "create" ? (
                <span>{t("projects.createNamed", { name: q.trim() })}</span>
              ) : (
                <>
                  <span className={`tick tick-${state(row.p.id)}`} aria-hidden="true" />
                  <span>{row.p.name}</span>
                  <span className="spacer" />
                  <span className="muted small">{row.p.count}</span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
