import type { HighlightColor, HighlightColorLabel, HighlightKind } from "@paperlines/backend-port";
import { PdfViewer, type ViewerStrings } from "@paperlines/pdf-viewer";
import { FileDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { backend } from "../../backend";
import { t } from "../../i18n";
import { useHighlights } from "../../store/highlights";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { useSettings } from "../../store/settings";
import { useToast } from "../../store/toast";

const strings: ViewerStrings = {
  highlight: t("reader.highlight"),
  underline: t("reader.underline"),
  rect: t("reader.rect"),
  zoomIn: t("reader.zoomIn"),
  zoomOut: t("reader.zoomOut"),
  fitWidth: t("reader.fitWidth"),
  page: (n, total) => t("reader.page", { n, total }),
  quote: t("reader.quote"),
  delete: t("reader.delete"),
  comment: t("reader.comment"),
  loading: t("reader.loading"),
  failed: t("reader.failed"),
  find: t("reader.find"),
  findPlaceholder: t("reader.findPlaceholder"),
  findNext: t("reader.findNext"),
  findPrev: t("reader.findPrev"),
  matchCase: t("reader.matchCase"),
  wholeWord: t("reader.wholeWord"),
  closeFind: t("reader.closeFind"),
  findCount: (i, n) => t("reader.findCount", { i, n }),
  noMatches: t("reader.noMatches"),
  searching: t("reader.searching"),
};

// one shared empty list: a fresh [] per read makes the store snapshot change on every render
const NO_COLORS: HighlightColorLabel[] = [];

export function Reader({ itemId }: { itemId: number }) {
  const item = useLibrary((s) => s.items.find((i) => i.id === itemId));
  const colors = useSettings((s) => s.settings?.highlightColors ?? NO_COLORS);
  const rf = usePanes((s) => s.readerFocus);
  const focus = rf && rf.itemId === itemId ? rf : null;
  const hasGraphTab = usePanes((s) => s.tabs.some((t) => t.kind === "graph"));
  const [finding, setFinding] = useState(false);
  const { byItem, load, create, update, remove, quote, place } = useHighlights();
  const highlights = byItem[itemId] ?? [];
  const [data, setData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setData(null);
    setError(null);
    if (!item?.hasPdf) return;
    backend.readPdf(itemId).then(setData, (e) => setError(String(e)));
    load(itemId);
  }, [itemId, item?.hasPdf, load]);

  const viewerHighlights = useMemo(() => highlights, [highlights]);
  if (!item) return null;

  const attach = async () => {
    const paths = await backend.pickPaths("files");
    if (!paths?.[0]) return;
    await useLibrary.getState().mutate(() => backend.attachPdf(itemId, paths[0]));
  };

  const exportPdf = async () => {
    const dest = await backend.pickSavePath(`${item.citekey}-annotated.pdf`);
    if (!dest) return;
    try {
      const n = await backend.exportAnnotatedPdf(itemId, dest);
      useToast.getState().show({ text: t("reader.exported", { n }) });
    } catch (e) {
      useToast.getState().show({ text: String(e).replace(/^Error: /, "") });
    }
  };

  const backToGraph = hasGraphTab ? (
    <button type="button" className="btn" onClick={() => usePanes.getState().goBack()}>
      ← {t("graph.title")}
    </button>
  ) : null;

  return (
    <div className="reader">
      {/* no title row: the tab names the paper; without a PDF only the way back stays */}
      {!item.hasPdf && hasGraphTab && <div className="toolbar">{backToGraph}</div>}
      {!item.hasPdf ? (
        <div className="empty">
          {item.hasEpub ? (
            <>
              <span className="muted">{t("reader.epub")}</span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => backend.openAttachment(itemId, "epub")}
              >
                {t("reader.openEpub")}
              </button>
            </>
          ) : (
            <span className="muted">{t("reader.noPdf")}</span>
          )}
          <div className="row">
            {(item.doi || item.arxivId) && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={finding}
                onClick={async () => {
                  setFinding(true);
                  try {
                    const r = await backend.findPdfs([itemId]);
                    setStatus(r.found.length ? t("reader.found") : t("reader.notFound"));
                    await useLibrary.getState().refresh();
                  } catch (e) {
                    setStatus(String(e));
                  } finally {
                    setFinding(false);
                  }
                }}
              >
                {finding ? t("reader.finding") : t("reader.findPdf")}
              </button>
            )}
            <button type="button" className="btn" onClick={attach}>
              {t("reader.attach")}
            </button>
          </div>
          {status && <span className="small muted">{status}</span>}
        </div>
      ) : error ? (
        <div className="empty alert">{error}</div>
      ) : data ? (
        <PdfViewer
          toolbarStart={backToGraph}
          toolbarEnd={
            <button
              type="button"
              className="icon-btn"
              aria-label={t("reader.export")}
              title={t("reader.exportHint")}
              onClick={exportPdf}
            >
              <FileDown size={15} aria-hidden="true" />
            </button>
          }
          data={data}
          highlights={viewerHighlights}
          colors={colors}
          focus={focus}
          strings={strings}
          onCreate={async (draft, color, q) => {
            for (const [i, part] of draft.parts.entries()) {
              await create(
                {
                  itemId,
                  page: part.page,
                  kind: draft.kind as HighlightKind,
                  rects: part.rects,
                  text: i === 0 ? draft.text : null,
                  color: color as HighlightColor,
                  comment: null,
                },
                q && i === 0,
              );
            }
          }}
          onUpdate={(id, patch) => {
            const h = highlights.find((x) => x.id === id);
            if (h)
              update(h, {
                color: patch.color as HighlightColor | undefined,
                comment: patch.comment,
              });
          }}
          onDelete={(id) => {
            const h = highlights.find((x) => x.id === id);
            if (h) remove(h);
          }}
          onQuote={(id) => {
            const h = highlights.find((x) => x.id === id);
            if (h) quote(h);
          }}
          onPlace={(id, page, rects) => place(itemId, id, page, rects)}
        />
      ) : (
        <div className="empty muted">{t("reader.loading")}</div>
      )}
    </div>
  );
}
