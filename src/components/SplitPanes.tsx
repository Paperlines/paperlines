import { type ReactNode, useRef } from "react";
import { PANE_MIN } from "./paneRoom";

interface Props {
  widths: [number, number];
  onResize(w: [number, number]): void;
  /** A null third pane lets the second fill the rest (used by the wide graph). */
  children: [ReactNode, ReactNode, ReactNode | null];
}

const MIN = PANE_MIN.first;
const MAX = 900;

/** Three panes; the first two have draggable right edges, the third fills the rest. */
export function SplitPanes({ widths, onResize, children }: Props) {
  const drag = useRef<{ idx: 0 | 1; x: number; start: [number, number]; max: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // a drag starts from the widths as drawn (on a small window the panes may be narrower than the
  // widths last set) and can grow a pane only as far as the filling pane has room to give
  const onDown = (idx: 0 | 1) => (e: React.PointerEvent) => {
    const panes = root.current?.querySelectorAll<HTMLElement>(":scope > .pane") ?? [];
    const drawn = [...panes].map((p) => p.getBoundingClientRect().width);
    const fill = root.current?.querySelector<HTMLElement>(":scope > .pane-fill");
    const room = fill ? Math.max(0, fill.getBoundingClientRect().width - PANE_MIN.fill) : 0;
    const start: [number, number] = [
      drawn[0] ?? widths[0],
      panes.length > 2 ? drawn[1] : widths[1],
    ];
    drag.current = { idx, x: e.clientX, start, max: Math.min(MAX, start[idx] + room) };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const next: [number, number] = [...d.start];
    next[d.idx] = Math.round(Math.max(MIN, Math.min(d.max, d.start[d.idx] + e.clientX - d.x)));
    onResize(next);
  };
  const onUp = () => {
    drag.current = null;
  };
  const handle = (idx: 0 | 1) => (
    <div
      className="split-handle"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={widths[idx]}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      tabIndex={0}
      onPointerDown={onDown(idx)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onKeyDown={(e) => {
        const step = e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0;
        if (!step) return;
        const next: [number, number] = [...widths];
        next[idx] = Math.max(MIN, widths[idx] + step);
        onResize(next);
      }}
    />
  );
  return (
    <div className="split" ref={root}>
      <section className="pane pane-shrink pane-first" style={{ flexBasis: widths[0] }}>
        {children[0]}
      </section>
      {handle(0)}
      {children[2] === null ? (
        <section className="pane pane-fill">{children[1]}</section>
      ) : (
        <>
          <section className="pane pane-shrink pane-second" style={{ flexBasis: widths[1] }}>
            {children[1]}
          </section>
          {handle(1)}
          <section className="pane pane-fill">{children[2]}</section>
        </>
      )}
    </div>
  );
}
