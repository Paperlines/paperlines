import { Info } from "lucide-react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MARGIN = 8;

/** Where the bubble goes: under the button (or above it when there's no room), always inside the
 *  window. It's drawn on the window itself, so a narrow pane can't cut it off. */
function placeTip(btn: DOMRect, pop: { w: number; h: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = btn.left + btn.width / 2 - pop.w / 2;
  left = Math.max(MARGIN, Math.min(vw - pop.w - MARGIN, left));
  const below = btn.bottom + 6;
  const top = below + pop.h <= vh - MARGIN ? below : Math.max(MARGIN, btn.top - 6 - pop.h);
  return { left, top };
}

/** The (i) help button: hover or focus shows an explanation; click pins it; Escape closes. */
export function InfoTip({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!pinned) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) {
        setPinned(false);
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [pinned]);
  const shown = open || pinned;
  // measured once drawn, then placed; again when the window changes size or scrolls
  useLayoutEffect(() => {
    if (!shown) {
      setPos(null);
      return;
    }
    const place = () => {
      const btn = ref.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (btn && pop) setPos(placeTip(btn, { w: pop.offsetWidth, h: pop.offsetHeight }));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [shown]);
  // Escape closes the tip before anything else (a surrounding dialog) sees it; WebKit doesn't focus
  // buttons on click, so this can't rely on the button's own keydown
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setPinned(false);
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [shown]);
  return (
    <span
      className="infotip"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="infotip-btn"
        aria-label={label}
        aria-describedby={shown ? id : undefined}
        aria-expanded={shown}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPinned(!pinned);
          setOpen(!pinned);
        }}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {shown &&
        createPortal(
          <span
            ref={popRef}
            role="tooltip"
            id={id}
            className={`infotip-pop${wide ? " wide" : ""}`}
            style={
              pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }
            }
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}
