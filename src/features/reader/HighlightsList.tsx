import type { HighlightColorLabel, Item } from "@paperlines/backend-port";
import { useEffect } from "react";
import { t } from "../../i18n";
import { useHighlights } from "../../store/highlights";
import { usePanes } from "../../store/panes";
import { useSettings } from "../../store/settings";

// one shared empty list: a fresh [] per read makes the store snapshot change on every render
const NO_COLORS: HighlightColorLabel[] = [];

export function HighlightsList({ item }: { item: Item }) {
  const { byItem, load, quote } = useHighlights();
  const colors = useSettings((s) => s.settings?.highlightColors ?? NO_COLORS);
  const list = byItem[item.id] ?? [];
  useEffect(() => {
    if (item.hasPdf) load(item.id);
  }, [item.id, item.hasPdf, load]);
  const label = (c: string) => colors.find((x) => x.color === c)?.label ?? c;

  if (!item.hasPdf) return <div className="empty muted">{t("reader.noPdf")}</div>;
  if (!list.length) return <div className="empty muted">{t("highlights.empty")}</div>;
  return (
    <ul className="hl-list">
      {list.map((h) => (
        <li
          key={h.id}
          className="hl-entry"
          style={{ "--hl": `var(--hl-${h.color})` } as React.CSSProperties}
        >
          <button
            type="button"
            className="hl-jump"
            onClick={() =>
              usePanes.getState().openPdf(item.id, { page: h.page, highlightId: h.id })
            }
          >
            <span className="hl-meta small muted">
              <span className="hl-swatch" /> {label(h.color)} ·{" "}
              {t("highlights.page", { n: h.page })}
              {h.kind !== "highlight" && ` · ${t(`reader.${h.kind}`)}`}
              {h.rects.length === 0 && (
                <span className="hl-pending" title={t("highlights.pendingHint")}>
                  {" "}
                  · {t("highlights.pending")}
                </span>
              )}
            </span>
            <span className="hl-text">{h.text ?? t("highlights.area")}</span>
            {h.comment && <span className="hl-comment">{h.comment}</span>}
          </button>
          <button type="button" className="btn hl-quote" onClick={() => quote(h)}>
            {t("reader.quote")}
          </button>
        </li>
      ))}
    </ul>
  );
}
