import type { FrameElement, Presentation, Slide, SlideElement } from "./types";
import type { Bounds } from "../editor/geometry";
export function descendants(slide:Slide,ids:readonly string[]):Set<string>{
  const found=new Set(ids);
  let changed=true;
  while(changed){changed=false;for(const e of slide.elements)if(e.parentId&&found.has(e.parentId)&&!found.has(e.id)){found.add(e.id);changed=true;}}
  return found;
}
export function rootSelection(slide:Slide,ids:readonly string[]):string[]{
  const selected=new Set(ids),byId=new Map(slide.elements.map(e=>[e.id,e]));
  return ids.filter(id=>{let parent=byId.get(id)?.parentId;const seen=new Set<string>();while(parent&&!seen.has(parent)){if(selected.has(parent))return false;seen.add(parent);parent=byId.get(parent)?.parentId;}return true;});
}
export function contains(frame:Bounds,rect:Bounds):boolean{
  return rect.x>=frame.x&&rect.y>=frame.y&&rect.x+rect.width<=frame.x+frame.width&&rect.y+rect.height<=frame.y+frame.height;
}
export function containingFrame(slide:Slide,rect:Bounds,exclude:ReadonlySet<string>=new Set()):FrameElement|undefined{
  return slide.elements.filter((e):e is FrameElement=>e.type==="frame"&&!exclude.has(e.id)&&contains(e,rect))
    .sort((a,b)=>a.width*a.height-b.width*b.height)[0];
}
export function insertFrame(project:Presentation,slideId:string,frame:FrameElement,ids?:readonly string[]):Presentation{
  const next=structuredClone(project),slide=next.slides.find(s=>s.id===slideId);
  if(!slide)throw Error("Slide not found");
  const roots=ids?rootSelection(slide,ids):undefined;
  const parent=containingFrame(slide,frame,descendants(slide,roots??[]));
  frame={...frame,parentId:roots?.length?slide.elements.find(e=>e.id===roots[0])?.parentId:parent?.id};
  const adopt=new Set(roots??slide.elements.filter(e=>e.parentId===frame.parentId&&contains(frame,e)).map(e=>e.id));
  const incomplete=new Set(slide.elements.filter(e=>e.groupId&&!adopt.has(e.id)).map(e=>e.groupId));
  for(const e of slide.elements)if(adopt.has(e.id)&&!incomplete.has(e.groupId)){e.parentId=frame.id;}
  const first=roots?.length?slide.elements.findIndex(e=>roots.includes(e.id)):-1;
  if(first>=0)slide.elements.splice(first,0,frame);else slide.elements.push(frame);
  return next;
}
export function translateFrameChildren(before:Presentation,after:Presentation,patches:Readonly<Record<string,Partial<SlideElement>>>):void{
  for(const slide of after.slides){
    const old=before.slides.find(s=>s.id===slide.id);if(!old)continue;
    const previous=new Map(old.elements.map(e=>[e.id,e])), current=new Map(slide.elements.map(e=>[e.id,e]));
    const done=new Set<string>();
    function visit(e:SlideElement){
      if(done.has(e.id))return;done.add(e.id);
      const parent=e.parentId?current.get(e.parentId):undefined, prior=previous.get(e.id);
      if(!parent||!prior||prior.parentId!==e.parentId)return;
      visit(parent);
      const oldParent=previous.get(parent.id);if(!oldParent)return;
      if(patches[e.id]?.x===undefined)e.x+=parent.x-oldParent.x;
      if(patches[e.id]?.y===undefined)e.y+=parent.y-oldParent.y;
    }
    slide.elements.forEach(visit);
  }
}

