import { ArrowDown, ArrowUp, BookOpen, FileText } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { InfoTip } from "../../components/InfoTip";
import { registry, trashWithUndo } from "../../contributions/commands";
import { t } from "../../i18n";
import type { MessageKey } from "../../i18n/en";
import { isMod } from "../../platform";
import { cardTriggers, useCard } from "../../store/card";
import { useContextMenu } from "../../store/contextMenu";
import { useLibrary } from "../../store/library";
import { usePanes } from "../../store/panes";
import { usePlatform } from "../../store/platform";
import { type ColumnWidths, useUi } from "../../store/ui";
import { loadSpines } from "../spine/store";
import { startPaperDrag } from "./dragPapers";
import { orderItems, type SortKey, type StatusFilter, shortAuthors } from "./filter";
import { itemMenu } from "./itemMenu";
import { QueryInput } from "./QueryInput";

const runCommand = (id: string) =>
  registry
    .listCommands()
    .find((c) => c.id === id)
    ?.run();

const ROW = 36;
const STATUSES: StatusFilter[] = ["all", "unread", "reading", "read"];
const COLUMNS: { key: SortKey; label: MessageKey; cls: string }[] = [
  { key: "title", label: "table.title", cls: "c-title" },
  { key: "author", label: "table.creator", cls: "c-creator" },
  { key: "year", label: "table.year", cls: "c-year" },
  { key: "dateAdded", label: "table.added", cls: "c-added" },
];

/** Which stored width a column uses; the title column takes the rest. */
const WIDTH_OF: Partial<Record<SortKey, keyof ColumnWidths>> = {
  author: "creator",
  year: "year",
  dateAdded: "added",
};

/** The divider on a column's left edge: drag left to widen, double-click to reset. */
function ColumnResizer(p: { label: string; width: number; onResize(px: number | null): void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={p.label}
      aria-valuenow={p.width}
      tabIndex={0}
      className="col-resizer"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const x0 = e.clientX;
        const w0 = p.width;
        const move = (ev: PointerEvent) => p.onResize(w0 - (ev.clientX - x0));
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          document.body.classList.remove("resizing-col");
        };
        document.body.classList.add("resizing-col");
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      }}
      onDoubleClick={() => p.onResize(null)}
      onKeyDown={(e) => {
        const d = e.key === "ArrowLeft" ? 8 : e.key === "ArrowRight" ? -8 : 0;
        if (!d) return;
        e.preventDefault();
        p.onResize(p.width + d);
      }}
    />
  );
}

