import type { Item, RelationView } from "@paperlines/backend-port";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { cardTriggers } from "../../store/card";
import { useDialogs } from "../../store/dialogs";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useUi } from "../../store/ui";
import { authorYear } from "../graph/model";

/** A paper's typed connections ("Extends Chen ’22"), with add, edit and remove. */
export function ConnectionsSection({ item }: { item: Item }) {
  const version = usePanes((s) => s.citationsVersion);
  const items = useLibrary((s) => s.items);
  const [list, setList] = useState<RelationView[]>([]);
  useEffect(() => {
    backend.itemRelations(item.id).then(setList);
  }, [item.id, version, items]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const add = () => useDialogs.getState().show("connection", { from: item.id });
  return (
    <section aria-label={t("conn.title")} className="connections">
      <div className="row">
        <h3 className="field-label">
          {t("conn.title")} ({list.length})
          <InfoTip label={t("help.about", { what: t("conn.title") })}>
            {t("help.connections")}
          </InfoTip>
        </h3>
        <span className="spacer" />
        <button type="button" className="nav-link" onClick={add}>
          <Plus size={12} aria-hidden="true" /> {t("conn.add")}
        </button>
      </div>
      {list.length === 0 && <div className="muted small">{t("conn.none")}</div>}
      <ul className="conn-list">
        {list.map((r) => {
          const other = byId.get(r.otherItemId);
          if (!other) return null;
          return (
            <li
              key={r.id}
              className="conn-row"
              style={{ "--conn": `var(--tag-${r.color})` } as React.CSSProperties}
            >
              <span className="conn-label">{r.label}</span>
              <button
                type="button"
                className="conn-target"
                title={other.title}
                {...cardTriggers(other.id, "citations")}
                onClick={() => useUi.getState().select(other.id)}
              >
                {authorYear(other)}
                <span className="muted"> · {other.title}</span>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("conn.editOne", { label: r.label, title: other.title })}
                onClick={() =>
                  useDialogs.getState().show("connection", { from: item.id, relationId: r.id })
                }
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
              {(r.note || r.evidenceText) && (
                <div className="conn-detail">
                  {r.note && <span>{r.note}</span>}
                  {r.evidenceText && (
                    <button
                      type="button"
                      className="conn-evidence"
                      title={t("conn.openEvidence")}
                      onClick={() =>
                        r.evidenceItemId !== null &&
                        usePanes.getState().openPdf(r.evidenceItemId, {
                          page: r.evidencePage ?? 1,
                          highlightId: r.evidenceHighlightId ?? undefined,
                        })
                      }
                    >
                      “{r.evidenceText}” <span className="muted">p. {r.evidencePage}</span>
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
