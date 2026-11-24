import type { Item } from "@paperlines/backend-port";
import { FileText } from "lucide-react";
import { t } from "../../i18n";
import { type DetailTab, usePanes } from "../../store/panes";
import { CitationsPanel } from "../citations/CitationsPanel";
import { PaperNote } from "../notes/PaperNote";
import { HighlightsList } from "../reader/HighlightsList";
import { ItemDetail } from "./ItemDetail";

const TABS: DetailTab[] = ["info", "note", "highlights", "citations"];

export function DetailPane({ item }: { item: Item }) {
  const { detailTab, setDetailTab, right, openPdf } = usePanes();
  const readerOpen = right?.kind === "reader" && right.itemId === item.id;
  return (
    <div className="detail">
      <div className="tabs-bar">
        <div className="tabs" role="tablist" aria-label={t("detail.tabs")}>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={detailTab === tab}
              className={detailTab === tab ? "on" : ""}
              onClick={() => setDetailTab(tab)}
            >
              {t(`detail.tab.${tab}`)}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {item.hasPdf && !readerOpen && (
          <button
            type="button"
            className="icon-btn open-pdf"
            aria-label={t("reader.open")}
            title={t("reader.open")}
            onClick={() => openPdf(item.id)}
          >
            <FileText size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="tab-body" role="tabpanel">
        {detailTab === "note" && <PaperNote key={item.id} item={item} />}
        {detailTab === "citations" && <CitationsPanel key={item.id} item={item} />}
        {detailTab === "highlights" && <HighlightsList item={item} />}
        {detailTab === "info" && <ItemDetail key={item.id} item={item} />}
      </div>
    </div>
  );
}
