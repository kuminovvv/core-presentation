import type { Entrance } from "../src/core/types";

export function timelineRange(animations: (Entrance | undefined)[]): number {
  const end = Math.max(0, ...animations.filter(a => a && a.type !== "none").map(a => (a!.delay ?? 0) + (a!.duration ?? 600)));
  return Math.max(2500, Math.ceil((end + 100) / 500) * 500);
}
/** Start a default entrance at the clicked time, rounded to the nearest 10 ms. */
export function createTimelineAnimation(offset: number, width: number, range: number): Entrance {
  const time = width > 0 && Number.isFinite(offset) && Number.isFinite(range)
    ? Math.round(Math.max(0, Math.min(1, offset / width)) * range / 10) * 10 : 0;
  return { type: "fade", delay: Math.max(0, Math.min(10000, time)), duration: 600 };
}

type Edge = "start" | "end" | "move";
export function adjustAnimation(delay: number, duration: number, delta: number, edge: Edge, range: number): [number, number] {
  const snap = Math.round(delta / 10) * 10;
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  if (edge === "move") return [clamp(delay + snap, 0, Math.max(0, Math.min(10000, range - duration))), duration];
  if (edge === "end") return [delay, clamp(duration + snap, 0, Math.max(0, Math.min(10000, range - delay)))];
  const end = delay + duration;
  const start = clamp(delay + snap, Math.max(0, end - 10000), end);
  return [start, end - start];
}
export function bindAnimationBar(row: HTMLElement, delay: number, duration: number, range: number, commit: (delay: number, duration: number) => void): void {
  const bar = row.querySelector<HTMLElement>(".timeline-bar")!;
  const track = row.querySelector<HTMLElement>(".timeline-track")!;
  const delayInput = row.querySelector<HTMLInputElement>('[data-timeline="delay"]')!;
  const durationInput = row.querySelector<HTMLInputElement>('[data-timeline="duration"]')!;
  let drag: { x: number; width: number; edge: Edge; pointer: number } | null = null;
  let next: [number, number] = [delay, duration];
  const show = () => {
    bar.style.left = (next[0] / range * 100) + "%";
    bar.style.width = (next[1] / range * 100) + "%";
    delayInput.value = String(next[0]); durationInput.value = String(next[1]);
    bar.setAttribute("aria-valuenow", String(next[0]));
    bar.title = next[0] + "–" + (next[0] + next[1]) + " мс";
  };
  bar.addEventListener("pointerdown", event => {
    if (event.button !== 0 || drag) return;
    event.preventDefault(); event.stopPropagation();
    const edge = (event.target as HTMLElement).dataset.edge;
    drag = { x: event.clientX, width: track.getBoundingClientRect().width, edge: edge === "start" || edge === "end" ? edge : "move", pointer: event.pointerId };
    if (drag.width <= 0) { drag = null; return; }
    bar.focus();
    bar.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("timeline-dragging");
    row.classList.add("dragging");
  });
  bar.addEventListener("pointermove", event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    next = adjustAnimation(delay, duration, (event.clientX - drag.x) * range / drag.width, drag.edge, range);
    show();
  });
  const finish = (save: boolean) => {
    if (!drag) return;
    drag = null;
    document.documentElement.classList.remove("timeline-dragging");
    row.classList.remove("dragging");
    if (save && (next[0] !== delay || next[1] !== duration)) commit(...next);
    else { next = [delay, duration]; show(); }
  };
  bar.addEventListener("pointerup", () => finish(true));
  bar.addEventListener("pointercancel", () => finish(false));
  bar.addEventListener("lostpointercapture", () => finish(false));
  bar.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault(); event.stopPropagation();
    next = adjustAnimation(delay, duration, (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 100 : 10), event.altKey ? "end" : "move", range);
    if (next[0] !== delay || next[1] !== duration) commit(...next);
  });
}
export function initTimelineHeight(): void {
  const panel = document.getElementById("timeline-panel")!;
  const handle = document.getElementById("timeline-resizer")!;
  const workspace = panel.parentElement!;
  const key = "core-presentation:timeline-height";
  let height = 200;
  try { const saved = Number(localStorage.getItem(key)); if (saved >= 120 && saved <= 500) height = saved; } catch {}
  const limit = () => Math.max(120, Math.min(500, workspace.clientHeight - 230));
  const apply = (next: number) => {
    height = Math.max(120, Math.min(limit(), Math.round(next)));
    panel.style.setProperty("--timeline-height", height + "px");
    handle.setAttribute("aria-valuenow", String(height));
    handle.setAttribute("aria-valuemax", String(limit()));
  };
  const save = () => { try { localStorage.setItem(key, String(height)); } catch {} };
  apply(height);
  let initial: { y: number; height: number } | null = null;
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault(); initial = { y: event.clientY, height: panel.getBoundingClientRect().height };
    handle.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("timeline-resizing");
  });
  handle.addEventListener("pointermove", event => {
    if (initial) apply(initial.height + initial.y - event.clientY);
  });
  const finish = () => { if (!initial) return; initial = null; save(); document.documentElement.classList.remove("timeline-resizing"); };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", finish);
  handle.addEventListener("keydown", event => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault(); event.stopPropagation();
    apply(height + (event.key === "ArrowUp" ? 20 : -20)); save();
  });
  new ResizeObserver(() => { if (!panel.hidden) apply(height); }).observe(workspace);
}
