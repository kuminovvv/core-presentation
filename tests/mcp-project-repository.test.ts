import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSlide, createSlide } from "../src/core/document";
import type { Presentation } from "../src/core/types";
import { ProjectRepository } from "../src/mcp/project-repository";

describe("MCP project persistence and isolation", () => {
  let root: string;
  let repo: ProjectRepository;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cp-repo-unit-"));
    repo = new ProjectRepository(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("saves and re-opens a versioned document", async () => {
    const created = await repo.create("quarterly-2026", "Quarterly review");
    expect(created.project.title).toBe("Quarterly review");
    expect(created.revision).toMatch(/^[a-f0-9]{64}$/);
    const reloaded = await new ProjectRepository(root).read("quarterly-2026");
    expect(reloaded.project).toEqual(created.project);
    expect(reloaded.revision).toEqual(created.revision);
    expect((await repo.list()).map(item => item.name)).toEqual(["quarterly-2026"]);
  });

  it("refuses path traversal and duplicate project names", async () => {
    await expect(repo.create("../outside", "Unsafe")).rejects.toThrow();
    await expect(repo.create("bad/slash", "Unsafe")).rejects.toThrow();
    await repo.create("safe", "Safe");
    await expect(repo.read("..")).rejects.toThrow();
    await expect(repo.create("safe", "Duplicate")).rejects.toThrow();
    expect((await repo.read("safe")).project.title).toBe("Safe");
  });

  it("does not list unrelated folders", async () => {
    await mkdir(join(root, "other"));
    await repo.create("slides", "Presentations");
    expect((await repo.list()).map(item => item.name)).toEqual(["slides"]);
  });

  it("serializes concurrent mutations without losing edits", async () => {
    await repo.create("shared", "Shared");
    await Promise.all(Array.from({ length: 12 }, (_, i) =>
      repo.mutate("shared", project => addSlide(project, createSlide(`Part ${i}`)))));
    const saved = await repo.read("shared");
    expect(saved.project.slides).toHaveLength(12);
    expect(new Set(saved.project.slides.map(slide => slide.name)).size).toBe(12);
  });

  it("rejects stale revisions and leaves the file untouched", async () => {
    const first = await repo.create("work", "Original");
    const second = await repo.mutate("work", project => ({ ...project, title: "New" }));
    await expect(repo.mutate("work",
      project => ({ ...project, title: "Stale" }), first.revision)).rejects.toThrow("Revision mismatch");
    const final = await repo.read("work");
    expect(final.revision).toBe(second.revision);
    expect(final.project.title).toBe("New");
  });

  it("rejects invalid data without partial writes", async () => {
    const original = await repo.create("atomic", "Valid");
    await expect(repo.mutate("atomic", project => ({
      ...project, viewport: { width: 0, height: 900 },
    } as Presentation))).rejects.toThrow();
    const final = await repo.read("atomic");
    expect(final.revision).toBe(original.revision);
    expect(JSON.parse(await readFile(final.path, "utf8")).version).toBe(1);
  });
});
