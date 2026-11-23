import {
  PresentationPlayer, PresentationStore, addElement, addSlide, createElement, createSlide,
  createSlideNode, deleteElement, deleteSlide, duplicateSlide,
  parsePresentation, serializePresentation, updateElement,
} from "../src";
import type { ElementKind, Presentation, Slide, SlideElement } from "../src";
import { demoPresentation } from "../src/demo";
import "./style.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing UI element: ${id}`);
  return found as T;
};
const escape = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const store = new PresentationStore(demoPresentation);
const stage = $<HTMLDivElement>("editor-stage");
const shell = $<HTMLDivElement>("stage-shell");
const props = $<HTMLDivElement>("properties");
const overlay = $<HTMLDivElement>("preview-overlay");
let slideId = demoPresentation.slides[0]!.id;
let selectedId: string | null = null;
let scale = 1;
let player: PresentationPlayer | null = null;

function selected(): { project: Presentation; slide?: Slide; element?: SlideElement } {
  const project = store.value;
  const slide = project.slides.find(s => s.id === slideId);
  return { project, slide, element: slide?.elements.find(e => e.id === selectedId) };
}

function render(): void {
  const project = store.value;
  if (!project.slides.some(s => s.id === slideId)) slideId = project.slides[0]?.id ?? "";
  if (!project.slides.find(s => s.id === slideId)?.elements.some(e => e.id === selectedId))
    selectedId = null;
  $<HTMLInputElement>("project-title").value = project.title;
  $("slide-counter").textContent = `Слайд ${Math.max(0, project.slides.findIndex(s => s.id === slideId) + 1)} из ${project.slides.length}`;
  $<HTMLButtonElement>("undo").disabled = !store.canUndo;
  $<HTMLButtonElement>("redo").disabled = !store.canRedo;
  const list = $("slide-list");
  list.replaceChildren();
  project.slides.forEach((slide, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "slide-row" + (slide.id === slideId ? " active" : "");
    row.innerHTML = `<span class="slide-number">${String(index + 1).padStart(2,"0")}</span>
      <span class="slide-thumb" style="background:${escape(slide.background)}"><span>${escape(slide.name)}</span></span>
      <span class="slide-title">${escape(slide.name)}</span>`;
    row.addEventListener("click", () => { slideId = slide.id; selectedId = null; render(); });
    list.append(row);
  });
  stage.replaceChildren();
  stage.style.width = project.viewport.width + "px";
  stage.style.height = project.viewport.height + "px";
  const current = project.slides.find(s => s.id === slideId);
  if (current) stage.append(createSlideNode(current, project));
  stage.querySelectorAll("iframe").forEach(iframe => iframe.style.pointerEvents = "none");
  highlight();
  fit();
  renderProperties();
}

function fit(): void {
  const { width, height } = store.value.viewport;
  scale = Math.min((shell.clientWidth - 76) / width, (shell.clientHeight - 76) / height);
  if (!Number.isFinite(scale) || scale <= 0) return;
  const x = (shell.clientWidth - width * scale) / 2;
  const y = (shell.clientHeight - height * scale) / 2;
  stage.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  $("zoom").textContent = `Масштаб ${Math.round(scale * 100)}%`;
}

