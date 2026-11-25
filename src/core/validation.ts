import type { Presentation } from "./types";
import { reflowPresentation } from "./auto-layout";

export class PresentationValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("\n"));
    this.name = "PresentationValidationError";
  }
}
const obj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const oneOf = (v: unknown, values: string[]) => values.includes(String(v));

export function validatePresentation(input: unknown): asserts input is Presentation {
  const errors: string[] = [];
  const fail = (path: string, reason: string) => errors.push(`${path}: ${reason}`);
  if (!obj(input)) throw new PresentationValidationError(["presentation must be an object"]);
  if (input.version !== 1) fail("version", "must equal 1");
  if (!str(input.id) || !input.id.trim()) fail("id", "required string");
  if (!str(input.title)) fail("title", "required string");
  if (!obj(input.viewport) || !num(input.viewport.width) || !num(input.viewport.height) ||
      input.viewport.width <= 0 || input.viewport.height <= 0) {
    fail("viewport", "requires positive finite width and height");
  }
  if (!Array.isArray(input.slides)) fail("slides", "required array");
  else {
    const ids = new Set<string>();
    const checkId = (id: unknown, path: string) => {
      if (!str(id) || !id.trim()) fail(path, "required string");
      else if (ids.has(id)) fail(path, "duplicate id");
      else ids.add(id);
    };
    input.slides.forEach((slide: unknown, i: number) => {
      const path = `slides[${i}]`;
      if (!obj(slide)) { fail(path, "must be object"); return; }
      checkId(slide.id, path + ".id");
      if (!str(slide.name)) fail(path + ".name", "required string");
      if (!str(slide.background)) fail(path + ".background", "required CSS string");
      if (slide.transition !== undefined) {
        if (!obj(slide.transition) || !oneOf(slide.transition.type, ["none","fade","slide","zoom","morph"]))
          fail(path + ".transition", "unknown transition");
        else if (slide.transition.duration !== undefined &&
          (!num(slide.transition.duration) || slide.transition.duration < 0))
          fail(path + ".transition.duration", "must be non-negative");
      }
      if (!Array.isArray(slide.elements)) { fail(path + ".elements", "required array"); return; }
      const extraLayout=(l:Record<string,unknown>,p:string)=>{
        for(const k of ["crossGap","paddingTop","paddingRight","paddingBottom","paddingLeft"])if(l[k]!==undefined&&(!num(l[k])||(l[k] as number)<0||(l[k] as number)>10000))fail(p+"."+k,"invalid spacing");
        if(l.wrap!==undefined&&typeof l.wrap!=="boolean")fail(p+".wrap","must be boolean");
        if(l.gridColumns!==undefined&&(!num(l.gridColumns)||!Number.isInteger(l.gridColumns)||(l.gridColumns as number)<1||(l.gridColumns as number)>50))fail(p+".gridColumns","must be integer 1–50");
        if(l.packedJustify!==undefined&&!oneOf(l.packedJustify,["start","center","end"]))fail(p+".packedJustify","invalid alignment");
      };
      if (slide.layout !== undefined) {
        if (!obj(slide.layout)) fail(path + ".layout", "must be an object");
        else {
          const layout = slide.layout;
          extraLayout(layout,path+".layout");
          if (!oneOf(layout.direction, ["row","column"])) fail(path + ".layout.direction", "unknown direction");
          if (!oneOf(layout.align, ["start","center","end"])) fail(path + ".layout.align", "unknown alignment");
          if (!oneOf(layout.justify, ["start","center","end","space-between"])) fail(path + ".layout.justify", "unknown distribution");
          for (const key of ["gap","paddingX","paddingY"]) {
            const value = layout[key];
            if (!num(value) || value < 0 || value > 10000) fail(path + ".layout." + key, "must be between 0 and 10000");
          }
        }
      }
      if (slide.notes !== undefined && !str(slide.notes)) fail(path + ".notes", "must be a string");
      const morphIds = new Set<string>();
      slide.elements.forEach((element: unknown, j: number) => {
        const p = `${path}.elements[${j}]`;
        if (!obj(element)) { fail(p, "must be object"); return; }
        checkId(element.id, p + ".id");
        if (element.morphId !== undefined) {
          if (!str(element.morphId) || !element.morphId.trim()) fail(p + ".morphId", "must be a non-empty string");
          else if (morphIds.has(element.morphId)) fail(p + ".morphId", "duplicate morph identity on the same slide");
          else morphIds.add(element.morphId);
        }
        if (element.type === "text" && element.fontStyle !== undefined && !oneOf(element.fontStyle, ["normal","italic"])) fail(p + ".fontStyle", "unknown font style");
        if (element.type === "shape" && element.boxShadow !== undefined && !str(element.boxShadow)) fail(p + ".boxShadow", "must be a CSS string");
        if (!oneOf(element.type, ["text","shape","image","html","frame"])) {
          fail(p + ".type", "unknown element"); return;
        }
        for (const key of ["x","y","width","height"]) {
          if (!num(element[key]) ||
             ((key === "width" || key === "height") && (element[key] as number) <= 0))
            fail(p + "." + key, "must be finite; dimensions must be positive");
        }
        for (const key of ["rotation","opacity","zIndex"]) {
          if (element[key] !== undefined && !num(element[key]))
            fail(p + "." + key, "must be finite");
        }
        if (element.parentId !== undefined && (!str(element.parentId)||!element.parentId.trim())) fail(p+".parentId","required frame ID");
        for(const k of ["sizingX","sizingY"])if(element[k]!==undefined&&!oneOf(element[k],["fixed","hug","fill"]))fail(p+"."+k,"invalid sizing");
        if(element.type==="frame"){
          if(element.rotation!==undefined&&element.rotation!==0)fail(p+".rotation","frame rotation is not supported");
          if(element.clipContent!==undefined&&typeof element.clipContent!=="boolean")fail(p+".clipContent","must be boolean");
          for(const key of ["name","fill","border","boxShadow"])if(element[key]!==undefined&&!str(element[key]))fail(p+"."+key,"must be string");
          if(element.borderRadius!==undefined&&(!num(element.borderRadius)||element.borderRadius<0))fail(p+".borderRadius","must be non-negative");
          if(obj(element.layout))extraLayout(element.layout,p+".layout");
          if(element.layout!==undefined){const l=element.layout;if(!obj(l)||!oneOf(l.direction,["row","column"])||!oneOf(l.align,["start","center","end"])||!oneOf(l.justify,["start","center","end","space-between"]))fail(p+".layout","invalid frame layout");else for(const k of ["gap","paddingX","paddingY"])if(!num(l[k])||(l[k] as number)<0||(l[k] as number)>10000)fail(p+".layout."+k,"invalid spacing");}
        }
        if (element.layoutPosition !== undefined && !oneOf(element.layoutPosition, ["flow","absolute"])) fail(p + ".layoutPosition", "unknown positioning mode");
        if (element.groupId !== undefined && (!str(element.groupId) || !element.groupId.trim()))
          fail(p + ".groupId", "must be a non-empty string");
        if (element.type === "text" && !str(element.text)) fail(p + ".text", "required string");
        if(element.type==="text"&&element.textAdvances!==undefined&&(!obj(element.textAdvances)||Object.keys(element.textAdvances).length>2048||Object.entries(element.textAdvances).some(([k,v])=>Array.from(k).length!==1||!num(v)||(v as number)<0||(v as number)>10)))fail(p+".textAdvances","invalid font metrics");
        if (element.type === "image" && !str(element.src)) fail(p + ".src", "required string");
        if (element.type === "html" && !str(element.html)) fail(p + ".html", "required string");
        if (element.animation !== undefined) {
          if (!obj(element.animation) ||
              !oneOf(element.animation.type, ["none","fade","slide-up","zoom"]))
            fail(p + ".animation", "unknown animation");
          else for (const key of ["duration","delay"]) {
            const x = element.animation[key];
            if (x !== undefined && (!num(x) || x < 0))
              fail(p + ".animation." + key, "must be non-negative");
          }
        }
      });
      const byId=new Map(slide.elements.filter(obj).map(e=>[e.id,e]));
      for(const e of slide.elements.filter(obj)){
        let parent=e.parentId;const seen=new Set([e.id]);let depth=0;
        while(parent!==undefined){
          const frame=byId.get(parent);
          if(!frame||frame.type!=="frame"||seen.has(parent)||++depth>32){fail(path+".elements","invalid frame ancestry (missing frame, cycle or depth > 32)");break;}
          seen.add(parent);parent=frame.parentId;
        }
      }
    });
  }
  if (errors.length) throw new PresentationValidationError(errors);
}

export function parsePresentation(json: string): Presentation {
  const value: unknown = JSON.parse(json);
  validatePresentation(value);
  return reflowPresentation(value);
}

export function serializePresentation(value: Presentation): string {
  validatePresentation(value);
  return JSON.stringify(reflowPresentation(value), null, 2);
}
