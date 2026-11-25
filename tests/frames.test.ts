import {describe,it,expect} from "vitest";
import {createPresentation,createSlide,createElement,addSlide,updateElement,duplicateElements,deleteElement,duplicateSlide} from "../src/core/document";
import {insertFrame} from "../src/core/frames";
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
 it("rejects cyclic parents",()=>{const p=make();expect(()=>updateElement(p,"frame",{parentId:"frame"})).toThrow("invalid frame ancestry");});
});
