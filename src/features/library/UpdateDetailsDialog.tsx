import { type ItemInput, toInput } from "@paperlines/backend-port";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { Dialog } from "../../components/Dialog";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { authorsToText } from "./filter";

type Found = { input: ItemInput; warnings: string[]; citekey: string };

const ROWS: { key: string; label: () => string; get: (i: ItemInput) => string }[] = [
  { key: "title", label: () => t("detail.title"), get: (i) => i.title },
  {
    key: "authors",
    label: () => t("detail.authors"),
    get: (i) => authorsToText(i.authors).split("\n").join("; "),
  },
  { key: "year", label: () => t("detail.year"), get: (i) => (i.year ? String(i.year) : "") },
  { key: "venue", label: () => t("detail.venue"), get: (i) => i.venue ?? "" },
  {
    key: "volume",
    label: () => t("details.issue"),
    get: (i) =>
      [i.volume, i.issue && `(${i.issue})`, i.pages && `: ${i.pages}`].filter(Boolean).join(""),
  },
  { key: "doi", label: () => t("detail.doi"), get: (i) => i.doi ?? i.arxivId ?? "" },
];

/** Re-reads a paper's details from its PDF and shows old and new before replacing them. */
export function UpdateDetailsDialog({ itemId, onClose }: { itemId: number; onClose(): void }) {
  const item = useLibrary((s) => s.items.find((i) => i.id === itemId));
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    backend
      .reidentifyPdf(itemId)
      .then((f) => {
        setFound(f);
        // keep the old key if it already fits the new first author
        const first = f.input.authors[0]?.family.toLowerCase() ?? "";
        setNewKey(
          !!item && f.citekey !== item.citekey && !item.citekey.toLowerCase().startsWith(first),
        );
      })
      .catch((e) => setError(String(e)));
  }, [itemId, item]);

  if (!item) return null;
  const current = toInput(item);
  const changed = found ? ROWS.filter((r) => r.get(current) !== r.get(found.input)) : [];

  const apply = async () => {
    if (!found) return;
    setSaving(true);
    try {
      const f = found.input;
      // bibliographic fields come from the PDF; notes, tags, status, rating and projects stay
      await useLibrary.getState().save(itemId, {
        ...current,
        title: f.title,
        authors: f.authors,
        editors: f.editors,
        year: f.year,
        pubDate: f.pubDate,
        venue: f.venue,
        itemType: f.itemType || current.itemType,
        doi: f.doi,
        arxivId: f.arxivId,
        url: f.url,
        abstract: f.abstract ?? current.abstract,
        volume: f.volume,
        issue: f.issue,
        pages: f.pages,
        publisher: f.publisher,
        place: f.place,
        isbn: f.isbn,
        issn: f.issn,
        edition: f.edition,
        language: f.language,
        series: f.series,
        number: f.number,
        citekey: newKey ? found.citekey : null,
      });
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={t("details.title")}
      subtitle={t("details.subtitle")}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t("import.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!found || saving || (changed.length === 0 && !newKey)}
            onClick={apply}
          >
            {t("details.apply")}
          </button>
        </>
      }
    >
      {!found && !error && <div className="loading muted">{t("details.reading")}</div>}
      {error && <div className="alert">{error}</div>}
      {found && (
        <div className="stack">
          {found.warnings.map((w) => (
            <div key={w} className="small muted">
              {w}
            </div>
          ))}
          {changed.length === 0 ? (
            <div className="alert alert-info">{t("details.same")}</div>
          ) : (
            <table className="details-diff">
              <thead>
                <tr>
                  <th />
                  <th>{t("details.now")}</th>
                  <th>{t("details.fromPdf")}</th>
                </tr>
              </thead>
              <tbody>
                {changed.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.label()}</th>
                    <td className="old">{r.get(current) || "—"}</td>
                    <td className="new">{r.get(found.input) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {found.citekey !== item.citekey && (
            <div className="check">
              <input
                type="checkbox"
                id="new-citekey"
                checked={newKey}
                onChange={(e) => setNewKey(e.target.checked)}
              />
              <label htmlFor="new-citekey">
                <strong>{t("details.newKey", { key: found.citekey })}</strong>
                <span className="field-hint">{t("details.newKeyHint", { old: item.citekey })}</span>
              </label>
              <InfoTip label={t("help.about", { what: t("detail.citekey") })}>
                {t("help.citekeyChange")}
              </InfoTip>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
