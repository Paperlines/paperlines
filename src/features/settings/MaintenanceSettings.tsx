import type { BackupInfo, DoctorReport } from "@paperlines/backend-port";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { branding } from "../../branding.generated";
import { t } from "../../i18n";

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

/** "backups": backups and the library check; "cli": command-line tool and MCP. */
export function MaintenanceSettings({ part }: { part: "backups" | "cli" }) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => backend.listBackups().then(setBackups);
  useEffect(() => {
    load();
  }, []);

  const guard = async (f: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await f();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = (b: BackupInfo) =>
    guard(async () => {
      if (!(await backend.confirm(t("maint.restoreConfirm", { name: b.name })))) return;
      await backend.restoreBackup(b.path);
      window.location.reload();
    });
  const cli = branding.cliCommand;
  const mcp = `claude mcp add ${cli} -- ${cli} mcp`;

  return (
    <>
      {part === "backups" && (
        <>
          <div className="field">
            <span className="field-label">{t("maint.backups")}</span>
            <span className="field-hint">{t("maint.backupsHint")}</span>
            <ul className="backup-list">
              {backups.slice(0, 6).map((b) => (
                <li key={b.path} className="row">
                  <span className="mono small backup-name">{b.name}</span>
                  <span className="muted small">{kb(b.size)}</span>
                  <span className="spacer" />
                  <button type="button" className="btn" disabled={busy} onClick={() => restore(b)}>
                    {t("maint.restore")}
                  </button>
                </li>
              ))}
            </ul>
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  guard(
                    async () => (
                      await backend.backupNow(), await load(), setMsg(t("maint.backedUp"))
                    ),
                  )
                }
              >
                {t("maint.backupNow")}
              </button>
            </div>
          </div>
          <div className="field">
            <span className="field-label">{t("maint.doctor")}</span>
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => guard(async () => setReport(await backend.runDoctor(false)))}
              >
                {t("maint.check")}
              </button>
              {report?.issues.some((i) => i.fixable) && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => guard(async () => setReport(await backend.runDoctor(true)))}
                >
                  {t("maint.fix")}
                </button>
              )}
            </div>
            {report && (
              <div className="small" role="status">
                <div className="muted">
                  {t("maint.counts", {
                    items: report.items,
                    pdfs: report.pdfs,
                    edges: report.edges,
                  })}
                </div>
                {report.fixed.map((f) => (
                  <div key={f}>✓ {f}</div>
                ))}
                {report.issues.length === 0 ? (
                  <div>{t("maint.allGood")}</div>
                ) : (
                  report.issues.map((i) => (
                    <div key={i.detail} className="warn">
                      {i.detail}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
      {part === "cli" && (
        <div className="field">
          <span className="field-label">{t("maint.cli")}</span>
          <span className="field-hint">{t("maint.cliHint", { cli })}</span>
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                guard(async () => {
                  const r = await backend.installCli();
                  setMsg(
                    r.method === "package"
                      ? t("maint.cliPackaged", { path: r.path })
                      : r.inPath
                        ? t("maint.cliInstalled", { path: r.path })
                        : t("maint.cliNotInPath", { path: r.path }),
                  );
                })
              }
            >
              {t("maint.installCli")}
            </button>
          </div>
          <span className="field-hint">{t("maint.mcpHint")}</span>
          <div className="row key-row">
            <code className="path">{mcp}</code>
            <button
              type="button"
              className="btn"
              onClick={() =>
                navigator.clipboard?.writeText(mcp).then(() => setMsg(t("maint.copied")))
              }
            >
              {t("maint.copy")}
            </button>
          </div>
        </div>
      )}
      {msg && (
        <div className="alert alert-info" role="status">
          {msg}
        </div>
      )}
    </>
  );
}
