import type { Slide, SlideElement } from "../core/types";

export interface MorphMatch { before: SlideElement; after: SlideElement }
export function matchMorphElements(from: Slide, to: Slide): MorphMatch[] {
  const keys = new Map(from.elements.filter(e => e.morphId).map(e => [e.morphId!, e]));
  return to.elements.flatMap(after => {
    const before = after.morphId ? keys.get(after.morphId) : undefined;
    if (!before || before.type !== after.type || after.type === "html") return [];
    // A changed string or image is a content crossfade, not a distorted morph.
    if (before.type === "text" && after.type === "text" && before.text !== after.text) return [];
    if (before.type === "image" && after.type === "image" && before.src !== after.src) return [];
    return [{ before, after }];
  });
}
export function morphFrame(element: SlideElement): Keyframe {
  const frame: Keyframe = {
    left: element.x + "px", top: element.y + "px",
    width: element.width + "px", height: element.height + "px",
    transform: "rotate(" + (element.rotation ?? 0) + "deg)",
    opacity: element.opacity ?? 1,
  };
  if (element.type === "shape") Object.assign(frame, {
    background: element.fill ?? "#767cff", borderRadius: (element.borderRadius ?? 0) + "px",
    border: element.border ?? "none", boxShadow: element.boxShadow ?? "none",
  });
  if (element.type === "text") Object.assign(frame, {
    fontSize: (element.fontSize ?? 56) + "px", color: element.color ?? "#fff",
    fontWeight: element.fontWeight ?? 500, lineHeight: element.lineHeight ?? 1.2,
  });
  return frame;
}
function elementsOf(node: HTMLElement): Map<string, HTMLElement> {
  return new Map(Array.from(node.children).filter((e): e is HTMLElement =>
    e instanceof HTMLElement && Boolean(e.dataset.elementId)).map(e => [e.dataset.elementId!, e]));
}
/** Interpolate matched native elements in slide coordinates; unmatched content fades. */
export async function animateMorph(from: Slide, to: Slide, old: HTMLElement, incoming: HTMLElement, duration: number): Promise<void> {
  const options: KeyframeAnimationOptions = { duration, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" };
  const a = elementsOf(old), b = elementsOf(incoming);
  const matches = matchMorphElements(from, to);
  const matchedBefore = new Set(matches.map(m => m.before.id));
  const matchedAfter = new Set(matches.map(m => m.after.id));
  const active: Animation[] = [];
  incoming.style.zIndex = "0";
  old.style.zIndex = "1";
  old.style.pointerEvents = "none";
  old.style.background = "transparent";
  active.push(incoming.animate([{ background: from.background }, { background: to.background }], options));
  for (const match of matches) {
    const source = a.get(match.before.id), target = b.get(match.after.id);
    if (!source || !target) continue;
    source.style.visibility = "hidden";
    active.push(target.animate([morphFrame(match.before), morphFrame(match.after)], options));
  }
  for (const element of from.elements) {
    if (matchedBefore.has(element.id)) continue;
    const node = a.get(element.id);
    if (node) active.push(node.animate([{ opacity: element.opacity ?? 1 }, { opacity: 0 }], options));
  }
  for (const element of to.elements) {
    if (matchedAfter.has(element.id)) continue;
    const node = b.get(element.id);
    if (node) active.push(node.animate([{ opacity: 0 }, { opacity: element.opacity ?? 1 }], options));
  }
  await Promise.all(active.map(animation => animation.finished.catch(() => undefined)));
  for (const animation of active) animation.cancel();
  incoming.style.zIndex = "";
}
