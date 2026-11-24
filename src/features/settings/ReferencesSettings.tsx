import type { SecretName, SecretStatus, Settings } from "@paperlines/backend-port";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";

const LABELS: Record<SecretName, string> = {
  semantic_scholar: "Semantic Scholar",
  openalex: "OpenAlex",
};

function KeyRow({ s, store, reload }: { s: SecretStatus; store: string; reload(): void }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="field">
      <span className="field-label">{t("settings.apiKey", { service: LABELS[s.name] })}</span>
      <div className="row key-row">
        <input
          className="input"
          type="password"
          autoComplete="off"
          aria-label={t("settings.apiKey", { service: LABELS[s.name] })}
          placeholder={s.location ? "••••••••" : t("settings.apiKeyOptional")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          disabled={!value.trim()}
          onClick={async () => {
            try {
              await backend.setSecret(s.name, value);
              setValue("");
              setErr(null);
              reload();
            } catch (e) {
              setErr(String(e));
            }
          }}
        >
          {t("common.save")}
        </button>
        {s.location && (
          <button
            type="button"
            className="btn"
            onClick={async () => (await backend.deleteSecret(s.name), reload())}
          >
            {t("settings.clear")}
          </button>
        )}
      </div>
      <span className="field-hint">
        {s.location === "os"
          ? t("settings.keyInStore", { store })
          : s.location === "encryptedFile"
            ? t("settings.keyInFile")
            : t("settings.keyNone")}
      </span>
      {err && <span className="field-hint warn">{err}</span>}
    </div>
  );
}

export function ReferencesSettings({
  settings,
  store,
  onChange,
}: {
  settings: Settings;
  store: string;
  onChange(p: Partial<Settings>): void;
}) {
  const [status, setStatus] = useState<SecretStatus[]>([]);
  const [grobid, setGrobid] = useState(settings.grobidUrl ?? "");
  const reload = () => backend.secretStatus().then(setStatus);
  useEffect(() => {
    reload();
  }, []);
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.autoFetchReferences}
          onChange={(e) => onChange({ autoFetchReferences: e.target.checked })}
        />
        <span>
          <strong>{t("settings.autoFetch")}</strong>
          <span className="field-hint">{t("settings.autoFetchHint")}</span>
        </span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.autoFindPdfs}
          onChange={(e) => onChange({ autoFindPdfs: e.target.checked })}
        />
        <span>
          <strong>{t("settings.autoFindPdfs")}</strong>
          <span className="field-hint">{t("settings.autoFindPdfsHint")}</span>
        </span>
      </label>
      <label className="field">
        <span className="field-label">{t("settings.grobid")}</span>
        <input
          className="input"
          placeholder="http://localhost:8070"
          value={grobid}
          onChange={(e) => setGrobid(e.target.value)}
          onBlur={() => grobid !== (settings.grobidUrl ?? "") && onChange({ grobidUrl: grobid })}
        />
        <span className="field-hint">{t("settings.grobidHint")}</span>
      </label>
      {status.map((s) => (
        <KeyRow key={s.name} s={s} store={store} reload={reload} />
      ))}
    </>
  );
}
