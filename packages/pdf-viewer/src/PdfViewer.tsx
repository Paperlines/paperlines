import type { HighlightKind, Rect } from "@paperlines/backend-port";
import { TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildPageText,
  type FindItem,
  type FindOptions,
  findInText,
  findPassage,
  matchRects,
  type PageText,
} from "./find";
import { type Box, hitTest, mergeLines, normalizeRects, rectFromPoints } from "./geometry";
import { loadPdf, type PDFDocumentProxy } from "./pdf";
import "./viewer.css";

export interface ViewerHighlight {
  id: number;
  page: number;
  kind: HighlightKind;
  rects: Rect[];
  color: string;
  comment: string | null;
  text: string | null;
}

export type Tool = HighlightKind;

/** A new highlight before it is saved; selections across pages yield one part per page. */
export interface Draft {
  kind: Tool;
  parts: { page: number; rects: Rect[] }[];
  text: string | null;
}

export interface ViewerStrings {
  highlight: string;
  underline: string;
  rect: string;
  zoomIn: string;
  zoomOut: string;
  fitWidth: string;
  page(n: number, total: number): string;
  quote: string;
  delete: string;
  comment: string;
  loading: string;
  failed: string;
  find: string;
  findPlaceholder: string;
  findNext: string;
  findPrev: string;
  matchCase: string;
  wholeWord: string;
  closeFind: string;
  /** "3 of 17" */
  findCount(i: number, n: number): string;
  noMatches: string;
  searching: string;
}