/** Zotero-style item table: sortable, resizable columns, virtualized rows. */
export function LibraryTable() {
  const { items, loaded, results, runSearch, tags } = useLibrary();
  const {
    query,
    status,
    sort,
    sortDir,
    selectedId,
    selectedIds,
    setQuery,
    setStatus,
    setSort,
    select,
    selectMany,
    columnWidths,
    setColumnWidth,
  } = useUi();
  const platform = usePlatform((s) => s.platform);
  const visible = useMemo(
    () => orderItems(items, results?.ids ?? null, status, sort, sortDir),
    [items, results, status, sort, sortDir],
  );
  const order = useMemo(() => visible.map((i) => i.id), [visible]);
  const colors = useMemo(() => new Map(tags.map((x) => [x.path, x.color])), [tags]);
  const listRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(600);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const h = setTimeout(() => runSearch(query), 120);
    return () => clearTimeout(h);
  }, [query, runSearch]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHeight(el.clientHeight);
      setWidth(el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollIntoView = (idx: number) => {
    const el = listRef.current;
    if (!el) return;
    if (idx * ROW < el.scrollTop) el.scrollTop = idx * ROW;
    else if ((idx + 1) * ROW > el.scrollTop + el.clientHeight)
      el.scrollTop = (idx + 1) * ROW - el.clientHeight;
  };

  const onKey = (e: KeyboardEvent) => {
    if (platform && isMod(platform, e) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectMany(order);
      return;
    }
    if (e.key === "Enter" && selectedId !== null) {
      e.preventDefault();
      if (items.find((i) => i.id === selectedId)?.hasPdf) usePanes.getState().openPdf(selectedId);
      return;
    }
    // Delete / ⌫: selected papers to the Trash (with Undo), then select the next one, like Finder
    if ((e.key === "Delete" || e.key === "Backspace") && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const ids = useUi.getState().selectedIds;
      if (!ids.length) return;
      e.preventDefault();
      const lastIdx = Math.max(...ids.map((id) => order.indexOf(id)));
      const next =
        order.slice(lastIdx + 1).find((id) => !ids.includes(id)) ??
        [...order.slice(0, lastIdx)].reverse().find((id) => !ids.includes(id)) ??
        null;
      trashWithUndo(ids).then(() => next !== null && select(next));
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const cur = order.indexOf(selectedId ?? -1);
    const next = Math.max(0, Math.min(order.length - 1, cur + (e.key === "ArrowDown" ? 1 : -1)));
    if (order[next] === undefined) return;
    if (e.shiftKey) {
      const ui = useUi.getState();
      const anchor = ui.selectedIds.length ? order.indexOf(ui.selectedIds[0]) : cur;
      const [a, b] = [Math.min(anchor, next), Math.max(anchor, next)];
      const range = order.slice(a, b + 1);
      useUi.setState({
        selectedIds: anchor <= next ? range : range.reverse(),
        selectedId: order[next],
      });
    } else select(order[next]);
    scrollIntoView(next);
  };

  const first = Math.max(0, Math.floor(scroll / ROW) - 8);
  const last = Math.min(visible.length, Math.ceil((scroll + height) / ROW) + 8);
  const narrow = width < 520;
  // a very narrow list keeps titles readable; authors stay in the hover card and detail pane
  const tiny = width < 380;
  // the title keeps at least 45% of the list (and 120px); the other columns are as wide as the
  // user made them; when the pane is too narrow, Creator gives way first so Year stays visible
  const titleMin = Math.max(120, Math.round(width * 0.45));
  const fixed =
    columnWidths.year + (narrow ? 0 : columnWidths.added) + 44 + (tiny ? width * 0.55 : titleMin);
  const creator = Math.max(56, Math.min(columnWidths.creator, width - fixed));
  const cols = [
    `minmax(${titleMin}px, 1fr)`,
    ...(tiny ? [] : [`${creator}px`]),
    `${columnWidths.year}px`,
    ...(narrow ? [] : [`${columnWidths.added}px`]),
    "50px",
  ].join(" ");

  return (
    <div
      className={`library${narrow ? " narrow" : ""}`}
      style={{ "--cols": cols } as React.CSSProperties}
    >
      <div className="list-toolbar">
        <div className="query-row">
          <QueryInput value={query} onChange={setQuery} />
          <InfoTip label={t("help.queryLabel")} wide>
            <strong>{t("help.queryTitle")}</strong>
            <span className="help-list">
              <code>tag:ml/nlp</code> {t("help.q.tag")}
              <br />
              <code>project:"Thesis"</code> {t("help.q.project")}
              <br />
              <code>author:hinton</code> · <code>venue:neurips</code> · <code>type:book</code>
              <br />
              <code>year:2020</code> · <code>year:&gt;=2018</code> · <code>year:2016..2020</code>
              <br />
              <code>is:unread</code> · <code>is:pdf</code> · <code>is:untagged</code> ·{" "}
              <code>has:notes</code>
              <br />
              <code>cites:key</code> · <code>cited-by:key</code> {t("help.q.cites")}
              <br />
              <code>"exact phrase"</code> · <code>-word</code> · <code>-tag:x</code>{" "}
              {t("help.q.not")}
            </span>
          </InfoTip>
        </div>
        {results?.warnings.map((w) => (
          <div key={w} className="small warn">
            {w}
          </div>
        ))}
        <div className="filters row">
          <div className="segmented" role="group" aria-label={t("library.statusFilter")}>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                className={status === s ? "on" : ""}
                onClick={() => setStatus(s)}
              >
                {t(`status.${s}`)}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <span className="muted small" role="status">
            {t("library.count", { n: visible.length })}
          </span>
        </div>
      </div>
      <div className="table-head" role="row">
        {COLUMNS.filter(
          (c) => !(narrow && c.key === "dateAdded") && !(tiny && c.key === "author"),
        ).map((c) => {
          const col = WIDTH_OF[c.key];
          return (
            <div key={c.key} className={`th-cell ${c.cls}`}>
              {col && (
                <ColumnResizer
                  label={t("table.resize", { name: t(c.label) })}
                  width={columnWidths[col]}
                  onResize={(px) => setColumnWidth(col, px)}
                />
              )}
              <button
                type="button"
                role="columnheader"
                aria-sort={
                  sort === c.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                }
                className={`th ${c.cls}${sort === c.key ? " sorted" : ""}`}
                onClick={() =>
                  setSort(c.key, sort === c.key ? (sortDir === "asc" ? "desc" : "asc") : undefined)
                }
              >
                {t(c.label)}
                {sort === c.key &&
                  (sortDir === "asc" ? (
                    <ArrowUp size={12} aria-hidden="true" />
                  ) : (
                    <ArrowDown size={12} aria-hidden="true" />
                  ))}
              </button>
            </div>
          );
        })}
        <span className="th c-icons" title={t("table.iconsHint")}>
          <span className="visually-hidden">{t("table.iconsHint")}</span>
        </span>
      </div>
      <div
        className="list"
        ref={listRef}
        role="listbox"
        aria-multiselectable="true"
        tabIndex={0}
        aria-label={t("library.title")}
        onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
        onKeyDown={onKey}
      >
        {loaded && items.length === 0 && (
          <div className="empty first-run">
            <strong>{t("library.empty")}</strong>
            <span className="muted">{t("library.emptyHint")}</span>
            <div className="first-run-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => runCommand("library.add")}
              >
                {t("library.firstAdd")}
              </button>
              <button type="button" className="btn" onClick={() => runCommand("discover.open")}>
                {t("cmd.searchOnline")}
              </button>
              <button type="button" className="btn" onClick={() => runCommand("import.zotero")}>
                {t("cmd.importZotero")}
              </button>
            </div>
          </div>
        )}
        {items.length > 0 && visible.length === 0 && (
          <div className="empty muted">{t("library.noMatches")}</div>
        )}
        <div style={{ height: visible.length * ROW, position: "relative" }}>
          {visible.slice(first, last).map((item, n) => {
            const on = selectedIds.includes(item.id);
            const dots = item.tags.filter((x) => colors.get(x));
            return (
              <div
                key={item.id}
                role="option"
                aria-selected={on}
                tabIndex={-1}
                className={`tr${on ? " selected" : ""}${(first + n) % 2 ? " odd" : ""}`}
                style={{ top: (first + n) * ROW, height: ROW }}
                {...cardTriggers(item.id, "list")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // right-click on a paper outside the selection selects just that paper
                  if (!useUi.getState().selectedIds.includes(item.id))
                    select(item.id, "single", order);
                  useCard.getState().close();
                  const { clientX, clientY } = e;
                  const ids = useLibrary.getState().projects.map((p) => p.id);
                  loadSpines(ids).then((spines) =>
                    useContextMenu.getState().open(clientX, clientY, itemMenu(spines), item.title),
                  );
                }}
                onDoubleClick={() => item.hasPdf && usePanes.getState().openPdf(item.id)}
                onMouseDown={(e) => {
                  if (e.button !== 0) return; // right-click keeps a multi-selection; see onContextMenu
                  const mode = e.shiftKey
                    ? "range"
                    : platform && isMod(platform, e)
                      ? "toggle"
                      : "single";
                  const sel = useUi.getState().selectedIds;
                  // pressing inside a multi-selection keeps it, so all of it can be dragged
                  const keep = mode === "single" && sel.length > 1 && sel.includes(item.id);
                  if (!keep) select(item.id, mode, order);
                  if (mode === "toggle") return;
                  const ids = useUi.getState().selectedIds;
                  startPaperDrag(
                    e,
                    ids,
                    ids.length === 1 ? item.title : t("drag.papers", { n: ids.length }),
                    keep ? () => select(item.id, "single", order) : undefined,
                  );
                }}
              >
                <span className="td c-title" title={item.title}>
                  {dots.length > 0 && (
                    <span className="row-tags" aria-hidden="true" title={dots.join(", ")}>
                      {dots.map((x) => (
                        <span
                          key={x}
                          className="chip-dot"
                          style={{ background: `var(--tag-${colors.get(x)})` }}
                        />
                      ))}
                    </span>
                  )}
                  <span className="row-title">{item.title}</span>
                </span>
                {!tiny && <span className="td c-creator">{shortAuthors(item.authors)}</span>}
                <span className="td c-year">{item.year ?? ""}</span>
                {!narrow && <span className="td c-added">{item.dateAdded.slice(0, 10)}</span>}
                <span className="td c-icons">
                  <span
                    className={`dot dot-${item.readStatus}`}
                    title={t(`status.${item.readStatus}`)}
                  />
                  {item.hasPdf ? (
                    <FileText size={14} aria-label="PDF" className="att" />
                  ) : item.hasEpub ? (
                    <BookOpen size={14} aria-label="EPUB" className="att" />
                  ) : (
                    <span className="att-none" />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
