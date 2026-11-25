import type { TextElement } from "../src/core/types";
let context:CanvasRenderingContext2D|null|undefined;
export function captureTextAdvances(e:TextElement):Record<string,number>|undefined{
  context??=document.createElement("canvas").getContext("2d");
  if(!context)return undefined;
  context.font=(e.fontStyle??"normal")+" "+(e.fontWeight??500)+" 100px "+(e.fontFamily??"Inter, system-ui, sans-serif");
  return Object.fromEntries(Array.from(new Set(Array.from(e.text))).slice(0,2048).map(c=>[c,Math.max(0,Math.min(10,context!.measureText(c).width/100))]));
}
