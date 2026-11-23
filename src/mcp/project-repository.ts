import { createHash, randomUUID } from "node:crypto";
import { mkdir, lstat, open, readdir, readFile, realpath, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Presentation } from "../core/types";
import { createPresentation } from "../core/document";
import { parsePresentation, serializePresentation } from "../core/validation";

const MAX_PROJECT_BYTES = 5 * 1024 * 1024;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const DEFAULT_PROJECTS_DIR = fileURLToPath(new URL("../../presentations/", import.meta.url));

export interface ProjectRecord { project: Presentation; revision: string; path: string }
export interface ProjectSummary {
  name: string;
  title: string;
  revision: string;
  slides: number;
}

function revisionOf(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

function nameOf(name: string): string {
  if (!NAME.test(name) || name === "." || name === "..") {
    throw new Error("Project name must contain 1–64 ASCII letters, digits, '_' or '-' and start with a letter/digit.");
  }
  return name;
}

/** File-backed projects live under an explicit root, never at arbitrary user-supplied paths. */
export class ProjectRepository {
  readonly root: string;
  private tails = new Map<string, Promise<void>>();

  constructor(root = process.env.CORE_PRESENTATION_PROJECTS_DIR || DEFAULT_PROJECTS_DIR) {
    this.root = resolve(root);
  }

  private async checkedRoot(): Promise<string> {
    await mkdir(this.root, { recursive: true });
    return realpath(this.root);
  }

  private async projectFolder(name: string, create = false): Promise<string> {
    const base = await this.checkedRoot();
    const folder = join(base, nameOf(name));
    if (create) await mkdir(folder, { recursive: false });
    const info = await lstat(folder);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Project directory must be a regular directory");
    const actual = await realpath(folder);
    if (actual !== folder) throw new Error("Symbolic links for project folders are not permitted");
    return folder;
  }

  private async projectPath(name: string): Promise<string> {
    return join(await this.projectFolder(name), "presentation.json");
  }

  private async checkedFile(path: string): Promise<string> {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Project document is not a regular file");
    if (info.size > MAX_PROJECT_BYTES) throw new Error("Project exceeds the 5 MiB maximum");
    return readFile(path, "utf8");
  }

  private async atomicWrite(file: string, contents: string): Promise<void> {
    if (Buffer.byteLength(contents, "utf8") > MAX_PROJECT_BYTES) throw new Error("Project exceeds the 5 MiB maximum");
    const temporary = file + "." + randomUUID() + ".tmp";
    let handle;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(contents, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, file);
    } finally {
      if (handle) await handle.close();
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async serializeRecord(name: string, project: Presentation): Promise<ProjectRecord> {
    const json = serializePresentation(project);
    const path = await this.projectPath(name);
    await this.atomicWrite(path, json);
    return { project: structuredClone(project), revision: revisionOf(json), path };
  }

  async create(name: string, title: string, viewport?: { width: number; height: number }): Promise<ProjectRecord> {
    const slug = nameOf(name);
    return this.lock(slug, async () => {
      const folder = await this.projectFolder(slug, true);
      const project = createPresentation(title);
      if (viewport) project.viewport = viewport;
      try {
        return await this.serializeRecord(slug, project);
      } catch (error) {
        await rm(folder, { recursive: true, force: true });
        throw error;
      }
    });
  }

  async read(name: string): Promise<ProjectRecord> {
    const path = await this.projectPath(name);
    const text = await this.checkedFile(path);
    return { project: parsePresentation(text), revision: revisionOf(text), path };
  }

  async list(): Promise<ProjectSummary[]> {
    const base = await this.checkedRoot();
    const entries = await readdir(base, { withFileTypes: true });
    const result: ProjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !NAME.test(entry.name)) continue;
      try {
        const record = await this.read(entry.name);
        result.push({
          name: entry.name, title: record.project.title,
          revision: record.revision, slides: record.project.slides.length,
        });
      } catch {
        // Non-project folders or invalid documents do not appear in project discovery.
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Each mutation is validated, revision-checked and committed as one file replacement. */
  async mutate(
    name: string,
    transform: (project: Presentation) => Presentation,
    expectedRevision?: string,
  ): Promise<ProjectRecord> {
    const slug = nameOf(name);
    return this.lock(slug, async () => {
      const current = await this.read(slug);
      if (expectedRevision && current.revision !== expectedRevision) {
        throw new Error(`Revision mismatch: project changed. Current revision: ${current.revision}`);
      }
      const next = transform(structuredClone(current.project));
      return this.serializeRecord(slug, next);
    });
  }

  async exportHtml(name: string, html: string): Promise<string> {
    const slug = nameOf(name);
    return this.lock(slug, async () => {
      const dir = await this.projectFolder(slug);
      const path = join(dir, "presentation.html");
      await this.atomicWrite(path, html);
      return path;
    });
  }

  private async lock<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const waiter = new Promise<void>(resolve => { release = resolve; });
    const next = previous.then(() => waiter);
    this.tails.set(name, next);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(name) === next) this.tails.delete(name);
    }
  }
}
