import {
  PresentationPlayer, PresentationStore, addElement, addSlide, createElement, createSlide,
  createSlideNode, deleteElement, deleteSlide, duplicateSlide, duplicateElements,
  groupElements, ungroupElements, reorderElements, updateElements,
  parsePresentation, serializePresentation, updateElement,
} from "../src";
import type { ElementKind, Presentation, Slide, SlideElement } from "../src";
import { demoPresentation } from "../src/demo";
import { CanvasInteractions } from "./canvas-interactions";
import { unionBounds } from "../src/editor/geometry";
import { ProjectSync } from "./project-sync";
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
let scale = 1;
let player: PresentationPlayer | null = null;
let applyingRemote = false;
const canvas = new CanvasInteractions(stage, {
  project: () => store.value,
  slideId: () => slideId,
  scale: () => scale,
  commit: patches => store.update(project => updateElements(project, patches)),
  selectionChanged: () => { renderProperties(); renderTimeline(); },
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
  canApplyRemote: () => !document.hidden &&
    !document.activeElement?.matches("input,textarea,select,[contenteditable='true']"),
  onState: state => {
    const indicator = $("sync-status");
    indicator.textContent = state.message;
    indicator.dataset.state = state.status;
    $("sync-remote").hidden = $("sync-copy").hidden = state.status !== "conflict";
    picker.value = state.name ?? "";
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
        store.load(demoPresentation);
      } finally { applyingRemote = false; }
    } else {
      await sync.open(picker.value);
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  } finally { picker.value = sync.activeName ?? ""; }
});

