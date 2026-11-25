import {
  PresentationPlayer, PresentationStore, addElement, addSlide, createElement, createSlide,
  createSlideNode, deleteElement, deleteSlide, duplicateSlide, duplicateElements, moveSlide,
  groupElements, ungroupElements, reorderElements, updateElements,
  parsePresentation, serializePresentation, updateElement,
} from "../src";
import type { ElementKind, Presentation, Slide, SlideElement } from "../src";
import { demoPresentation } from "../src/demo";
import { CanvasInteractions } from "./canvas-interactions";
import { unionBounds } from "../src/editor/geometry";
import { ProjectSync } from "./project-sync";
import { createLayoutSlide } from "../src/editor/layouts";
import type { SlideLayout } from "../src/editor/layouts";
import "./style.css";
import { initTheme } from "./theme";
import { initPanels } from "./panels";
import { enhanceSelects, syncSelect } from "./selects";
import { bindAnimationBar, initTimelineHeight, timelineRange } from "./timeline";

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
  canApplyRemote: () => !document.hidden && !document.documentElement.classList.contains("timeline-dragging") &&
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
      <span class="slide-thumb" style="background:${escape(slide.background)}"><span>${escape(slide.name)}</span></span>
      <span class="slide-title">${escape(slide.name)}</span>`;
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
  if (current) stage.append(createSlideNode(current, project));
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

function renderProperties(): void {
  const { project, slide, element } = selected();
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
      <div class="property-section">Выравнивание</div>
      <div class="align-grid">
        <button data-action="align-left" title="По левому краю">⇤ Слева</button>
        <button data-action="align-center-x" title="По центру горизонтально">↔ Центр</button>
        <button data-action="align-right" title="По правому краю">Справа ⇥</button>
        <button data-action="align-top" title="По верхнему краю">⇡ Сверху</button>
        <button data-action="align-center-y" title="По центру вертикально">↕ Центр</button>
        <button data-action="align-bottom" title="По нижнему краю">Снизу ⇣</button>
      </div>
      <div class="property-section">Компоновка</div>
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
      <div class="property-section">Размер слайда</div>
      <div class="field-grid">
        ${field("Ширина","viewportWidth",project.viewport.width,"number")}
        ${field("Высота","viewportHeight",project.viewport.height,"number")}
      </div>
      ${field("Фон (CSS)","background",slide.background)}
      ${area("Заметки докладчика","notes",slide.notes)}
      ${pick("Переход","transition",slide.transition?.type ?? "fade",["none","fade","slide","zoom","morph"])}
      ${field("Длительность, мс","transitionDuration",slide.transition?.duration ?? 450,"number")}
      <div class="inspector-actions"><button id="duplicate-slide">Дублировать слайд</button><button class="danger" id="delete-slide">Удалить слайд</button></div>`;
    $("duplicate-slide").addEventListener("click", () => store.update(project => duplicateSlide(project, slide.id)));
    $("delete-slide").addEventListener("click", () => store.update(project => deleteSlide(project, slide.id)));
  } else {
    props.innerHTML = `<div class="property-title">${escape(({ text: "Текст", shape: "Фигура", image: "Изображение", html: "HTML / JS" } as const)[element.type])}</div>
      <div class="property-help">ID: ${escape(element.id)}</div>
      <div class="field-grid">
        ${field("X","x",element.x,"number")}${field("Y","y",element.y,"number")}
        ${field("Ширина","width",element.width,"number")}${field("Высота","height",element.height,"number")}
        ${field("Поворот","rotation",element.rotation ?? 0,"number")}
        ${field("Прозрачность","opacity",element.opacity ?? 1,"number")}
      </div>
      ${field("Связь между слайдами (Morph ID)","morphId",element.morphId)}

      ${element.type === "text" ? `
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
      <div class="property-section">Компоновка</div>
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
  enhanceSelects(props);
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
      escape(element.type === "text" ? element.text.slice(0, 25) : ({ shape: "Фигура", image: "Изображение", html: "HTML / JS" } as const)[element.type]) + '</button>' +
      '<div class="timeline-track">' + (active
        ? '<div class="timeline-bar" tabindex="0" role="slider" aria-label="Начало анимации" aria-valuemin="0" aria-valuemax="' + range + '" aria-valuenow="' + delay + '" style="left:' + (delay / range * 100) + '%;width:' + (duration / range * 100) + '%" title="' + escape(element.animation?.type) + ' · ' + delay + '–' + (delay + duration) + ' мс"><span class="timeline-edge start" data-edge="start"></span><span class="timeline-edge end" data-edge="end"></span></div>'
        : '<span class="timeline-none">Без анимации</span>') + '</div>' +
      '<input type="number" class="timeline-number" data-timeline="delay" min="0" max="10000" step="50" aria-label="Задержка анимации" value="' + delay + '">' +
      '<input type="number" class="timeline-number" data-timeline="duration" min="0" max="10000" step="50" aria-label="Длительность анимации" value="' + duration + '">';
    row.querySelector(".timeline-object")!.addEventListener("click", () => canvas.select([element.id]));
    const animation = element.animation ?? { type: "fade" as const, duration: 600, delay: 0 };
    const commit = (delay: number, duration: number) => {
      store.update(project => updateElement(project, element.id, { animation: { ...animation, delay, duration } }));
    };
    row.querySelectorAll<HTMLInputElement>("input").forEach(input => input.addEventListener("change", () => {
      const value = Math.max(0, Math.min(10000, Number(input.value) || 0));
      commit(input.dataset.timeline === "delay" ? value : delay, input.dataset.timeline === "duration" ? value : duration);
    }));
    if (active) bindAnimationBar(row, delay, duration, range, commit);
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
      const patch = key === "animation" ? {
        animation: { type: value, duration: element.animation?.duration ?? 600, delay: element.animation?.delay ?? 0 }
      } : key === "animationDelay" ? {
        animation: { type: element.animation?.type ?? "fade", duration: element.animation?.duration ?? 600, delay: Number(value) }
      } : key === "animationDuration" ? {
        animation: { type: element.animation?.type ?? "fade", duration: Number(value), delay: element.animation?.delay ?? 0 }
      } : key === "morphId" ? { morphId: String(value).trim() || undefined } : { [key]: value };
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
      try { store.update(project => updateElement(project, id, { text: value })); }
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
  if (event.key === "Escape" && player) { closePreview(); return; }
  const typing = Boolean((event.target as HTMLElement)?.closest("input, textarea, select, .studio-select, .timeline-bar, [role=separator], [contenteditable='true']"));
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
  if (applyingRemote) return;
  if (sync.activeName) sync.edited();
  else {
    try { localStorage.setItem(localDraftKey, serializePresentation(store.value)); }
    catch { /* Users can still download their JSON document manually */ }
  }
});
new ResizeObserver(fit).observe(shell);
render();
