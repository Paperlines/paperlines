import { type AutoExport, TAG_COLORS } from "@paperlines/backend-port";
import { FileDown, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useUi } from "../../store/ui";
import { saveProjectBib } from "../export/projectBib";
import { SpineEditor } from "../spine/SpineEditor";
import { SuggestionsInbox } from "./suggestions";

/** The project's .bib: save once, or keep a file that follows the project. */
function ProjectBib({ name }: { name: string }) {
  const [kept, setKept] = useState<AutoExport[]>([]);
  const load = useCallback(
    () =>
      backend
        .listAutoExports()
        .then((all) =>
          setKept(
            all.filter(
              (a) => a.format === "bibtex" && a.scopeKind === "project" && a.scopeValue === name,
            ),
          ),
        ),
    [name],
  );
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="field project-bib">
      <span className="field-label">
        {t("projects.bibFile")}
        <InfoTip label={t("help.about", { what: t("projects.bibFile") })}>
          {t("help.projectBib")}
        </InfoTip>
      </span>
      <div className="row">
        <button type="button" className="btn" onClick={() => saveProjectBib(name)}>
          <FileDown size={14} aria-hidden="true" /> {t("projects.saveBib")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (await saveProjectBib(name, true)) load();
          }}
        >
          <RefreshCw size={14} aria-hidden="true" /> {t("projects.keepBib")}
        </button>
      </div>
      {kept.map((a) => (
        <div key={a.id} className="row small">
          <span className="muted">{t("projects.bibKeptAt")}</span>
          <code className="path" title={a.path}>
            {a.path}
          </code>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await backend.removeAutoExport(a.id);
              load();
            }}
          >
            {t("projects.stopBib")}
          </button>
        </div>
      ))}
      <span className="field-hint">{t("projects.bibHint")}</span>
    </div>
  );
}

/** Create (projectId null) or edit a project. New projects receive the current selection. */
export function ProjectDialog({
  projectId,
  onClose,
}: {
  projectId: number | null;
  onClose(): void;
}) {
  const { projects, mutate } = useLibrary();
  const selectedIds = useUi((s) => s.selectedIds);
  const existing = projects.find((p) => p.id === projectId) ?? null;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [addSelection, setAddSelection] = useState(!existing && selectedIds.length > 0);

  const save = async () => {
    const ok = await mutate(async () => {
      if (existing) await backend.updateProject(existing.id, name, description || null);
      else {
        const id = await backend.createProject(name, description || null);
        if (addSelection) await backend.addToProject(id, selectedIds);
      }
    });
    if (ok) onClose();
  };

  const remove = async () => {
    if (existing && (await backend.confirm(t("projects.deleteConfirm", { name: existing.name })))) {
      if (await mutate(() => backend.deleteProject(existing.id))) onClose();
    }
  };

  /** Each project has one notes document, created on first use. */
  const openNotes = async () => {
    if (!existing) return;
    const found = (await backend.listNotes()).find(
      (n) => n.kind === "project" && n.projectId === existing.id,
    );
    const id = found
      ? found.noteId
      : (
          await backend.createNote({
            kind: "project",
            projectId: existing.id,
            title: t("projects.notesTitle", { name: existing.name }),
          })
        ).id;
    usePanes.getState().notesChanged();
    usePanes.getState().openNote(id);
    onClose();
  };

  return (
    <Dialog
      title={existing ? t("projects.editTitle") : t("projects.newTitle")}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              {t("projects.delete")}
            </button>
          )}
          {existing && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                onClose();
                useDialogs.getState().show("export", existing.name);
              }}
            >
              {t("projects.export")}
            </button>
          )}
          {existing && (
            <button type="button" className="btn" onClick={openNotes}>
              {t("projects.notes")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t("import.cancel")}
          </button>
          <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={save}>
            {existing ? t("common.save") : t("projects.create")}
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save();
        }}
      >
        <label className="field">
          <span className="field-label">{t("projects.name")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t("projects.description")}</span>
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {existing && (
          <div className="field">
            <span className="field-label">{t("projects.color")}</span>
            <div className="swatches" role="group" aria-label={t("projects.color")}>
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch${existing.color === c ? " on" : ""}`}
                  style={{ background: `var(--tag-${c})` }}
                  aria-label={c}
                  aria-pressed={existing.color === c}
                  onClick={() => mutate(() => backend.setProjectColor(existing.id, c))}
                />
              ))}
            </div>
            <span className="field-hint">{t("projects.colorHint")}</span>
          </div>
        )}
        {existing && <SuggestionsInbox projectId={existing.id} onClose={onClose} />}
        {existing && <SpineEditor projectId={existing.id} />}
        {existing && <ProjectBib name={existing.name} />}
        {!existing && selectedIds.length > 0 && (
          <label className="check">
            <input
              type="checkbox"
              checked={addSelection}
              onChange={(e) => setAddSelection(e.target.checked)}
            />
            <span>{t("projects.addSelection", { n: selectedIds.length })}</span>
          </label>
        )}
      </form>
    </Dialog>
  );
}
