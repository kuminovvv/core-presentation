import type { Presentation, Slide, SlideElement, SlideLayout } from "./types";

export const defaultSlideLayout: SlideLayout = {
  direction: "column", gap: 24, paddingX: 64, paddingY: 64,
  align: "start", justify: "start",
};
type Viewport = Presentation["viewport"];
interface Unit {
  elements: SlideElement[];
  x: number; y: number; width: number; height: number;
}
/** A regular group is a single layout item; its internal geometry is unchanged. */
function units(slide: Slide): Unit[] {
  const items = new Map<string, SlideElement[]>();
  for (const e of slide.elements.filter(e=>!e.parentId)) {
    const key = e.groupId ? "g:" + e.groupId : "e:" + e.id;
    const group = items.get(key);
    if (group) group.push(e);
    else items.set(key, [e]);
  }
  return Array.from(items.values()).filter(es => !es.some(e => e.layoutPosition === "absolute")).map(elements => {
    const x = Math.min(...elements.map(e => e.x));
    const y = Math.min(...elements.map(e => e.y));
    return { elements, x, y, width: Math.max(...elements.map(e => e.x + e.width)) - x,
      height: Math.max(...elements.map(e => e.y + e.height)) - y };
  });
}
export function isFlowElement(slide: Slide, element: SlideElement): boolean {
  return Boolean(!element.parentId && slide.layout && element.layoutPosition !== "absolute" &&
    (!element.groupId || !slide.elements.some(e => e.groupId === element.groupId && e.layoutPosition === "absolute")));
}
const round = (n: number) => Math.round(n * 100) / 100;
function alignment(free: number, value: "start" | "center" | "end" | "space-between"): number {
  return value === "center" ? Math.max(0, free) / 2 : value === "end" ? Math.max(0, free) : 0;
}
/** Deterministic, fixed-size flex-like layout, independent of browser or font metrics. */
function resolveFlat(slide: Slide, viewport: Viewport): Slide {
  const layout = slide.layout;
  if (!layout) return slide;
  const flow = units(slide);
  if (!flow.length) return slide;
  const row = layout.direction === "row";
  const mainPad = row ? layout.paddingX : layout.paddingY;
  const crossPad = row ? layout.paddingY : layout.paddingX;
  const main = Math.max(0, (row ? viewport.width : viewport.height) - 2 * mainPad);
  const cross = Math.max(0, (row ? viewport.height : viewport.width) - 2 * crossPad);
  const size = (u: Unit) => row ? u.width : u.height;
  const crossSize = (u: Unit) => row ? u.height : u.width;
  const occupied = flow.reduce((total, u) => total + size(u), 0) + layout.gap * (flow.length - 1);
  const spare = Math.max(0, main - occupied);
  const gap = layout.gap + (layout.justify === "space-between" && flow.length > 1 ? spare / (flow.length - 1) : 0);
  let cursor = mainPad + alignment(main - occupied, layout.justify);
  const positions = new Map<string, { x: number; y: number }>();
  for (const u of flow) {
    const crossAt = crossPad + alignment(cross - crossSize(u), layout.align);
    const x = row ? cursor : crossAt;
    const y = row ? crossAt : cursor;
    for (const e of u.elements) positions.set(e.id, { x: round(x + (e.x - u.x)), y: round(y + (e.y - u.y)) });
    cursor += size(u) + gap;
  }
  return { ...slide, elements: slide.elements.map(e => positions.has(e.id) ? { ...e, ...positions.get(e.id)! } : e) };
}
export function resolveSlideLayout(slide:Slide,viewport:Viewport):Slide{
  if(!slide.elements.some(e=>e.type==="frame"))return resolveFlat(slide,viewport);
  const elements=slide.elements.map(e=>({...e}));
  const children=(id?:string)=>elements.filter(e=>e.parentId===id);
  function move(e:SlideElement,dx:number,dy:number){
    e.x=round(e.x+dx);e.y=round(e.y+dy);
    if(e.type==="frame")for(const child of children(e.id))move(child,dx,dy);
  }
  function arrange(parent?:Extract<SlideElement,{type:"frame"}>){
    const list=children(parent?.id),layout=parent?parent.layout:slide.layout;
    if(layout){
      const x=parent?.x??0,y=parent?.y??0;
      const local=list.map(e=>({...e,parentId:undefined,x:e.x-x,y:e.y-y}));
      const result=resolveFlat({...slide,layout,elements:local},parent?{width:parent.width,height:parent.height}:viewport);
      result.elements.forEach((e,i)=>{const target=list[i]!;move(target,e.x+x-target.x,e.y+y-target.y);});
    }
    for(const e of list)if(e.type==="frame")arrange(e);
  }
  arrange();return {...slide,elements};
}
export function reflowPresentation(project: Presentation): Presentation {
  if (!project.slides.some(s => s.layout || s.elements.some(e=>e.type==="frame"))) return project;
  return { ...project, slides: project.slides.map(s => resolveSlideLayout(s, project.viewport)) };
}
export function layoutOverflows(slide: Slide, viewport: Viewport): boolean {
  if (!slide.layout) return false;
  const layout = slide.layout;
  return units(resolveSlideLayout(slide, viewport)).some(u =>
    u.x + u.width > viewport.width - layout.paddingX + .01 ||
    u.y + u.height > viewport.height - layout.paddingY + .01);
}
/** Reorder managed units at a drop coordinate without changing absolute elements. */
export function reorderLayoutAt(project: Presentation, slideId: string, selectedIds: readonly string[], coordinate: number): Presentation {
  const slide = project.slides.find(s => s.id === slideId);
  if (!slide?.layout || !Number.isFinite(coordinate)) return project;
  const flow = units(slide);
  const ids = new Set(selectedIds);
  const moving = flow.filter(u => u.elements.some(e => ids.has(e.id)));
  const rest = flow.filter(u => !moving.includes(u));
  if (!moving.length || !rest.length) return project;
  const row = slide.layout.direction === "row";
  const index = rest.findIndex(u => coordinate < (row ? u.x + u.width / 2 : u.y + u.height / 2));
  rest.splice(index < 0 ? rest.length : index, 0, ...moving);
  const ordered = rest.flatMap(u => u.elements);
  const managed = new Set(ordered.map(e => e.id));
  let cursor = 0;
  const next = { ...slide, elements: slide.elements.map(e => managed.has(e.id) ? ordered[cursor++]! : e) };
  return reflowPresentation({ ...project, slides: project.slides.map(s => s.id === slideId ? next : s) });
}
export function stepLayoutOrder(project: Presentation, slideId: string, ids: readonly string[], step: -1 | 1): Presentation {
  const slide = project.slides.find(s => s.id === slideId);
  if (!slide?.layout) return project;
  const flow = units(slide), selected = new Set(ids);
  const moving = flow.filter(u => u.elements.some(e => selected.has(e.id)));
  if (!moving.length) return project;
  const index = flow.indexOf(step < 0 ? moving[0]! : moving[moving.length - 1]!);
  const target = flow[index + step];
  if (!target || moving.includes(target)) return project;
  const row = slide.layout.direction === "row";
  const midpoint = row ? target.x + target.width / 2 : target.y + target.height / 2;
  return reorderLayoutAt(project, slideId, ids, midpoint + step * .01);
}
