import type { TextElement } from "./types";
function fallback(c:string):number{
  if(/\s/u.test(c))return .33;
  if(/[\u0300-\u036f\u200d\ufe0f]/u.test(c))return 0;
  if(/[ilI1|.,:;!'’]/u.test(c))return .29;
  if(/[MWЖШЩЮ@%]/u.test(c))return .87;
  if(/[\u2e80-\u9fff\u{1f300}-\u{1faff}]/u.test(c))return 1;
  return .57;
}
export function fitText(e:TextElement,width=e.width):TextElement{
  if(e.sizingX!=="hug"&&e.sizingY!=="hug")return e;
  const size=e.fontSize??56,lh=size*(e.lineHeight??1.2);
  const advance=(c:string)=>size*(e.textAdvances?.[c]??fallback(c));
  const measure=(s:string)=>Array.from(s).reduce((sum,c)=>sum+advance(c),0);
  const lines=e.text.replace(/\r\n?/g,"\n").split("\n");
  const auto=e.sizingX==="hug";
  const w=auto?Math.max(1,Math.ceil(lines.reduce((n,s)=>Math.max(n,measure(s)),0))):Math.max(1,width);
  let count=0;
  for(const line of lines){
    count++;if(auto)continue;
    let used=0;
    for(const token of line.match(/\s+|\S+/gu)??[]){
      const tw=measure(token);
      if(used&&used+tw>w&&!/^\s+$/u.test(token)){count++;used=0;}
      for(const c of token){const n=advance(c);if(used&&used+n>w){count++;used=0;}used+=n;}
    }
  }
  return {...e,width:w,height:e.sizingY==="hug"?Math.max(1,Math.ceil(count*lh)):e.height};
}
