import type { Presentation, SlideElement } from "../src/core/types";
import {
  hitByMarquee, resizeElements, rotateElements, shiftElements, snapMove,
  unionBounds,
} from "../src/editor/geometry";
import type { Bounds, GeometryPatch, Guide, Handle } from "../src/editor/geometry";

interface EditorHooks {
  project(): Presentation;
  slideId(): string;
  scale(): number;
  commit(patches: Record<string, GeometryPatch>, mode: Mode): void;
  selectionChanged(): void;
}

type Mode = "move" | "resize" | "rotate" | "marquee";
interface Gesture {
  mode: Mode;
  pointerId: number;
  startX: number;
  startY: number;
  origin: SlideElement[];
  box?: Bounds;
  handle?: Handle;
  startAngle?: number;
  previousIds: string[];
  didMove: boolean;
  all?: SlideElement[];
  viewport?: { width: number; height: number };
}

/** Pointer-driven visual editing. Geometry functions stay usable without the DOM. */
export class CanvasInteractions {
  private chosen = new Set<string>();
  private live: Record<string, GeometryPatch> = {};
  private gesture: Gesture | null = null;
  private guides: Guide = {};
  private marquee: Bounds | null = null;

  constructor(private stage: HTMLElement, private hooks: EditorHooks) {
    stage.addEventListener("pointerdown", this.onDown);
  }
  get ids(): string[] { return [...this.chosen]; }
  get primaryId(): string | null { return this.ids[0] ?? null; }

  clear(): void { this.select([]); }
  select(ids: string[]): void {
    const valid = new Set(this.elements().map(e => e.id));
    this.chosen = new Set(ids.filter(id => valid.has(id)));
    this.refresh();
    this.hooks.selectionChanged();
  }

  /** Syncs outlines on new render, new slide or undo/redo. */
  refresh(): void {
    const valid = new Set(this.elements().map(e => e.id));
    this.chosen = new Set([...this.chosen].filter(id => valid.has(id)));
    this.stage.querySelectorAll<HTMLElement>(".cp-element").forEach(node =>
      node.classList.toggle("chosen", this.chosen.has(node.dataset.elementId ?? "")));
    this.draw();
  }

  destroy(): void {
    this.stage.removeEventListener("pointerdown", this.onDown);
    this.stopGesture();
  }

  private elements(): SlideElement[] {
    if (this.gesture?.all) return this.gesture.all;
    return this.hooks.project().slides.find(s => s.id === this.hooks.slideId())?.elements ?? [];
  }
  private selectedElements(): SlideElement[] {
    const selected = this.chosen;
    return this.elements().filter(e => selected.has(e.id)).map(e => ({
      ...e, ...(this.live[e.id] ?? {}),
    }));
  }
  private point(event: PointerEvent): {x: number; y: number} {
    const rect = this.stage.getBoundingClientRect();
    const scale = this.hooks.scale();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  }

