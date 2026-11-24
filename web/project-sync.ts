import type { Presentation } from "../src/core/types";
import { validatePresentation } from "../src/core/validation";

export interface RemoteProject {
  name: string;
  project: Presentation;
  revision: string;
}
export interface RemoteSummary {
  name: string;
  title: string;
  revision: string;
  slides: number;
}
export type SyncStatus = "local" | "synced" | "dirty" | "saving" | "offline" | "conflict";
export interface SyncState {
  status: SyncStatus;
  name: string | null;
  message: string;
}
export interface SyncHooks {
  current(): Presentation;
  load(project: Presentation): void;
  onState(state: SyncState): void;
  canApplyRemote(): boolean;
}
class RemoteError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
type Draft = { revision: string; project: Presentation };
const safeName = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const key = (name: string) => "core-presentation:draft:" + name;
const same = (a: Presentation, b: Presentation) => JSON.stringify(a) === JSON.stringify(b);

async function request<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const res = await fetch("/api/projects" + path, { cache: "no-store", ...options });
  if (res.status === 304) return null;
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new RemoteError(res.status, error.error ?? "Unexpected project API error");
  }
  return await res.json() as T;
}
function draftOf(name: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return null;
    const draft: Draft = JSON.parse(raw) as Draft;
    validatePresentation(draft.project);
    if (typeof draft.revision !== "string") return null;
    return draft;
  } catch { return null; }
}

export class ProjectSync {
  private name: string | null = null;
  private revision: string | null = null;
  private dirty = false;
  private saving = false;
  private busy = false;
  private conflict: RemoteProject | null = null;
  private timer: number | undefined;
  private generation = 0;
  private lastStatus: SyncState = { status: "local", name: null, message: "Локальный пример" };
  constructor(private hooks: SyncHooks) {
    window.setInterval(() => { void this.poll(); }, 1400);
    window.addEventListener("focus", () => { void this.poll(); });
    window.addEventListener("online", () => { void this.poll(); });
    window.addEventListener("beforeunload", event => {
      if (!this.dirty) return;
      event.preventDefault();
    });
  }
  get activeName(): string | null { return this.name; }
  get hasUnsavedChanges(): boolean { return this.dirty; }
  get status(): SyncState { return this.lastStatus; }
  private announce(status: SyncStatus, message: string): void {
    this.lastStatus = { status, name: this.name, message };
    this.hooks.onState(this.lastStatus);
  }
  private saveDraft(): void {
    if (!this.name || !this.revision) return;
    try { localStorage.setItem(key(this.name), JSON.stringify({
      revision: this.revision, project: this.hooks.current(),
    })); } catch { /* local storage may be unavailable; the server remains authoritative */ }
  }
  private clearDraft(name: string): void {
    try { localStorage.removeItem(key(name)); } catch { /* ignore */ }
  }
  private use(record: RemoteProject, apply = true): void {
    this.generation += 1;
    this.name = record.name;
    this.revision = record.revision;
    this.conflict = null;
    this.dirty = false;
    this.saving = false;
    window.clearTimeout(this.timer);
    if (apply) this.hooks.load(record.project);
    this.announce("synced", "Синхронизировано");
  }

