import type { CitationLink, Citations, Item } from "@paperlines/backend-port";
import { Quote } from "lucide-react";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";
import { cardTriggers } from "../../store/card";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useUi } from "../../store/ui";
import { ConnectionsSection } from "../connections/ConnectionsSection";
import { shortAuthors } from "../library/filter";
import { ItemPickerDialog } from "./ItemPickerDialog";

const SOURCE: Record<string, string> = {
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  opencitations: "OpenCitations",
  grobid: "GROBID",
  manual: "manual",
};

/** "Cites" and "Cited by" within the library, with manual add/remove. */
export function CitationsPanel({ item }: { item: Item }) {
  const version = usePanes((s) => s.citationsVersion);
  const items = useLibrary((s) => s.items);
  const [c, setC] = useState<Citations | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [picker, setPicker] = useState<"cites" | "citedBy" | null>(null);

  useEffect(() => {
    backend.getCitations(item.id).then(setC);
  }, [item.id, version, items]);

  const changed = () => {
    usePanes.getState().citationsChanged();
    useLibrary.getState().runSearch(useUi.getState().query);
  };
  const act = async (f: () => Promise<void>) => {
    try {
      await f();
      changed();
    } catch (e) {
      setMessage(String(e));
    }
  };
  const fetchRefs = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await backend.fetchReferences([item.id], c?.status !== null);
      setMessage(r.failed[0] ?? (r.skipped ? t("citations.noIds") : null));
      changed();
    } finally {
      setBusy(false);
    }
  };

  const byId = new Map(items.map((i) => [i.id, i]));
  const row = (l: CitationLink, dir: "cites" | "citedBy") => {
    const other = byId.get(l.itemId);
    if (!other) return null;
    const [citing, cited] = dir === "cites" ? [item.id, l.itemId] : [l.itemId, item.id];
    return (
      <li key={`${dir}-${l.itemId}`} className="cite-row">
        <button
          type="button"
          className="cite-open"
          {...cardTriggers(other.id, "citations")}
          onClick={() => useUi.getState().select(other.id)}
        >
          <span className="cite-title">{other.title}</span>
          <span className="muted small">
            {[shortAuthors(other.authors), other.year].filter(Boolean).join(" · ")}
          </span>
        </button>
        {l.isManual && <span className="badge">{t("citations.manual")}</span>}
        <button
          type="button"
          className="icon-btn"
          aria-label={t("citations.remove", { title: other.title })}
          title={t("citations.removeHint")}
          onClick={() => act(() => backend.removeCitation(citing, cited))}
        >
          ×
        </button>
      </li>
    );
  };

  if (!c) return null;
  const s = c.status;
  return (
    <div className="citations">
      <div className="cite-status">
        {s ? (
          <span className="small muted">
            {t("citations.status", {
              total: s.total,
              inLib: s.total - s.outside,
              source: SOURCE[s.source] ?? s.source,
              date: s.fetchedAt.slice(0, 10),
            })}
          </span>
        ) : (
          <span className="small muted">{t("citations.notFetched")}</span>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            usePanes.getState().setGraph({ focus: true });
            usePanes.getState().openGraph();
          }}
        >
          {t("citations.showInGraph")}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={fetchRefs}>
          {busy ? t("citations.fetching") : s ? t("citations.refetch") : t("citations.fetch")}
        </button>
      </div>
      {message && <div className="alert">{message}</div>}

      <ConnectionsSection item={item} />

      <section aria-label={t("citations.cites")}>
        <div className="row">
          <h3 className="field-label">
            {t("citations.cites")} ({c.cites.length})
          </h3>
          <span className="spacer" />
          <button
            type="button"
            className="nav-link"
            aria-label={t("citations.addCites")}
            onClick={() => setPicker("cites")}
          >
            + {t("citations.add")}
          </button>
        </div>
        {c.cites.length === 0 && <div className="muted small">{t("citations.citesEmpty")}</div>}
        <ul className="cite-list">{c.cites.map((l) => row(l, "cites"))}</ul>
        {s && s.outside > 0 && (
          <div className="muted small outside">{t("citations.outside", { n: s.outside })}</div>
        )}
      </section>

      <section aria-label={t("citations.citedBy")}>
        <div className="row">
          <h3 className="field-label">
            {t("citations.citedBy")} ({c.citedBy.length})
          </h3>
          <span className="spacer" />
          <button
            type="button"
            className="nav-link"
            aria-label={t("citations.addCitedBy")}
            onClick={() => setPicker("citedBy")}
          >
            + {t("citations.add")}
          </button>
        </div>
        {c.citedBy.length === 0 && <div className="muted small">{t("citations.citedByEmpty")}</div>}
        <ul className="cite-list">{c.citedBy.map((l) => row(l, "citedBy"))}</ul>
        {(item.doi || item.arxivId) && (
          <button
            type="button"
            className="btn citing-open"
            onClick={() => usePanes.getState().openCiting(item.id)}
          >
            <Quote size={14} aria-hidden="true" /> {t("citing.open")}
          </button>
        )}
      </section>

      {c.hidden.length > 0 && (
        <details className="hidden-links">
          <summary className="small muted">{t("citations.hidden", { n: c.hidden.length })}</summary>
          <ul className="cite-list">
            {c.hidden.map((h) => {
              const a = byId.get(h.citingItemId);
              const b = byId.get(h.citedItemId);
              return (
                <li key={`${h.citingItemId}>${h.citedItemId}`} className="cite-row">
                  <span className="small">
                    {a?.citekey ?? "?"} → {b?.citekey ?? "?"}
                  </span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => act(() => backend.resetCitation(h.citingItemId, h.citedItemId))}
                  >
                    {t("citations.restore")}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {picker && (
        <ItemPickerDialog
          title={
            picker === "cites"
              ? t("citations.pickCites", { title: item.title })
              : t("citations.pickCitedBy", { title: item.title })
          }
          exclude={[item.id, ...(picker === "cites" ? c.cites : c.citedBy).map((l) => l.itemId)]}
          onClose={() => setPicker(null)}
          onPick={(other) => {
            setPicker(null);
            act(() =>
              picker === "cites"
                ? backend.addCitation(item.id, other.id)
                : backend.addCitation(other.id, item.id),
            );
          }}
        />
      )}
    </div>
  );
}
