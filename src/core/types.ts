/** Format v1. Geometry is measured in slide pixels. */
export type ElementKind = "text" | "shape" | "image" | "html" | "frame";
export type TransitionKind = "none" | "fade" | "slide" | "zoom" | "morph";
export type EntranceKind = "none" | "fade" | "slide-up" | "zoom";
export type Entrance = { type: EntranceKind; duration?: number; delay?: number };
export type Transition = { type: TransitionKind; duration?: number };
export type LayoutDirection = "row" | "column";
export type LayoutAlign = "start" | "center" | "end";
export type LayoutJustify = LayoutAlign | "space-between";
export interface SlideLayout {
  direction: LayoutDirection;
  gap: number;
  wrap?: boolean;
  gridColumns?: number;
  crossGap?: number;
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  /** Packed main-axis position restored after Auto gap is disabled. */
  packedJustify?: LayoutAlign;
  paddingX: number;
  paddingY: number;
  align: LayoutAlign;
  justify: LayoutJustify;
}
export interface ElementBase {
  id: string; x: number; y: number; width: number; height: number;
  rotation?: number; opacity?: number; zIndex?: number; animation?: Entrance;
  /** Elements sharing a groupId can be selected and transformed together. */
  groupId?: string;
  parentId?: string; // Coordinates remain slide-relative.
  /** Absolute objects are not positioned by slide Auto Layout. */
  layoutPosition?: "flow" | "absolute";
  sizingX?: "fixed" | "hug" | "fill";
  sizingY?: "fixed" | "hug" | "fill";
  /** Stable visual identity across slides; unique within each slide. */
  morphId?: string;
}
export interface TextElement extends ElementBase {
  type: "text"; text: string; color?: string; fontFamily?: string;
  fontSize?: number; fontWeight?: number; align?: "left" | "center" | "right";
  lineHeight?: number; fontStyle?: "normal" | "italic";
}
export interface ShapeElement extends ElementBase {
  type: "shape"; fill?: string; borderRadius?: number; border?: string; boxShadow?: string;
}
export interface ImageElement extends ElementBase {
  type: "image"; src: string; alt?: string; fit?: "contain" | "cover" | "fill";
  borderRadius?: number;
}
/** Custom HTML/CSS/JS is sandboxed in a cross-origin iframe. */
export interface HtmlElement extends ElementBase {
  type: "html"; html: string; css?: string; javascript?: string;
}
export interface FrameElement extends ElementBase {
  type: "frame"; name?: string; fill?: string; border?: string; borderRadius?: number; boxShadow?: string;
  clipContent?: boolean; layout?: SlideLayout;
}
export type SlideElement = TextElement | ShapeElement | ImageElement | HtmlElement | FrameElement;
export interface Slide {
  id: string; name: string; background: string;
  transition?: Transition; elements: SlideElement[]; notes?: string;
  /** Omitted for ordinary free-positioned slides. */
  layout?: SlideLayout;
}
export interface Presentation {
  version: 1; id: string; title: string;
  viewport: { width: number; height: number }; slides: Slide[];
}
