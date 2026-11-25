import type { Presentation, Slide, SlideElement, SlideLayout } from "./types";
import { fitText } from "./text-layout";

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
export function layoutPadding(l:SlideLayout){
  return {left:l.paddingLeft??l.paddingX,right:l.paddingRight??l.paddingX,top:l.paddingTop??l.paddingY,bottom:l.paddingBottom??l.paddingY};
}
type Placement={x:number;y:number;width:number;height:number};
function arrangeFlat(slide:Slide,viewport:Viewport,hugX=false,hugY=false){
  const l=slide.layout!, p=layoutPadding(l),row=l.direction==="row";
  const mainPad=row?p.left:p.top,crossPad=row?p.top:p.left;
  const main=Math.max(0,(row?viewport.width-p.left-p.right:viewport.height-p.top-p.bottom));
  const cross=Math.max(0,(row?viewport.height-p.top-p.bottom:viewport.width-p.left-p.right));
  const mainHug=row?hugX:hugY,crossHug=row?hugY:hugX;
  const prepared=slide.elements.map(e=>e.type==="text"?fitText(e,!row&&!crossHug&&e.sizingX==="fill"&&e.layoutPosition!=="absolute"&&!e.groupId?Math.max(1,cross):e.width):e);
  const flow=units({...slide,elements:prepared});
  const size=(u:Unit)=>row?u.width:u.height, cs=(u:Unit)=>row?u.height:u.width;
  const fill=(u:Unit,axis:"x"|"y")=>u.elements.length===1&&u.elements[0]![axis==="x"?"sizingX":"sizingY"]==="fill";
  const mainFill=(u:Unit)=>!mainHug&&fill(u,row?"x":"y");
  const crossFill=(u:Unit)=>!crossHug&&fill(u,row?"y":"x");
  const positions=new Map<string,Placement>();
  function put(u:Unit,x:number,y:number,w=u.width,h=u.height){
    for(const e of u.elements)positions.set(e.id,{x:round(x+e.x-u.x),y:round(y+e.y-u.y),width:round(u.elements.length===1?w:e.width),height:round(u.elements.length===1?h:e.height)});
  }
  const crossGap=l.crossGap??l.gap;
  let contentW=0,contentH=0;
  if(l.gridColumns){
    const cols=Math.max(1,Math.min(l.gridColumns,flow.length||1));
    const rows=Math.ceil(flow.length/cols);
    const widths=Array.from({length:cols},(_,i)=>Math.max(1,...flow.filter((_,j)=>j%cols===i).map(u=>u.width)));
    const heights=Array.from({length:rows},(_,i)=>Math.max(1,...flow.slice(i*cols,(i+1)*cols).map(u=>u.height)));
    contentW=widths.reduce((s,n)=>s+n,0)+Math.max(0,cols-1)*l.gap;
    contentH=heights.reduce((s,n)=>s+n,0)+Math.max(0,rows-1)*crossGap;
    const x0=p.left+alignment(hugX?0:viewport.width-p.left-p.right-contentW,l.justify);
    const y0=p.top+alignment(hugY?0:viewport.height-p.top-p.bottom-contentH,l.align);
    flow.forEach((u,i)=>{
      const c=i%cols,r=Math.floor(i/cols),w=widths[c]!,h=heights[r]!;
      const uw=fill(u,"x")?w:u.width,uh=fill(u,"y")?h:u.height;
      put(u,x0+widths.slice(0,c).reduce((s,n)=>s+n,0)+c*l.gap+alignment(w-uw,l.justify),
        y0+heights.slice(0,r).reduce((s,n)=>s+n,0)+r*crossGap+alignment(h-uh,l.align),uw,uh);
    });
  }else{
    const lines:Unit[][]=[];let line:Unit[]=[],used=0;
    for(const u of flow){
      const n=mainFill(u)?1:size(u);
      if(l.wrap&&!mainHug&&line.length&&used+l.gap+n>main){lines.push(line);line=[];used=0;}
      used+=n+(line.length?l.gap:0);line.push(u);
    }
    if(line.length)lines.push(line);
    const lineSizes=lines.map(items=>Math.max(1,...items.map(u=>crossFill(u)?1:cs(u))));
    if(lines.length===1&&!crossHug)lineSizes[0]=Math.max(lineSizes[0]!,cross);
    const naturalCross=lines.reduce((sum,items)=>sum+Math.max(1,...items.map(cs)),0)+Math.max(0,lines.length-1)*crossGap;
    const occupiedCross=lineSizes.reduce((s,n)=>s+n,0)+Math.max(0,lines.length-1)*crossGap;
    let crossCursor=crossPad+alignment(crossHug?0:cross-occupiedCross,l.align),maxMain=0;
    lines.forEach((items,index)=>{
      const gaps=Math.max(0,items.length-1);
      const count=items.filter(mainFill).length;
      const fixed=items.reduce((sum,u)=>sum+(mainFill(u)?0:size(u)),0);
      const auto=l.justify==="space-between"&&!mainHug&&count===0&&gaps>0;
      const gap=auto?Math.max(0,(main-fixed)/gaps):l.gap;
      const fillSize=count?Math.max(1,(main-fixed-gap*gaps)/count):0;
      const total=fixed+count*fillSize+gap*gaps;
      let cursor=mainPad+alignment(mainHug?0:main-total,l.justify);
      const lineCross=lineSizes[index]!;
      for(const u of items){
        const ms=mainFill(u)?fillSize:size(u), csz=crossFill(u)?lineCross:cs(u);
        const ca=crossCursor+alignment(lineCross-csz,l.align);
        put(u,row?cursor:ca,row?ca:cursor,row?ms:csz,row?csz:ms);
        cursor+=ms+gap;
      }
      maxMain=Math.max(maxMain,total);
      crossCursor+=lineCross+crossGap;
    });
    contentW=row?maxMain:naturalCross;contentH=row?naturalCross:maxMain;
  }
  return {elements:prepared.map(e=>{const placed=positions.has(e.id)?{...e,...positions.get(e.id)!}:e;return placed.type==="text"?fitText(placed):placed;}),width:Math.max(1,round(contentW+p.left+p.right)),height:Math.max(1,round(contentH+p.top+p.bottom))};
}
function resolveFlat(slide:Slide,viewport:Viewport):Slide{
  if(!slide.layout)return {...slide,elements:slide.elements.map(e=>e.type==="text"?fitText(e):e)};
  return {...slide,elements:arrangeFlat(slide,viewport).elements};
}
export function resolveSlideLayout(slide:Slide,viewport:Viewport):Slide{
  if(!slide.elements.some(e=>e.type==="frame"))return resolveFlat(slide,viewport);
  const elements=slide.elements.map(e=>e.type==="text"?fitText({...e}):({...e}));
  const children=(id?:string)=>elements.filter(e=>e.parentId===id);
  function move(e:SlideElement,dx:number,dy:number){
    e.x=round(e.x+dx);e.y=round(e.y+dy);
    if(e.type==="frame")for(const child of children(e.id))move(child,dx,dy);
  }
  function arrange(parent?:Extract<SlideElement,{type:"frame"}>,measure=false){
    const list=children(parent?.id),layout=parent?parent.layout:slide.layout;
    if(measure)for(const e of list)if(e.type==="frame")arrange(e,true);
    if(layout){
      const x=parent?.x??0,y=parent?.y??0;
      const local=list.map(e=>({...e,parentId:undefined,x:e.x-x,y:e.y-y}));
      const hx=parent?.sizingX==="hug",hy=parent?.sizingY==="hug";
      const result=arrangeFlat({...slide,layout,elements:local},parent?{width:parent.width,height:parent.height}:viewport,hx,hy);
      if(parent){if(hx)parent.width=result.width;if(hy)parent.height=result.height;}
      if(!measure)result.elements.forEach((e,i)=>{const target=list[i]!;move(target,e.x+x-target.x,e.y+y-target.y);target.width=e.width;target.height=e.height;});
    }
    if(!measure)for(const e of list)if(e.type==="frame")arrange(e);
  }
  arrange(undefined,true);arrange();arrange(undefined,true);arrange();return {...slide,elements};
}
export function reflowPresentation(project: Presentation): Presentation {
  if (!project.slides.some(s => s.layout || s.elements.some(e=>e.type==="frame"||(e.type==="text"&&(e.sizingX==="hug"||e.sizingY==="hug"))))) return project;
  return { ...project, slides: project.slides.map(s => resolveSlideLayout(s, project.viewport)) };
}
export function layoutOverflows(slide: Slide, viewport: Viewport): boolean {
  if (!slide.layout) return false;
  const layout = slide.layout;
  const p=layoutPadding(layout);
  return units(resolveSlideLayout(slide, viewport)).some(u =>
    u.x + u.width > viewport.width - p.right + .01 ||
    u.y + u.height > viewport.height - p.bottom + .01);
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