function highlight(): void {
  stage.querySelectorAll<HTMLElement>(".cp-element").forEach(node =>
    node.classList.toggle("chosen", node.dataset.elementId === selectedId));
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

function renderProperties(): void {
  const { slide, element } = selected();
  if (!slide) {
    props.innerHTML = '<div class="empty-note">Добавьте первый слайд.</div>';
    return;
  }
  if (!element) {
    props.innerHTML = `<div class="property-title">Слайд</div><div class="property-help">Выберите элемент на холсте, чтобы настроить его.</div>
      ${field("Название","name",slide.name)}
      ${field("Фон (CSS)","background",slide.background)}
      ${pick("Переход","transition",slide.transition?.type ?? "fade",["none","fade","slide","zoom"])}
      ${field("Длительность, мс","transitionDuration",slide.transition?.duration ?? 450,"number")}
      <div class="inspector-actions"><button id="duplicate-slide">Дублировать слайд</button><button class="danger" id="delete-slide">Удалить слайд</button></div>`;
    $("duplicate-slide").addEventListener("click", () => store.update(project => duplicateSlide(project, slide.id)));
    $("delete-slide").addEventListener("click", () => store.update(project => deleteSlide(project, slide.id)));
  } else {
    props.innerHTML = `<div class="property-title">${escape(element.type.toUpperCase())}</div>
      <div class="property-help">ID: ${escape(element.id)}</div>
      <div class="field-grid">
        ${field("X","x",element.x,"number")}${field("Y","y",element.y,"number")}
        ${field("Ширина","width",element.width,"number")}${field("Высота","height",element.height,"number")}
        ${field("Поворот","rotation",element.rotation ?? 0,"number")}
        ${field("Прозрачность","opacity",element.opacity ?? 1,"number")}
      </div>
      ${element.type === "text" ? `
        ${area("Текст","text",element.text)}
        ${field("Размер шрифта","fontSize",element.fontSize ?? 56,"number")}
        ${field("Цвет","color",element.color ?? "#fff")}
        ${field("Насыщенность","fontWeight",element.fontWeight ?? 500,"number")}
        ${pick("Выравнивание","align",element.align ?? "left",["left","center","right"])}` : ""}
      ${element.type === "shape" ? `
        ${field("Заливка (CSS)","fill",element.fill)}
        ${field("Скругление","borderRadius",element.borderRadius ?? 0,"number")}` : ""}
      ${element.type === "image" ? `
        ${field("URL изображения","src",element.src)}
        ${field("Подпись","alt",element.alt)}
        ${pick("Вписывание","fit",element.fit ?? "cover",["cover","contain","fill"])}` : ""}
      ${element.type === "html" ? `
        <div class="code-tip">Встроенный HTML/CSS/JS изолирован в iframe. Код не запускается в редакторе.</div>
        ${area("HTML","html",element.html)}
        ${area("CSS","css",element.css)}
        ${area("JavaScript","javascript",element.javascript)}` : ""}
      ${pick("Анимация","animation",element.animation?.type ?? "none",["none","fade","slide-up","zoom"])}
      ${field("Задержка, мс","animationDelay",element.animation?.delay ?? 0,"number")}
      ${field("Длительность, мс","animationDuration",element.animation?.duration ?? 600,"number")}
      <div class="inspector-actions"><button class="danger" id="delete-element">Удалить элемент</button></div>`;
    $("delete-element").addEventListener("click", () => {
      selectedId = null;
      store.update(project => deleteElement(project, element.id));
    });
  }
  props.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-field]")
    .forEach(input => input.addEventListener("change", () => applyProperty(input)));
}

function applyProperty(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const key = input.dataset.field!;
  const { slide, element } = selected();
  if (!slide) return;
  const numeric = ["x","y","width","height","rotation","opacity","fontSize","fontWeight",
    "borderRadius","animationDelay","animationDuration","transitionDuration"];
  let value: string | number = input.value;
  if (numeric.includes(key)) {
    value = Number(value);
    if (!Number.isFinite(value)) { render(); return; }
    if (["width","height"].includes(key)) value = Math.max(1, value);
    if (key === "opacity") value = Math.max(0, Math.min(1, value));
    if (["animationDelay","animationDuration","transitionDuration"].includes(key))
      value = Math.max(0, value);
  }
  try {
    if (!element) {
      store.update(project => {
        const next = structuredClone(project);
        const target = next.slides.find(s => s.id === slide.id)!;
        if (key === "name") target.name = String(value);
        else if (key === "background") target.background = String(value);
        else if (key === "transition") target.transition = { ...target.transition, type: value as "none"|"fade"|"slide"|"zoom" };
        else if (key === "transitionDuration") target.transition = { type: target.transition?.type ?? "fade", duration: Number(value) };
        return next;
      });
    } else {
      const patch = key === "animation" ? {
        animation: { type: value, duration: element.animation?.duration ?? 600, delay: element.animation?.delay ?? 0 }
      } : key === "animationDelay" ? {
        animation: { type: element.animation?.type ?? "fade", duration: element.animation?.duration ?? 600, delay: Number(value) }
      } : key === "animationDuration" ? {
        animation: { type: element.animation?.type ?? "fade", duration: Number(value), delay: element.animation?.delay ?? 0 }
      } : { [key]: value };
      store.update(project => updateElement(project, element.id, patch as Partial<SlideElement>));
    }
  } catch (error) { alert(error instanceof Error ? error.message : String(error)); render(); }
}

