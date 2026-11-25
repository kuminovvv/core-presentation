import type { ElementKind, Presentation, Slide, SlideElement } from "./types";
import { validatePresentation } from "./validation";
import { reflowPresentation } from "./auto-layout";

export function newId(prefix = "item"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createPresentation(title = "Untitled presentation"): Presentation {
  return { version: 1, id: newId("presentation"), title,
    viewport: { width: 1600, height: 900 }, slides: [] };
}

export function createSlide(name = "New slide"): Slide {
  return { id: newId("slide"), name, background: "#101827",
    transition: { type: "fade", duration: 450 }, elements: [] };
}

export function createElement(type: ElementKind): SlideElement {
  const base = { id: newId("element"), x: 120, y: 120, width: 440, height: 130 };
  switch (type) {
    case "text":
      return { ...base, type, text: "Your text", color: "#ffffff", fontSize: 64, fontWeight: 600 };
    case "shape":
      return { ...base, type, width: 280, height: 180, fill: "#7c86ff", borderRadius: 20 };
    case "image":
      return { ...base, type, src: "", alt: "", fit: "cover" };
    case "html":
      return { ...base, type, width: 500, height: 300,
        html: '<button id="demo">Click me</button>',
        css: 'body { display:grid; place-items:center; height:100vh; margin:0; background:#1b2540; } button { padding:20px 32px; border:0; border-radius:12px; cursor:pointer; }',
        javascript: 'document.querySelector("#demo").addEventListener("click", e => e.target.textContent = "It works!");' };
  }
}

/** Immutable document operations for both editor UI and programmatic agents. */
export function addSlide(project: Presentation, slide: Slide, index = project.slides.length): Presentation {
  const next = structuredClone(project);
  next.slides.splice(Math.max(0, Math.min(index, next.slides.length)), 0, structuredClone(slide));
  validatePresentation(next);
  return reflowPresentation(next);
}

export function deleteSlide(project: Presentation, slideId: string): Presentation {
  if (!project.slides.some(s => s.id === slideId)) throw new Error(`Slide not found: ${slideId}`);
  return { ...project, slides: project.slides.filter(s => s.id !== slideId) };
}

export function moveSlide(project: Presentation, slideId: string, index: number): Presentation {
  const next = structuredClone(project);
  const previous = next.slides.findIndex(s => s.id === slideId);
  if (previous < 0) throw new Error(`Slide not found: ${slideId}`);
  const [slide] = next.slides.splice(previous, 1);
  next.slides.splice(Math.max(0, Math.min(index, next.slides.length)), 0, slide!);
  return next;
}

export function duplicateSlide(project: Presentation, slideId: string): Presentation {
  const index = project.slides.findIndex(s => s.id === slideId);
  if (index < 0) throw new Error(`Slide not found: ${slideId}`);
  const copy = structuredClone(project.slides[index]!);
  copy.id = newId("slide");
  copy.name += " copy";
  copy.elements.forEach(e => e.id = newId("element"));
  return addSlide(project, copy, index + 1);
}

export function addElement(project: Presentation, slideId: string, element: SlideElement): Presentation {
  const next = structuredClone(project);
  const slide = next.slides.find(s => s.id === slideId);
  if (!slide) throw new Error(`Slide not found: ${slideId}`);
  slide.elements.push(structuredClone(element));
  validatePresentation(next);
  return reflowPresentation(next);
}

export function updateElement(project: Presentation, elementId: string, patch: Partial<SlideElement>): Presentation {
  const next = structuredClone(project);
  const element = next.slides.flatMap(s => s.elements).find(e => e.id === elementId);
  if (!element) throw new Error(`Element not found: ${elementId}`);
  if (patch.id && patch.id !== elementId) throw new Error("Changing element IDs is not supported");
  if (patch.type && patch.type !== element.type) throw new Error("Changing element types is not supported");
  Object.assign(element, patch);
  validatePresentation(next);
  return reflowPresentation(next);
}

/** Apply a multi-element gesture as one validated, undoable history entry. */
export function updateElements(
  project: Presentation,
  patches: Readonly<Record<string, Partial<SlideElement>>>,
): Presentation {
  const next = structuredClone(project);
  const targets = new Map(next.slides.flatMap(s => s.elements).map(e => [e.id, e]));
  for (const [id, patch] of Object.entries(patches)) {
    const element = targets.get(id);
    if (!element) throw new Error(`Element not found: ${id}`);
    if (patch.id !== undefined && patch.id !== id) throw new Error("Changing element IDs is not supported");
    if (patch.type !== undefined && patch.type !== element.type) throw new Error("Changing element types is not supported");
    Object.assign(element, patch);
  }
  validatePresentation(next);
  return reflowPresentation(next);
}

/** Stores an explicit group identity without flattening elements into a bitmap. */
export function groupElements(project: Presentation, slideId: string, ids: string[]): Presentation {
  const slide = project.slides.find(s => s.id === slideId);
  const chosen = new Set(ids);
  if (!slide || chosen.size < 2 || slide.elements.filter(e => chosen.has(e.id)).length !== chosen.size)
    throw new Error("Select at least two elements on the same slide");
  const groupId = newId("group");
  const patches: Record<string, Partial<SlideElement>> = {};
  for (const id of ids) patches[id] = { groupId };
  return updateElements(project, patches);
}

export function ungroupElements(project: Presentation, slideId: string, ids: string[]): Presentation {
  const slide = project.slides.find(s => s.id === slideId);
  if (!slide) throw new Error(`Slide not found: ${slideId}`);
  const affected = new Set(ids);
  const groupIds = new Set(slide.elements.filter(e => affected.has(e.id)).map(e => e.groupId).filter(Boolean));
  const patches: Record<string, Partial<SlideElement>> = {};
  for (const element of slide.elements) {
    if (affected.has(element.id) || (element.groupId && groupIds.has(element.groupId)))
      patches[element.id] = { groupId: undefined };
  }
  return updateElements(project, patches);
}

export function reorderElements(
  project: Presentation, slideId: string, ids: string[], direction: "front" | "back",
): Presentation {
  const slide = project.slides.find(s => s.id === slideId);
  if (!slide) throw new Error(`Slide not found: ${slideId}`);
  const selected = new Set(ids);
  if (slide.elements.filter(e => selected.has(e.id)).length !== selected.size)
    throw new Error("Elements must belong to the same slide");
  const ordered = slide.elements.map((e, i) => ({ id: e.id, index: i, z: e.zIndex ?? 0 }))
    .sort((a, b) => a.z - b.z || a.index - b.index);
  const front = ordered.filter(e => selected.has(e.id));
  const back = ordered.filter(e => !selected.has(e.id));
  const sorted = direction === "front" ? [...back, ...front] : [...front, ...back];
  const patches: Record<string, Partial<SlideElement>> = {};
  sorted.forEach((e, i) => patches[e.id] = { zIndex: i });
  return updateElements(project, patches);
}

export function duplicateElements(
  project: Presentation, slideId: string, ids: string[], offset = 24,
): { project: Presentation; ids: string[] } {
  const next = structuredClone(project);
  const slide = next.slides.find(s => s.id === slideId);
  if (!slide) throw new Error(`Slide not found: ${slideId}`);
  const selected = new Set(ids);
  const copies = slide.elements.filter(e => selected.has(e.id)).map(e => structuredClone(e));
  if (copies.length !== selected.size) throw new Error("Elements must belong to the same slide");
  const groups = new Map<string, string>();
  for (const copy of copies) {
    copy.id = newId("element");
    delete copy.morphId; // Copies on the same slide must not share a morph identity.
    copy.x += offset;
    copy.y += offset;
    if (copy.groupId) {
      if (!groups.has(copy.groupId)) groups.set(copy.groupId, newId("group"));
      copy.groupId = groups.get(copy.groupId);
    }
  }
  slide.elements.push(...copies);
  validatePresentation(next);
  return { project: reflowPresentation(next), ids: copies.map(e => e.id) };
}

export function deleteElement(project: Presentation, elementId: string): Presentation {
  const next = structuredClone(project);
  const slide = next.slides.find(s => s.elements.some(e => e.id === elementId));
  if (!slide) throw new Error(`Element not found: ${elementId}`);
  slide.elements = slide.elements.filter(e => e.id !== elementId);
  return reflowPresentation(next);
}
