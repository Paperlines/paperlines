import type { CitationStyle, ExportFormat, ExportScope } from "@paperlines/backend-port";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";

type Fmt = ExportFormat | "formatted";
const FORMATS: { id: Fmt; ext: string }[] = [
  { id: "bibtex", ext: "bib" },
  { id: "csl-json", ext: "json" },
  { id: "ris", ext: "ris" },
  { id: "markdown", ext: "md" },
  { id: "formatted", ext: "html" },
  { id: "json", ext: "json" },
];
const AUTO: Fmt[] = ["bibtex", "csl-json", "ris", "markdown"];

type ScopeKind = "all" | "selection" | "search" | "project";

/** Pass as the dialog argument to start with the selected papers. */
export const SELECTION = { selection: true } as const;

/** Bibliographies (raw or formatted), the full library dump, notes as Markdown, and auto-updating files. */
export function ExportDialog({
  project,
  selection,
  onClose,
}: {
  project?: string | null;
  selection?: boolean;
  onClose(): void;
}) {
  const { projects } = useLibrary();
  const { selectedIds, query } = useUi();
  const defaultStyle = useSettings((s) => s.settings?.citationStyle ?? "apa");
  const [format, setFormat] = useState<Fmt>("bibtex");
  const [kind, setKind] = useState<ScopeKind>(
    project
      ? "project"
      : (selection && selectedIds.length > 0) || selectedIds.length > 1
        ? "selection"
        : "all",
  );
  const [projectName, setProjectName] = useState(project ?? projects[0]?.name ?? "");
  const [style, setStyle] = useState(defaultStyle);
  const [styles, setStyles] = useState<CitationStyle[]>([]);
  const [keep, setKeep] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    backend.citationStyles().then(setStyles);
  }, []);

  const canKeep = AUTO.includes(format) && kind !== "selection";
  const scope = (): ExportScope => {
    if (format === "json") return { kind: "all" };
    if (kind === "selection") return { kind: "ids", value: selectedIds };
    if (kind === "search") return { kind: "query", value: query };
    if (kind === "project") return { kind: "project", value: projectName };
    return { kind: "all" };
  };

  const run = async () => {
    setMessage(null);
    setError(null);
    if (format === "json") {
      // the whole library: a folder with library.json and every PDF, ready to import elsewhere
      const parent = (await backend.pickPaths("folder"))?.[0];
      if (!parent) return;
      try {
        const r = await backend.exportLibrary(parent);
        setMessage(
          t("export.libraryDone", { papers: r.papers, files: r.files, path: r.path }) +
            (r.missing.length ? ` ${t("export.libraryMissing", { n: r.missing.length })}` : ""),
        );
      } catch (e) {
        setError(String(e));
      }
      return;
    }
    const f = FORMATS.find((x) => x.id === format) ?? FORMATS[0];
    const base = kind === "project" ? projectName || "project" : "references";
    const dest = await backend.pickSavePath(
      `${base.replace(/[\\/:*?"<>|]/g, "-")}.${f.ext}`,
      f.ext,
    );
    if (!dest) return;
    try {
      if (format === "formatted") {
        setMessage(t("export.done", { path: await backend.exportFormatted(scope(), style, dest) }));
      } else if (keep && canKeep) {
        const s = scope();
        const scopeKind = s.kind === "project" ? "project" : s.kind === "query" ? "query" : "all";
        const value = s.kind === "project" || s.kind === "query" ? s.value : null;
        const a = await backend.addAutoExport(format, scopeKind, value, dest);
        setMessage(t("export.kept", { path: a.path }));
      } else {
        setMessage(t("export.done", { path: await backend.exportItems(format, scope(), dest) }));
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const notes = async () => {
    setMessage(null);
    setError(null);
    const dir = await backend.pickPaths("folder");
    if (!dir?.[0]) return;
    try {
      setMessage(t("export.notesDone", { n: await backend.exportNotes(dir[0]), path: dir[0] }));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Dialog
      title={t("export.title")}
      subtitle={t("export.subtitle")}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={notes}>
            {t("export.notes")}
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-primary"
            disabled={kind === "project" && !projectName && format !== "json"}
            onClick={run}
          >
            {format === "json" ? t("export.saveFolder") : t("export.save")}
          </button>
        </>
      }
    >
      <div className="export-grid">
        <fieldset className="field">
          <legend className="field-label">{t("export.format")}</legend>
          {FORMATS.map((f) => (
            <label key={f.id} className="check">
              <input
                type="radio"
                name="format"
                checked={format === f.id}
                onChange={() => setFormat(f.id)}
              />
              <span>
                <strong>{t(`export.f.${f.id}`)}</strong>
                <span className="field-hint">{t(`export.fh.${f.id}`)}</span>
              </span>
            </label>
          ))}
          {format === "formatted" && (
            <select
              className="select"
              aria-label={t("settings.citationStyle")}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </fieldset>
        {format !== "json" && (
          <fieldset className="field">
            <legend className="field-label">{t("export.which")}</legend>
            <label className="check">
              <input
                type="radio"
                name="scope"
                checked={kind === "all"}
                onChange={() => setKind("all")}
              />
              <span>{t("export.all")}</span>
            </label>
            <label className="check">
              <input
                type="radio"
                name="scope"
                disabled={selectedIds.length === 0}
                checked={kind === "selection"}
                onChange={() => setKind("selection")}
              />
              <span>{t("export.selection", { n: selectedIds.length })}</span>
            </label>
            <label className="check">
              <input
                type="radio"
                name="scope"
                disabled={!query.trim()}
                checked={kind === "search"}
                onChange={() => setKind("search")}
              />
              <span>
                {query.trim() ? t("export.search", { q: query }) : t("export.searchNone")}
              </span>
            </label>
            <label className="check">
              <input
                type="radio"
                name="scope"
                disabled={projects.length === 0}
                checked={kind === "project"}
                onChange={() => setKind("project")}
              />
              <span className="row">
                {t("export.project")}
                <select
                  className="select"
                  aria-label={t("export.project")}
                  value={projectName}
                  onChange={(e) => {
                    setProjectName(e.target.value);
                    setKind("project");
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            {AUTO.includes(format) && (
              <div className="check keep-updated">
                <input
                  type="checkbox"
                  id="keep-updated"
                  disabled={!canKeep}
                  checked={keep && canKeep}
                  onChange={(e) => setKeep(e.target.checked)}
                />
                <label htmlFor="keep-updated">
                  <strong>{t("export.keep")}</strong>
                  <span className="field-hint">{t("export.keepHint")}</span>
                </label>
                <InfoTip label={t("help.about", { what: t("export.keep") })}>
                  {t("help.autoExport")}
                </InfoTip>
              </div>
            )}
          </fieldset>
        )}
      </div>
      {message && (
        <div className="alert alert-info" role="status">
          {message}
        </div>
      )}
      {error && <div className="alert">{error}</div>}
    </Dialog>
  );
}
