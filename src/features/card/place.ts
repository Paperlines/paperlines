export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Card position next to an anchor: right of it if it fits, else left, else below/above;
 * always clamped inside the viewport with a margin.
 */
export function placeCard(
  anchor: Rect,
  card: { width: number; height: number },
  view: { width: number; height: number },
  gap = 10,
  margin = 8,
) {
  const right = anchor.left + anchor.width + gap;
  const left = anchor.left - gap - card.width;
  let x: number;
  let y: number;
  if (right + card.width <= view.width - margin) {
    x = right;
    y = anchor.top + anchor.height / 2 - card.height / 2;
  } else if (left >= margin) {
    x = left;
    y = anchor.top + anchor.height / 2 - card.height / 2;
  } else {
    x = anchor.left + anchor.width / 2 - card.width / 2;
    const below = anchor.top + anchor.height + gap;
    y = below + card.height <= view.height - margin ? below : anchor.top - gap - card.height;
  }
  const clamp = (v: number, size: number, max: number) =>
    Math.max(margin, Math.min(v, max - size - margin));
  return { left: clamp(x, card.width, view.width), top: clamp(y, card.height, view.height) };
}