  private onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.gesture || (event.target as HTMLElement).closest("[contenteditable=true]")) return;
    // The second click on text belongs to inline editing, not to drag selection.
    if (event.detail >= 2 && (event.target as HTMLElement).closest(".cp-element.cp-text")) return;
    const target = event.target as HTMLElement;
    const resize = target.closest<HTMLElement>("[data-handle]")?.dataset.handle as Handle | undefined;
    const rotating = Boolean(target.closest("[data-rotate]"));
    const node = target.closest<HTMLElement>(".cp-element[data-element-id]");
    const at = this.point(event);

    if (resize || rotating) {
      const elements = this.selectedElements();
      if (!elements.length) return;
      const box = unionBounds(elements);
      this.begin(event, {
        mode: resize ? "resize" : "rotate",
        pointerId: event.pointerId, startX: at.x, startY: at.y,
        origin: elements, box, handle: resize,
        startAngle: Math.atan2(at.y - box.y - box.height / 2, at.x - box.x - box.width / 2),
        previousIds: this.ids, didMove: false,
      });
      return;
    }

    if (node?.dataset.elementId) {
      const element = this.elements().find(e => e.id === node.dataset.elementId);
      if (!element) return;
      const affected = element.groupId
        ? this.elements().filter(e => e.groupId === element.groupId).map(e => e.id)
        : [element.id];
      if (event.shiftKey) {
        const next = new Set(this.ids);
        const allSelected = affected.every(id => next.has(id));
        affected.forEach(id => allSelected ? next.delete(id) : next.add(id));
        this.select([...next]);
        return;
      }
      if (!this.chosen.has(element.id)) this.select(affected);
      const selected = this.selectedElements();
      this.begin(event, { mode: "move", pointerId: event.pointerId,
        startX: at.x, startY: at.y, origin: selected, box: unionBounds(selected),
        previousIds: this.ids, didMove: false,
      });
      return;
    }

    const previous = event.shiftKey ? this.ids : [];
    if (!event.shiftKey) this.clear();
    this.begin(event, { mode: "marquee", pointerId: event.pointerId,
      startX: at.x, startY: at.y, origin: [],
      previousIds: previous, didMove: false,
    });
  };

  private begin(_event: PointerEvent, gesture: Gesture): void {
    // Do not cancel pointerdown: Chrome needs native click/dblclick events for inline text editing.
    const project = this.hooks.project();
    gesture.all = project.slides.find(s => s.id === this.hooks.slideId())?.elements ?? [];
    gesture.viewport = project.viewport;
    this.gesture = gesture;
    // Capture only after an actual drag, otherwise native double-click is lost.
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onCancel);
  }

  private onMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (gesture) event.preventDefault();
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const at = this.point(event);
    const dx = at.x - gesture.startX, dy = at.y - gesture.startY;
    if (!gesture.didMove && Math.hypot(dx, dy) > 1) {
      gesture.didMove = true;
      this.stage.setPointerCapture(event.pointerId);
    }

    if (gesture.mode === "marquee") {
      this.marquee = {
        x: Math.min(at.x, gesture.startX), y: Math.min(at.y, gesture.startY),
        width: Math.abs(dx), height: Math.abs(dy),
      };
      const hits = hitByMarquee(this.elements(), this.marquee);
      const groups = new Set(this.elements().filter(e => hits.includes(e.id) && e.groupId).map(e => e.groupId));
      const ids = [...new Set([
        ...gesture.previousIds,
        ...hits,
        ...this.elements().filter(e => e.groupId && groups.has(e.groupId)).map(e => e.id),
      ])];
      if (ids.length !== this.chosen.size || ids.some(id => !this.chosen.has(id))) {
        this.chosen = new Set(ids);
        this.refresh();
        this.hooks.selectionChanged();
      } else {
        this.draw();
      }
      return;
    }

    if (gesture.mode === "move") {
      if (!gesture.box || !gesture.viewport) return;
      const moving = new Set(gesture.origin.map(s => s.id));
      const other = (gesture.all ?? []).filter(e => !moving.has(e.id));
      const snapped = event.altKey ? { dx, dy, guides: {} } :
        snapMove(gesture.box, dx, dy, gesture.viewport.width, gesture.viewport.height, other);
      this.guides = snapped.guides;
      this.live = shiftElements(gesture.origin, snapped.dx, snapped.dy);
    } else if (gesture.mode === "resize") {
      this.live = resizeElements(gesture.origin, gesture.handle!, dx, dy);
    } else if (gesture.mode === "rotate" && gesture.box) {
      const centerX = gesture.box.x + gesture.box.width / 2;
      const centerY = gesture.box.y + gesture.box.height / 2;
      const angle = Math.atan2(at.y - centerY, at.x - centerX);
      let delta = (angle - gesture.startAngle!) * 180 / Math.PI;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      if (event.shiftKey) delta = Math.round(delta / 15) * 15;
      this.live = rotateElements(gesture.origin, delta);
    }
    this.applyLive();
    this.draw();
  };

  private onUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const patches = this.live;
    this.stopGesture();
    if (gesture.mode === "marquee") {
      this.refresh();
      this.hooks.selectionChanged();
      return;
    }
    if (gesture.didMove && Object.keys(patches).length) {
      // Revert DOM preview before committing a single undoable operation.
      this.hooks.commit(patches, gesture.mode);
    } else {
      this.refresh();
    }
  };
  private onCancel = (event: PointerEvent): void => {
    if (!this.gesture || event.pointerId !== this.gesture.pointerId) return;
    this.stopGesture();
    this.hooks.selectionChanged();
  };
  private stopGesture(): void {
    const gesture = this.gesture;
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onCancel);
    if (gesture && this.stage.hasPointerCapture(gesture.pointerId))
      this.stage.releasePointerCapture(gesture.pointerId);
    // A cancelled drag must not leave uncommitted positions in the DOM.
    const nodes = new Map(Array.from(this.stage.querySelectorAll<HTMLElement>(".cp-element"))
      .map(item => [item.dataset.elementId, item]));
    for (const element of gesture?.origin ?? []) {
      const node = nodes.get(element.id);
      if (!node) continue;
      node.style.left = element.x + "px";
      node.style.top = element.y + "px";
      node.style.width = element.width + "px";
      node.style.height = element.height + "px";
      node.style.transform = `rotate(${element.rotation ?? 0}deg)`;
    }
    this.gesture = null;
    this.live = {};
    this.guides = {};
    this.marquee = null;
    this.refresh();
  }

  private applyLive(): void {
    const nodes = new Map(Array.from(this.stage.querySelectorAll<HTMLElement>(".cp-element"))
      .map(item => [item.dataset.elementId, item]));
    for (const [id, patch] of Object.entries(this.live)) {
      const node = nodes.get(id);
      if (!node) continue;
      node.style.left = `${patch.x}px`;
      node.style.top = `${patch.y}px`;
      node.style.width = `${patch.width}px`;
      node.style.height = `${patch.height}px`;
      node.style.transform = `rotate(${patch.rotation ?? 0}deg)`;
    }
  }

  private draw(): void {
    this.stage.querySelectorAll(".selection-box, .selection-multi-mark, .snap-guide, .marquee-box").forEach(n => n.remove());
    const elements = this.selectedElements();
    if (elements.length) {
      const box = unionBounds(elements);
      const single = elements.length === 1 ? elements[0] : undefined;
      if (elements.length > 1) {
        for (const element of elements) {
          const marker = document.createElement("div");
          marker.className = "selection-multi-mark";
          Object.assign(marker.style, {
            left: element.x + "px", top: element.y + "px",
            width: element.width + "px", height: element.height + "px",
            transform: `rotate(${element.rotation ?? 0}deg)`,
          });
          this.stage.append(marker);
        }
      }
      const selection = document.createElement("div");
      selection.className = "selection-box";
      selection.dataset.selection = String(elements.length);
      Object.assign(selection.style, {
        left: box.x + "px", top: box.y + "px",
        width: box.width + "px", height: box.height + "px",
        transform: single ? `rotate(${single.rotation ?? 0}deg)` : "none",
      });
      selection.style.setProperty("--handle-size", `${11 / this.hooks.scale()}px`);
      selection.style.setProperty("--selection-line", `${2 / this.hooks.scale()}px`);
      selection.style.setProperty("--rotate-distance", `${32 / this.hooks.scale()}px`);
      for (const handle of ["nw","n","ne","e","se","s","sw","w"] as Handle[]) {
        const dot = document.createElement("div");
        dot.className = "selection-handle " + handle;
        dot.dataset.handle = handle;
        dot.setAttribute("role", "button");
        dot.setAttribute("aria-label", "Resize " + handle);
        selection.append(dot);
      }
      const rotation = document.createElement("div");
      rotation.className = "selection-rotate";
      rotation.dataset.rotate = "true";
      rotation.setAttribute("role", "button");
      rotation.setAttribute("aria-label", "Rotate selection");
      rotation.title = "Повернуть (Shift: по 15°)";
      selection.append(rotation);
      this.stage.append(selection);
    }
    if (this.guides.x !== undefined || this.guides.y !== undefined) {
      for (const axis of ["x", "y"] as const) {
        if (this.guides[axis] === undefined) continue;
        const guide = document.createElement("div");
        guide.className = "snap-guide " + axis;
        guide.style[axis === "x" ? "left" : "top"] = this.guides[axis] + "px";
        this.stage.append(guide);
      }
    }
    if (this.marquee) {
      const box = document.createElement("div");
      box.className = "marquee-box";
      Object.assign(box.style, {
        left: this.marquee.x + "px", top: this.marquee.y + "px",
        width: this.marquee.width + "px", height: this.marquee.height + "px",
      });
      this.stage.append(box);
    }
  }
}
