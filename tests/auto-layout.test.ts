import { describe, expect, it } from "vitest";
import { createPresentation, createSlide, addSlide, addElement, updateElement, deleteElement, groupElements } from "../src/core/document";
import { defaultSlideLayout, reflowPresentation, reorderLayoutAt, stepLayoutOrder, layoutOverflows } from "../src/core/auto-layout";
import { parsePresentation, serializePresentation, validatePresentation } from "../src/core/validation";
import { PresentationStore } from "../src/core/store";
import type { ShapeElement } from "../src/core/types";
function make() {
  const p = createPresentation();
  p.viewport = {width:500,height:400};
  const s = createSlide();
  s.layout = {...defaultSlideLayout, direction:"row",gap:20,paddingX:40,paddingY:30};
  s.elements = [
    {id:"a",type:"shape",x:9,y:11,width:100,height:80},
    {id:"b",type:"shape",x:20,y:50,width:150,height:40},
  ];
  return addSlide(p,s);
}
describe("slide auto layout", () => {
  it("lays out in rows and columns; gap, padding and alignment are deterministic", () => {
    const p = make(), s = p.slides[0]!;
    expect(s.elements.map(e=>[e.x,e.y])).toEqual([[40,30],[160,30]]);
    s.layout = {...s.layout!,direction:"column",align:"center",justify:"end"};
    const n = reflowPresentation(p);
    expect(n.slides[0]!.elements.map(e=>[e.x,e.y])).toEqual([[200,230],[175,330]]);
  });
  it("reflows after edits and add/delete, and can be undone", () => {
    const p = make(), id=p.slides[0]!.id;
    const store = new PresentationStore(p);
    store.update(doc=>updateElement(doc,"a",{width:200}));
    expect(store.value.slides[0]!.elements[1]!.x).toBe(260);
    store.undo();
    expect(store.value.slides[0]!.elements[1]!.x).toBe(160);
    const c:ShapeElement={id:"c",type:"shape",x:0,y:0,width:50,height:40};
    const added = addElement(p,id,c);
    expect(added.slides[0]!.elements[2]!.x).toBe(330);
    expect(deleteElement(added,"a").slides[0]!.elements[0]!.x).toBe(40);
  });
  it("keeps absolute objects and grouped relative offsets", () => {
    const p=make(), id=p.slides[0]!.id;
    const pin:ShapeElement={id:"pin",type:"shape",x:17,y:19,width:50,height:50,layoutPosition:"absolute"};
    const withPin=addElement(p,id,pin);
    const grouped=groupElements(withPin,id,["a","b"]);
    const s=grouped.slides[0]!;
    s.layout={...s.layout!,align:"end"};
    const n=reflowPresentation(grouped).slides[0]!;
    expect(n.elements[1]!.x-n.elements[0]!.x).toBe(120);
    expect(n.elements[2]).toEqual(pin);
  });
  it("reorders by drop and step, and spaces items evenly", () => {
    const p=make(),id=p.slides[0]!.id;
    const moved=reorderLayoutAt(p,id,["a"],500);
    expect(moved.slides[0]!.elements.map(e=>e.id)).toEqual(["b","a"]);
    expect(stepLayoutOrder(moved,id,["a"],-1).slides[0]!.elements.map(e=>e.id)).toEqual(["a","b"]);
    p.slides[0]!.layout!.justify="space-between";
    expect(reflowPresentation(p).slides[0]!.elements[1]!.x).toBe(310);
  });
  it("preserves free positioning and validates serializable layout", () => {
    const p=make(),s=p.slides[0]!;
    expect(parsePresentation(serializePresentation(p))).toEqual(p);
    expect(layoutOverflows(s,p.viewport)).toBe(false);
    expect(layoutOverflows(s,{width:200,height:400})).toBe(true);
    s.layout!.gap=-1;
    expect(()=>validatePresentation(p)).toThrow("layout.gap");
    delete s.layout;
    expect(reflowPresentation(p)).toBe(p);
  });
});
