import {
  PresentationPlayer, PresentationStore, addElement, addSlide, createElement, createSlide,
  createSlideNode, deleteElement, deleteSlide, duplicateSlide, duplicateElements, moveSlide,
  groupElements, ungroupElements, reorderElements, updateElements,
  parsePresentation, serializePresentation, updateElement,
} from "../src";
import type { ElementKind, Presentation, Slide, SlideElement, AutoLayout, FrameElement } from "../src";
import { initFrameTool } from "./frame-tool";
import { insertFrame, frameAtPoint, descendants, rootSelection, parentLayout, isManaged, reorderFrameChild } from "../src/core/frames";
import { defaultSlideLayout, isFlowElement, layoutOverflows, reorderLayoutAt, stepLayoutOrder } from "../src";
import { demoPresentation } from "../src/demo";
import { CanvasInteractions } from "./canvas-interactions";
import { unionBounds } from "../src/editor/geometry";
import { ProjectSync } from "./project-sync";
import { createLayoutSlide } from "../src/editor/layouts";
import type { SlideLayout } from "../src/editor/layouts";
import "./style.css";
import { shortcutKey } from "./shortcuts";
import { captureTextAdvances } from "./text-metrics";
import { fitText } from "../src/core/text-layout";
import type { TextElement } from "../src/core/types";
import { inspectorIcon } from "./inspector-icons";
import { createContextMenu } from "./context-menu";
import type { MenuItem } from "./context-menu";
import { initSlideSource } from "./slide-source";
import { initTheme } from "./theme";
import { initPanels } from "./panels";
import { enhanceSelects, syncSelect } from "./selects";
import { bindAnimationBar, createTimelineAnimation, initTimelineHeight, timelineRange } from "./timeline";

enhanceSelects();
initTheme();
initPanels();
initTimelineHeight();

