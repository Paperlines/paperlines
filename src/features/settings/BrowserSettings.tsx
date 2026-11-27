import type { BrowserStatus } from "@paperlines/backend-port";
import { Check, Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { branding } from "../../branding.generated";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";

const REPO = branding.repository.replace(/\/$/, "");
/** Stable name on every release, so "latest" always points at the current extension. */
const DOWNLOAD = REPO ? `${REPO}/releases/latest/download/paperlines-browser-extension.zip` : null;
/** The Chrome Web Store page (also used by Edge, Brave, Arc and Vivaldi). */
const STORE =
  "https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf";

/** Settings → Browser extension: register Paperlines with Chrome-family browsers. */
export function BrowserSettings() {
  const [browsers, setBrowsers] = useState<BrowserStatus[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backend.browserStatus().then(setBrowsers);
  }, []);

  const installed = (browsers ?? []).filter((b) => b.installed);
  const allConnected = installed.length > 0 && installed.every((b) => b.connected);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      setBrowsers(await backend.browserConnect());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <p className="muted">
        {t("browser.intro")} <InfoTip label={t("settings.s.browser")}>{t("help.browser")}</InfoTip>
      </p>

      <section className="stack" aria-label={t("browser.step1")}>
        <h3 className="field-label">{t("browser.step1")}</h3>
        {browsers && installed.length === 0 ? (
          <p className="muted">{t("browser.none")}</p>
        ) : (
          <ul className="browser-list">
            {installed.map((b) => (
              <li key={b.name}>
                <span>{b.name}</span>
                <span className={b.connected ? "browser-ok" : "muted"}>
                  {b.connected ? (
                    <>
                      <Check size={14} aria-hidden="true" /> {t("browser.connected")}
                    </>
                  ) : (
                    t("browser.notConnected")
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button
            type="button"
            className={allConnected ? "btn" : "btn btn-primary"}
            disabled={busy || (browsers !== null && installed.length === 0)}
            onClick={connect}
          >
            {allConnected ? t("browser.connectAgain") : t("browser.connect")}
          </button>
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
      </section>

      <section className="stack" aria-label={t("browser.step2")}>
        <h3 className="field-label">{t("browser.step2")}</h3>
        <p className="muted">{t("browser.install")}</p>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => backend.openExternal(STORE)}
          >
            <ExternalLink size={14} aria-hidden="true" /> {t("browser.addToChrome")}
          </button>
          {DOWNLOAD && (
            <button
              type="button"
              className="btn"
              title={t("browser.zipHint")}
              onClick={() => backend.openExternal(DOWNLOAD)}
            >
              <Download size={14} aria-hidden="true" /> {t("browser.download")}
            </button>
          )}
        </div>
        {DOWNLOAD && <p className="muted small">{t("browser.zipHint")}</p>}
      </section>
    </div>
  );
}
