export type {
  Presentation, Slide, SlideElement, ElementKind, TextElement,
  ShapeElement, ImageElement, HtmlElement, Transition, Entrance,
} from "./core/types";
export { validatePresentation, parsePresentation, serializePresentation, PresentationValidationError } from "./core/validation";
export {
  createPresentation, createSlide, createElement, newId, addSlide, deleteSlide,
  moveSlide, duplicateSlide, addElement, updateElement, deleteElement,
  updateElements, groupElements, ungroupElements, reorderElements, duplicateElements,
} from "./core/document";
export { PresentationStore } from "./core/store";
export {
  unionBounds, shiftElements, resizeElements, rotateElements, snapMove, hitByMarquee,
} from "./editor/geometry";
export type { Bounds, Handle, Guide, GeometryPatch } from "./editor/geometry";
export { createElementNode, createSlideNode } from "./renderer/dom";
export { PresentationPlayer } from "./renderer/player";
