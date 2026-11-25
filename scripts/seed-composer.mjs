import { readFile } from "node:fs/promises";
import { ProjectRepository } from "../src/mcp/project-repository.ts";
import { parsePresentation } from "../src/core/validation.ts";
import { buildStandaloneHtml } from "../src/export/standalone.mjs";
const name = process.argv[2] ?? "composer-demo";
const repo = new ProjectRepository();
const project = parsePresentation(await readFile(new URL("../examples/composer-demo.json", import.meta.url), "utf8"));
if ((await repo.list()).some(item => item.name === name)) {
  console.log("Project already exists; it was not overwritten. Use a different name to create a fresh copy.");
} else {
  const created = await repo.create(name, project.title, project.viewport);
  const saved = await repo.replace(name, { ...project, id: created.project.id }, created.revision);
  console.log("Editable project: " + saved.path);
  console.log("Standalone website: " + await repo.exportHtml(name, await buildStandaloneHtml(saved.project)));
}
