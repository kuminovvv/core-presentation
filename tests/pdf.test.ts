import { describe, expect, it } from "vitest";
import { createPresentation, createSlide, createElement } from "../src/core/document";
import { validatePresentation } from "../src/core/validation";

describe("presentation PDF format", () => {
  it("supports native text, embedded images and HTML widgets without flattening the source project", async () => {
    const { buildPdf } = await import("../src/export/pdf.mjs");
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aZkAAAAASUVORK5CYII=";
    const deck = createPresentation("PDF export");
    const first = createSlide("Slide 1");
    const title = createElement("text");
    title.text = "Printable text";
    title.fontSize = 72;
    deck.slides.push({ ...first, elements: [title] });
    const second = createSlide("Slide 2");
    const image = createElement("image");
    image.src = "data:image/png;base64," + pixel;
    const widget = createElement("html");
    widget.html = "<h1>Custom HTML</h1>";
    deck.slides.push({ ...second, elements: [image, widget] });
    validatePresentation(deck);
    const before = JSON.stringify(deck);
    const pdf = await buildPdf(deck);
    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1500);
    const source = pdf.toString("latin1");
    const pageCount = [...source.matchAll(/\/Type\s*\/Page\b/g)].length;
    expect(pageCount).toBe(2);
    expect(JSON.stringify(deck)).toBe(before);
  }, 35000);

  it("rejects empty decks and excessively large viewports", async () => {
    const { buildPdf } = await import("../src/export/pdf.mjs");
    const blank = createPresentation();
    await expect(buildPdf(blank)).rejects.toThrow("between 1 and 200 slides");
    blank.viewport.width = 9000;
    blank.slides.push(createSlide());
    await expect(buildPdf(blank)).rejects.toThrow("viewport");
  });
});
