import type {
  AutoExport,
  CitationStyle,
  LibraryLocation,
  PlatformInfo,
  Settings,
} from "@paperlines/backend-port";
import {
  BookMarked,
  FileOutput,
  FolderCog,
  FolderDown,
  FolderUp,
  LifeBuoy,
  NotebookPen,
  Palette,
  SlidersHorizontal,
  SquareTerminal,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { InfoTip } from "../../components/InfoTip";
import { SparkIcon } from "../../components/SparkIcon";
import { t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { useUi } from "../../store/ui";
import { AboutSettings } from "./AboutSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { AssistantsSettings } from "./AssistantsSettings";
import { EXTRA_COLORS, isBase } from "./highlightPalette";
import { MaintenanceSettings } from "./MaintenanceSettings";
import { ReferencesSettings } from "./ReferencesSettings";

interface Props {
  settings: Settings;
  info: PlatformInfo;
  onChange(patch: Partial<Settings>): void;
  onClose(): void;
}

type SectionId =
  | "general"
  | "appearance"
  | "notes"
  | "citations"
  | "export"
  | "library"
  | "assistants"
  | "cli"
  | "about";
const SECTIONS: {
  id: SectionId;
  icon: (p: { size?: number; "aria-hidden"?: boolean | "true" }) => React.ReactNode;
}[] = [
  { id: "general", icon: SlidersHorizontal },
  { id: "appearance", icon: Palette },
  { id: "notes", icon: NotebookPen },
  { id: "citations", icon: BookMarked },
  { id: "export", icon: FileOutput },
  { id: "library", icon: FolderCog },
  { id: "assistants", icon: SparkIcon },
  { id: "cli", icon: SquareTerminal },
  { id: "about", icon: LifeBuoy },
];

/** A labelled setting with an optional (i) explanation. */
function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <span className="field-label">
        {label}
        {help && <InfoTip label={t("help.about", { what: label })}>{help}</InfoTip>}
      </span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  help,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  help?: ReactNode;
  checked: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <div className="check">
      <input
        type="checkbox"
        id={`t-${label}`}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={`t-${label}`}>
        <strong>{label}</strong>
        {hint && <span className="field-hint">{hint}</span>}
      </label>
      {help && <InfoTip label={t("help.about", { what: label })}>{help}</InfoTip>}
    </div>
  );
}

/** Export the whole library as one folder, or import one: to move computers or share. */
function LibraryTransfer({ onClose }: { onClose(): void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Field label={t("transfer.title")} help={t("help.transfer")}>
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setMsg(null);
            setErr(null);
            const parent = (await backend.pickPaths("folder"))?.[0];
            if (!parent) return;
            setBusy(true);
            try {
              const r = await backend.exportLibrary(parent);
              setMsg(t("export.libraryDone", { papers: r.papers, files: r.files, path: r.path }));
            } catch (e) {
              setErr(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <FolderUp size={14} aria-hidden="true" />{" "}
          {busy ? t("transfer.exporting") : t("transfer.export")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            onClose();
            useDialogs.getState().show("import", { start: "dump" });
          }}
        >
          <FolderDown size={14} aria-hidden="true" /> {t("transfer.import")}
        </button>
      </div>
      <span className="field-hint">{t("transfer.hint")}</span>
      {msg && (
        <div className="alert alert-info" role="status">
          {msg}
        </div>
      )}
      {err && <div className="alert">{err}</div>}
    </Field>
  );
}

function LibraryFolder() {
  const [loc, setLoc] = useState<LibraryLocation | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    backend.libraryLocation().then(setLoc);
  }, []);
  const go = async (mode: "move" | "open" | "default", path: string | null) => {
    setErr(null);
    try {
      await backend.setLibraryLocation(path, mode);
    } catch (e) {
      setErr(String(e));
    }
  };
  return (
    <Field label={t("settings.library")} help={t("help.libraryFolder")}>
      <code className="path">{loc?.current ?? ""}</code>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const p = await backend.pickPaths("folder");
            if (p?.[0]) setPending(p[0]);
          }}
        >
          {t("settings.changeFolder")}
        </button>
        {loc && !loc.isDefault && (
          <button type="button" className="btn" onClick={() => go("default", null)}>
            {t("settings.useDefault")}
          </button>
        )}
      </div>
      {pending && (
        <div className="choice-box" role="group" aria-label={t("settings.moveTitle")}>
          <strong>{t("settings.moveTitle")}</strong>
          <code className="path">{pending}</code>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => go("move", pending)}>
              {t("settings.moveHere")}
            </button>
            <button type="button" className="btn" onClick={() => go("open", pending)}>
              {t("settings.openThere")}
            </button>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              {t("import.cancel")}
            </button>
          </div>
          <span className="field-hint">{t("settings.moveHint")}</span>
        </div>
      )}
      {err && <span className="field-hint warn">{err}</span>}
      <span className="field-hint">{t("settings.libraryHint")}</span>
    </Field>
  );
}

