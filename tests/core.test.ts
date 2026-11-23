import { describe, expect, it } from "vitest";
import {
  PresentationStore, PresentationValidationError, addElement, addSlide,
  createElement, createPresentation, createSlide, deleteElement, deleteSlide,
  duplicateSlide, moveSlide, parsePresentation, serializePresentation,
  updateElement, validatePresentation,
} from "../src";
import { demoPresentation } from "../src/demo";

describe("open presentation format", () => {
  it("round trips through JSON without changing any data", () => {
    expect(parsePresentation(serializePresentation(demoPresentation))).toEqual(demoPresentation);
  });
  it("rejects unsupported schema versions", () => {
    expect(() => validatePresentation({ ...demoPresentation, version: 5 }))
      .toThrow(PresentationValidationError);
  });
  it("rejects duplicate IDs and invalid dimensions", () => {
    const doc = structuredClone(demoPresentation);
    doc.slides[1]!.id = doc.slides[0]!.id;
    doc.slides[2]!.elements[0]!.width = -10;
    try { validatePresentation(doc); throw new Error("should fail"); }
    catch (err) {
      expect(err).toBeInstanceOf(PresentationValidationError);
      expect((err as PresentationValidationError).issues).toHaveLength(2);
    }
  });
});

describe("immutable agent document operations", () => {
  it("creates, edits and deletes slides and elements", () => {
    const original = createPresentation("Demo");
    const first = createSlide("One");
    const element = createElement("text");
    const withSlide = addSlide(original, first);
    const withElement = addElement(withSlide, first.id, element);
    const edited = updateElement(withElement, element.id, { x: 500, y: 300 });
    expect(original.slides).toHaveLength(0);
    expect(withSlide.slides[0]!.elements).toHaveLength(0);
    expect((edited.slides[0]!.elements[0]!).x).toBe(500);
    expect(deleteElement(edited, element.id).slides[0]!.elements).toHaveLength(0);
    expect(deleteSlide(edited, first.id).slides).toHaveLength(0);
  });
  it("duplicates slide with new stable element identifiers", () => {
    const doc = structuredClone(demoPresentation);
    const copy = duplicateSlide(doc, "cover");
    expect(copy.slides).toHaveLength(4);
    expect(copy.slides[1]!.id).not.toEqual("cover");
    expect(copy.slides[1]!.elements[0]!.id).not.toEqual(doc.slides[0]!.elements[0]!.id);
    expect(moveSlide(copy, copy.slides[1]!.id, 3).slides[3]!.name).toContain("copy");
  });
  it("never mutates existing state when update fails", () => {
    const doc = structuredClone(demoPresentation);
    expect(() => updateElement(doc, "cover-title", { width: -1 })).toThrow();
    expect(doc.slides[0]!.elements.find(el => el.id === "cover-title")!.width).toBe(1130);
  });
});

describe("undo/redo store", () => {
  it("supports agent and UI edits through the same immutable API", () => {
    const store = new PresentationStore(demoPresentation);
    const seen: string[] = [];
    store.subscribe(value => seen.push(value.title));
    store.update(project => ({ ...project, title: "Changed" }));
    expect(store.value.title).toBe("Changed");
    expect(store.undo()).toBe(true);
    expect(store.value.title).toBe(demoPresentation.title);
    expect(store.redo()).toBe(true);
    expect(store.value.title).toBe("Changed");
    expect(seen).toHaveLength(3);
    const leaked = store.value;
    leaked.title = "tampered";
    expect(store.value.title).toBe("Changed");
  });
});