$("new-project").addEventListener("click", () => dialog.showModal());
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
window.setInterval(() => { void refreshProjects(); }, 5000);
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
    row.addEventListener("click", () => { slideId = slide.id; canvas.clear(); render(); });
    list.append(row);
  });
  stage.replaceChildren();
  stage.style.width = project.viewport.width + "px";
  stage.style.height = project.viewport.height + "px";
  const current = project.slides.find(s => s.id === slideId);
  if (current) stage.append(createSlideNode(current, project));
  stage.querySelectorAll("iframe").forEach(iframe => iframe.style.pointerEvents = "none");
  fit();
  canvas.refresh();
  renderProperties();
  renderTimeline();
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
  if (canvas.ids.length > 1) {
    const elements = slide.elements.filter(e => canvas.ids.includes(e.id));
    const groups = new Set(elements.map(e => e.groupId));
    const alreadyGrouped = groups.size === 1 && Boolean(elements[0]?.groupId);
    props.innerHTML = `<div class="property-title">Выделено: ${elements.length}</div>
      <div class="property-help">Shift + щелчок или выделение рамкой · Ctrl+G для группы</div>
      <div class="property-section">ВЫРАВНИВАНИЕ</div>
      <div class="align-grid">
        <button data-action="align-left" title="По левому краю">⇤ Слева</button>
        <button data-action="align-center-x" title="По центру горизонтально">↔ Центр</button>
        <button data-action="align-right" title="По правому краю">Справа ⇥</button>
        <button data-action="align-top" title="По верхнему краю">⇡ Сверху</button>
        <button data-action="align-center-y" title="По центру вертикально">↕ Центр</button>
        <button data-action="align-bottom" title="По нижнему краю">Снизу ⇣</button>
      </div>
      <div class="property-section">КОМПОНОВКА</div>
      <div class="inspector-actions">
        <button data-action="${alreadyGrouped ? "ungroup" : "group"}">${alreadyGrouped ? "Разгруппировать" : "Сгруппировать · Ctrl+G"}</button>
        <button data-action="front">На передний план</button>
        <button data-action="back">На задний план</button>
        <button data-action="duplicate">Дублировать · Ctrl+D</button>
        <button class="danger" data-action="delete">Удалить выбранное</button>
      </div>`;
    bindActions();
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
      <div class="property-section">КОМПОНОВКА</div>
      <div class="inspector-actions">
        ${element.groupId ? '<button data-action="ungroup">Разгруппировать</button>' : ""}
        <button data-action="front">На передний план</button>
        <button data-action="back">На задний план</button>
        <button data-action="duplicate">Дублировать · Ctrl+D</button>
        <button class="danger" data-action="delete">Удалить элемент</button>
      </div>`;
    bindActions();
  }
  props.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-field]")
    .forEach(input => input.addEventListener("change", () => applyProperty(input)));
}

function renderTimeline(): void {
  const timeline = $("timeline-rows");
  const slide = selected().slide;
  timeline.replaceChildren();
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
    row.innerHTML = `
      <button type="button" class="timeline-object" title="${escape(element.id)}">${escape(
        element.type === "text" ? element.text.slice(0, 25) : element.type.toUpperCase())}</button>
      <div class="timeline-track">${active
        ? `<div class="timeline-bar" style="left:${Math.min(100, delay / 25)}%;width:${Math.min(100, duration / 25)}%" title="${escape(element.animation?.type)} · ${delay}–${delay + duration} мс"></div>`
        : '<span class="timeline-none">Без анимации</span>'}</div>
      <input type="number" class="timeline-number" data-timeline="delay" min="0" max="10000" step="50" aria-label="Задержка анимации" value="${delay}" title="Задержка, мс">
      <input type="number" class="timeline-number" data-timeline="duration" min="0" max="10000" step="50" aria-label="Длительность анимации" value="${duration}" title="Длительность, мс">`;
    row.querySelector(".timeline-object")!.addEventListener("click", () => canvas.select([element.id]));
    row.querySelectorAll<HTMLInputElement>("input").forEach(input => input.addEventListener("change", () => {
      const value = Math.max(0, Math.min(10000, Number(input.value) || 0));
      const animation = element.animation ?? { type: "fade" as const, duration: 600, delay: 0 };
      const patch = { animation: { ...animation, [input.dataset.timeline!]: value } };
      store.update(project => updateElement(project, element.id, patch));
    }));
    timeline.append(row);
  }
}

function bindActions(): void {
  props.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button =>
    button.addEventListener("click", () => runAction(button.dataset.action!)));
}

function runAction(action: string): void {
  const { slide } = selected();
  if (!slide || !canvas.ids.length) return;
  const ids = canvas.ids;
  const elements = slide.elements.filter(e => ids.includes(e.id));
  if (action === "delete") {
    canvas.clear();
    store.update(project => ids.reduce((doc, id) => deleteElement(doc, id), project));
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
  if (action.startsWith("align-") && elements.length > 1) {
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
  player?.destroy();
  player = null;
  overlay.hidden = true;
}

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
$("preview-close").addEventListener("click", closePreview);
$("preview-next").addEventListener("click", () => { void player?.next(); });
$("preview-back").addEventListener("click", () => { void player?.previous(); });
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && player) { closePreview(); return; }
  const typing = Boolean((event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable='true']"));
  if (typing || player) return;
  const command = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (command && key === "s") {
    event.preventDefault();
    if (sync.activeName) void sync.flush();
    else download("presentation.json", serializePresentation(store.value));
  } else if (command && key === "z") {
    event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo();
  } else if (command && key === "y") {
    event.preventDefault(); store.redo();
  } else if (command && key === "a") {
    event.preventDefault(); canvas.select(selected().slide?.elements.map(el => el.id) ?? []);
  } else if (command && key === "g" && canvas.ids.length) {
    event.preventDefault(); runAction(event.shiftKey ? "ungroup" : "group");
  } else if (command && key === "d" && canvas.ids.length) {
    event.preventDefault(); runAction("duplicate");
  } else if (event.key === "Escape") {
    canvas.clear();
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
    store.update(project => updateElements(project, patches));
  }
});
store.subscribe(() => {
  render();
  if (!applyingRemote) sync.edited();
});
new ResizeObserver(fit).observe(shell);
render();