const $ = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing UI element: ${id}`);
  return found as T;
};
const escape = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const localDraftKey = "core-presentation:local-document";
function localDraft(): Presentation {
  try {
    const saved = localStorage.getItem(localDraftKey);
    if (saved) return parsePresentation(saved);
  } catch { /* Fall back to example */ }
  return demoPresentation;
}
const store = new PresentationStore(localDraft());
const stage = $<HTMLDivElement>("editor-stage");
const shell = $<HTMLDivElement>("stage-shell");
const props = $<HTMLDivElement>("properties");
const overlay = $<HTMLDivElement>("preview-overlay");
let slideId = store.value.slides[0]?.id ?? "";
let scale = 1;
let player: PresentationPlayer | null = null;
let applyingRemote = false;
const canvas = new CanvasInteractions(stage, {
  project: () => store.value,
  slideId: () => slideId,
  scale: () => scale,
  commit: (patches, mode, point) => store.update(project => {
    const slide = project.slides.find(s => s.id === slideId);
    const moving = slide?.elements.filter(e => Object.prototype.hasOwnProperty.call(patches, e.id)) ?? [];
    if(mode==="move"&&slide&&moving.length===1&&!moving[0]!.groupId){
      const original=moving[0]!, candidate={...original,...patches[original.id]!};
      const target=frameAtPoint(slide,point,descendants(slide,[original.id]));
      if(target?.id!==original.parentId){
        let next=updateElement(project,original.id,{...patches[original.id],parentId:target?.id,...(!target?{sizingX:original.sizingX==="fill"?"fixed":original.sizingX,sizingY:original.sizingY==="fill"?"fixed":original.sizingY}:{})});
        if(target?.layout)next=reorderFrameChild(next,slideId,original.id,target.layout.direction==="row"?point.x:point.y);
        return next;
      }
      if(original.parentId&&isManaged(slide,original)){
        const layout=parentLayout(slide,original)!;
        return reorderFrameChild(project,slideId,original.id,layout.direction==="row"?candidate.x+candidate.width/2:candidate.y+candidate.height/2);
      }
    }
    if (mode === "move" && slide?.layout) {
      const flow = moving.filter(e => isFlowElement(slide, e));
      const free = Object.fromEntries(moving.filter(e => !isFlowElement(slide, e)).map(e => [e.id, patches[e.id]!]));
      let next = Object.keys(free).length ? updateElements(project, free) : project;
      if (flow.length) {
        const box = unionBounds(flow.map(e => ({ ...e, ...patches[e.id]! })));
        next = reorderLayoutAt(next, slideId, flow.map(e => e.id), slide.layout.direction === "row" ? box.x + box.width / 2 : box.y + box.height / 2);
      }
      return next;
    }
    if(mode==="resize"){
      const resized:Record<string,Partial<SlideElement>>={};
      for(const e of moving){const p=patches[e.id]!;resized[e.id]={...p,...(Math.abs(p.width-e.width)>.01?{sizingX:"fixed" as const}:{}),...(Math.abs(p.height-e.height)>.01?{sizingY:"fixed" as const}:{})};}
      return updateElements(project,resized);
    }
    return updateElements(project, patches);
  }),
  selectionChanged: () => { renderProperties(); renderTimeline(); renderLayers(); },
});

const picker = $<HTMLSelectElement>("project-picker");
const dialog = $<HTMLDialogElement>("create-project-dialog");
const sync = new ProjectSync({
  current: () => store.value,
  load: project => {
    applyingRemote = true;
    try {
      if (store.value.id !== project.id) {
        canvas.clear();
        slideId = project.slides[0]?.id ?? "";
      } else if (!project.slides.some(slide => slide.id === slideId)) {
        canvas.clear();
        slideId = project.slides[0]?.id ?? "";
      }
      store.load(project);
    } finally {
      applyingRemote = false;
    }
  },
  canApplyRemote: () => !document.hidden && !$<HTMLDialogElement>("slide-source-dialog").open && !document.querySelector(".studio-context-menu:not([hidden])") && !document.documentElement.classList.contains("timeline-dragging") &&
    !document.querySelector(".studio-select-component [aria-expanded=true]") &&
    !document.activeElement?.matches("input,textarea,select,[contenteditable='true']"),
  onState: state => {
    const indicator = $("sync-status");
    indicator.textContent = state.message;
    indicator.dataset.state = state.status;
    $("sync-remote").hidden = $("sync-copy").hidden = state.status !== "conflict";
    picker.value = state.name ?? "";
    syncSelect(picker);
    $<HTMLDetailsElement>("project-actions").hidden = state.name === null;
  },
});

async function refreshProjects(): Promise<void> {
  try {
    const available = await sync.list();
    const selectedName = sync.activeName ?? "";
    const signature = available.map(item => item.name + ":" + item.title).join("|");
    if (picker.dataset.signature !== signature) {
      picker.replaceChildren(new Option("Локальный пример", ""));
      for (const project of available) picker.add(new Option(project.title + " (" + project.name + ")", project.name));
      picker.dataset.signature = signature;
    }
    picker.value = selectedName;
    syncSelect(picker);
  } catch {
    // Offline mode continues to work without a local project server.
  }
}

picker.addEventListener("change", async () => {
  try {
    if (!picker.value) {
      sync.localMode();
      applyingRemote = true;
      try {
        canvas.clear();
        slideId = demoPresentation.slides[0]!.id;
        store.load(localDraft());
      } finally { applyingRemote = false; }
    } else {
      await sync.open(picker.value);
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  } finally { picker.value = sync.activeName ?? ""; syncSelect(picker); }
});

$("new-project").addEventListener("click", () => dialog.showModal());
$("duplicate-project").addEventListener("click", async () => {
  const active = sync.activeName;
  if (!active) return;
  const suggestion = (active.slice(0, 56) + "-copy").slice(0, 64);
  const name = prompt("Имя копии (латиница, цифры, - и _)", suggestion);
  if (!name) return;
  try {
    await sync.duplicateCurrent(name.trim());
    await refreshProjects();
  } catch (error) { alert(error instanceof Error ? error.message : String(error)); }
  $<HTMLDetailsElement>("project-actions").open = false;
});
$("archive-project").addEventListener("click", async () => {
  const active = sync.activeName;
  if (!active || !confirm('Архивировать проект "' + active + '"? Его файлы будут сохранены в папке .trash.')) return;
  try {
    await sync.archiveCurrent();
    applyingRemote = true;
    try {
      canvas.clear();
      slideId = demoPresentation.slides[0]!.id;
      store.load(localDraft());
    } finally { applyingRemote = false; }
    await refreshProjects();
  } catch (error) { alert(error instanceof Error ? error.message : String(error)); }
  $<HTMLDetailsElement>("project-actions").open = false;
});

$("cancel-project").addEventListener("click", () => dialog.close());
$<HTMLFormElement>("create-project-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $<HTMLButtonElement>("confirm-project");
  const name = $<HTMLInputElement>("new-project-name").value.trim();
  const title = $<HTMLInputElement>("new-project-title").value.trim();
  button.disabled = true;
  $("project-error").textContent = "";
  try {
    await sync.create(name, title);
    dialog.close();
    await refreshProjects();
  } catch (error) {
    $("project-error").textContent = error instanceof Error ? error.message : String(error);
  } finally { button.disabled = false; }
});

$("sync-remote").addEventListener("click", async () => {
  if (!confirm("Заменить локальные изменения последней версией агента? Несохранённые изменения будут потеряны.")) return;
  try { await sync.loadServerVersion(); } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
});
$("sync-copy").addEventListener("click", async () => {
  const name = prompt("Имя новой копии (латиница, цифры, - и _):");
  if (!name) return;
  try {
    await sync.saveConflictCopy(name.trim());
    await refreshProjects();
  } catch (error) { alert(error instanceof Error ? error.message : String(error)); }
});
window.setInterval(() => { void refreshProjects().then(() => sync.restoreLast()); }, 5000);
void refreshProjects();

function selected(): { project: Presentation; slide?: Slide; element?: SlideElement } {
  const project = store.value;
  const slide = project.slides.find(s => s.id === slideId);
  return { project, slide, element: slide?.elements.find(e => e.id === canvas.primaryId) };
}

function render(): void {
  const project = store.value;
  if (!project.slides.some(s => s.id === slideId)) slideId = project.slides[0]?.id ?? "";
  $<HTMLInputElement>("project-title").value = project.title;
  $("slide-counter").textContent = `Слайд ${Math.max(0, project.slides.findIndex(s => s.id === slideId) + 1)} из ${project.slides.length}`;
  $("viewport-label").textContent = `${project.viewport.width} × ${project.viewport.height} · ${(project.viewport.width / project.viewport.height).toFixed(2)}:1`;
  $<HTMLButtonElement>("undo").disabled = !store.canUndo;
  $<HTMLButtonElement>("redo").disabled = !store.canRedo;
  const list = $("slide-list");
  list.replaceChildren();
  project.slides.forEach((slide, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.draggable = true;
    row.dataset.slideId = slide.id;
    row.className = "slide-row" + (slide.id === slideId ? " active" : "");
    row.innerHTML = `<span class="slide-number">${String(index + 1).padStart(2,"0")}</span>
      <span class="slide-title" title="${escape(slide.name)}">${escape(slide.name)}</span>
      <span class="slide-thumb" style="background:${escape(slide.background)}"><span>${escape(slide.name)}</span></span>`;
    row.addEventListener("click", () => { slideId = slide.id; canvas.clear(); render(); });
    row.addEventListener("dragstart", event => {
      event.dataTransfer?.setData("text/plain", slide.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      list.querySelectorAll(".dragging, .drop-target").forEach(node =>
        node.classList.remove("dragging", "drop-target"));
    });
    row.addEventListener("dragover", event => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
    row.addEventListener("drop", event => {
      event.preventDefault();
      row.classList.remove("drop-target");
      const id = event.dataTransfer?.getData("text/plain");
      if (!id || id === slide.id || !store.value.slides.some(item => item.id === id)) return;
      store.update(project => moveSlide(project, id, index));
    });
    list.append(row);
  });
  stage.replaceChildren();
  stage.style.width = project.viewport.width + "px";
  stage.style.height = project.viewport.height + "px";
  const current = project.slides.find(s => s.id === slideId);
  if (current) stage.append(createSlideNode(current, project, false));
  renderLayers();
  stage.querySelectorAll("iframe").forEach(iframe => iframe.style.pointerEvents = "none");
  fit();
  canvas.refresh();
  renderProperties();
  renderTimeline();
}

function fit(): void {
  const { width, height } = store.value.viewport;
  const padding = Math.min(48, shell.clientWidth * 0.05, shell.clientHeight * 0.08);
  scale = Math.min((shell.clientWidth - padding) / width, (shell.clientHeight - padding) / height);
  if (!Number.isFinite(scale) || scale <= 0) return;
  const x = (shell.clientWidth - width * scale) / 2;
  const y = (shell.clientHeight - height * scale) / 2;
  stage.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  $("zoom").textContent = `Масштаб ${Math.round(scale * 100)}%`;
}

function field(label: string, key: string, value: string | number | undefined, type = "text"): string {
  return `<label class="field"><span>${escape(label)}</span><input data-field="${key}" type="${type}" value="${escape(value)}"></label>`;
}
function area(label: string, key: string, value: string | undefined): string {
  return `<label class="field"><span>${escape(label)}</span><textarea data-field="${key}" rows="5" spellcheck="false">${escape(value)}</textarea></label>`;
}
function pick(label: string, key: string, value: string, choices: string[]): string {
  return `<label class="field"><span>${escape(label)}</span><select data-field="${key}">${choices.map(choice =>
    `<option value="${choice}" ${choice === value ? "selected" : ""}>${escape(choice)}</option>`).join("")}</select></label>`;
}

function iconButton(action:string, label:string, icon:string, pressed?:boolean):string {
  return '<button type="button" class="btn icon-control" data-variant="ghost" data-action="'+action+'" title="'+escape(label)+'" aria-label="'+escape(label)+'"'+
    (pressed===undefined?'':' aria-pressed="'+pressed+'"')+'>'+inspectorIcon(icon)+'</button>';
}
function layoutControls(slide: Slide, project: Presentation, dimensions=""): string {
  const l=slide.layout,row=l?.direction==="row";
  const directions=[["free","Свободная компоновка","free"],["column","Вертикально","column"],["row","Горизонтально","row"],["grid","Grid","grid"]] as const;
  const values=["start","center","end"] as const;
  const activeDirection=l?.gridColumns?"grid":l?.direction??"free";
  const auto=l?.justify==="space-between";
  const individual=l&&[l.paddingTop,l.paddingRight,l.paddingBottom,l.paddingLeft].some(v=>v!==undefined);
  return '<div class="property-section layout-heading"><span>Auto Layout</span>'+iconButton(l?"layout-direction-free":"layout-direction-column",l?"Убрать Auto Layout":"Добавить Auto Layout","column")+'</div>'+
    '<span class="layout-label">Flow</span><div class="layout-flow-row"><div class="icon-segment layout-flow" role="group" aria-label="Направление">'+
    directions.map(([id,label,icon])=>iconButton("layout-direction-"+id,label,icon,activeDirection===id)).join("")+'</div>'+
    (l&&!l.gridColumns&&row?iconButton("layout-wrap","Wrap — перенос строк","wrap",!!l.wrap):'')+'</div>'+
    dimensions+
    (l?'<div class="layout-alignment-row"><div class="layout-control-stack"><span class="layout-label">Alignment</span><div class="layout-alignment" role="group" aria-label="Выравнивание объектов">'+
    values.flatMap((y,iy)=>values.map((x,ix)=>{
      const align=row?y:x,justify=row?x:y;
      const active=l.align===align&&(auto?justify==="center":l.justify===justify);
      const label=["Сверху","По центру вертикально","Снизу"][iy]+" · "+["Слева","По центру горизонтально","Справа"][ix];
      return '<button type="button" class="layout-dot '+(row?"axis-row":"axis-column")+(auto?" auto-gap":"")+'" data-action="layout-point-'+align+'-'+justify+'" title="'+label+'" aria-label="'+label+'" aria-pressed="'+active+'"><span></span></button>';
    })).join("")+'</div></div><div class="layout-spacing"><span class="layout-label">Gap</span>'+
    '<div class="gap-control">'+(auto?'<div class="icon-number">'+inspectorIcon(row?"gap":"gapY")+'<span>Auto</span></div>':iconNumber("Интервал","layoutGap",l.gap,row?"gap":"gapY"))+
    '<select class="gap-mode" data-field="layoutGapMode" aria-label="Режим интервала"><option value="packed"'+(!auto?' selected':'')+'>Packed</option><option value="auto"'+(auto?' selected':'')+'>Auto</option></select></div>'+
    (l.gridColumns?iconNumber("Колонки","layoutGridColumns",l.gridColumns,"grid"):'')+
    (l.wrap||l.gridColumns?iconNumber("Между строками","layoutCrossGap",l.crossGap??l.gap,"gapY"):'')+'</div></div>'+
    '<span class="layout-label">Padding</span><div class="layout-padding-row"><div class="field-grid">'+
    (individual?iconNumber("Слева","layoutPaddingLeft",l.paddingLeft??l.paddingX,"paddingLeft")+iconNumber("Справа","layoutPaddingRight",l.paddingRight??l.paddingX,"paddingRight")+iconNumber("Сверху","layoutPaddingTop",l.paddingTop??l.paddingY,"paddingTop")+iconNumber("Снизу","layoutPaddingBottom",l.paddingBottom??l.paddingY,"paddingBottom"):iconNumber("Отступы по X","layoutPaddingX",l.paddingX,"paddingX")+iconNumber("Отступы по Y","layoutPaddingY",l.paddingY,"paddingY"))+
    '</div>'+iconButton("layout-padding-individual","Раздельные отступы","paddingAll",!!individual)+'</div>'+
    (layoutOverflows(slide,project.viewport)?'<div class="layout-warning" role="status">Объекты выходят за границы макета.</div>':''):'');
}
function sizeControl(e:SlideElement,axis:"X"|"Y",managed:boolean,showNumber=true):string{
  const key=axis==="X"?"width":"height",mode=axis==="X"?"sizingX":"sizingY";
  const hug=e.type==="frame"&&!!e.layout;
  return '<div class="layout-size">'+(showNumber?'<label class="frame-number"><span>'+(axis==="X"?"W":"H")+'</span><input type="number" min="1" aria-label="'+(axis==="X"?"Ширина":"Высота")+'" data-field="'+key+'" value="'+e[key]+'"></label>':'<span class="layout-label">'+(axis==="X"?"Width":"Height")+'</span>')+
    (hug||managed?'<select data-field="'+mode+'" aria-label="Режим размера '+axis+'"><option value="fixed"'+((e[mode]??"fixed")==="fixed"?' selected':'')+'>Fixed</option>'+(hug?'<option value="hug"'+(e[mode]==="hug"?' selected':'')+'>Hug</option>':'')+(managed?'<option value="fill"'+(e[mode]==="fill"?' selected':'')+'>Fill</option>':'')+'</select>':'')+'</div>';
}
function iconNumber(label:string,key:string,value:number,icon:string):string{
  return '<label class="icon-number" title="'+escape(label)+'">'+inspectorIcon(icon)+'<input type="number" min="0" max="10000" data-field="'+key+'" aria-label="'+escape(label)+'" value="'+value+'"></label>';
}
function itemLayoutControls(slide: Slide, elements: SlideElement[]): string {
  if (!elements.length || !elements.every(e=>parentLayout(slide,e))) return "";
  const flowing=elements.every(e=>isManaged(slide,e));
  return '<div class="property-section layout-heading"><span>Auto Layout</span>'+iconButton(flowing?"layout-absolute":"layout-flow",flowing?"Абсолютная позиция":"Вернуть в поток","absolute",!flowing)+'</div>'+
    '<div class="layout-control-row"><span>'+(flowing?"В потоке":"Абсолютно")+'</span><div class="icon-segment">'+
    iconButton("layout-settings","Настройки макета","column")+'</div></div>'+(flowing&&elements.length===1&&elements[0]?.type!=="frame"?'<div class="field-grid">'+sizeControl(elements[0]!,"X",true,false)+sizeControl(elements[0]!,"Y",true,false)+'</div>':'');
}
function frameInspector(e:FrameElement,slide:Slide,project:Presentation):string{
  const layoutSlide:Slide={...slide,layout:e.layout,elements:slide.elements.filter(child=>child.parentId===e.id).map(child=>({...child,parentId:undefined,x:child.x-e.x,y:child.y-e.y}))};
  const pair=(a:string,b:string)=>'<div class="field-grid">'+a+b+'</div>';
  const n=(label:string,key:string,value:number,aria=label)=>'<label class="frame-number" title="'+aria+'"><span>'+label+'</span><input type="number" data-field="'+key+'" aria-label="'+aria+'" value="'+value+'"></label>';
  const section=(title:string,body:string)=>'<section class="frame-section"><h3>'+title+'</h3>'+body+'</section>';
  const fold=(title:string,body:string,open=false)=>'<details class="frame-section" '+(open?'open':'')+'><summary>'+title+'<span class="frame-disclosure">+</span></summary>'+body+'</details>';
  return '<div class="frame-inspector">'+
    '<div class="frame-heading"><strong>Frame</strong><div class="icon-segment">'+iconButton("source-code","Код слайда","code")+iconButton("frame-layout-toggle","Auto Layout","column",!!e.layout)+'</div></div>'+
    section("Положение",'<span class="frame-label">Выравнивание</span><div class="icon-segment alignment-tools">'+
      [["left","По левому краю","left"],["center-x","По центру горизонтально","centerX"],["right","По правому краю","right"],["top","По верхнему краю","top"],["center-y","По центру вертикально","centerY"],["bottom","По нижнему краю","bottom"]].map(([key,label,icon])=>iconButton("frame-align-"+key,label!,icon!)).join("")+'</div>'+
      field("Название","name",e.name??"Frame")+pair(n("X","x",e.x),n("Y","y",e.y)))+
    itemLayoutControls(slide,[e])+
    section(e.layout?"Auto Layout":"Layout",layoutControls(layoutSlide,{...project,viewport:{width:e.width,height:e.height}},'<span class="layout-label">Dimensions</span>'+pair(sizeControl(e,"X",isManaged(slide,e)),sizeControl(e,"Y",isManaged(slide,e))))+
      '<label class="frame-check"><input type="checkbox" data-field="clipContent" '+(e.clipContent?'checked':'')+'> Обрезать содержимое</label>')+
    section("Внешний вид",pair(n("%","frameOpacity",Math.round((e.opacity??1)*100),"Непрозрачность"),n("⌜","borderRadius",e.borderRadius??0,"Скругление")))+
    fold("Заливка",'<div class="frame-fill"><input aria-label="Цвет заливки" title="Выбрать цвет" type="color" data-field="fill" value="'+(/^#[0-9a-f]{6}$/i.test(e.fill??"")?escape(e.fill):"#ffffff")+'">'+field("Цвет (CSS)","fill",e.fill??"transparent")+iconButton("frame-fill-clear","Убрать заливку","trash")+'</div>',true)+
    fold("Обводка",field("Граница (CSS)","border",e.border??"none"),!!e.border&&e.border!=="none")+
    fold("Эффекты",field("Тень (CSS)","boxShadow",e.boxShadow??"none"),!!e.boxShadow&&e.boxShadow!=="none")+
    fold("Анимация",pick("Эффект","animation",e.animation?.type??"none",["none","fade","slide-up","zoom"])+field("Задержка, мс","animationDelay",e.animation?.delay??0,"number")+field("Длительность, мс","animationDuration",e.animation?.duration??600,"number"))+
    '</div>';
}
function renderLayers(){
  const host=$("frame-layers"),{slide}=selected();
  host.replaceChildren();
  host.hidden=!slide?.elements.some(e=>e.type==="frame");
  if(!slide||host.hidden)return;
  const title=document.createElement("div");title.className="layers-heading";title.textContent="Слои";host.append(title);
  function append(parent?:string,depth=0){
    for(const e of slide!.elements.filter(e=>e.parentId===parent)){
      const b=document.createElement("button");b.type="button";b.className="layer-row"+(canvas.ids.includes(e.id)?" active":"");b.dataset.layerId=e.id;
      b.style.paddingLeft=(10+depth*14)+"px";b.innerHTML=inspectorIcon(e.type==="frame"?"free":e.type==="html"?"code":"layers");
      const name=document.createElement("span");name.textContent=e.type==="frame"?e.name??"Frame":e.type==="text"?e.text.slice(0,26):e.type;b.append(name);
      b.addEventListener("click",()=>canvas.select([e.id]));
      b.addEventListener("contextmenu",event=>{event.preventDefault();canvas.select([e.id]);openObjectMenu(event.clientX,event.clientY);});
      host.append(b);if(e.type==="frame")append(e.id,depth+1);
    }
  }
  append();
}
function makeFrame(rect:{x:number;y:number;width:number;height:number},ids?:string[]){
  const {slide}=selected();if(!slide)return;
  const frame={...createElement("frame"),...rect} as FrameElement;
  if(ids?.length)frame.fill="transparent";
  store.update(project=>insertFrame(project,slide.id,frame,ids));
  canvas.select([frame.id]);
}

function renderProperties(): void {
  const { project, slide, element } = selected();
  if (!slide) {
    props.innerHTML = '<div class="empty-note">Добавьте первый слайд.</div>';
    return;
  }
  if(element?.type==="frame"&&canvas.ids.length===1){
    props.innerHTML=frameInspector(element,slide,project);
    bindActions();
    props.querySelectorAll<HTMLInputElement|HTMLSelectElement>("[data-field]").forEach(input=>input.addEventListener("change",()=>applyProperty(input)));
    enhanceSelects(props);
    if(isManaged(slide,element))props.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input[data-field="x"],input[data-field="y"],button[data-action^="frame-align-"]').forEach(control=>{control.disabled=true;control.title="Управляется Auto Layout";});
    return;
  }
  if (canvas.ids.length > 1) {
    const elements = slide.elements.filter(e => canvas.ids.includes(e.id));
    props.innerHTML = `<div class="property-title">Выделено: ${elements.length}</div>
      <div class="property-help">Shift + щелчок или выделение рамкой · Ctrl+G для группы</div>
      ${itemLayoutControls(slide, elements)}
      <div class="property-section">Выравнивание</div>
      <div class="icon-segment alignment-tools">
        ${iconButton("align-left","По левому краю","left")}${iconButton("align-center-x","По центру горизонтально","centerX")}${iconButton("align-right","По правому краю","right")}
        ${iconButton("align-top","По верхнему краю","top")}${iconButton("align-center-y","По центру вертикально","centerY")}${iconButton("align-bottom","По нижнему краю","bottom")}
      </div>
      <div class="property-help">ПКМ по объекту — действия с выделением.</div>`;
    bindActions();
    if (elements.some(e => isFlowElement(slide,e))) props.querySelectorAll<HTMLButtonElement>('[data-action^="align-"]').forEach(button => { button.disabled = true; button.title = "Используйте настройки Auto Layout"; });
    return;
  }
  if (!element) {
    props.innerHTML = `<div class="property-title">Слайд</div><div class="property-help">Выберите элемент на холсте, чтобы настроить его.</div>
      ${field("Название","name",slide.name)}
      <div class="property-section">Размер слайда</div>
      <div class="field-grid">
        ${field("Ширина","viewportWidth",project.viewport.width,"number")}
        ${field("Высота","viewportHeight",project.viewport.height,"number")}
      </div>
      ${layoutControls(slide, project)}
      ${field("Фон (CSS)","background",slide.background)}
      ${area("Заметки докладчика","notes",slide.notes)}
      ${pick("Переход","transition",slide.transition?.type ?? "fade",["none","fade","slide","zoom","morph"])}
      ${field("Длительность, мс","transitionDuration",slide.transition?.duration ?? 450,"number")}
      <div class="inspector-actions"><button id="duplicate-slide">Дублировать слайд</button><button class="danger" id="delete-slide">Удалить слайд</button></div>`;
    bindActions();
    $("duplicate-slide").addEventListener("click", () => store.update(project => duplicateSlide(project, slide.id)));
    $("delete-slide").addEventListener("click", () => store.update(project => deleteSlide(project, slide.id)));
  } else {
    props.innerHTML = `<div class="property-title">${escape(({ text: "Текст", shape: "Фигура", image: "Изображение", html: "HTML / JS", frame:"Frame" } as const)[element.type])}</div>
      <div class="property-help">ID: ${escape(element.id)}</div>
      ${itemLayoutControls(slide,[element])}
      <div class="field-grid">
        ${field("X","x",element.x,"number")}${field("Y","y",element.y,"number")}
        ${field("Ширина","width",element.width,"number")}${field("Высота","height",element.height,"number")}
        ${field("Поворот","rotation",element.rotation ?? 0,"number")}
        ${field("Прозрачность","opacity",element.opacity ?? 1,"number")}
      </div>
      ${field("Связь между слайдами (Morph ID)","morphId",element.morphId)}

      ${element.type === "text" ? `
        <div class="property-section">Resizing</div><div class="icon-segment text-resizing">${iconButton("text-auto-width","Auto width","textWidth",element.sizingX==="hug"&&element.sizingY==="hug")}${iconButton("text-auto-height","Auto height","textHeight",element.sizingX!=="hug"&&element.sizingY==="hug")}${iconButton("text-fixed","Fixed size","textFixed",element.sizingX!=="hug"&&element.sizingY!=="hug")}</div>
        ${area("Текст","text",element.text)}
        ${field("Размер шрифта","fontSize",element.fontSize ?? 56,"number")}
        ${field("Семейство шрифта","fontFamily",element.fontFamily ?? "Inter, system-ui, sans-serif")}
        ${field("Межстрочный интервал","lineHeight",element.lineHeight ?? 1.2,"number")}
        ${field("Цвет","color",element.color ?? "#fff")}
        ${field("Насыщенность","fontWeight",element.fontWeight ?? 500,"number")}
        ${pick("Начертание","fontStyle",element.fontStyle ?? "normal",["normal","italic"])}
        ${pick("Выравнивание","align",element.align ?? "left",["left","center","right"])}` : ""}
      ${element.type === "shape" ? `
        ${field("Заливка (CSS)","fill",element.fill)}
        ${field("Граница (CSS)","border",element.border ?? "none")}
        ${field("Тень (CSS)","boxShadow",element.boxShadow ?? "none")}
        ${field("Скругление","borderRadius",element.borderRadius ?? 0,"number")}` : ""}
      ${element.type === "image" ? `
        <label class="image-upload">Загрузить файл (PNG, JPG, WebP, GIF)
          <input id="image-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
        </label>
        ${field("URL изображения","src",element.src)}
        ${field("Подпись","alt",element.alt)}
        ${field("Скругление","borderRadius",element.borderRadius ?? 0,"number")}
        ${pick("Вписывание","fit",element.fit ?? "cover",["cover","contain","fill"])}` : ""}
      ${element.type === "html" ? `
        <div class="code-tip">Встроенный HTML/CSS/JS изолирован в iframe. Код не запускается в редакторе.</div>
        ${area("HTML","html",element.html)}
        ${area("CSS","css",element.css)}
        ${area("JavaScript","javascript",element.javascript)}` : ""}
      ${pick("Анимация","animation",element.animation?.type ?? "none",["none","fade","slide-up","zoom"])}
      ${field("Задержка, мс","animationDelay",element.animation?.delay ?? 0,"number")}
      ${field("Длительность, мс","animationDuration",element.animation?.duration ?? 600,"number")}
      <div class="property-help">ПКМ по объекту — компоновка, слои и дублирование.</div>`;
    bindActions();
  }
  props.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-field]")
    .forEach(input => input.addEventListener("change", () => applyProperty(input)));
  enhanceSelects(props);
  if (element && isManaged(slide, element)) {
    props.querySelectorAll<HTMLInputElement>('input[data-field="x"],input[data-field="y"]').forEach(input => { input.disabled = true; input.title = "Управляется Auto Layout"; });
  }
  const fileInput = props.querySelector<HTMLInputElement>("#image-upload");
  if (fileInput && element?.type === "image") fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      alert("Поддерживаются PNG, JPEG, WebP и GIF.");
      return;
    }
    if (file.size > 2_500_000) {
      alert("Изображение слишком большое. Максимум 2,5 МБ.");
      return;
    }
    try {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Не удалось прочитать изображение"));
        reader.readAsDataURL(file);
      });
      const current = store.value;
      const next = updateElement(current, element.id, { src, alt: file.name });
      if (new Blob([serializePresentation(next)]).size > 4_750_000)
        throw new Error("Размер презентации превысит лимит проекта (4,75 МБ)");
      store.update(() => next);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  });
}

function renderTimeline(): void {
  const timeline = $("timeline-rows");
  const slide = selected().slide;
  timeline.replaceChildren();
  const range = timelineRange(slide?.elements.map(element => element.animation) ?? []);
  const ruler = $("timeline-ruler");
  ruler.replaceChildren(...Array.from({ length: 6 }, (_, i) => {
    const mark = document.createElement("span");
    mark.textContent = String(Math.round(range * i / 5)) + (i === 0 ? " мс" : "");
    return mark;
  }));
  if (!slide) return;
  if (!slide.elements.length) {
    timeline.innerHTML = '<div class="timeline-empty">Добавьте элементы на слайд, чтобы настроить анимацию.</div>';
    return;
  }
  for (const element of slide.elements) {
    const duration = element.animation?.duration ?? 600;
    const delay = element.animation?.delay ?? 0;
    const active = element.animation && element.animation.type !== "none";
    const row = document.createElement("div");
    row.className = "timeline-row" + (canvas.ids.includes(element.id) ? " active" : "");
    row.dataset.elementId = element.id;
    row.innerHTML = '<button type="button" class="timeline-object" title="' + escape(element.id) + '">' +
      escape(element.type === "text" ? element.text.slice(0, 25) : ({ shape: "Фигура", image: "Изображение", html: "HTML / JS", frame:"Frame" } as const)[element.type]) + '</button>' +
      '<div class="timeline-track"' + (active ? '' : ' data-empty="true" role="button" tabindex="0" aria-label="Добавить анимацию: двойной щелчок по дорожке или Enter" title="Двойной щелчок ЛКМ — добавить анимацию"') + '>' + (active
        ? '<div class="timeline-bar" tabindex="0" role="slider" aria-label="Начало анимации" aria-valuemin="0" aria-valuemax="' + range + '" aria-valuenow="' + delay + '" style="left:' + (delay / range * 100) + '%;width:' + (duration / range * 100) + '%" title="' + escape(element.animation?.type) + ' · ' + delay + '–' + (delay + duration) + ' мс"><span class="timeline-edge start" data-edge="start"></span><span class="timeline-edge end" data-edge="end"></span></div>'
        : '<span class="timeline-none">Двойной щелчок — добавить</span>') + '</div>' +
      '<input type="number" class="timeline-number" data-timeline="delay" min="0" max="10000" step="50" aria-label="Задержка анимации" value="' + delay + '">' +
      '<input type="number" class="timeline-number" data-timeline="duration" min="0" max="10000" step="50" aria-label="Длительность анимации" value="' + duration + '">';
    row.querySelector(".timeline-object")!.addEventListener("click", () => canvas.select([element.id]));
    const animation = active ? element.animation! : { type: "fade" as const, duration: 600, delay: 0 };
    const commit = (delay: number, duration: number) => {
      store.update(project => updateElement(project, element.id, { animation: { ...animation, delay, duration } }));
    };
    row.querySelectorAll<HTMLInputElement>("input").forEach(input => input.addEventListener("change", () => {
      const value = Math.max(0, Math.min(10000, Number(input.value) || 0));
      commit(input.dataset.timeline === "delay" ? value : delay, input.dataset.timeline === "duration" ? value : duration);
    }));
    if (active) bindAnimationBar(row, delay, duration, range, commit);
    else {
      const track = row.querySelector<HTMLElement>(".timeline-track")!;
      const create = (offset: number) => {
        const rect = track.getBoundingClientRect();
        const animation = createTimelineAnimation(offset, rect.width, range);
        store.update(project => updateElement(project, element.id, { animation }));
        // Re-render replaces the row. Focus the new clip, not the slide canvas.
        const clip = Array.from(timeline.querySelectorAll<HTMLElement>(".timeline-row"))
          .find(item => item.dataset.elementId === element.id)?.querySelector<HTMLElement>(".timeline-bar");
        clip?.focus({ preventScroll: true });
      };
      track.addEventListener("dblclick", event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        create(event.clientX - track.getBoundingClientRect().left);
      });
      track.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        create(0);
      });
    }
    timeline.append(row);
  }
}

function bindActions(): void {
  props.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button =>
    button.addEventListener("click", () => runAction(button.dataset.action!)));
}

function runAction(action: string): void {
  const { slide } = selected();
  if (!slide) return;
  if (action==="source-code"){sourceEditor.open();return;}
  if(["text-auto-width","text-auto-height","text-fixed"].includes(action)){
    const e=selected().element;if(e?.type!=="text")return;
    store.update(p=>updateElement(p,e.id,{sizingX:action==="text-auto-width"?"hug":"fixed",sizingY:action==="text-fixed"?"fixed":"hug",textAdvances:captureTextAdvances(e)}));return;
  }
  const frame=canvas.ids.length===1?slide.elements.find(e=>e.id===canvas.primaryId&&e.type==="frame") as FrameElement|undefined:undefined;
  if(action==="frame-selection"){const chosen=slide.elements.filter(e=>rootSelection(slide,canvas.ids).includes(e.id));if(chosen.length&&new Set(chosen.map(e=>e.parentId)).size===1)makeFrame(unionBounds(chosen),chosen.map(e=>e.id));return;}
  if(frame&&action==="frame-fill-clear"){store.update(p=>updateElement(p,frame.id,{fill:"transparent"}));return;}
  if(frame&&action.startsWith("frame-align-")){
    if(isManaged(slide,frame))return;
    const parent=slide.elements.find(e=>e.id===frame.parentId),viewport=store.value.viewport;
    const box=parent??{x:0,y:0,...viewport};
    const axis=action.slice("frame-align-".length);
    const patch:Partial<FrameElement>=axis==="left"?{x:box.x}:axis==="right"?{x:box.x+box.width-frame.width}:axis==="center-x"?{x:box.x+(box.width-frame.width)/2}:axis==="top"?{y:box.y}:axis==="bottom"?{y:box.y+box.height-frame.height}:{y:box.y+(box.height-frame.height)/2};
    store.update(p=>updateElement(p,frame.id,patch));return;
  }
  if(action==="frame-layout-toggle"){if(frame)store.update(p=>updateElement(p,frame.id,{layout:frame.layout?undefined:{...defaultSlideLayout,paddingX:16,paddingY:16}}));return;}
  if (action.startsWith("layout-direction-")||action.startsWith("layout-point-")||["layout-space-between","layout-wrap","layout-padding-individual"].includes(action)){
    store.update(project=>{
      const target=frame?project.slides.find(s=>s.id===slide.id)!.elements.find(e=>e.id===frame.id) as FrameElement:project.slides.find(s=>s.id===slide.id)!;
      if(action.startsWith("layout-direction-")){
        const direction=action.slice("layout-direction-".length);
        target.layout=direction==="free"?undefined:{...defaultSlideLayout,...(frame?{paddingX:16,paddingY:16}:{}),...target.layout,direction:(direction==="grid"?"row":direction) as AutoLayout["direction"],gridColumns:direction==="grid"?target.layout?.gridColumns??2:undefined,wrap:direction==="row"?target.layout?.wrap:undefined};
      }else if(target.layout){
        if(action==="layout-wrap")target.layout.wrap=!target.layout.wrap;
        else if(action==="layout-padding-individual"){
          const l=target.layout,individual=[l.paddingTop,l.paddingRight,l.paddingBottom,l.paddingLeft].some(v=>v!==undefined);
          if(individual){l.paddingX=l.paddingLeft??l.paddingX;l.paddingY=l.paddingTop??l.paddingY;delete l.paddingLeft;delete l.paddingRight;delete l.paddingTop;delete l.paddingBottom;}
          else{l.paddingLeft=l.paddingRight=l.paddingX;l.paddingTop=l.paddingBottom=l.paddingY;}
        }else if(action==="layout-space-between"){const l=target.layout;if(l.justify==="space-between")l.justify=l.packedJustify??"start";else{l.packedJustify=l.justify;l.justify="space-between";}}
        else{
          const [, ,align,justify]=action.split("-");
          target.layout.align=align as AutoLayout["align"];
          if(target.layout.justify!=="space-between")target.layout.justify=justify as AutoLayout["justify"];
          else target.layout.packedJustify=justify as AutoLayout["packedJustify"];
        }
      }
      return project;
    });
    return;
  }
  if (!canvas.ids.length) return;
  const ids = canvas.ids;
  const elements = slide.elements.filter(e => ids.includes(e.id));
  if (action === "layout-settings") { const parent=elements[0]?.parentId; if(parent)canvas.select([parent]);else canvas.clear(); return; }
  if (action === "layout-previous" || action === "layout-next") {
    const item=elements.length===1?elements[0]:undefined;
    const layout=item?parentLayout(slide,item):undefined;
    if(item?.parentId&&layout&&!item.groupId){
      const siblings=slide.elements.filter(e=>e.parentId===item.parentId&&isManaged(slide,e));
      const step=action==="layout-previous"?-1:1,target=siblings[siblings.indexOf(item)+step];
      if(target)store.update(p=>reorderFrameChild(p,slide.id,item.id,(layout.direction==="row"?target.x+target.width/2:target.y+target.height/2)+step*.01));
    }else store.update(project => stepLayoutOrder(project, slide.id, ids, action === "layout-previous" ? -1 : 1));
    return;
  }
  if (action === "layout-absolute" || action === "layout-flow") {
    const selected = new Set(ids);
    const groups = new Set(elements.map(e => e.groupId).filter(Boolean));
    const patches = Object.fromEntries(slide.elements.filter(e => selected.has(e.id) || (e.groupId && groups.has(e.groupId)))
      .map(e => [e.id, { layoutPosition: action === "layout-absolute" ? "absolute" as const : "flow" as const }]));
    store.update(project => updateElements(project, patches));
    return;
  }
  if (action === "delete") {
    canvas.clear();
    store.update(project => rootSelection(slide,ids).reduce((doc, id) => deleteElement(doc, id), project));
    return;
  }
  if (action === "duplicate") {
    let copies: string[] = [];
    store.update(project => {
      const result = duplicateElements(project, slide.id, ids);
      copies = result.ids;
      return result.project;
    });
    canvas.select(copies);
    return;
  }
  if (action === "group") {
    if (ids.length<2||new Set(elements.map(e=>e.parentId)).size>1) return;
    store.update(project => groupElements(project, slide.id, ids));
    return;
  }
  if (action === "ungroup") {
    store.update(project => ungroupElements(project, slide.id, ids));
    return;
  }
  if (action === "front" || action === "back") {
    store.update(project => reorderElements(project, slide.id, ids, action));
    return;
  }
  if (action.startsWith("align-") && elements.length > 1 && !elements.some(e => isFlowElement(slide,e))) {
    const bounds = unionBounds(elements);
    const patches: Record<string, Partial<SlideElement>> = {};
    for (const e of elements) {
      if (action === "align-left") patches[e.id] = { x: bounds.x };
      if (action === "align-center-x") patches[e.id] = { x: bounds.x + (bounds.width - e.width) / 2 };
      if (action === "align-right") patches[e.id] = { x: bounds.x + bounds.width - e.width };
      if (action === "align-top") patches[e.id] = { y: bounds.y };
      if (action === "align-center-y") patches[e.id] = { y: bounds.y + (bounds.height - e.height) / 2 };
      if (action === "align-bottom") patches[e.id] = { y: bounds.y + bounds.height - e.height };
    }
    store.update(project => updateElements(project, patches));
  }
}

function applyProperty(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const key = input.dataset.field!;
  const { slide, element } = selected();
  if (!slide) return;
  const numeric = ["x","y","width","height","rotation","opacity","fontSize","fontWeight",
    "borderRadius","lineHeight","viewportWidth","viewportHeight","animationDelay","animationDuration","transitionDuration"];
  let value: string | number = input.value;
  if (numeric.includes(key)) {
    value = Number(value);
    if (!Number.isFinite(value)) { render(); return; }
    if (["width","height"].includes(key)) value = Math.max(1, value);
    if (key === "viewportWidth") value = Math.max(320, Math.min(2400, Math.round(value)));
    if (key === "viewportHeight") value = Math.max(180, Math.min(1600, Math.round(value)));
    if (key === "lineHeight") value = Math.max(0.5, Math.min(5, value));
    if (key === "opacity") value = Math.max(0, Math.min(1, value));
    if (["animationDelay","animationDuration","transitionDuration"].includes(key))
      value = Math.max(0, value);
  }
  try {
    if(element?.type==="frame"&&key==="clipContent"){store.update(p=>updateElement(p,element.id,{clipContent:(input as HTMLInputElement).checked}));return;}
    if(element?.type==="frame"&&key==="frameOpacity"){store.update(p=>updateElement(p,element.id,{opacity:Math.max(0,Math.min(1,Number(value)/100))}));return;}
    if (key.startsWith("layout")) {
      store.update(project => {
        const target = element?.type==="frame"?project.slides.find(s=>s.id===slide.id)!.elements.find(e=>e.id===element.id) as FrameElement:project.slides.find(s => s.id === slide.id)!;
        if (key === "layoutDirection") {
          target.layout = value === "free" ? undefined : { ...defaultSlideLayout, ...target.layout, direction: value as AutoLayout["direction"] };
        } else if (target.layout) {
          const l=target.layout;
          if(key==="layoutGapMode"){
            if(value==="auto"&&l.justify!=="space-between"){l.packedJustify=l.justify;l.justify="space-between";}
            else if(value==="packed"&&l.justify==="space-between")l.justify=l.packedJustify??"start";
          }else if(key==="layoutGridColumns"){l.gridColumns=Math.max(1,Math.min(50,Math.round(Number(value)||1)));}
          else if(["layoutGap","layoutCrossGap","layoutPaddingX","layoutPaddingY","layoutPaddingTop","layoutPaddingRight","layoutPaddingBottom","layoutPaddingLeft"].includes(key)){
            const n=Number(value);if(!Number.isFinite(n))return project;
            const name=key.slice(6);const prop=(name[0]!.toLowerCase()+name.slice(1)) as "gap"|"crossGap"|"paddingX"|"paddingY"|"paddingTop"|"paddingRight"|"paddingBottom"|"paddingLeft";
            l[prop]=Math.max(0,Math.min(10000,n));
          } else if (key === "layoutAlign") target.layout.align = value as AutoLayout["align"];
          else if (key === "layoutJustify") target.layout.justify = value as AutoLayout["justify"];
        }
        return project;
      });
      return;
    }
    if (!element) {
      store.update(project => {
        const next = structuredClone(project);
        const target = next.slides.find(s => s.id === slide.id)!;
        if (key === "viewportWidth") next.viewport.width = Number(value);
        else if (key === "viewportHeight") next.viewport.height = Number(value);
        else if (key === "name") target.name = String(value);
        else if (key === "background") target.background = String(value);
        else if (key === "notes") target.notes = String(value);
        else if (key === "transition") target.transition = { ...target.transition, type: value as "none"|"fade"|"slide"|"zoom"|"morph" };
        else if (key === "transitionDuration") target.transition = { type: target.transition?.type ?? "fade", duration: Number(value) };
        return next;
      });
    } else {
      const patch = key==="width"?{width:value,sizingX:"fixed"}:key==="height"?{height:value,sizingY:"fixed"}:key === "animation" ? {
        animation: { type: value, duration: element.animation?.duration ?? 600, delay: element.animation?.delay ?? 0 }
      } : key === "animationDelay" ? {
        animation: { type: element.animation?.type ?? "fade", duration: element.animation?.duration ?? 600, delay: Number(value) }
      } : key === "animationDuration" ? {
        animation: { type: element.animation?.type ?? "fade", duration: Number(value), delay: element.animation?.delay ?? 0 }
      } : key === "morphId" ? { morphId: String(value).trim() || undefined } : { [key]: value };
      if(element.type==="text"&&["text","fontFamily","fontSize","fontStyle","fontWeight","sizingX","sizingY"].includes(key)){
        const next={...element,...patch} as TextElement;
        store.update(project=>updateElement(project,element.id,{...patch,textAdvances:captureTextAdvances(next)} as Partial<SlideElement>));
      }else store.update(project => updateElement(project, element.id, patch as Partial<SlideElement>));
    }
  } catch (error) { alert(error instanceof Error ? error.message : String(error)); render(); }
}

function add(kind: ElementKind): void {
  if (!slideId) return;
  const element = createElement(kind);
  const chosen=selected().element;
  if(chosen?.type==="frame"){element.parentId=chosen.id;element.x=chosen.x+16;element.y=chosen.y+16;}
  else if(chosen?.parentId){element.parentId=chosen.parentId;element.x=chosen.x;element.y=chosen.y+chosen.height+16;}
  if(element.type==="text"){
    element.sizingX="hug";element.sizingY="hug";
    const parent=selected().slide?.elements.find(e=>e.id===element.parentId);
    if(parent?.type==="frame"&&/^#(?:fff|ffffff)$/i.test(parent.fill??""))element.color="#111111";
    element.textAdvances=captureTextAdvances(element);
    Object.assign(element,fitText(element));
  }
  store.update(project => addElement(project, slideId, element));
  canvas.select([element.id]);
}

function download(name: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openPreview(): void {
  if (!store.value.slides.length) return;
  overlay.hidden = false;
  const host = $("preview-surface");
  const index = store.value.slides.findIndex(s => s.id === slideId);
  player = new PresentationPlayer(host, store.value, index);
  const refresh = () => $("preview-counter").textContent = `${player!.currentIndex + 1} / ${player!.count}`;
  player.subscribe(refresh);
  refresh();
  player.focus();
}
function closePreview(): void {
  if (document.fullscreenElement === overlay) void document.exitFullscreen();
  player?.destroy();
  player = null;
  overlay.hidden = true;
}

document.querySelectorAll<HTMLButtonElement>("[data-layout]").forEach(button =>
  button.addEventListener("click", () => {
    const layout = button.dataset.layout as SlideLayout;
    const slide = createLayoutSlide(layout, store.value.viewport);
    slideId = slide.id; canvas.clear();
    store.update(project => addSlide(project, slide));
    button.closest("details")?.removeAttribute("open");
  }));
$("add-slide").addEventListener("click", () => {
  const slide = createSlide(`Слайд ${store.value.slides.length + 1}`);
  slideId = slide.id; canvas.clear();
  store.update(project => addSlide(project, slide));
});
$("add-text").addEventListener("click", () => add("text"));
$("add-shape").addEventListener("click", () => add("shape"));
$("add-image").addEventListener("click", () => add("image"));
$("add-html").addEventListener("click", () => add("html"));
$("timeline-toggle").addEventListener("click", () => {
  const panel = $("timeline-panel");
  panel.hidden = !panel.hidden;
  $("timeline-toggle").setAttribute("aria-expanded", String(!panel.hidden));
  renderTimeline();
  fit();
});
$("undo").addEventListener("click", () => store.undo());
$("redo").addEventListener("click", () => store.redo());
$<HTMLInputElement>("project-title").addEventListener("change", event => {
  const title = (event.target as HTMLInputElement).value;
  store.update(project => ({ ...project, title }));
});
$("save").addEventListener("click", () => {
  download("presentation.json", serializePresentation(store.value));
});
$<HTMLInputElement>("import-file").addEventListener("change", async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const project = parsePresentation(await file.text());
    slideId = project.slides[0]?.id ?? ""; canvas.clear();
    store.replace(project);
  } catch (error) { alert(`Не удалось открыть проект: ${error instanceof Error ? error.message : String(error)}`); }
  input.value = "";
});
$("preview").addEventListener("click", openPreview);
$("export-pdf").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("export-pdf");
  button.disabled = true;
  const old = button.textContent;
  button.textContent = "PDF...";
  try {
    const response = await fetch("/api/export/pdf", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: store.value }),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(problem.error ?? "Не удалось подготовить PDF. Установите Google Chrome.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = (store.value.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "presentation") + ".pdf";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  } finally { button.disabled = false; button.textContent = old; }
});
$("export-html").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("export-html");
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = "Экспорт...";
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: store.value }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(error.error ?? "Экспорт недоступен. Запустите веб-редактор через npm run dev.");
    }
    const html = await response.blob();
    const url = URL.createObjectURL(html);
    const link = document.createElement("a");
    link.href = url;
    link.download = (store.value.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "presentation") + ".html";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
});

stage.addEventListener("dblclick", event => {
  const node = (event.target as HTMLElement).closest<HTMLElement>(".cp-element.cp-text");
  if (!node?.dataset.elementId || node.isContentEditable) return;
  const id = node.dataset.elementId;
  const source = store.value.slides.flatMap(slide => slide.elements)
    .find(item => item.id === id);
  if (!source || source.type !== "text") return;
  canvas.select([id]);
  const original = source.text;
  node.contentEditable = "true";
  node.spellcheck = true;
  node.style.cursor = "text";
  node.focus();
  let closed = false;
  const finish = (save: boolean) => {
    if (closed) return;
    closed = true;
    const value = node.innerText;
    node.removeAttribute("contenteditable");
    node.style.cursor = "";
    if (!save) { node.textContent = original; return; }
    if (value !== original) {
      try { store.update(project => updateElement(project, id, { text: value,textAdvances:captureTextAdvances({...source,text:value}) })); }
      catch (error) { alert(error instanceof Error ? error.message : String(error)); }
    }
  };
  node.addEventListener("blur", () => finish(true), { once: true });
  node.addEventListener("keydown", key => {
    if (key.key === "Escape") { key.stopPropagation(); finish(false); node.blur(); }
    if (key.key === "Enter" && (key.ctrlKey || key.metaKey)) {
      key.preventDefault();
      finish(true);
      node.blur();
    }
  });
});
$("preview-close").addEventListener("click", closePreview);
$("preview-next").addEventListener("click", () => { void player?.next(); });
$("preview-fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement === overlay) {
    void document.exitFullscreen();
  } else {
    void overlay.requestFullscreen().catch(error =>
      alert("Полноэкранный режим недоступен: " + error.message));
  }
});
document.addEventListener("fullscreenchange", () => {
  $("preview-fullscreen").querySelector("span")!.textContent = document.fullscreenElement === overlay
    ? "Выйти из полного экрана" : "Полный экран";
});

$("preview-back").addEventListener("click", () => { void player?.previous(); });
window.addEventListener("keydown", event => {
  if ($<HTMLDialogElement>("slide-source-dialog").open || (event.target as HTMLElement)?.closest(".studio-context-menu")) return;
  if (event.key === "Escape" && player) { closePreview(); return; }
  const typing = Boolean((event.target as HTMLElement)?.closest("input, textarea, select, .studio-select, .timeline-bar, .timeline-track[data-empty], [role=separator], [contenteditable='true']"));
  if (typing || player) return;
  const command = event.ctrlKey || event.metaKey;
  if(event.isComposing||event.getModifierState("AltGraph"))return;
  const key = shortcutKey(event);
  if (command && key === "s") {
    event.preventDefault();
    if (sync.activeName) void sync.flush();
    else download("presentation.json", serializePresentation(store.value));
  } else if (command && key === "z") {
    event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo();
  } else if (command && key === "y") {
    event.preventDefault(); store.redo();
  } else if (command && key === "a") {
    event.preventDefault(); const {slide,element}=selected();canvas.select(slide?.elements.filter(el=>el.parentId===element?.parentId).map(el=>el.id)??[]);
  } else if(!command&&!event.altKey&&key==="f"){event.preventDefault();frameTool.activate();
  } else if(command&&event.altKey&&key==="g"){event.preventDefault();runAction("frame-selection");
  } else if (event.shiftKey && key === "a" && !command) {
    event.preventDefault(); if(selected().element?.type==="frame")runAction("layout-direction-column");else if(canvas.ids.length){runAction("frame-selection");if(selected().element?.type==="frame")runAction("layout-direction-column");}else runAction("layout-direction-column");
  } else if (command && key === "g" && canvas.ids.length) {
    event.preventDefault(); runAction(event.shiftKey ? "ungroup" : "group");
  } else if (command && key === "d" && canvas.ids.length) {
    event.preventDefault(); runAction("duplicate");
  } else if (event.key === "Escape") {
    if(!frameTool.cancel()){const parent=selected().element?.parentId;if(parent)canvas.select([parent]);else canvas.clear();}
  } else if(event.key==="Enter"&&selected().element?.type==="frame"){
    const children=selected().slide?.elements.filter(e=>e.parentId===selected().element?.id)??[];
    if(children.length){event.preventDefault();canvas.select([children[0]!.id]);}
  } else if ((event.key === "Delete" || event.key === "Backspace") && canvas.ids.length) {
    event.preventDefault(); runAction("delete");
  } else if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key) && canvas.ids.length) {
    event.preventDefault();
    const distance = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
    const dy = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
    const ids = canvas.ids;
    const patches: Record<string, Partial<SlideElement>> = {};
    for (const el of selected().slide?.elements ?? []) {
      if (ids.includes(el.id)) patches[el.id] = { x: el.x + dx, y: el.y + dy };
    }
    const slide = selected().slide;
    const current=selected().element;
    if(slide&&current?.parentId&&isManaged(slide,current)&&ids.length===1){
      const layout=parentLayout(slide,current)!;const axis=layout.direction==="row"?dx:dy;
      const siblings=slide.elements.filter(e=>e.parentId===current.parentId&&isManaged(slide,e));const other=siblings[siblings.indexOf(current)+(axis<0?-1:1)];
      if(axis&&other)store.update(p=>reorderFrameChild(p,slide.id,current.id,(layout.direction==="row"?other.x+other.width/2:other.y+other.height/2)+(axis<0?-.01:.01)));
    } else if (slide?.layout && slide.elements.some(e => ids.includes(e.id) && isFlowElement(slide,e))) {
      const axis = slide.layout.direction === "row" ? dx : dy;
      if (axis) store.update(project => stepLayoutOrder(project, slide.id, ids, axis < 0 ? -1 : 1));
    } else store.update(project => updateElements(project, patches));
  }
});

const frameTool=initFrameTool(stage,()=>scale,makeFrame);
const sourceEditor=initSlideSource({
  current:selected,
  apply:project=>{canvas.clear();store.replace(project);}
});
$("slide-source").addEventListener("click",()=>sourceEditor.open());
const contextMenu=createContextMenu(inspectorIcon,runAction);
function openObjectMenu(x:number,y:number){
  const {slide}=selected();if(!slide)return;
  const elements=slide.elements.filter(e=>canvas.ids.includes(e.id));
  const grouped=elements.some(e=>e.groupId);
  const flow=elements.some(e=>isManaged(slide,e));
  const groups:MenuItem[][]=[];
  if(elements.length){
    groups.push([
      {action:"frame-selection",label:"Frame из выделения",icon:"free",shortcut:"Ctrl+Alt+G"},
      {action:"group",label:"Сгруппировать",icon:"group",shortcut:"Ctrl+G",disabled:elements.length<2},
      {action:"ungroup",label:"Разгруппировать",icon:"group",shortcut:"Ctrl+Shift+G",disabled:!grouped},
      {action:"duplicate",label:"Дублировать",icon:"copy",shortcut:"Ctrl+D"},
    ],[
      {action:"front",label:"На передний план",icon:"layers"},
      {action:"back",label:"На задний план",icon:"layers"},
    ]);
    if(elements.every(e=>parentLayout(slide,e)))groups.push([
      {action:flow?"layout-absolute":"layout-flow",label:flow?"Абсолютная позиция":"Вернуть в Auto Layout",icon:"absolute"},
      ...(flow?[{action:"layout-previous",label:"Переместить раньше",icon:"left"},{action:"layout-next",label:"Переместить позже",icon:"right"}]:[]),
      {action:"layout-settings",label:"Настройки Auto Layout",icon:"column"},
    ]);
  }else groups.push([{action:"layout-direction-column",label:"Auto Layout · вертикально",icon:"column",shortcut:"Shift+A"},
    {action:"layout-direction-row",label:"Auto Layout · горизонтально",icon:"row"}]);
  groups.push([{action:"source-code",label:"Код слайда",icon:"code"}]);
  if(elements.length)groups.push([{action:"delete",label:"Удалить",icon:"trash",shortcut:"Del",danger:true}]);
  contextMenu.open(x,y,groups);
}
shell.addEventListener("contextmenu",event=>{
  if((event.target as HTMLElement).closest("[contenteditable=true]"))return;
  event.preventDefault();
  const {slide}=selected();
  const id=(event.target as HTMLElement).closest<HTMLElement>(".cp-element")?.dataset.elementId;
  if(id&&!canvas.ids.includes(id)){
    const element=slide?.elements.find(e=>e.id===id);
    canvas.select(element?.groupId?slide!.elements.filter(e=>e.groupId===element.groupId).map(e=>e.id):[id]);
  }else if(!id&&!((event.target as HTMLElement).closest(".selection-box,.selection-multi-mark")))canvas.clear();
  openObjectMenu(event.clientX,event.clientY);
});
$("inspector-more").addEventListener("click",event=>{
  const box=(event.currentTarget as HTMLElement).getBoundingClientRect();openObjectMenu(box.right-236,box.bottom+6);
});

store.subscribe(() => {
  render();
  if (applyingRemote) return;
  if (sync.activeName) sync.edited();
  else {
    try { localStorage.setItem(localDraftKey, serializePresentation(store.value)); }
    catch { /* Users can still download their JSON document manually */ }
  }
});
new ResizeObserver(fit).observe(shell);
render();
