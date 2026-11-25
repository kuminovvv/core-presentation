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
  frame={...frame,parentId:parent?.id};
  const adopt=new Set(roots??slide.elements.filter(e=>e.parentId===frame.parentId&&contains(frame,e)).map(e=>e.id));
  const incomplete=new Set(slide.elements.filter(e=>e.groupId&&!adopt.has(e.id)).map(e=>e.groupId));
  for(const e of slide.elements)if(adopt.has(e.id)&&!incomplete.has(e.groupId)){e.parentId=frame.id;e.groupId=undefined;}
  slide.elements.push(frame);return next;
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
