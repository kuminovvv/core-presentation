import type { Presentation } from "./types";
import { validatePresentation } from "./validation";
import { reflowPresentation } from "./auto-layout";

export type Subscriber = (project: Presentation) => void;

/** Undoable, immutable project state. */
export class PresentationStore {
  private current: Presentation;
  private past: Presentation[] = [];
  private future: Presentation[] = [];
  private listeners = new Set<Subscriber>();

  constructor(initial: Presentation, private readonly maxHistory = 100) {
    validatePresentation(initial);
    this.current = structuredClone(reflowPresentation(initial));
  }
  get value(): Presentation { return structuredClone(this.current); }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  subscribe(listener: Subscriber): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  update(transform: (project: Presentation) => Presentation): void {
    const candidate = transform(structuredClone(this.current));
    validatePresentation(candidate);
    const next = reflowPresentation(candidate);
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.past.push(this.current);
    if (this.past.length > this.maxHistory) this.past.shift();
    this.current = structuredClone(next);
    this.future = [];
    this.emit();
  }
  replace(project: Presentation): void { this.update(() => project); }

  /** Opening a different project or applying remote changes resets history. */
  load(project: Presentation): void {
    validatePresentation(project);
    this.current = structuredClone(reflowPresentation(project));
    this.past = [];
    this.future = [];
    this.emit();
  }
  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.current);
    this.current = previous;
    this.emit();
    return true;
  }
  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.current);
    this.current = next;
    this.emit();
    return true;
  }
  private emit(): void { for (const cb of this.listeners) cb(this.value); }
}
