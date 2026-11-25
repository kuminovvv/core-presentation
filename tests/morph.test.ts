import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parsePresentation, validatePresentation } from "../src/core/validation";
import { duplicateElements } from "../src/core/document";
import { matchMorphElements, morphFrame } from "../src/renderer/morph";
const project = parsePresentation(readFileSync(new URL("../examples/composer-demo.json", import.meta.url), "utf8"));
describe("composer and morph", () => {
  it("has fourteen independently editable scenes with stable unique keys", () => {
    expect(project.slides).toHaveLength(14);
    expect(project.slides.every(slide => slide.notes)).toBe(true);
    validatePresentation(project);
  });
  it("matches the pill across scenes and interpolates the native geometry", () => {
    const pairs = matchMorphElements(project.slides[7]!, project.slides[8]!);
    const pill = pairs.find(pair => pair.before.morphId === "composer")!;
    expect(morphFrame(pill.before).width).toBe("2350px");
    expect(morphFrame(pill.after).width).toBe("732px");
    expect(morphFrame(pill.after).borderRadius).toBe("34px");
  });
  it("rejects duplicate morph identities on a slide and clears identity on object copies", () => {
    const slide = project.slides[3]!;
    const item = slide.elements[0]!;
    const duplicated = duplicateElements(project, slide.id, [item.id]);
    expect(duplicated.project.slides[3]!.elements.at(-1)!.morphId).toBeUndefined();
    const invalid = structuredClone(project);
    invalid.slides[3]!.elements.push({ ...item, id: "duplicate-morph" });
    expect(() => validatePresentation(invalid)).toThrow("duplicate morph identity");
  });
});
