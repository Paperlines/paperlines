/** The smallest widths the panes keep (the drag code and the stylesheet agree on these). */
export const PANE_MIN = { first: 240, second: 240, fill: 280 } as const;

/**
 * How many pixels the panes in `.main` can still give up before one reaches its minimum,
 * not counting `except` (the pane being dragged).
 */
export function paneSlack(except?: Element | null): number {
  let slack = 0;
  for (const el of document.querySelectorAll(".split > .pane")) {
    if (el === except) continue;
    const min = el.classList.contains("pane-first")
      ? PANE_MIN.first
      : el.classList.contains("pane-second")
        ? PANE_MIN.second
        : PANE_MIN.fill;
    slack += Math.max(0, el.getBoundingClientRect().width - min);
  }
  return slack;
}