export function parentLayout(slide:Slide,element:SlideElement){
  const parent=slide.elements.find(e=>e.id===element.parentId);
  return parent?.type==="frame"?parent.layout:slide.layout;
}
export function isManaged(slide:Slide,element:SlideElement):boolean{
  return Boolean(parentLayout(slide,element)&&element.layoutPosition!=="absolute"&&
    (!element.groupId||!slide.elements.some(e=>e.parentId===element.parentId&&e.groupId===element.groupId&&e.layoutPosition==="absolute")));
}
/** Reorder a single ungrouped item among direct siblings, using its proposed center. */
export function reorderFrameChild(project:Presentation,slideId:string,elementId:string,coordinate:number):Presentation{
  const next=structuredClone(project),slide=next.slides.find(s=>s.id===slideId);
  const item=slide?.elements.find(e=>e.id===elementId);
  if(!slide||!item||!item.parentId||item.groupId||!isManaged(slide,item))return project;
  const layout=parentLayout(slide,item)!;
  const siblings=slide.elements.filter(e=>e.parentId===item.parentId&&e.id!==item.id&&isManaged(slide,e));
  const target=siblings.find(e=>coordinate<(layout.direction==="row"?e.x+e.width/2:e.y+e.height/2));
  const ordered=slide.elements.filter(e=>e.id!==item.id);
  const last=siblings.at(-1);
  const index=target?ordered.indexOf(target):last?ordered.indexOf(last)+1:ordered.length;
  ordered.splice(index,0,item);slide.elements=ordered;return next;
}

export function pickFrameLayer(slide:Slide,id:string,selected:readonly string[],deep=false,enter=false):string{
  if(deep)return id;
  const chain:string[]=[id],byId=new Map(slide.elements.map(e=>[e.id,e]));
  let parent=byId.get(id)?.parentId;
  while(parent&&byId.has(parent)&&!chain.includes(parent)){chain.unshift(parent);parent=byId.get(parent)?.parentId;}
  for(let i=chain.length-2;i>=0;i--)if(selected.includes(chain[i]!))return chain[enter?i+1:i]!;
  for(const current of selected){const scope=byId.get(current)?.parentId;const i=scope?chain.indexOf(scope):-1;if(i>=0&&i<chain.length-1)return chain[i+1]!;}
  return chain[enter?Math.min(1,chain.length-1):0]!;
}
export function frameAtPoint(slide:Slide,point:{x:number;y:number},exclude:ReadonlySet<string>=new Set()):FrameElement|undefined{
  const candidates=slide.elements.filter((e):e is FrameElement=>e.type==="frame"&&!exclude.has(e.id)&&point.x>=e.x&&point.x<=e.x+e.width&&point.y>=e.y&&point.y<=e.y+e.height);
  const byId=new Map(slide.elements.map(e=>[e.id,e]));
  const depth=(e:SlideElement)=>{let n=0,p=e.parentId;while(p&&n<32){n++;p=byId.get(p)?.parentId;}return n;};
  return candidates.sort((a,b)=>(b.zIndex??0)-(a.zIndex??0)||depth(b)-depth(a)||slide.elements.indexOf(b)-slide.elements.indexOf(a))[0];
}

export function inferFrameLayout(frame:FrameElement,items:SlideElement[]):import("./types").SlideLayout{
  const children=items.filter(e=>e.parentId===frame.id&&e.layoutPosition!=="absolute");
  const x=children.length?Math.min(...children.map(e=>e.x)):frame.x+16;
  const y=children.length?Math.min(...children.map(e=>e.y)):frame.y+16;
  const maxX=children.length?Math.max(...children.map(e=>e.x+e.width)):frame.x+frame.width-16;
  const maxY=children.length?Math.max(...children.map(e=>e.y+e.height)):frame.y+frame.height-16;
  const cx=children.map(e=>e.x+e.width/2),cy=children.map(e=>e.y+e.height/2);
  const dx=children.length>1?Math.max(...cx)-Math.min(...cx):0,dy=children.length>1?Math.max(...cy)-Math.min(...cy):0;
  const direction=dx>dy?"row":"column";
  const sorted=[...children].sort((a,b)=>direction==="row"?a.x-b.x:a.y-b.y);
  const gaps=sorted.slice(1).map((e,i)=>Math.max(0,direction==="row"?e.x-sorted[i]!.x-sorted[i]!.width:e.y-sorted[i]!.y-sorted[i]!.height)).sort((a,b)=>a-b);
  const clamp=(n:number)=>Math.min(10000,Math.max(0,Math.round(n)));
  const left=clamp(x-frame.x),right=clamp(frame.x+frame.width-maxX),top=clamp(y-frame.y),bottom=clamp(frame.y+frame.height-maxY);
  return {direction,gap:gaps.length?clamp(gaps[Math.floor(gaps.length/2)]!):16,paddingX:left,paddingY:top,
    ...(left!==right?{paddingLeft:left,paddingRight:right}:{}),...(top!==bottom?{paddingTop:top,paddingBottom:bottom}:{}),align:"start",justify:"start"};
}
