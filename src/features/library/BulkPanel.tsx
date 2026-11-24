import type { ReadStatus } from "@paperlines/backend-port";
import { backend } from "../../backend";
import { trashWithUndo } from "../../contributions/commands";
import { t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { useUi } from "../../store/ui";
import { TagInput } from "../tags/TagInput";

export function BulkPanel() {
  const { items, tags, projects, mutate } = useLibrary();
  const { selectedIds, select } = useUi();
  const show = useDialogs((s) => s.show);
  const selected = items.filter((i) => selectedIds.includes(i.id));
  const present = [...new Set(selected.flatMap((i) => i.tags))].sort();
  const ids = selected.map((i) => i.id);

  return (
    <div className="detail">
      <div className="toolbar">
        <strong>{t("bulk.selected", { n: selected.length })}</strong>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => select(null)}>
          {t("bulk.clear")}
        </button>
      </div>
      <div className="detail-body">
        <div className="field">
          <span className="field-label">{t("detail.status")}</span>
          <div className="segmented" role="group" aria-label={t("detail.status")}>
            {(["unread", "reading", "read"] as ReadStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={selected.every((i) => i.readStatus === s)}
                className={selected.every((i) => i.readStatus === s) ? "on" : ""}
                onClick={() => mutate(() => backend.setReadStatus(ids, s))}
              >
                {t(`status.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">{t("detail.tags")}</span>
          <TagInput
            value={present}
            allTags={tags}
            onAdd={(p) => mutate(() => backend.tagItems(ids, [p]))}
            onRemove={(p) => mutate(() => backend.untagItems(ids, [p]))}
          />
          <span className="field-hint">{t("tags.pickerHint")}</span>
        </div>
        <div className="field">
          <span className="field-label">{t("detail.projects")}</span>
          <div className="row">
            {projects.map((p) => {
              const n = selected.filter((i) => i.projectIds.includes(p.id)).length;
              return n > 0 ? (
                <span key={p.id} className="chip">
                  <span className="chip-label">
                    {p.name} {n < selected.length && <span className="muted">({n})</span>}
                  </span>
                  <button
                    type="button"
                    className="chip-x"
                    aria-label={t("projects.removeFrom", { name: p.name })}
                    onClick={() => mutate(() => backend.removeFromProject(p.id, ids))}
                  >
                    ×
                  </button>
                </span>
              ) : null;
            })}
            <button type="button" className="btn" onClick={() => show("projectPicker")}>
              {t("projects.addTo")}
            </button>
          </div>
        </div>
        <div className="danger-zone">
          <button type="button" className="btn btn-danger" onClick={() => trashWithUndo(ids)}>
            {t("bulk.trash", { n: ids.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
