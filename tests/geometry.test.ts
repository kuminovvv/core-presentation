import { describe, expect, it } from "vitest";
import type { SlideElement } from "../src";
import {
  duplicateElements, groupElements, reorderElements, ungroupElements,
  updateElements, createPresentation, createSlide, addSlide, addElement,
} from "../src";
import { hitByMarquee, resizeElements, rotateElements, shiftElements, snapMove, unionBounds } from "../src/editor/geometry";

const element = (id: string, x: number, y: number, width = 100, height = 80, rotation = 0): SlideElement => ({
  id, type: "shape", x, y, width, height, rotation, fill: "#ffee99",
});

describe("pointer geometry", () => {
  const first = element("first", 100, 200);
  const second = element("second", 300, 400, 200, 100);

  it("computes selection bounds and offsets without mutating originals", () => {
    expect(unionBounds([first, second])).toEqual({ x: 100, y: 200, width: 400, height: 300 });
    expect(shiftElements([first, second], 12, -8).second).toMatchObject({ x: 312, y: 392 });
    expect(first.x).toBe(100);
  });

  it("resizes a single shape from its southeast handle", () => {
    const out = resizeElements([first], "se", 40, 30).first;
    expect(out).toMatchObject({ x: 100, y: 200, width: 140, height: 110 });
    const northwest = resizeElements([first], "nw", 1000, 1000).first;
    expect(northwest).toMatchObject({ width: 24, height: 24, x: 176, y: 256 });
  });

  it("keeps the opposite rotated handle stationary", () => {
    const rotated = element("rotated", 100, 100, 100, 80, 90);
    const out = resizeElements([rotated], "e", 0, 20).rotated;
    expect(out).toMatchObject({ x: 90, y: 110, width: 120, height: 80, rotation: 90 });
  });

  it("resizes groups by scaling their children and their separation", () => {
    const out = resizeElements([first, second], "se", 400, 300);
    expect(out.first).toMatchObject({ x: 100, y: 200, width: 200, height: 160 });
    expect(out.second).toMatchObject({ x: 500, y: 600, width: 400, height: 200 });
  });

  it("rotates a group around the common center", () => {
    const a = element("a", 0, 0, 100, 100);
    const b = element("b", 100, 0, 100, 100);
    const out = rotateElements([a, b], 180);
    expect(out.a).toMatchObject({ x: 100, y: 0, rotation: 180 });
    expect(out.b).toMatchObject({ x: 0, y: 0, rotation: 180 });
  });

  it("snaps to slide center and other shapes, with tolerance", () => {
    const moving = { x: 100, y: 100, width: 100, height: 100 };
    const snapped = snapMove(moving, 345, 195, 1000, 800, [], 8);
    expect(snapped).toMatchObject({ dx: 350, dy: 200, guides: { x: 500, y: 400 } });
    expect(snapMove(moving, 100, 70, 1000, 800, [element("other", 307, 400)], 8))
      .toMatchObject({ dx: 107, guides: { x: 307 } });
  });

  it("selects only shapes intersecting a marquee", () => {
    expect(hitByMarquee([first, second], { x: 95, y: 195, width: 30, height: 30 }))
      .toEqual(["first"]);
  });
});

describe("group and layer document operations", () => {
  const slide = createSlide("Slide");
  const a = element("a", 0, 0);
  const b = element("b", 130, 0);
  const c = element("c", 250, 0);
  const project = addElement(addElement(addElement(addSlide(createPresentation(), slide), slide.id, a), slide.id, b), slide.id, c);

  it("groups, duplicates with new group IDs, and ungroups", () => {
    const grouped = groupElements(project, slide.id, ["a", "b"]);
    const [ga, gb] = grouped.slides[0]!.elements;
    expect(ga!.groupId).toBeTruthy();
    expect(ga!.groupId).toEqual(gb!.groupId);
    const copies = duplicateElements(grouped, slide.id, ["a", "b"]);
    const newElements = copies.project.slides[0]!.elements.slice(3);
    expect(newElements.map(e => e.id)).toEqual(copies.ids);
    expect(newElements[0]!.groupId).toBe(newElements[1]!.groupId);
    expect(newElements[0]!.groupId).not.toBe(ga!.groupId);
    const split = ungroupElements(grouped, slide.id, ["a"]);
    expect(split.slides[0]!.elements.slice(0, 2).every(e => !e.groupId)).toBe(true);
    expect(project.slides[0]!.elements[0]!.groupId).toBeUndefined();
  });

  it("preserves order of selected elements when changing z-index", () => {
    const raised = reorderElements(project, slide.id, ["a","b"], "front");
    expect(raised.slides[0]!.elements.map(e => [e.id, e.zIndex])).toEqual([
      ["a", 1], ["b", 2], ["c", 0],
    ]);
    const lowered = reorderElements(raised, slide.id, ["a","b"], "back");
    expect(lowered.slides[0]!.elements.map(e => [e.id, e.zIndex])).toEqual([
      ["a", 0], ["b", 1], ["c", 2],
    ]);
  });

  it("makes a batch update atomic with validation", () => {
    expect(() => updateElements(project, { a: { x: 20 }, b: { width: -2 } })).toThrow();
    expect(project.slides[0]!.elements[0]!.x).toBe(0);
  });
});
