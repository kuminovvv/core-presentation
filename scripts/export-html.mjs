import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildStandaloneHtml } from "../src/export/standalone.mjs";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error("Usage: npm run export:html -- presentation.json presentation.html");
  process.exit(1);
}
const project = JSON.parse(await readFile(resolve(source), "utf8"));
if (project.version !== 1 || !Array.isArray(project.slides)) {
  throw new Error("Invalid presentation format. Expected version 1 and slides array.");
}
const html = await buildStandaloneHtml(project);
await writeFile(resolve(destination), html, "utf8");
console.log(`Exported ${project.slides.length} slides to ${resolve(destination)}`);
