import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import type { MessageKey } from "../../i18n/en";
import { useTour } from "../../store/tour";

/** One stop: what to point at (none: a card in the middle), and what to say about it. */
interface Step {
  target?: string;
  title: MessageKey;
  text: MessageKey;
}

export const STEPS: Step[] = [
  { title: "tour.welcome.title", text: "tour.welcome.text" },
  { target: ".quick-add", title: "tour.add.title", text: "tour.add.text" },
  { target: ".sidebar", title: "tour.sidebar.title", text: "tour.sidebar.text" },
  { target: ".pane-first", title: "tour.list.title", text: "tour.list.text" },
  { target: ".topbar .segmented.icons", title: "tour.layout.title", text: "tour.layout.text" },
  {
    target: '.topbar [aria-label="Show citation graph"]',
    title: "tour.graph.title",
    text: "tour.graph.text",
  },
  { target: ".topbar .agent-toggle", title: "tour.assistant.title", text: "tour.assistant.text" },
  {
    target: '.topbar [aria-label="Command palette"]',
    title: "tour.palette.title",
    text: "tour.palette.text",
  },
  {
    target: '.topbar [aria-label="Settings"]',
    title: "tour.settings.title",
    text: "tour.settings.text",
  },
  { title: "tour.done.title", text: "tour.done.text" },
];

type Box = { x: number; y: number; w: number; h: number };
const PAD = 6;
const CARD_W = 320;
const GAP = 12;

/** Where the card goes: below, above, right or left of the highlighted part, whichever fits. */
function place(box: Box | null, card: { w: number; h: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(12, Math.min(vw - card.w - 12, x));
  const clampY = (y: number) => Math.max(12, Math.min(vh - card.h - 12, y));
  if (!box) return { left: (vw - card.w) / 2, top: (vh - card.h) / 2 };
  const cx = box.x + box.w / 2 - card.w / 2;
  if (box.y + box.h + GAP + card.h <= vh - 12)
    return { left: clampX(cx), top: box.y + box.h + GAP };
  if (box.y - GAP - card.h >= 12) return { left: clampX(cx), top: box.y - GAP - card.h };
  if (box.x + box.w + GAP + card.w <= vw - 12)
    return { left: box.x + box.w + GAP, top: clampY(box.y + box.h / 2 - card.h / 2) };
  if (box.x - GAP - card.w >= 12)
    return { left: box.x - GAP - card.w, top: clampY(box.y + box.h / 2 - card.h / 2) };
  return { left: (vw - card.w) / 2, top: (vh - card.h) / 2 };
}

/**
 * The first-run tour: the window dims, one part at a time is outlined, and a card says what it
 * does. Next/Back (or the arrow keys) move through it; Skip or Escape ends it.
 */
export function Tour() {
  const { open, step, go, finish } = useTour();
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState({ w: CARD_W, h: 160 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const s = STEPS[step];

  const measure = useCallback(() => {
    const el = s?.target ? document.querySelector<HTMLElement>(s.target) : null;
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0) {
      // kept inside the window, so the outline of a part along an edge isn't cut off
      const x = Math.max(2, r.x - PAD);
      const y = Math.max(2, r.y - PAD);
      const right = Math.min(window.innerWidth - 2, r.right + PAD);
      const bottom = Math.min(window.innerHeight - 2, r.bottom + PAD);
      setBox({ x, y, w: right - x, h: bottom - y });
    } else setBox(null);
    const c = cardRef.current;
    if (c) setCard({ w: c.offsetWidth, h: c.offsetHeight });
  }, [s]);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);
  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  const last = step === STEPS.length - 1;
  const next = useCallback(() => (last ? finish() : go(step + 1)), [last, finish, go, step]);
  const back = useCallback(() => step > 0 && go(step - 1), [go, step]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, next, back, finish]);

  if (!open || !s) return null;
  const pos = place(box, card);
  return (
    <div className="tour" aria-live="polite">
      {/* blocks the app while the tour is on; the outlined part shows through */}
      <div className="tour-block" />
      {box ? (
        <div
          className="tour-spot"
          data-target={s.target}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-label={t("tour.label")}
        aria-describedby="tour-text"
        style={{ left: pos.left, top: pos.top, width: CARD_W }}
      >
        <button
          type="button"
          className="icon-btn tour-close"
          aria-label={t("tour.skip")}
          onClick={finish}
        >
          <X size={15} aria-hidden="true" />
        </button>
        <span className="tour-count">{t("tour.count", { n: step + 1, of: STEPS.length })}</span>
        <h3>{t(s.title)}</h3>
        <p id="tour-text">{t(s.text)}</p>
        <div className="tour-actions">
          {!last && (
            <button type="button" className="tour-skip" onClick={finish}>
              {t("tour.skip")}
            </button>
          )}
          <span className="spacer" />
          {step > 0 && (
            <button type="button" className="btn" onClick={back}>
              {t("tour.back")}
            </button>
          )}
          <button ref={nextRef} type="button" className="btn btn-primary" onClick={next}>
            {last ? t("tour.finish") : step === 0 ? t("tour.start") : t("tour.next")}
          </button>
        </div>
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((x, i) => (
            <span key={x.title} className={i === step ? "on" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}
