import type { SlideElement } from "../core/types";

export interface Bounds { x: number; y: number; width: number; height: number }
export type Handle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export interface Guide { x?: number; y?: number }
export type GeometryPatch = Pick<SlideElement, "x" | "y" | "width" | "height"> & { rotation?: number };

const round = (n: number): number => {
  const value = Math.round(n * 100) / 100;
  return Object.is(value, -0) ? 0 : value;
};
const deg = (n: number): number => n * Math.PI / 180;

/** Unrotated logical bounds: stable for multi-selection and group resizing. */
export function unionBounds(elements: readonly SlideElement[]): Bounds {
  if (!elements.length) throw new Error("Cannot find bounds of empty selection");
  const x = Math.min(...elements.map(e => e.x));
  const y = Math.min(...elements.map(e => e.y));
  return {
    x, y,
    width: Math.max(...elements.map(e => e.x + e.width)) - x,
    height: Math.max(...elements.map(e => e.y + e.height)) - y,
  };
}

export function shiftElements(elements: readonly SlideElement[], dx: number, dy: number): Record<string, GeometryPatch> {
  return Object.fromEntries(elements.map(e =>
    [e.id, { x: round(e.x + dx), y: round(e.y + dy), width: e.width, height: e.height, rotation: e.rotation ?? 0 }]));
}

/** Scales a group, or resizes one rotated rectangle around the opposite handle. */
export function resizeElements(
  elements: readonly SlideElement[], handle: Handle, dx: number, dy: number, minSize = 24,
): Record<string, GeometryPatch> {
  if (!elements.length) return {};
  const single = elements.length === 1 ? elements[0]! : null;
  const angle = deg(single?.rotation ?? 0);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Single-element handles are in the element's local rotated coordinate system.
  const localDx = single ? dx * cos + dy * sin : dx;
  const localDy = single ? -dx * sin + dy * cos : dy;
  const before = single ?? unionBounds(elements);
  let west = 0, north = 0, east = before.width, south = before.height;
  if (handle.includes("w")) west = Math.min(east - minSize, localDx);
  if (handle.includes("e")) east = Math.max(west + minSize, before.width + localDx);
  if (handle.includes("n")) north = Math.min(south - minSize, localDy);
  if (handle.includes("s")) south = Math.max(north + minSize, before.height + localDy);
  const width = east - west, height = south - north;

  if (single) {
    const offsetX = (west + east - before.width) / 2;
    const offsetY = (north + south - before.height) / 2;
    const centerX = before.x + before.width / 2 + offsetX * cos - offsetY * sin;
    const centerY = before.y + before.height / 2 + offsetX * sin + offsetY * cos;
    return { [single.id]: {
      x: round(centerX - width / 2), y: round(centerY - height / 2),
      width: round(width), height: round(height), rotation: single.rotation ?? 0,
    } };
  }

  const box = unionBounds(elements);
  const scaleX = width / box.width;
  const scaleY = height / box.height;
  return Object.fromEntries(elements.map(e => [e.id, {
    x: round(box.x + west + (e.x - box.x) * scaleX),
    y: round(box.y + north + (e.y - box.y) * scaleY),
    width: round(e.width * scaleX), height: round(e.height * scaleY),
    rotation: e.rotation ?? 0,
  }]));
}

/** Rotates every element and its center around the selection's center. */
export function rotateElements(elements: readonly SlideElement[], degrees: number): Record<string, GeometryPatch> {
  if (!elements.length) return {};
  const box = unionBounds(elements);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const angle = deg(degrees), cos = Math.cos(angle), sin = Math.sin(angle);
  return Object.fromEntries(elements.map(e => {
    const ox = e.x + e.width / 2 - cx, oy = e.y + e.height / 2 - cy;
    return [e.id, {
      x: round(cx + ox * cos - oy * sin - e.width / 2),
      y: round(cy + ox * sin + oy * cos - e.height / 2),
      width: e.width, height: e.height,
      rotation: round((e.rotation ?? 0) + degrees),
    }];
  }));
}

/** Find closest matching line among slide edges, center and other elements. */
export function snapMove(
  moving: Bounds,
  dx: number,
  dy: number,
  slideWidth: number,
  slideHeight: number,
  others: readonly SlideElement[],
  tolerance = 8,
): { dx: number; dy: number; guides: Guide } {
  const candidateX = [0, slideWidth / 2, slideWidth];
  const candidateY = [0, slideHeight / 2, slideHeight];
  for (const e of others) {
    candidateX.push(e.x, e.x + e.width / 2, e.x + e.width);
    candidateY.push(e.y, e.y + e.height / 2, e.y + e.height);
  }
  const anchorsX = [moving.x + dx, moving.x + dx + moving.width / 2, moving.x + dx + moving.width];
  const anchorsY = [moving.y + dy, moving.y + dy + moving.height / 2, moving.y + dy + moving.height];
  const find = (anchors: number[], candidates: number[]): { offset: number; line?: number } => {
    let best = tolerance + 0.001, line: number | undefined, offset = 0;
    for (const a of anchors) for (const c of candidates) {
      const delta = c - a;
      if (Math.abs(delta) < best) { best = Math.abs(delta); offset = delta; line = c; }
    }
    return best <= tolerance ? { offset, line } : { offset: 0 };
  };
  const x = find(anchorsX, candidateX);
  const y = find(anchorsY, candidateY);
  return { dx: round(dx + x.offset), dy: round(dy + y.offset), guides: { x: x.line, y: y.line } };
}

export function hitByMarquee(elements: readonly SlideElement[], rect: Bounds): string[] {
  return elements.filter(e =>
    e.x < rect.x + rect.width && e.x + e.width > rect.x &&
    e.y < rect.y + rect.height && e.y + e.height > rect.y
  ).map(e => e.id);
}