/** One search hit: its page and boxes (0-1 of the page). */
interface FindHit {
  page: number;
  rects: Rect[];
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const isMod = (e: KeyboardEvent | React.KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);

export interface PdfViewerProps {
  data: Uint8Array;
  highlights: ViewerHighlight[];
  /** Highlight colors and their meanings; the first is the default. */
  colors: { color: string; label: string }[];
  /** Change `nonce` to scroll to a page or highlight again. */
  focus: { page: number; highlightId?: number; nonce: number } | null;
  strings: ViewerStrings;
  onCreate(draft: Draft, color: string, quote: boolean): void;
  onUpdate(id: number, patch: { color?: string; comment?: string }): void;
  onDelete(id: number): void;
  onQuote(id: number): void;
  /**
   * A highlight known only by its words (no rects yet, e.g. made by an AI assistant from the
   * PDF's text) was found on `page`: save where it is. Not called when it can't be found.
   */
  onPlace?(id: number, page: number, rects: Rect[]): void;
  /** The host's own controls at the start and end of the toolbar (e.g. "back", "Export"). */
  toolbarStart?: React.ReactNode;
  toolbarEnd?: React.ReactNode;
}

type Popup =
  | { type: "draft"; draft: Draft; x: number; y: number }
  | { type: "existing"; id: number; x: number; y: number }
  | null;

const NO_FINDS: Rect[][] = [];

const hlVar = (color: string) =>
  ({ "--hl": `var(--hl-${color}, ${color})` }) as React.CSSProperties;

interface PageProps {
  doc: PDFDocumentProxy;
  num: number;
  scale: number;
  visible: boolean;
  size: { w: number; h: number };
  onSize(num: number, w: number, h: number): void;
  highlights: ViewerHighlight[];
  activeId: number | null;
  flashId: number | null;
  /** Find hits on this page; `active` is the index (within these) of the current hit, or -1. */
  finds: Rect[][];
  activeFind: number;
  tool: Tool;
  onRect(page: number, r: Rect, anchor: { x: number; y: number }): void;
  registerEl(num: number, el: HTMLDivElement | null): void;
}

function PageView(p: PageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    a: { x: number; y: number };
    b: { x: number; y: number };
  } | null>(null);
  const { doc, num, scale, visible, onSize } = p;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    let tl: TextLayer | null = null;
    (async () => {
      const page = await doc.getPage(num);
      if (cancelled) return;
      const vp = page.getViewport({ scale });
      onSize(num, vp.width, vp.height);
      const c = canvas.current;
      const t = text.current;
      if (!c || !t) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.floor(vp.width * dpr);
      c.height = Math.floor(vp.height * dpr);
      c.style.width = `${vp.width}px`;
      c.style.height = `${vp.height}px`;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      task = page.render({
        canvasContext: ctx,
        canvas: c,
        viewport: vp,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      t.replaceChildren();
      tl = new TextLayer({
        textContentSource: page.streamTextContent({ includeMarkedContent: true }),
        container: t,
        viewport: vp,
      });
      await Promise.all([task.promise, tl.render()]).catch(() => {});
      if (cancelled) return;
      const end = document.createElement("div");
      end.className = "endOfContent";
      t.append(end);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      tl?.cancel();
      if (canvas.current) canvas.current.width = 0;
      text.current?.replaceChildren();
    };
  }, [doc, num, scale, visible, onSize]);

  const norm = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const style = {
    width: p.size.w,
    height: p.size.h,
    "--scale-factor": scale,
    "--total-scale-factor": scale,
    "--scale-round-x": "1px",
    "--scale-round-y": "1px",
    "--user-unit": 1,
  } as React.CSSProperties;

  return (
    <div className="pv-page" data-page={num} style={style} ref={(el) => p.registerEl(num, el)}>
      <canvas ref={canvas} aria-hidden="true" />
      <div className="pv-hl-layer">
        {p.highlights.map((h) => (
          // one group per highlight: its transparency applies to the whole, so where two lines'
          // boxes overlap the colour doesn't double up into a darker band
          <div
            key={h.id}
            className={`pv-hl-group k-${h.kind}${p.activeId === h.id ? " active" : ""}`}
            style={hlVar(h.color)}
          >
            {h.rects.map((r, i) => (
              <div
                key={`${h.id}-${i}`}
                className={`pv-hl k-${h.kind}${p.activeId === h.id ? " active" : ""}${p.flashId === h.id ? " flash" : ""}`}
                data-highlight={h.id}
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {p.finds.length > 0 && (
        <div className="pv-find-layer" aria-hidden="true">
          {p.finds.map((rects, i) =>
            rects.map((r, j) => (
              <div
                key={`${i}-${j}`}
                className={`pv-find${i === p.activeFind ? " active" : ""}`}
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
              />
            )),
          )}
        </div>
      )}
      <div
        className="pv-text"
        ref={text}
        onPointerDown={(e) => e.currentTarget.classList.add("selecting")}
        onPointerUp={(e) => e.currentTarget.classList.remove("selecting")}
      />
      {p.tool === "rect" && (
        <div
          className="pv-draw"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const pt = norm(e);
            setDrag({ a: pt, b: pt });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, b: norm(e) })}
          onPointerUp={(e) => {
            if (!drag) return;
            const r = rectFromPoints(drag.a, norm(e));
            setDrag(null);
            if (r.w > 0.01 && r.h > 0.01) p.onRect(num, r, { x: e.clientX, y: e.clientY });
          }}
        >
          {drag && (
            <div
              className="pv-drawing"
              style={(() => {
                const r = rectFromPoints(drag.a, drag.b);
                return {
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                };
              })()}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function PdfViewer(props: PdfViewerProps) {
  const { data, highlights, colors, focus, strings: s } = props;
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("highlight");
  const [visible, setVisible] = useState<Set<number>>(new Set([1]));
  const [current, setCurrent] = useState(1);
  const [popup, setPopup] = useState<Popup>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const observer = useRef<IntersectionObserver | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [findOpts, setFindOpts] = useState<FindOptions>({});
  const [hits, setHits] = useState<FindHit[]>([]);
  const [hitIndex, setHitIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  /** Per-page text, extracted once per document. */
  const texts = useRef(new Map<number, { items: FindItem[]; page: PageText }>());
  /** Whether the user last clicked or typed in this viewer: then mod+F means find in the PDF. */
  const engaged = useRef(false);

  useEffect(() => {
    let live = true;
    let loaded = null as PDFDocumentProxy | null;
    setDoc(null);
    setError(null);
    setSizes({});
    texts.current = new Map();
    setHits([]);
    setHitIndex(-1);
    loadPdf(data)
      .then(async (d) => {
        loaded = d;
        const first = await d.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (!live) return;
        setBase({ w: vp.width, h: vp.height });
        setDoc(d);
      })
      .catch((e) => live && setError(String(e?.message ?? e)));
    return () => {
      live = false;
      loaded?.loadingTask.destroy();
    };
  }, [data]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = base ? Math.max(0.25, ((width - 40) / base.w) * zoom) : 1;

  useEffect(() => {
    setSizes({});
  }, [scale]);

  useEffect(() => {
    if (!doc) return;
    observer.current?.disconnect();
    const io = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        }),
      { root: scrollRef.current, rootMargin: "1200px 0px" },
    );
    observer.current = io;
    for (const el of pageEls.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [doc]);

  const registerEl = useCallback((num: number, el: HTMLDivElement | null) => {
    const prev = pageEls.current.get(num);
    if (prev && prev !== el) observer.current?.unobserve(prev);
    if (el) {
      pageEls.current.set(num, el);
      observer.current?.observe(el);
    } else pageEls.current.delete(num);
  }, []);

  const onSize = useCallback((num: number, w: number, h: number) => {
    setSizes((prev) =>
      prev[num]?.w === w && prev[num]?.h === h ? prev : { ...prev, [num]: { w, h } },
    );
  }, []);

  const sizeOf = (n: number) =>
    sizes[n] ?? { w: (base?.w ?? 600) * scale, h: (base?.h ?? 800) * scale };

  const toContent = (clientX: number, clientY: number) => {
    const el = scrollRef.current as HTMLDivElement;
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left + el.scrollLeft, y: clientY - r.top + el.scrollTop };
  };

  // scroll to a requested page / highlight
  useEffect(() => {
    if (!focus || !doc) return;
    const el = pageEls.current.get(focus.page);
    const sc = scrollRef.current;
    if (!el || !sc) return;
    const h = focus.highlightId ? highlights.find((x) => x.id === focus.highlightId) : undefined;
    const y = h?.rects.length ? Math.min(...h.rects.map((r) => r.y)) * el.offsetHeight : 0;
    sc.scrollTo({ top: el.offsetTop + y - 80 });
    if (h) {
      setFlashId(h.id);
      const t = setTimeout(() => setFlashId(null), 1300);
      return () => clearTimeout(t);
    }
  }, [focus, doc, highlights]);

  // text of one page, extracted once per document (shared with find)
  const pageText = async (n: number) => {
    if (!doc) return null;
    const pg = await doc.getPage(n);
    let t = texts.current.get(n);
    if (!t) {
      const content = await pg.getTextContent();
      const items = (content.items as unknown as FindItem[]).filter(
        (it) => typeof it.str === "string",
      );
      t = { items, page: buildPageText(items) };
      texts.current.set(n, t);
    }
    const vp = pg.getViewport({ scale: 1 });
    return { t, vp };
  };

  // place highlights that only have words (quoted from the PDF's text): the quoted page first,
  // then its neighbours, then the rest; each is tried once per opening
  const tried = useRef(new Set<number>());
  useEffect(() => {
    if (!doc || !props.onPlace) return;
    const pending = highlights.filter(
      (h) => h.rects.length === 0 && h.text && !tried.current.has(h.id),
    );
    if (!pending.length) return;
    let live = true;
    (async () => {
      for (const h of pending) {
        tried.current.add(h.id);
        const order = [h.page, h.page - 1, h.page + 1];
        for (let n = 1; n <= doc.numPages; n++) if (!order.includes(n)) order.push(n);
        for (const n of order.filter((n) => n >= 1 && n <= doc.numPages)) {
          const got = await pageText(n);
          if (!live || !got) return;
          const span = findPassage(got.t.page, h.text as string);
          if (!span) continue;
          const { vp } = got;
          const toVp = ([x1, y1, x2, y2]: number[]) => [
            ...vp.convertToViewportPoint(x1, y1),
            ...vp.convertToViewportPoint(x2, y2),
          ];
          const rects = mergeLines(
            matchRects(got.t.page, got.t.items, span[0], span[1], toVp, {
              w: vp.width,
              h: vp.height,
            }),
          );
          if (rects.length) props.onPlace?.(h.id, n, rects);
          break;
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [doc, highlights]);

  // search every page (text extracted once, then cached); a newer query cancels an older one
  useEffect(() => {
    if (!doc || !findOpen || !query.trim()) {
      setHits([]);
      setHitIndex(-1);
      setSearching(false);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      const found: FindHit[] = [];
      for (let n = 1; n <= doc.numPages && live; n++) {
        let t = texts.current.get(n);
        const pg = await doc.getPage(n);
        if (!live) return;
        if (!t) {
          const content = await pg.getTextContent();
          const items = (content.items as unknown as FindItem[]).filter(
            (it) => typeof it.str === "string",
          );
          t = { items, page: buildPageText(items) };
          texts.current.set(n, t);
        }
        const vp = pg.getViewport({ scale: 1 });
        const size = { w: vp.width, h: vp.height };
        const toVp = ([x1, y1, x2, y2]: number[]) => [
          ...vp.convertToViewportPoint(x1, y1),
          ...vp.convertToViewportPoint(x2, y2),
        ];
        for (const [a, b] of findInText(t.page.text, query, findOpts)) {
          found.push({ page: n, rects: matchRects(t.page, t.items, a, b, toVp, size) });
        }
        // show results as they come in on long documents
        if (n % 20 === 0 && live) setHits([...found]);
      }
      if (!live) return;
      setHits(found);
      setSearching(false);
      // start at the first hit on or after the page being read
      const from = found.findIndex((h) => h.page >= current);
      setHitIndex(found.length ? Math.max(from, 0) : -1);
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // the reading position only picks the starting hit; it must not re-run the search
  }, [doc, findOpen, query, findOpts]);

  // bring the current hit into view
  useEffect(() => {
    const h = hits[hitIndex];
    const sc = scrollRef.current;
    const el = h && pageEls.current.get(h.page);
    if (!h || !sc || !el) return;
    const top = el.offsetTop + Math.min(...h.rects.map((r) => r.y)) * el.offsetHeight;
    const left = el.offsetLeft + Math.min(...h.rects.map((r) => r.x)) * el.offsetWidth;
    if (top < sc.scrollTop + 40 || top > sc.scrollTop + sc.clientHeight - 60)
      sc.scrollTo({ top: top - sc.clientHeight / 3 });
    if (left < sc.scrollLeft || left > sc.scrollLeft + sc.clientWidth - 40)
      sc.scrollTo({ left: Math.max(0, left - 40) });
  }, [hits, hitIndex]);

  const step = (d: 1 | -1) => {
    if (!hits.length) return;
    setHitIndex((i) => (i + d + hits.length) % hits.length);
  };

  const openFind = () => {
    const sel = window.getSelection();
    const picked =
      sel && !sel.isCollapsed && rootRef.current?.contains(sel.anchorNode) ? sel.toString() : "";
    if (picked.trim() && picked.length < 200) setQuery(picked.replace(/\s+/g, " ").trim());
    setFindOpen(true);
    requestAnimationFrame(() => {
      findInput.current?.focus();
      findInput.current?.select();
    });
  };
  const closeFind = () => {
    setFindOpen(false);
    setHits([]);
    setHitIndex(-1);
  };

  // mod+F / mod+G: only for the viewer in use (visible, last clicked), ahead of app shortcuts
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      engaged.current = !!rootRef.current?.contains(e.target as Node);
    };
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || root.offsetParent === null) return;
      const inside = root.contains(document.activeElement);
      if (!engaged.current && !inside) return;
      const k = e.key.toLowerCase();
      if (isMod(e) && !e.altKey && k === "f") {
        e.preventDefault();
        e.stopPropagation();
        openFind();
      } else if (isMod(e) && k === "g" && findOpen) {
        e.preventDefault();
        e.stopPropagation();
        step(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  });

  const hitsByPage = useMemo(() => {
    const m = new Map<number, { rects: Rect[][]; active: number }>();
    hits.forEach((h, i) => {
      const e = m.get(h.page) ?? { rects: [], active: -1 };
      if (i === hitIndex) e.active = e.rects.length;
      e.rects.push(h.rects);
      m.set(h.page, e);
    });
    return m;
  }, [hits, hitIndex]);

  const onScroll = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    const mid = sc.scrollTop + sc.clientHeight / 3;
    let n = 1;
    for (const [num, el] of pageEls.current) if (el.offsetTop <= mid && num > n) n = num;
    if (n !== current) setCurrent(n);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (tool === "rect" || (e.target as HTMLElement).closest(".pv-popup")) return;
    const sel = window.getSelection();
    const pageEl = (e.target as HTMLElement).closest<HTMLElement>(".pv-page");
    if (!sel || sel.isCollapsed) {
      if (!pageEl) return setPopup(null);
      const r = pageEl.getBoundingClientRect();
      const page = Number(pageEl.dataset.page);
      const hit = hitTest(
        highlights,
        page,
        (e.clientX - r.left) / r.width,
        (e.clientY - r.top) / r.height,
      );
      const at = toContent(e.clientX, e.clientY);
      setPopup(hit ? { type: "existing", id: hit.id, x: at.x, y: at.y + 8 } : null);
      return;
    }
    const range = sel.getRangeAt(0);
    const client = [...range.getClientRects()];
    const parts: Draft["parts"] = [];
    for (const [num, el] of [...pageEls.current].sort((a, b) => a[0] - b[0])) {
      const box: Box = el.getBoundingClientRect();
      const rects = normalizeRects(client, box);
      if (rects.length) parts.push({ page: num, rects });
    }
    if (!parts.length) return;
    const last = client[client.length - 1];
    const at = toContent(last.right, last.bottom);
    setPopup({
      type: "draft",
      draft: { kind: tool, parts, text: sel.toString() },
      x: at.x,
      y: at.y + 6,
    });
  };

  const finishDraft = (color: string, quote: boolean) => {
    if (popup?.type !== "draft") return;
    props.onCreate(popup.draft, color, quote);
    window.getSelection()?.removeAllRanges();
    setPopup(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPopup(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pages = useMemo(() => Array.from({ length: doc?.numPages ?? 0 }, (_, i) => i + 1), [doc]);
  const existing =
    popup?.type === "existing" ? highlights.find((h) => h.id === popup.id) : undefined;

  const popupStyle = (x: number, y: number): React.CSSProperties => {
    const content = pagesRef.current?.scrollWidth ?? width;
    return { left: Math.max(8, Math.min(x - 110, content - 240)), top: y };
  };

  return (
    <div className="pv-root" ref={rootRef}>
      <div className="pv-toolbar" role="toolbar">
        {props.toolbarStart}
        <div className="segmented" role="group">
          {(["highlight", "underline", "rect"] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tool === t}
              className={tool === t ? "on" : ""}
              onClick={() => setTool(t)}
            >
              {s[t]}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button
          type="button"
          className={`icon-btn${findOpen ? " on" : ""}`}
          aria-label={s.find}
          title={`${s.find} (${isMac ? "⌘" : "Ctrl+"}F)`}
          aria-pressed={findOpen}
          onClick={() => (findOpen ? closeFind() : openFind())}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        <span className="muted small">{doc ? s.page(current, doc.numPages) : ""}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label={s.zoomOut}
          title={s.zoomOut}
          onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
        >
          −
        </button>
        <button type="button" className="btn" onClick={() => setZoom(1)}>
          {s.fitWidth}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={s.zoomIn}
          title={s.zoomIn}
          onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
        >
          +
        </button>
        {props.toolbarEnd}
      </div>
      {findOpen && (
        <div className="pv-findbar" role="search" aria-label={s.find}>
          <input
            ref={findInput}
            className="input pv-find-input"
            type="search"
            placeholder={s.findPlaceholder}
            aria-label={s.findPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeFind();
              }
            }}
          />
          <span className="pv-find-count small" role="status" aria-live="polite">
            {!query.trim()
              ? ""
              : searching && !hits.length
                ? s.searching
                : hits.length
                  ? s.findCount(hitIndex + 1, hits.length)
                  : s.noMatches}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label={s.findPrev}
            title={`${s.findPrev} (⇧Enter)`}
            disabled={!hits.length}
            onClick={() => step(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={s.findNext}
            title={`${s.findNext} (Enter)`}
            disabled={!hits.length}
            onClick={() => step(1)}
          >
            ↓
          </button>
          <button
            type="button"
            className={`pv-opt${findOpts.caseSensitive ? " on" : ""}`}
            aria-pressed={!!findOpts.caseSensitive}
            aria-label={s.matchCase}
            title={s.matchCase}
            onClick={() => setFindOpts({ ...findOpts, caseSensitive: !findOpts.caseSensitive })}
          >
            Aa
          </button>
          <button
            type="button"
            className={`pv-opt${findOpts.wholeWord ? " on" : ""}`}
            aria-pressed={!!findOpts.wholeWord}
            aria-label={s.wholeWord}
            title={s.wholeWord}
            onClick={() => setFindOpts({ ...findOpts, wholeWord: !findOpts.wholeWord })}
          >
            <u>ab</u>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={s.closeFind}
            title={`${s.closeFind} (Esc)`}
            onClick={closeFind}
          >
            ×
          </button>
        </div>
      )}
      <div className="pv-scroll" ref={scrollRef} onScroll={onScroll} onMouseUp={onMouseUp}>
        {error && (
          <div className="pv-status">
            {s.failed}: {error}
          </div>
        )}
        {!doc && !error && <div className="pv-status">{s.loading}</div>}
        <div className="pv-pages" ref={pagesRef}>
          {doc &&
            pages.map((n) => (
              <PageView
                key={n}
                doc={doc}
                num={n}
                scale={scale}
                visible={visible.has(n)}
                size={sizeOf(n)}
                onSize={onSize}
                highlights={highlights.filter((h) => h.page === n)}
                activeId={existing?.id ?? null}
                flashId={flashId}
                finds={hitsByPage.get(n)?.rects ?? NO_FINDS}
                activeFind={hitsByPage.get(n)?.active ?? -1}
                tool={tool}
                registerEl={registerEl}
                onRect={(page, r, at) => {
                  const c = toContent(at.x, at.y);
                  setPopup({
                    type: "draft",
                    draft: { kind: "rect", parts: [{ page, rects: [r] }], text: null },
                    x: c.x,
                    y: c.y + 6,
                  });
                }}
              />
            ))}
        </div>
        {popup?.type === "draft" && (
          <div
            className="pv-popup"
            style={popupStyle(popup.x, popup.y)}
            role="dialog"
            aria-label={s[popup.draft.kind]}
          >
            <div className="pv-colors">
              {colors.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  className="pv-color"
                  style={hlVar(c.color)}
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => finishDraft(c.color, false)}
                />
              ))}
            </div>
            <div className="pv-actions">
              <button
                type="button"
                className="btn"
                onClick={() => finishDraft(colors[0]?.color ?? "yellow", true)}
              >
                {s.quote}
              </button>
            </div>
          </div>
        )}
        {existing && popup?.type === "existing" && (
          <div
            className="pv-popup"
            style={popupStyle(popup.x, popup.y)}
            role="dialog"
            aria-label={existing.text ?? s[existing.kind]}
          >
            <div className="pv-colors">
              {colors.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  className={`pv-color${existing.color === c.color ? " on" : ""}`}
                  style={hlVar(c.color)}
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={existing.color === c.color}
                  onClick={() => props.onUpdate(existing.id, { color: c.color })}
                />
              ))}
            </div>
            <textarea
              key={existing.id}
              className="input"
              rows={2}
              placeholder={s.comment}
              aria-label={s.comment}
              defaultValue={existing.comment ?? ""}
              onBlur={(e) =>
                e.target.value !== (existing.comment ?? "") &&
                props.onUpdate(existing.id, { comment: e.target.value })
              }
            />
            <div className="pv-actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  props.onDelete(existing.id);
                  setPopup(null);
                }}
              >
                {s.delete}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  props.onQuote(existing.id);
                  setPopup(null);
                }}
              >
                {s.quote}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
