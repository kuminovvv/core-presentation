import type { Presentation, Slide, SlideElement, TransitionKind } from "../core/types";
import { validatePresentation } from "../core/validation";
import { createSlideNode } from "./dom";
import { animateMorph } from "./morph";
import "./player.css";

type NavigateListener = (index: number, slide: Slide) => void;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const timing = (ms: number) => ({ duration: ms, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" as FillMode });

export class PresentationPlayer {
  private project: Presentation;
  private index = 0;
  private root = document.createElement("div");
  private stage = document.createElement("div");
  private resizeObserver: ResizeObserver;
  private changing = false;
  private generation = 0;
  private disposed = false;
  private listeners = new Set<NavigateListener>();

  constructor(container: HTMLElement, project: Presentation, initialIndex = 0) {
    validatePresentation(project);
    this.project = structuredClone(project);
    this.index = Math.max(0, Math.min(initialIndex, project.slides.length - 1));
    this.root.className = "cp-player";
    this.root.tabIndex = 0;
    this.root.setAttribute("role", "region");
    this.root.setAttribute("aria-label", "Presentation");
    this.stage.className = "cp-stage";
    this.root.append(this.stage);
    container.append(this.root);
    this.root.addEventListener("keydown", this.handleKey);
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.root);
    this.render();
  }

  get currentIndex(): number { return this.index; }
  get count(): number { return this.project.slides.length; }
  get element(): HTMLElement { return this.root; }
  focus(): void { this.root.focus(); }
  subscribe(listener: NavigateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  replace(project: Presentation, keepIndex = true): void {
    validatePresentation(project);
    this.generation++;
    this.changing = false;
    this.project = structuredClone(project);
    this.index = keepIndex ? Math.min(this.index, project.slides.length - 1) : 0;
    this.index = Math.max(0, this.index);
    this.render();
    this.notify();
  }

  async next(): Promise<boolean> { return this.goTo(this.index + 1); }
  async previous(): Promise<boolean> { return this.goTo(this.index - 1); }

  async goTo(nextIndex: number): Promise<boolean> {
    if (this.disposed || this.changing || nextIndex === this.index ||
        nextIndex < 0 || nextIndex >= this.count) return false;
    const generation = this.generation;
    const previousSlide = this.project.slides[this.index]!;
    const incomingSlide = this.project.slides[nextIndex]!;
    const old = this.stage.querySelector<HTMLElement>(".cp-slide");
    const incoming = createSlideNode(incomingSlide, this.project);
    this.stage.append(incoming);
    this.changing = true;
    const transition = nextIndex < this.index ? previousSlide.transition : incomingSlide.transition;
    const kind = transition?.type ?? "fade";
    const duration = reduced() ? 0 : Math.min(10000, transition?.duration ?? 450);
    if (old && duration > 0 && kind === "morph") {
      await animateMorph(previousSlide, incomingSlide, old, incoming, duration);
    } else if (old && duration > 0 && kind !== "none") {
      const frames = this.transitionFrames(kind, nextIndex > this.index);
      const a = old.animate(frames.out, timing(duration));
      const b = incoming.animate(frames.in, timing(duration));
      await Promise.all([a.finished.catch(() => undefined), b.finished.catch(() => undefined)]);
    }
    if (this.disposed || generation !== this.generation) return false;
    this.stage.replaceChildren(incoming);
    this.index = nextIndex;
    this.changing = false;
    if (kind !== "morph") this.animateEntrance(incomingSlide, incoming);
    this.notify();
    return true;
  }

  destroy(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.root.removeEventListener("keydown", this.handleKey);
    this.root.remove();
    this.listeners.clear();
  }

  private render(): void {
    this.stage.style.width = `${this.project.viewport.width}px`;
    this.stage.style.height = `${this.project.viewport.height}px`;
    const slide = this.project.slides[this.index];
    const node = slide ? createSlideNode(slide, this.project) : null;
    this.stage.replaceChildren(...(node ? [node] : []));
    this.fit();
    if (slide && node) this.animateEntrance(slide, node);
  }

  private fit(): void {
    const { width, height } = this.project.viewport;
    const scale = Math.min(this.root.clientWidth / width, this.root.clientHeight / height);
    if (!Number.isFinite(scale) || scale <= 0) return;
    const x = (this.root.clientWidth - width * scale) / 2;
    const y = (this.root.clientHeight - height * scale) / 2;
    this.stage.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  }

  private transitionFrames(kind: TransitionKind, forward: boolean): {
    in: Keyframe[]; out: Keyframe[];
  } {
    const sign = forward ? 1 : -1;
    if (kind === "slide") return {
      in: [{ transform: `translateX(${sign * 100}%)` }, { transform: "translateX(0)" }],
      out: [{ transform: "translateX(0)" }, { transform: `translateX(${-sign * 100}%)` }],
    };
    if (kind === "zoom") return {
      in: [{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "scale(1)" }],
      out: [{ opacity: 1 }, { opacity: 0 }],
    };
    return {
      in: [{ opacity: 0 }, { opacity: 1 }],
      out: [{ opacity: 1 }, { opacity: 0 }],
    };
  }

  private animateEntrance(slide: Slide, node: HTMLElement): void {
    if (reduced()) return;
    for (const element of slide.elements) {
      const animation = element.animation;
      if (!animation || animation.type === "none") continue;
      const target = Array.from(node.children).find(child =>
        (child as HTMLElement).dataset.elementId === element.id) as HTMLElement | undefined;
      if (!target) continue;
      const frames = entranceFrames(element);
      target.animate(frames, { ...timing(Math.min(10000, animation.duration ?? 600)),
        delay: Math.min(10000, animation.delay ?? 0) });
    }
  }

  private notify(): void {
    const slide = this.project.slides[this.index];
    if (!slide) return;
    for (const fn of this.listeners) fn(this.index, slide);
    this.root.dispatchEvent(new CustomEvent("slidechange", { detail: { index: this.index, slide } }));
  }

  private handleKey = (event: KeyboardEvent): void => {
    if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
      event.preventDefault();
      void this.next();
    }
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      void this.previous();
    }
    if (event.key === "Home") { event.preventDefault(); void this.goTo(0); }
    if (event.key === "End") { event.preventDefault(); void this.goTo(this.count - 1); }
  };
}

function entranceFrames(element: SlideElement): Keyframe[] {
  const base = `rotate(${element.rotation ?? 0}deg)`;
  switch (element.animation?.type) {
    case "slide-up": return [
      { opacity: 0, transform: `translateY(48px) ${base}` },
      { opacity: element.opacity ?? 1, transform: base },
    ];
    case "zoom": return [
      { opacity: 0, transform: `scale(.88) ${base}` },
      { opacity: element.opacity ?? 1, transform: base },
    ];
    default: return [{ opacity: 0 }, { opacity: element.opacity ?? 1 }];
  }
}
