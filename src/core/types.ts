/** Format v1. Geometry is measured in slide pixels. */
export type ElementKind = "text" | "shape" | "image" | "html";
export type TransitionKind = "none" | "fade" | "slide" | "zoom";
export type EntranceKind = "none" | "fade" | "slide-up" | "zoom";
export type Entrance = { type: EntranceKind; duration?: number; delay?: number };
export type Transition = { type: TransitionKind; duration?: number };
export interface ElementBase {
  id: string; x: number; y: number; width: number; height: number;
  rotation?: number; opacity?: number; zIndex?: number; animation?: Entrance;
}
export interface TextElement extends ElementBase {
  type: "text"; text: string; color?: string; fontFamily?: string;
  fontSize?: number; fontWeight?: number; align?: "left" | "center" | "right";
  lineHeight?: number;
}
export interface ShapeElement extends ElementBase {
  type: "shape"; fill?: string; borderRadius?: number; border?: string;
}
export interface ImageElement extends ElementBase {
  type: "image"; src: string; alt?: string; fit?: "contain" | "cover" | "fill";
  borderRadius?: number;
}
/** Custom HTML/CSS/JS is sandboxed in a cross-origin iframe. */
export interface HtmlElement extends ElementBase {
  type: "html"; html: string; css?: string; javascript?: string;
}
export type SlideElement = TextElement | ShapeElement | ImageElement | HtmlElement;
export interface Slide {
  id: string; name: string; background: string;
  transition?: Transition; elements: SlideElement[];
}
export interface Presentation {
  version: 1; id: string; title: string;
  viewport: { width: number; height: number }; slides: Slide[];
}
