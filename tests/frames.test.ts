import {describe,it,expect} from "vitest";
import {createPresentation,createSlide,createElement,addSlide,updateElement,duplicateElements,deleteElement,duplicateSlide} from "../src/core/document";
import {insertFrame,reorderFrameChild,pickFrameLayer,frameAtPoint} from "../src/core/frames";
import {shortcutKey} from "../web/shortcuts";
import {validatePresentation} from "../src/core/validation";
import {reflowPresentation,defaultSlideLayout} from "../src/core/auto-layout";
import type {FrameElement} from "../src/core/types";
function make(){
 const p=createPresentation(),s=createSlide();
 s.elements=[{...createElement("shape"),id:"child",x:30,y:40,width:40,height:50}];
 const f={...createElement("frame"),id:"frame",x:10,y:20,width:200,height:200} as FrameElement;
 return insertFrame(addSlide(p,s),s.id,f);
}
describe("native frames",()=>{
 it("adopts and moves children with frame",()=>{const p=make();validatePresentation(p);expect(p.slides[0]!.elements[0]!.parentId).toBe("frame");const moved=updateElement(p,"frame",{x:100,y:200});expect(moved.slides[0]!.elements[0]!.x).toBe(120);expect(moved.slides[0]!.elements[0]!.y).toBe(220);});
 it("reflows inside frame",()=>{const p=updateElement(make(),"frame",{layout:{...defaultSlideLayout,paddingX:12,paddingY:16}});expect(p.slides[0]!.elements[0]!.x).toBe(22);expect(p.slides[0]!.elements[0]!.y).toBe(36);expect(reflowPresentation(p)).toEqual(p);});
 it("copies hierarchy and removes descendants",()=>{const p=make(),s=p.slides[0]!;const d=duplicateElements(p,s.id,["frame"]);validatePresentation(d.project);expect(d.project.slides[0]!.elements).toHaveLength(4);expect(deleteElement(p,"frame").slides[0]!.elements).toHaveLength(0);validatePresentation(duplicateSlide(p,s.id));});
 it("reorders direct children by coordinate",()=>{let p=make();p.slides[0]!.elements.push({...createElement("shape"),id:"second",parentId:"frame",x:60,y:40,width:40,height:50});p=updateElement(p,"frame",{layout:{...defaultSlideLayout,direction:"row",paddingX:10,paddingY:10,gap:10}});p=reflowPresentation(reorderFrameChild(p,p.slides[0]!.id,"child",1000));expect(p.slides[0]!.elements.filter(e=>e.parentId==="frame").map(e=>e.id)).toEqual(["second","child"]);});
 it("hugs fixed children and distributes fill children inside a frame",()=>{
   let p=make();p=updateElement(p,"frame",{layout:{...defaultSlideLayout,direction:"row",paddingX:10,paddingY:15},sizingX:"hug",sizingY:"hug"});
   let frame=p.slides[0]!.elements.find(e=>e.id==="frame")!;
   expect([frame.width,frame.height]).toEqual([60,80]);
   p=updateElement(p,"frame",{width:300,height:200,sizingX:"fixed",sizingY:"fixed"});
   p=updateElement(p,"child",{sizingX:"fill",sizingY:"fill"});
   const child=p.slides[0]!.elements.find(e=>e.id==="child")!;
   expect([child.width,child.height]).toEqual([280,170]);
 });
 it("physical shortcuts work in Cyrillic layouts",()=>{
   expect(shortcutKey({code:"KeyF",key:"а"})).toBe("f");
   expect(shortcutKey({code:"KeyZ",key:"я"})).toBe("z");
   expect(shortcutKey({code:"KeyA",key:"ф"})).toBe("a");
 });
 it("selects the container before drilling into children and hit-tests the pointer",()=>{
   const s=make().slides[0]!;
   expect(pickFrameLayer(s,"child",[])).toBe("frame");
   expect(pickFrameLayer(s,"child",["frame"])).toBe("frame");
   expect(pickFrameLayer(s,"child",["frame"],false,true)).toBe("child");
   expect(pickFrameLayer(s,"child",[],true)).toBe("child");
   expect(frameAtPoint(s,{x:50,y:50})?.id).toBe("frame");
 });
 it("hugs measured text and recomputes on editing",()=>{
   let p=make();const s=p.slides[0]!;
   s.elements[0]={id:"child",type:"text",parentId:"frame",text:"aa",x:30,y:40,width:440,height:130,fontSize:20,lineHeight:1.2,sizingX:"hug",sizingY:"hug",textAdvances:{a:.5}};
   p=updateElement(p,"frame",{layout:{...defaultSlideLayout,paddingX:10,paddingY:10},sizingX:"hug",sizingY:"hug"});
   expect(p.slides[0]!.elements[0]!.width).toBe(20);
   expect(p.slides[0]!.elements.find(e=>e.id==="frame")!.width).toBe(40);
   p=updateElement(p,"child",{text:"aaaaaa"});
   expect(p.slides[0]!.elements.find(e=>e.id==="frame")!.width).toBe(80);
 });
 it("rejects cyclic parents",()=>{const p=make();expect(()=>updateElement(p,"frame",{parentId:"frame"})).toThrow("invalid frame ancestry");});
});
