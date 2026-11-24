import { ChevronLeft, ChevronRight, FileText, Network, NotebookPen, Quote, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { useContextMenu } from "../../store/contextMenu";
import { useLibrary } from "../../store/library";
import { type Tab, usePanes } from "../../store/panes";
import { CitingView } from "../citations/CitingView";
import { GraphView } from "../graph/GraphView";
import { useNoteList } from "../notes/links";
import { NoteView } from "../notes/NoteView";
import { Reader } from "../reader/Reader";

const key = (tab: Tab) =>
  tab.kind === "reader"
    ? `r${tab.itemId}`
    : tab.kind === "note"
      ? `n${tab.noteId}`
      : tab.kind === "citing"
        ? `c${tab.itemId}`
        : "graph";

/** When the tabs don't fit: how far they're scrolled, and whether there's more either side. */
function useTabScroll(count: number, active: number) {
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({
    overflow: false,
    start: true,
    end: true,
    /** The slider's handle: where it starts and how wide it is, as fractions of the track. */
    thumb: { left: 0, width: 1 },
  });
  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    setEdges({
      overflow,
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
      thumb: {
        left: el.scrollWidth ? el.scrollLeft / el.scrollWidth : 0,
        width: el.scrollWidth ? Math.min(1, el.clientWidth / el.scrollWidth) : 1,
      },
    });
  }, []);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    measure();
    return () => ro.disconnect();
  }, [measure, count]);
  // the active tab is always brought into view
  useEffect(() => {
    const s = strip.current;
    const el = s?.children[active] as HTMLElement | undefined;
    if (!s || !el) return;
    // the first and last tabs go all the way to their end, so the arrows show there's no more
    if (active === 0) s.scrollLeft = 0;
    else if (active === count - 1) s.scrollLeft = s.scrollWidth;
    else el.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [active, count, measure]);
  // a mouse wheel scrolls the tabs sideways
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const page = (dir: -1 | 1) => {
    const el = strip.current;
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: "smooth" });
  };
  /** Dragging the slider's handle (or clicking its track) scrolls the tabs. */
  const slide = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = strip.current;
    const track = e.currentTarget;
    if (!el) return;
    const rect = track.getBoundingClientRect();
    const onThumb = (e.target as HTMLElement).classList.contains("tab-slider-thumb");
    const grab = onThumb
      ? e.clientX - rect.left - (el.scrollLeft / el.scrollWidth) * rect.width
      : -1;
    const to = (x: number) => {
      const handle = (el.clientWidth / el.scrollWidth) * rect.width;
      const at = grab >= 0 ? x - rect.left - grab : x - rect.left - handle / 2;
      el.scrollLeft = (at / rect.width) * el.scrollWidth;
    };
    to(e.clientX);
    track.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => to(ev.clientX);
    const up = () => {
      track.removeEventListener("pointermove", move);
      track.removeEventListener("pointerup", up);
    };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", up);
  };
  return { strip, edges, measure, page, slide };
}

/** Editor-style tabs for the right pane. Inactive tabs stay mounted so PDFs keep their place. */
export function RightTabs() {
  const { tabs, active, activate, closeTab, closeOtherTabs, closeTabsToRight, closeAllTabs } =
    usePanes();
  /** Right-click on a tab: close it, the others, the ones after it, or all. */
  const tabMenu = (e: React.MouseEvent, i: number, name: string) => {
    e.preventDefault();
    useContextMenu.getState().open(
      e.clientX,
      e.clientY,
      [
        { label: t("tabs.closeThis"), run: () => closeTab(i) },
        {
          label: t("tabs.closeOthers"),
          disabled: tabs.length < 2,
          run: () => closeOtherTabs(i),
        },
        {
          label: t("tabs.closeRight"),
          disabled: i >= tabs.length - 1,
          run: () => closeTabsToRight(i),
        },
        "separator",
        { label: t("tabs.closeAll"), run: () => closeAllTabs() },
      ],
      name,
    );
  };
  const items = useLibrary((s) => s.items);
  const notes = useNoteList();
  const { strip, edges, measure, page, slide } = useTabScroll(tabs.length, active);
  if (tabs.length === 0) {
    return (
      <div className="empty reader-empty">
        <FileText size={36} strokeWidth={1.4} aria-hidden="true" />
        <strong>{t("reader.placeholder")}</strong>
        <span className="muted small">{t("reader.placeholderHint")}</span>
      </div>
    );
  }
  const label = (tab: Tab) => {
    if (tab.kind === "graph") return t("graph.title");
    if (tab.kind === "note")
      return notes.find((n) => n.noteId === tab.noteId)?.title ?? t("notes.title");
    const it = items.find((i) => i.id === tab.itemId);
    if (tab.kind === "citing") return t("citing.tab", { key: it?.citekey ?? "" });
    return it ? it.citekey : t("reader.title");
  };
  return (
    <div className="right-pane">
      <div className={`tabstrip-wrap${edges.overflow ? " overflowing" : ""}`}>
        {edges.overflow && (
          <button
            type="button"
            className="tab-scroll"
            aria-label={t("tabs.scrollLeft")}
            title={t("tabs.scrollLeft")}
            disabled={edges.start}
            onClick={() => page(-1)}
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
        )}
        <div
          className="tabstrip"
          role="tablist"
          aria-label={t("tabs.label")}
          ref={strip}
          onScroll={measure}
        >
          {tabs.map((tab, i) => {
            const Icon =
              tab.kind === "graph"
                ? Network
                : tab.kind === "note"
                  ? NotebookPen
                  : tab.kind === "citing"
                    ? Quote
                    : FileText;
            return (
              <div
                key={key(tab)}
                className={`tab${i === active ? " on" : ""}`}
                onContextMenu={(e) => tabMenu(e, i, label(tab))}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  className="tab-btn"
                  title={label(tab)}
                  onClick={() => activate(i)}
                >
                  <Icon size={13} aria-hidden="true" />
                  <span>{label(tab)}</span>
                </button>
                <button
                  type="button"
                  className="tab-x"
                  aria-label={t("tabs.close", { name: label(tab) })}
                  onClick={() => closeTab(i)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        {edges.overflow && (
          <button
            type="button"
            className="tab-scroll"
            aria-label={t("tabs.scrollRight")}
            title={t("tabs.scrollRight")}
            disabled={edges.end}
            onClick={() => page(1)}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
        {edges.overflow && (
          <div
            className="tab-slider"
            role="scrollbar"
            aria-controls="right-tabstrip"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              (edges.thumb.left / Math.max(0.0001, 1 - edges.thumb.width)) * 100,
            )}
            aria-label={t("tabs.slider")}
            onPointerDown={slide}
          >
            <div
              className="tab-slider-thumb"
              style={{ left: `${edges.thumb.left * 100}%`, width: `${edges.thumb.width * 100}%` }}
            />
          </div>
        )}
      </div>
      <div className="tab-panels">
        {tabs.map((tab, i) => (
          <div key={key(tab)} className="tab-panel" hidden={i !== active}>
            {tab.kind === "reader" ? (
              <Reader itemId={tab.itemId} />
            ) : tab.kind === "note" ? (
              <NoteView noteId={tab.noteId} />
            ) : tab.kind === "citing" ? (
              <CitingView itemId={tab.itemId} />
            ) : (
              <GraphView />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
