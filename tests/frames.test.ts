import {describe,it,expect} from "vitest";
import {createPresentation,createSlide,createElement,addSlide,updateElement,duplicateElements,deleteElement,duplicateSlide} from "../src/core/document";
import {insertFrame,reorderFrameChild} from "../src/core/frames";
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
 it("rejects cyclic parents",()=>{const p=make();expect(()=>updateElement(p,"frame",{parentId:"frame"})).toThrow("invalid frame ancestry");});
});
