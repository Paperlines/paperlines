import type {
  Candidate,
  CommitResult,
  ImportAction,
  ImportReport,
  Preview,
  Progress,
} from "@paperlines/backend-port";
import {
  ArrowRight,
  BookOpen,
  Database,
  FileText,
  FolderOpen,
  Hash,
  Library,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { shortAuthors } from "../library/filter";

export interface ImportStart {
  paths?: string[];
  start?: "files" | "folder" | "paste" | "zotero" | "dump";
  /** Identifiers (one per line) to look up right away, e.g. from "Papers citing this". */
  text?: string;
  /** Files dropped on a project: what is added (or merged) goes into it. */
  projectId?: number;
  /** After importing into `projectId`, show that project as a graph ("Map these papers"). */
  openGraph?: boolean;
}

interface Props {
  start: ImportStart | null;
  offline: boolean;
  onClose(): void;
}

/** Whether the matched library paper lacks the file this candidate brings. */
function bringsMissingFile(c: Candidate): boolean {
  if (c.duplicateOf === null || !c.pdfPath) return false;
  const existing = useLibrary.getState().items.find((i) => i.id === c.duplicateOf);
  if (!existing) return false;
  return (c.fileKind ?? "pdf") === "epub" ? !existing.hasEpub : !existing.hasPdf;
}

/** New papers are added; a PDF or EPUB for a paper that has none is attached to it (no duplicate);
 * anything else already in the library is skipped. */
function defaultAction(c: Candidate): ImportAction {
  if (c.duplicateOf === null) return "add";
  return bringsMissingFile(c) ? "merge" : "skip";
}

type Phase = "choose" | "paste" | "zotero" | "loading" | "review" | "done" | "report";

function Card(p: {
  icon: LucideIcon;
  badge: LucideIcon;
  title: string;
  desc: string;
  onClick(): void;
}) {
  const { icon: Icon, badge: Badge } = p;
  return (
    <button type="button" className="import-card" onClick={p.onClick}>
      <span className="card-art" aria-hidden="true">
        <span className="art-doc">
          <Icon size={30} strokeWidth={1.5} />
        </span>
        <span className="art-badge">
          <Badge size={14} />
        </span>
      </span>
      <span className="card-text">
        <span className="card-name">
          {p.title}
          <ArrowRight size={14} aria-hidden="true" />
        </span>
        <span className="card-desc">{p.desc}</span>
      </span>
    </button>
  );
}

export function ImportDialog({ start, offline, onClose }: Props) {
  const refresh = useLibrary((s) => s.refresh);
  const [phase, setPhase] = useState<Phase>("choose");
  const [text, setText] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [actions, setActions] = useState<ImportAction[]>([]);
  const projects = useLibrary((s) => s.projects);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [zoteroDir, setZoteroDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => backend.on("import-progress", setProgress), []);

  const run = useCallback(async (p: Promise<Preview>) => {
    setPhase("loading");
    setProgress(null);
    try {
      const pv = await p;
      setPreview(pv);
      setActions(pv.candidates.map(defaultAction));
    } catch (e) {
      setPreview({ candidates: [], errors: [String(e)] });
      setActions([]);
    }
    setPhase("review");
  }, []);

  const pick = useCallback(
    async (kind: "files" | "folder") => {
      const p = await backend.pickPaths(kind);
      if (p?.length) run(backend.importPreviewPaths(p));
    },
    [run],
  );

  const bigImport = async (f: () => Promise<ImportReport>) => {
    setPhase("loading");
    setError(null);
    try {
      setReport(await f());
      await refresh();
      setPhase("report");
    } catch (e) {
      setError(String(e));
      setPhase("choose");
    }
  };

  const dump = useCallback(async () => {
    const file = await backend.pickFile(["json"]);
    if (file) bigImport(() => backend.importDump(file));
  }, []);

  const openZotero = useCallback(async () => {
    setZoteroDir(await backend.zoteroDefaultDir());
    setPhase("zotero");
  }, []);

  useEffect(() => {
    if (start?.paths?.length) run(backend.importPreviewPaths(start.paths));
    else if (start?.text?.trim()) {
      setText(start.text);
      run(backend.importPreviewText(start.text));
    } else if (start?.start === "files" || start?.start === "folder") pick(start.start);
    else if (start?.start === "paste") setPhase("paste");
    else if (start?.start === "zotero") openZotero();
    else if (start?.start === "dump") dump();
  }, []);

  const edit = (idx: number, patch: Partial<Candidate["input"]>) => {
    if (!preview) return;
    setPreview({
      ...preview,
      candidates: preview.candidates.map((c, i) =>
        i === idx ? { ...c, input: { ...c.input, ...patch } } : c,
      ),
    });
  };

  const commit = async () => {
    if (!preview) return;
    setPhase("loading");
    const r = await backend.importCommit(
      preview.candidates.map((candidate, i) => ({ candidate, action: actions[i] })),
    );
    if (start?.projectId) {
      const ids = [...r.added, ...r.merged];
      if (ids.length) await backend.addToProject(start.projectId, ids);
      if (start.openGraph) {
        usePanes.getState().setGraph({ projectId: start.projectId, focus: false, search: "" });
        usePanes.getState().openGraph();
      }
    }
    await refresh();
    setResult(r);
    setPhase("done");
  };

  const count = actions.filter((a) => a !== "skip").length;
  const footer =
    phase === "review" ? (
      <>
        <button type="button" className="btn" onClick={() => setPhase("choose")}>
          {t("import.back")}
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-primary" disabled={count === 0} onClick={commit}>
          {t("import.commit", { n: count })}
        </button>
      </>
    ) : phase === "done" || phase === "report" ? (
      <button type="button" className="btn btn-primary" onClick={onClose}>
        {t("common.close")}
      </button>
    ) : phase === "paste" ? (
      <>
        <button type="button" className="btn" onClick={() => setPhase("choose")}>
          {t("import.back")}
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!text.trim()}
          onClick={() => run(backend.importPreviewText(text))}
        >
          {t("import.lookup")}
        </button>
      </>
    ) : phase === "zotero" ? (
      <>
        <button type="button" className="btn" onClick={() => setPhase("choose")}>
          {t("import.back")}
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!zoteroDir}
          onClick={() => zoteroDir && bigImport(() => backend.importZotero(zoteroDir))}
        >
          {t("import.zoteroGo")}
        </button>
      </>
    ) : null;

  return (
    <Dialog
      title={t("import.title")}
      subtitle={phase === "choose" ? t("import.subtitle") : undefined}
      onClose={onClose}
      footer={footer}
      wide
    >
      {phase === "choose" && (
        <div className="stack">
          {offline && <div className="alert alert-info">{t("import.offline")}</div>}
          {error && <div className="alert">{error}</div>}
          <h3 className="field-label">{t("import.onComputer")}</h3>
          <div className="card-grid">
            <Card
              icon={FileText}
              badge={BookOpen}
              title={t("import.c.files")}
              desc={t("import.c.filesDesc")}
              onClick={() => pick("files")}
            />
            <Card
              icon={FolderOpen}
              badge={FileText}
              title={t("import.c.folder")}
              desc={t("import.c.folderDesc")}
              onClick={() => pick("folder")}
            />
            <Card
              icon={Database}
              badge={ArrowRight}
              title={t("import.c.dump")}
              desc={t("import.c.dumpDesc")}
              onClick={dump}
            />
          </div>
          <h3 className="field-label">{t("import.fromIds")}</h3>
          <div className="card-grid">
            <Card
              icon={Hash}
              badge={ArrowRight}
              title={t("import.c.ids")}
              desc={t("import.c.idsDesc")}
              onClick={() => setPhase("paste")}
            />
          </div>
          <h3 className="field-label">{t("import.fromApp")}</h3>
          <div className="card-grid">
            <Card
              icon={Library}
              badge={ArrowRight}
              title={t("import.c.zotero")}
              desc={t("import.c.zoteroDesc")}
              onClick={openZotero}
            />
          </div>
          <p className="muted small">{t("import.dropHint")}</p>
        </div>
      )}
      {phase === "paste" && (
        <label className="field">
          <span className="field-label">
            {t("import.paste")}
            <InfoTip label={t("help.pasteLabel")}>{t("help.paste")}</InfoTip>
          </span>
          <textarea
            className="input mono"
            rows={8}
            value={text}
            placeholder={"10.1038/nature14539\narXiv:1706.03762"}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      )}
      {phase === "zotero" && (
        <div className="stack">
          <p>{t("import.zoteroIntro")}</p>
          <div className="field">
            <span className="field-label">{t("import.zoteroFolder")}</span>
            <div className="row key-row">
              <code className="path">{zoteroDir ?? t("import.zoteroNotFound")}</code>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const p = await backend.pickPaths("folder");
                  if (p?.[0]) setZoteroDir(p[0]);
                }}
              >
                {t("import.choose")}
              </button>
            </div>
          </div>
          <p className="muted small">{t("import.zoteroSafe")}</p>
        </div>
      )}
      {phase === "loading" && (
        <div className="loading">
          <div className="progress">
            <div
              style={{
                width: progress ? `${(100 * progress.done) / Math.max(1, progress.total)}%` : "30%",
              }}
            />
          </div>
          <span className="muted">
            {progress
              ? t("import.reading", { done: progress.done, total: progress.total })
              : t("import.working")}
          </span>
        </div>
      )}
      {phase === "review" && preview && (
        <div className="stack">
          {preview.errors.map((e) => (
            <div key={e} className="alert">
              {e}
            </div>
          ))}
          {preview.candidates.length > 0 && (
            <div className="muted small">
              {t("import.review", { n: preview.candidates.length })}
            </div>
          )}
          <ul className="candidates">
            {preview.candidates.map((c, i) => (
              <li
                key={`${i}-${c.pdfPath ?? c.input.doi ?? c.input.title}`}
                className={actions[i] === "skip" ? "skipped" : ""}
              >
                <div className="cand-main">
                  <input
                    className="input cand-title"
                    aria-label={t("detail.title")}
                    value={c.input.title}
                    onChange={(e) => edit(i, { title: e.target.value })}
                  />
                  <div className="row small muted">
                    <span className="badge">{c.source}</span>
                    <span>{shortAuthors(c.input.authors) || "—"}</span>
                    <input
                      className="input input-year"
                      aria-label={t("detail.year")}
                      value={c.input.year ?? ""}
                      onChange={(e) => {
                        const y = Number.parseInt(e.target.value, 10);
                        edit(i, { year: Number.isFinite(y) ? y : null });
                      }}
                    />
                    {c.input.doi && <span className="mono">{c.input.doi}</span>}
                    {c.input.arxivId && <span className="mono">arXiv:{c.input.arxivId}</span>}
                  </div>
                  {c.duplicateOf !== null && (
                    <div className={`small ${bringsMissingFile(c) ? "attach-hint" : "warn"}`}>
                      {bringsMissingFile(c)
                        ? t("import.attachHint", { title: c.duplicateTitle ?? "" })
                        : c.pdfPath
                          ? t("import.sameFile", { title: c.duplicateTitle ?? "" })
                          : t("import.duplicate", { title: c.duplicateTitle ?? "" })}
                    </div>
                  )}
                  {c.warnings.map((w) => (
                    <div key={w} className="small muted">
                      {w}
                    </div>
                  ))}
                </div>
                <select
                  className="select"
                  aria-label="Action"
                  value={actions[i]}
                  onChange={(e) =>
                    setActions(
                      actions.map((a, j) => (j === i ? (e.target.value as ImportAction) : a)),
                    )
                  }
                >
                  <option value="add">{t("import.action.add")}</option>
                  {c.duplicateOf !== null && (
                    <option value="merge">
                      {bringsMissingFile(c) ? t("import.action.attach") : t("import.action.merge")}
                    </option>
                  )}
                  <option value="skip">{t("import.action.skip")}</option>
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
      {phase === "done" && result && (
        <div className="stack">
          {start?.projectId && (
            <div className="alert alert-info">
              {t("import.intoProject", {
                name: projects.find((p) => p.id === start.projectId)?.name ?? "",
              })}
            </div>
          )}
          <p>
            {t("import.done", {
              added: result.added.length,
              merged: result.merged.length,
              skipped: result.skipped,
            })}
          </p>
          {result.errors.map((e) => (
            <div key={e} className="alert">
              {e}
            </div>
          ))}
        </div>
      )}
      {phase === "report" && report && (
        <div className="stack">
          <p>
            {t("import.reportLine", {
              added: report.added,
              duplicates: report.duplicates,
              files: report.files,
              highlights: report.highlights,
              notes: report.notes,
              projects: report.projects,
            })}
          </p>
          {report.warnings.slice(0, 20).map((w) => (
            <div key={w} className="small warn">
              {w}
            </div>
          ))}
          {report.warnings.length > 20 && (
            <div className="small muted">
              {t("import.moreWarnings", { n: report.warnings.length - 20 })}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