  async list(): Promise<RemoteSummary[]> {
    const data = await request<{ projects: RemoteSummary[] }>("");
    return data?.projects ?? [];
  }
  async create(name: string, title: string): Promise<void> {
    if (!safeName.test(name)) throw new Error("Имя проекта: латинские буквы, цифры, - и _");
    if (!title.trim()) throw new Error("Укажите название презентации");
    if (!await this.readyToSwitch()) throw new Error("Сохраните конфликтующие изменения перед сменой проекта");
    const data = await request<RemoteProject>("", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, title }),
    });
    if (!data) throw new Error("Не удалось создать проект");
    this.clearDraft(name);
    this.use(data);
  }
  async open(name: string): Promise<void> {
    if (!safeName.test(name)) throw new Error("Некорректное имя проекта");
    if (name === this.name) return;
    if (!await this.readyToSwitch()) throw new Error("Сохраните конфликтующие изменения перед сменой проекта");
    const data = await request<RemoteProject>("/" + name);
    if (!data) throw new Error("Проект не найден");
    const draft = draftOf(name);
    this.use(data, false);
    if (draft && !same(draft.project, data.project)) {
      this.dirty = true;
      this.hooks.load(draft.project);
      if (draft.revision !== data.revision) {
        this.conflict = data;
        this.announce("conflict", "Есть несохранённые изменения и более новая версия");
      } else {
        this.announce("dirty", "Восстановлен черновик");
        this.schedule();
      }
    } else {
      this.clearDraft(name);
      this.hooks.load(data.project);
    }
  }
  private async readyToSwitch(): Promise<boolean> {
    if (this.dirty && !this.conflict) await this.flush();
    return !this.dirty && !this.saving;
  }
  localMode(): void {
    if (this.dirty || this.saving) throw new Error("Сначала сохраните текущий проект");
    this.generation += 1;
    this.name = this.revision = null;
    this.conflict = null;
    this.announce("local", "Локальный пример");
  }
  edited(): void {
    if (!this.name || !this.revision) return;
    this.dirty = true;
    this.saveDraft();
    if (this.conflict) {
      this.announce("conflict", "Конфликт изменений — выберите, как продолжить");
      return;
    }
    this.announce("dirty", "Есть несохранённые изменения");
    this.schedule();
  }
  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.flush(); }, 450);
  }
  async flush(): Promise<boolean> {
    if (!this.name || !this.revision) return true;
    if (this.conflict || this.saving) return false;
    if (!this.dirty) return true;
    const snapshot = this.hooks.current();
    const name = this.name, revision = this.revision, generation = this.generation;
    this.saving = true;
    this.announce("saving", "Сохранение...");
    try {
      const result = await request<RemoteProject>("/" + name, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: snapshot, expectedRevision: revision }),
      });
      if (!result || this.generation !== generation) return false;
      this.revision = result.revision;
      if (same(this.hooks.current(), snapshot)) {
        this.dirty = false;
        this.clearDraft(name);
        this.announce("synced", "Синхронизировано");
      } else {
        this.dirty = true;
        this.saveDraft();
        this.announce("dirty", "Сохранение следующих изменений...");
      }
      return !this.dirty;
    } catch (error) {
      if (error instanceof RemoteError && error.status === 409) {
        this.conflict = await request<RemoteProject>("/" + name).catch(() => null);
        this.announce("conflict", "Изменения агента и редактора конфликтуют");
      } else {
        this.announce("offline", "Нет соединения — локальный черновик сохранён");
      }
      return false;
    } finally {
      this.saving = false;
      if (this.dirty && !this.conflict && this.generation === generation) this.schedule();
    }
  }
  async poll(): Promise<void> {
    if (!this.name || !this.revision || this.busy || this.saving || this.conflict ||
        !this.hooks.canApplyRemote()) return;
    this.busy = true;
    const name = this.name, generation = this.generation;
    try {
      const incoming = await request<RemoteProject>("/" + name, {
        headers: { "If-None-Match": '"' + this.revision + '"' },
      });
      if (!incoming || this.generation !== generation) return;
      if (!this.hooks.canApplyRemote() && !this.dirty) return;
      if (this.dirty) {
        this.conflict = incoming;
        this.announce("conflict", "Проект изменён агентом — обнаружен конфликт");
      } else {
        this.use(incoming);
      }
    } catch {
      if (this.dirty) {
        this.announce("offline", "Соединение потеряно — черновик сохранён");
        this.schedule();
      } else {
        this.announce("offline", "Нет соединения с локальным сервером");
      }
    } finally { this.busy = false; }
  }
  async loadServerVersion(): Promise<void> {
    if (!this.name) return;
    const previous = this.name;
    const latest = await request<RemoteProject>("/" + previous);
    if (!latest) throw new Error("Версия сервера не найдена");
    this.clearDraft(previous);
    this.use(latest);
  }
  async saveConflictCopy(newName: string): Promise<void> {
    if (!this.name || !this.conflict) throw new Error("Нет активного конфликта");
    if (!safeName.test(newName) || newName === this.name)
      throw new Error("Укажите другое имя из латинских букв, цифр, - или _");
    const oldName = this.name, snapshot = this.hooks.current();
    const created = await request<RemoteProject>("", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, title: snapshot.title + " (копия)" }),
    });
    if (!created) throw new Error("Не удалось создать копию");
    const saved = await request<RemoteProject>("/" + newName, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: { ...snapshot, id: created.project.id, title: created.project.title }, expectedRevision: created.revision }),
    });
    if (!saved) throw new Error("Не удалось сохранить копию");
    this.clearDraft(oldName);
    this.use(saved);
  }
}
