import type { Presentation, Slide, HtmlElement } from "../src/core/types";
import { validatePresentation } from "../src/core/validation";
import { createSlideNode } from "../src/renderer/dom";
import { newId } from "../src/core/document";

export function replaceSlideSource(project:Presentation, slideId:string, source:string):Presentation {
  const value:unknown=JSON.parse(source);
  if(!value || typeof value!=="object" || Array.isArray(value) || (value as Slide).id!==slideId)
    throw new Error("JSON должен содержать текущий слайд с неизменным id.");
  if(!project.slides.some(s=>s.id===slideId))throw new Error("Слайд больше не существует.");
  const next={...project,slides:project.slides.map(s=>s.id===slideId?value as Slide:s)};
  validatePresentation(next);
  if(new Blob([JSON.stringify(next)]).size>4_750_000)throw new Error("Презентация превышает лимит 4,75 МБ.");
  return next;
}
export function webSource(slide:Slide,project:Presentation):{html:string;css:string;javascript:string;native:boolean} {
  const e=slide.elements[0];
  if(slide.elements.length===1 && e?.type==="html" && e.x===0 && e.y===0 && e.width===project.viewport.width && e.height===project.viewport.height && !slide.layout && !(e.rotation??0) && (e.opacity??1)===1)
    return {html:e.html,css:e.css??"",javascript:e.javascript??"",native:false};
  // Render native elements with their inline styles; this is a starting point, not a round-trip HTML parser.
  const node=createSlideNode(slide,project,false);
  node.style.position="relative";node.style.inset="auto";
  return {html:node.outerHTML,css:"html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }",javascript:"",native:true};
}
export function replaceSlideWithWeb(project:Presentation,slideId:string,code:{html:string;css:string;javascript:string}):Presentation {
  const slide=project.slides.find(s=>s.id===slideId);
  if(!slide)throw new Error("Слайд больше не существует.");
  const source=webSource(slide,project);
  const old=slide.elements[0];
  const element:HtmlElement={id:!source.native && old?.type==="html"?old.id:newId("element"),type:"html",x:0,y:0,
    width:project.viewport.width,height:project.viewport.height,html:code.html,css:code.css,javascript:code.javascript,layoutPosition:"absolute"};
  if(!source.native && old?.type==="html")Object.assign(element,{animation:old.animation,morphId:old.morphId});
  const updated:Slide={...slide,layout:undefined,elements:[element]};
  return replaceSlideSource(project,slideId,JSON.stringify(updated));
}
export function initSlideSource(hooks:{current:()=>{project:Presentation;slide?:Slide};apply:(project:Presentation)=>void}){
  const dialog=document.getElementById("slide-source-dialog") as HTMLDialogElement;
  const editor=dialog.querySelector<HTMLTextAreaElement>("#source-editor")!;
  const error=dialog.querySelector<HTMLElement>("#source-error")!;
  const hint=dialog.querySelector<HTMLElement>("#source-hint")!;
  const apply=dialog.querySelector<HTMLButtonElement>("#source-apply")!;
  const tabs=Array.from(dialog.querySelectorAll<HTMLButtonElement>("[data-source-tab]"));
  type Tab="json"|"html"|"css"|"javascript";
  let tab:Tab="json", drafts:Record<Tab,string>={json:"",html:"",css:"",javascript:""};
  let snapshot="", projectId="", slideId="", native=true, dirty=false;
  function changeTab(next:Tab){
    drafts[tab]=editor.value;tab=next;editor.value=drafts[tab];
    tabs.forEach(b=>b.setAttribute("aria-selected",String(b.dataset.sourceTab===tab)));
    hint.textContent=tab==="json"?"JSON — редактируемый исходник слайда: объекты, координаты, анимации и макет.":
      native?"HTML/CSS/JS — отдельная веб-вёрстка. Применение заменит нативные объекты одним HTML-блоком. Отмена через Ctrl+Z.":"HTML/CSS/JS — исходники веб-слайда. JavaScript запускается только в режиме показа.";
    apply.textContent=tab==="json"?"Применить JSON":native?"Заменить слайд HTML":"Применить HTML/CSS/JS";
    error.textContent="";
  }
  function open(){
    const {project,slide}=hooks.current();if(!slide)return;
    projectId=project.id;slideId=slide.id;snapshot=JSON.stringify({slide,viewport:project.viewport});
    const web=webSource(slide,project);native=web.native;
    drafts={json:JSON.stringify(slide,null,2),html:web.html,css:web.css,javascript:web.javascript};
    tab="json";editor.value=drafts.json;dirty=false;changeTab("json");dialog.showModal();editor.focus();
  }
  function close(){if(!dirty||confirm("Закрыть редактор кода без сохранения изменений?"))dialog.close();}
  tabs.forEach(b=>b.addEventListener("click",()=>changeTab(b.dataset.sourceTab as Tab)));
  editor.addEventListener("input",()=>{dirty=true;error.textContent="";});
  editor.addEventListener("keydown",e=>{
    if(e.key==="Tab"&&!e.shiftKey){e.preventDefault();const start=editor.selectionStart;editor.setRangeText("  ",start,editor.selectionEnd,"end");dirty=true;}
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();apply.click();}
  });
  dialog.querySelector("#source-close")!.addEventListener("click",close);
  dialog.addEventListener("cancel",e=>{e.preventDefault();close();});
  dialog.querySelector("#source-copy")!.addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(editor.value);hint.textContent="Код скопирован.";}
    catch{editor.focus();editor.select();hint.textContent="Выделен весь код. Нажмите Ctrl+C.";}
  });
  apply.addEventListener("click",()=>{
    try{
      const {project,slide}=hooks.current();
      if(project.id!==projectId||slide?.id!==slideId||JSON.stringify({slide,viewport:project.viewport})!==snapshot)
        throw new Error("Слайд изменился. Скопируйте черновик и откройте редактор заново.");
      drafts[tab]=editor.value;
      if(tab!=="json"&&native&&!confirm("Заменить все объекты слайда одним HTML-блоком? Нативные анимации и отдельное редактирование объектов будут потеряны. Ctrl+Z восстановит слайд."))return;
      const next=tab==="json"?replaceSlideSource(project,slideId,drafts.json):replaceSlideWithWeb(project,slideId,drafts);
      hooks.apply(next);dirty=false;dialog.close();
    }catch(e){error.textContent=e instanceof Error?e.message:String(e);}
  });
  return {open};
}
