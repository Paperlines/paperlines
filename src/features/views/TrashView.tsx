import type { Item } from "@paperlines/backend-port";
import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { backend } from "../../backend";
import { InfoTip } from "../../components/InfoTip";
import { t } from "../../i18n";
import { useLibrary } from "../../store/library";
import { useSettings } from "../../store/settings";
import { useTrashCount } from "../../store/trash";
import { shortAuthors } from "../library/filter";

export function TrashView() {
  const [items, setItems] = useState<Item[]>([]);
  const days = useSettings((s) => s.settings?.trashDays ?? 30);
  const refresh = useLibrary((s) => s.refresh);
  const load = () => backend.listTrash().then(setItems);
  useEffect(() => {
    load();
  }, []);
  const act = async (f: () => Promise<unknown>) => {
    await f();
    await load();
    await refresh();
    useTrashCount.getState().refresh();
  };
  // papers can be purged while this view is open (the app checks every hour)
  useEffect(() => backend.on("trash-purged", () => load()), []);
  return (
    <div className="view-pane">
      <div className="view-head">
        <h2>{t("view.trash")}</h2>
        <InfoTip label={t("help.trashLabel")}>
          {days > 0 ? t("help.trash", { days }) : t("help.trashNever")}
        </InfoTip>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-danger"
          disabled={items.length === 0}
          onClick={async () => {
            if (await backend.confirm(t("trash.emptyConfirm", { n: items.length })))
              act(() => backend.emptyTrash([]));
          }}
        >
          {t("trash.empty")}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="empty muted">{t("trash.none")}</div>
      ) : (
        <ul className="view-list" aria-label={t("view.trash")}>
          {items.map((i) => (
            <li key={i.id} className="view-row">
              <div className="view-main">
                <span className="view-title">{i.title}</span>
                <span className="muted small">
                  {[
                    shortAuthors(i.authors),
                    i.year,
                    t("trash.deleted", { date: (i.deletedAt ?? "").slice(0, 10) }),
                    days > 0 ? daysLeftText(i.deletedAt, days) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => act(() => backend.restoreItems([i.id]))}
              >
                <RotateCcw size={14} aria-hidden="true" /> {t("trash.restore")}
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("trash.deleteForever", { title: i.title })}
                title={t("trash.deleteForeverShort")}
                onClick={async () => {
                  if (await backend.confirm(t("trash.deleteForeverConfirm", { title: i.title })))
                    act(() => backend.emptyTrash([i.id]));
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Whole days until a paper deleted at `deletedAt` (UTC, "YYYY-MM-DD HH:MM:SS") goes for good. */
export function daysLeft(deletedAt: string | null, days: number, now = Date.now()): number {
  if (!deletedAt) return days;
  const at = Date.parse(
    `${deletedAt.replace(" ", "T")}${/Z|[+-]\d\d:?\d\d$/.test(deletedAt) ? "" : "Z"}`,
  );
  if (Number.isNaN(at)) return days;
  return Math.max(0, Math.ceil((at + days * 86_400_000 - now) / 86_400_000));
}

function daysLeftText(deletedAt: string | null, days: number): string {
  const n = daysLeft(deletedAt, days);
  return n <= 0 ? t("trash.leftToday") : n === 1 ? t("trash.leftOne") : t("trash.left", { n });
}
