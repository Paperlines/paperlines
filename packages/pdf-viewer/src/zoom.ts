// Zoom math for the viewer: pure, so the gesture handling in PdfViewer stays thin.

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 5;
/** One step of the zoom buttons and ⌘/Ctrl + / −. */
export const ZOOM_STEP = 1.2;

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * The zoom factor for one ctrl+wheel event: a trackpad pinch on Windows/Linux (small deltas,
 * many events) or Ctrl/⌘ + mouse wheel (about 100 px per notch). Scrolling up zooms in. A single
 * event never zooms by more than ~65%, so a fast wheel doesn't jump.
 */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-Math.max(-50, Math.min(50, px)) * 0.01);
}

/**
 * The scroll offset that keeps the point under the pointer where it is when the content grows by
 * `ratio`. `scroll` is the current offset, `pointer` the pointer's position in the scroll box, and
 * `padding` the unscaled space before the pages.
 */
export function anchoredScroll(scroll: number, pointer: number, ratio: number, padding = 0) {
  return Math.max(0, (scroll + pointer - padding) * ratio + padding - pointer);
}