function add(kind: ElementKind): void {
  if (!slideId) return;
  const element = createElement(kind);
  selectedId = element.id;
  store.update(project => addElement(project, slideId, element));
}

stage.addEventListener("pointerdown", event => {
  const node = (event.target as HTMLElement).closest<HTMLElement>("[data-element-id]");
  if (!node || !node.dataset.elementId) {
    selectedId = null; highlight(); renderProperties(); return;
  }
  selectedId = node.dataset.elementId;
  highlight();
  renderProperties();
  if (event.button !== 0) return;
  const { element } = selected();
  if (!element) return;
  const origin = { x: element.x, y: element.y, px: event.clientX, py: event.clientY };
  let changed = false;
  node.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) => {
    const dx = (e.clientX - origin.px) / scale;
    const dy = (e.clientY - origin.py) / scale;
    changed ||= Math.abs(dx) > 1 || Math.abs(dy) > 1;
    node.style.left = Math.round(origin.x + dx) + "px";
    node.style.top = Math.round(origin.y + dy) + "px";
  };
  const finish = (e: PointerEvent) => {
    node.removeEventListener("pointermove", move);
    node.removeEventListener("pointerup", finish);
    node.removeEventListener("pointercancel", cancel);
    if (!changed) return;
    const x = Math.round(origin.x + (e.clientX - origin.px) / scale);
    const y = Math.round(origin.y + (e.clientY - origin.py) / scale);
    store.update(project => updateElement(project, element.id, { x, y }));
  };
  const cancel = () => { node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", finish); render(); };
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", finish);
  node.addEventListener("pointercancel", cancel, { once: true });
});

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
  player?.destroy();
  player = null;
  overlay.hidden = true;
}

$("add-slide").addEventListener("click", () => {
  const slide = createSlide(`Слайд ${store.value.slides.length + 1}`);
  slideId = slide.id; selectedId = null;
  store.update(project => addSlide(project, slide));
});
$("add-text").addEventListener("click", () => add("text"));
$("add-shape").addEventListener("click", () => add("shape"));
$("add-image").addEventListener("click", () => add("image"));
$("add-html").addEventListener("click", () => add("html"));
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
    slideId = project.slides[0]?.id ?? ""; selectedId = null;
    store.replace(project);
  } catch (error) { alert(`Не удалось открыть проект: ${error instanceof Error ? error.message : String(error)}`); }
  input.value = "";
});
$("preview").addEventListener("click", openPreview);
$("preview-close").addEventListener("click", closePreview);
$("preview-next").addEventListener("click", () => { void player?.next(); });
$("preview-back").addEventListener("click", () => { void player?.previous(); });
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && player) { closePreview(); return; }
  const typing = /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName ?? "");
  if (typing || player) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault(); download("presentation.json", serializePresentation(store.value));
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo();
  } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
    const id = selectedId; selectedId = null;
    store.update(project => deleteElement(project, id));
  }
});
store.subscribe(render);
new ResizeObserver(fit).observe(shell);
render();
