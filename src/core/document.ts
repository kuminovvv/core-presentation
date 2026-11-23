import type { ElementKind, Presentation, Slide, SlideElement } from "./types";
import { validatePresentation } from "./validation";

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
  return next;
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
  return next;
}

export function updateElement(project: Presentation, elementId: string, patch: Partial<SlideElement>): Presentation {
  const next = structuredClone(project);
  const element = next.slides.flatMap(s => s.elements).find(e => e.id === elementId);
  if (!element) throw new Error(`Element not found: ${elementId}`);
  if (patch.id && patch.id !== elementId) throw new Error("Changing element IDs is not supported");
  if (patch.type && patch.type !== element.type) throw new Error("Changing element types is not supported");
  Object.assign(element, patch);
  validatePresentation(next);
  return next;
}

export function deleteElement(project: Presentation, elementId: string): Presentation {
  const next = structuredClone(project);
  const slide = next.slides.find(s => s.elements.some(e => e.id === elementId));
  if (!slide) throw new Error(`Element not found: ${elementId}`);
  slide.elements = slide.elements.filter(e => e.id !== elementId);
  return next;
}
