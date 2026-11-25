import type { Bounds } from "../src/editor/geometry";
export function initFrameTool(stage:HTMLElement,scale:()=>number,create:(rect:Bounds)=>void){
  const button=document.getElementById("add-frame")!;
  let active=false,drag:{id:number;x:number;y:number;node:HTMLElement}|undefined;
  function set(value:boolean){active=value;button.setAttribute("aria-pressed",String(value));stage.classList.toggle("frame-tool-active",value);}
  function reset(){if(drag){drag.node.remove();drag=undefined;}set(false);}
  const point=(e:PointerEvent)=>{const b=stage.getBoundingClientRect();return {x:Math.round((e.clientX-b.left)/scale()),y:Math.round((e.clientY-b.top)/scale())};};
  const bounds=(x:number,y:number)=>({x:Math.min(x,drag!.x),y:Math.min(y,drag!.y),width:Math.max(1,Math.abs(x-drag!.x)),height:Math.max(1,Math.abs(y-drag!.y))});
  button.addEventListener("click",()=>set(!active));
  stage.addEventListener("pointerdown",e=>{
    if(!active||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();
    const p=point(e),node=document.createElement("div");node.className="frame-drawing";stage.append(node);
    drag={id:e.pointerId,...p,node};stage.setPointerCapture(e.pointerId);
  },true);
  stage.addEventListener("pointermove",e=>{
    if(!drag||drag.id!==e.pointerId)return;const p=point(e),b=bounds(p.x,p.y);
    Object.assign(drag.node.style,{left:b.x+"px",top:b.y+"px",width:b.width+"px",height:b.height+"px"});
  });
  stage.addEventListener("pointerup",e=>{
    if(!drag||drag.id!==e.pointerId)return;const p=point(e),b=bounds(p.x,p.y);reset();
    if(b.width<4&&b.height<4){b.width=320;b.height=240;}create(b);
  });
  stage.addEventListener("pointercancel",reset);stage.addEventListener("lostpointercapture",()=>{if(drag)reset();});
  return {activate:()=>set(true),cancel:()=>{if(!active)return false;reset();return true;}};
}