function AutoExports() {
  const [list, setList] = useState<AutoExport[]>([]);
  const load = () => backend.listAutoExports().then(setList);
  useEffect(() => {
    load();
  }, []);
  return (
    <Field label={t("settings.autoExports")} help={t("help.autoExport")}>
      {list.length === 0 && <span className="field-hint">{t("settings.autoExportsNone")}</span>}
      <ul className="backup-list">
        {list.map((a) => (
          <li key={a.id} className="row">
            <span className="badge">{a.format}</span>
            <span className="mono small backup-name" title={a.path}>
              {a.path}
            </span>
            <span className="muted small">
              {a.scopeKind === "all" ? t("export.all") : a.scopeValue}
            </span>
            <span className="spacer" />
            {a.lastError && (
              <span className="small warn" title={a.lastError}>
                !
              </span>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label={t("settings.removeAutoExport", { path: a.path })}
              onClick={async () => {
                await backend.removeAutoExport(a.id);
                load();
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <span className="field-hint">{t("settings.autoExportsHint")}</span>
    </Field>
  );
}

export function SettingsDialog({ settings, info, onChange, onClose }: Props) {
  const { livePreview, setLivePreview } = useUi();
  // the dialog can be opened on a section, e.g. show("settings", { section: "assistants" })
  const start = (useDialogs.getState().arg as { section?: SectionId } | null)?.section;
  const [section, setSection] = useState<SectionId>(start ?? "general");
  const [template, setTemplate] = useState(settings.paperNoteTemplate);
  const [styles, setStyles] = useState<CitationStyle[]>([]);
  useEffect(() => {
    backend.citationStyles().then(setStyles);
  }, []);

  return (
    <Dialog
      title={t("settings.title")}
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t("settings.close")}
        </button>
      }
    >
      <div className="settings">
        <nav className="settings-nav" aria-label={t("settings.sections")}>
          {SECTIONS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id}
              className={section === id ? "on" : ""}
              onClick={() => setSection(id)}
            >
              <Icon size={15} aria-hidden="true" /> {t(`settings.s.${id}`)}
            </button>
          ))}
        </nav>
        <div className="settings-body stack">
          {section === "general" && (
            <>
              <Toggle
                label={t("settings.offline")}
                hint={t("settings.offlineHint")}
                help={t("help.offline")}
                checked={settings.offlineMode}
                onChange={(v) => onChange({ offlineMode: v })}
              />
            </>
          )}
          {section === "appearance" && <AppearanceSettings />}
          {section === "notes" && (
            <>
              <Toggle
                label={t("settings.livePreview")}
                hint={t("settings.livePreviewHint")}
                help={t("help.livePreview")}
                checked={livePreview}
                onChange={setLivePreview}
              />
              <Toggle
                label={t("settings.vim")}
                hint={t("settings.vimHint")}
                checked={settings.vimMode}
                onChange={(v) => onChange({ vimMode: v })}
              />
              <Field label={t("settings.template")} help={t("help.template")}>
                <textarea
                  className="input mono"
                  rows={4}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  onBlur={() =>
                    template !== settings.paperNoteTemplate &&
                    onChange({ paperNoteTemplate: template })
                  }
                />
              </Field>
              <Field label={t("settings.highlightColors")} help={t("help.highlightColors")}>
                {settings.highlightColors.map((c, i) => (
                  <div
                    key={c.color}
                    className="row hl-setting"
                    style={{ "--hl": `var(--hl-${c.color})` } as React.CSSProperties}
                  >
                    <span className="hl-swatch" aria-hidden="true" />
                    <input
                      className="input"
                      aria-label={t("settings.colorMeaning", { color: t(`color.${c.color}`) })}
                      defaultValue={c.label}
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (!label || label === c.label) return;
                        onChange({
                          highlightColors: settings.highlightColors.map((x, j) =>
                            j === i ? { ...x, label } : x,
                          ),
                        });
                      }}
                    />
                    {isBase(c.color) ? (
                      <span className="hl-fixed" title={t("settings.colorFixed")} />
                    ) : (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t("settings.colorRemove", { color: t(`color.${c.color}`) })}
                        title={t("settings.colorRemoveShort")}
                        onClick={() =>
                          onChange({
                            highlightColors: settings.highlightColors.filter(
                              (x) => x.color !== c.color,
                            ),
                          })
                        }
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
                {EXTRA_COLORS.some(
                  (e) => !settings.highlightColors.some((c) => c.color === e.color),
                ) && (
                  <div className="hl-add" role="group" aria-label={t("settings.colorAdd")}>
                    <span className="muted small">{t("settings.colorAdd")}</span>
                    {EXTRA_COLORS.filter(
                      (e) => !settings.highlightColors.some((c) => c.color === e.color),
                    ).map((e) => (
                      <button
                        key={e.color}
                        type="button"
                        className="hl-add-swatch"
                        style={{ "--hl": `var(--hl-${e.color})` } as React.CSSProperties}
                        aria-label={t("settings.colorAddOne", {
                          color: t(`color.${e.color}`),
                          purpose: e.label,
                        })}
                        title={`${t(`color.${e.color}`)}: ${e.label}`}
                        onClick={() =>
                          onChange({ highlightColors: [...settings.highlightColors, e] })
                        }
                      />
                    ))}
                  </div>
                )}
              </Field>
            </>
          )}
          {section === "citations" && (
            <>
              <Field label={t("settings.citationStyle")} help={t("help.citationStyle")}>
                <select
                  className="select"
                  aria-label={t("settings.citationStyle")}
                  value={settings.citationStyle}
                  onChange={(e) => onChange({ citationStyle: e.target.value })}
                >
                  {styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <ReferencesSettings
                settings={settings}
                store={info.credentialStore}
                onChange={onChange}
              />
            </>
          )}
          {section === "export" && <AutoExports />}
          {section === "library" && (
            <>
              <LibraryFolder />
              <LibraryTransfer onClose={onClose} />
              <Field label={t("settings.trashDays")} help={t("help.trashDays")}>
                <div className="row">
                  <input
                    className="input input-num"
                    type="number"
                    min={0}
                    max={3650}
                    aria-label={t("settings.trashDays")}
                    defaultValue={settings.trashDays}
                    onBlur={(e) => {
                      const d = Number.parseInt(e.target.value, 10);
                      if (Number.isFinite(d) && d !== settings.trashDays)
                        onChange({ trashDays: d });
                    }}
                  />
                  <span className="muted small">{t("settings.trashDaysUnit")}</span>
                </div>
              </Field>
              <MaintenanceSettings part="backups" />
            </>
          )}
          {section === "assistants" && <AssistantsSettings />}
          {section === "cli" && <MaintenanceSettings part="cli" />}
          {section === "about" && <AboutSettings info={info} />}
        </div>
      </div>
    </Dialog>
  );
}
