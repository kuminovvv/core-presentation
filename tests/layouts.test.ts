import { describe, expect, it } from "vitest";
import { createPresentation, addSlide } from "../src/core/document";
import { validatePresentation } from "../src/core/validation";
import { createLayoutSlide } from "../src/editor/layouts";

describe("editable presentation layouts", () => {
  it("generates unique ids and valid editable objects in all layouts", () => {
    let deck = createPresentation("Templates");
    const layouts = ["blank", "title", "section", "two-columns", "quote"] as const;
    for (const layout of layouts) {
      const slide = createLayoutSlide(layout, deck.viewport);
      expect(slide.name.length).toBeGreaterThan(0);
      deck = addSlide(deck, slide);
    }
    validatePresentation(deck);
    expect(deck.slides).toHaveLength(5);
    expect(deck.slides[0]!.elements).toHaveLength(0);
    const ids = deck.slides.flatMap(slide => slide.elements.map(el => el.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(deck.slides[3]!.elements.some(el => el.type === "text")).toBe(true);
  });
  it("scales layouts to another slide viewport", () => {
    const slide = createLayoutSlide("title", { width: 1280, height: 720 });
    expect(slide.elements.some(el => el.x > 0 && el.x < 1280)).toBe(true);
    expect(slide.elements.every(el => el.width > 0 && el.height > 0)).toBe(true);
    const doc = createPresentation();
    doc.viewport = { width: 1280, height: 720 };
    validatePresentation(addSlide(doc, slide));
  });
});
