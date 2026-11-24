import type { AppUpdate } from "@paperlines/backend-port";
import { renderMarkdown } from "@paperlines/notes-editor";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { backend } from "../../backend";
import { branding } from "../../branding.generated";
import { Dialog } from "../../components/Dialog";
import { t } from "../../i18n";

const REPO = branding.repository.replace(/\/$/, "");

type Phase =
  | { kind: "ask" }
  | { kind: "downloading"; done: number; total: number | null }
  | { kind: "installing" }
  | { kind: "failed"; error: string };

/** "2026-12-01T10:00:00Z" → "1 December 2026" (the user's locale). */
function day(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** A newer version is out: what changed, who made it, and Update now / Later. */
export function UpdateDialog({ update, onClose }: { update: AppUpdate; onClose(): void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  // raw HTML in the notes is never rendered (markdown-it with html off)
  const notes = useMemo(() => renderMarkdown(update.notes.trim()), [update.notes]);
  const released = day(update.date);
  const releaseUrl = REPO ? `${REPO}/releases/tag/v${update.version}` : null;
  const busy = phase.kind === "downloading" || phase.kind === "installing";

  useEffect(
    () =>
      backend.on("update-progress", ({ done, total }) =>
        setPhase(
          total !== null && done >= total
            ? { kind: "installing" }
            : { kind: "downloading", done, total },
        ),
      ),
    [],
  );

  const install = async () => {
    setPhase({ kind: "downloading", done: 0, total: null });
    try {
      await backend.installUpdate();
      // the app restarts; the fake backend (browser) just stays here
      setPhase({ kind: "installing" });
    } catch (e) {
      setPhase({ kind: "failed", error: String(e instanceof Error ? e.message : e) });
    }
  };

  const status =
    phase.kind === "downloading"
      ? phase.total
        ? t("update.downloading", { pct: Math.round((100 * phase.done) / phase.total) })
        : t("update.downloadingSize", { mb: (phase.done / 1e6).toFixed(1) })
      : phase.kind === "installing"
        ? t("update.installing", { name: branding.displayName })
        : null;

  return (
    <Dialog
      title={t("update.title", { name: branding.displayName, v: update.version })}
      subtitle={
        released
          ? t("update.subtitleDate", { current: update.currentVersion, date: released })
          : t("update.subtitle", { current: update.currentVersion })
      }
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          {releaseUrl && (
            <button
              type="button"
              className="btn-link"
              disabled={busy}
              onClick={() => backend.openExternal(releaseUrl)}
            >
              <ExternalLink size={14} aria-hidden="true" /> {t("update.onGithub")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            {t("update.later")}
          </button>
          {update.canInstall ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={install}>
              <RefreshCw size={14} aria-hidden="true" /> {t("update.now")}
            </button>
          ) : (
            releaseUrl && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => backend.openExternal(releaseUrl)}
              >
                <Download size={14} aria-hidden="true" /> {t("update.download")}
              </button>
            )
          )}
        </>
      }
    >
      <div className="update stack">
        {!update.canInstall && <p className="alert alert-info">{t("update.packaged")}</p>}
        <section aria-label={t("update.changes")}>
          <h3 className="field-label">{t("update.changes")}</h3>
          {notes ? (
            <article
              className="update-notes about-changelog"
              dangerouslySetInnerHTML={{ __html: notes }}
            />
          ) : (
            <p className="muted">{t("update.noNotes")}</p>
          )}
        </section>
        {update.contributors.length > 0 && (
          <section aria-label={t("update.contributors")}>
            <h3 className="field-label">{t("update.contributors")}</h3>
            <ul className="update-people">
              {update.contributors.map((c) => (
                <li key={c.login ?? c.name}>
                  {c.login ? (
                    <a
                      href={`https://github.com/${c.login}`}
                      title={`@${c.login}`}
                      onClick={(e) => {
                        e.preventDefault();
                        backend.openExternal(`https://github.com/${c.login}`);
                      }}
                    >
                      {c.name}
                    </a>
                  ) : (
                    <span>{c.name}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted small">{t("update.thanks")}</p>
          </section>
        )}
        {status && (
          <div className="update-status" role="status">
            <div className="progress" aria-hidden="true">
              <div
                style={{
                  width:
                    phase.kind === "downloading" && phase.total
                      ? `${Math.min(100, (100 * phase.done) / phase.total)}%`
                      : "100%",
                }}
              />
            </div>
            <span>{status}</span>
          </div>
        )}
        {phase.kind === "failed" && (
          <div className="alert" role="alert">
            {t("update.failed", { error: phase.error })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
