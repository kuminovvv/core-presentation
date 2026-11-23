import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error("Usage: npm run export:html -- presentation.json presentation.html");
  process.exit(1);
}
const project = JSON.parse(await readFile(resolve(source), "utf8"));
if (project.version !== 1 || !Array.isArray(project.slides)) {
  throw new Error("Invalid presentation format. Expected version 1 and slides array.");
}
const result = await build({
  entryPoints: [resolve("src/standalone.ts")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2022",
  outdir: resolve(".presentation-export"),
  loader: { ".css": "css" },
});
const javascript = result.outputFiles.find(file => file.path.endsWith(".js"))?.text ?? "";
const styles = result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";
const json = JSON.stringify(project).replace(/</g, "\\u003c");
const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${String(project.title ?? "Presentation").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" })[c])}</title>
  <style>
    html,body{height:100%;margin:0;background:#080b14;color:#fff;font-family:system-ui,sans-serif}
    body{display:flex;flex-direction:column}
    #player{flex:1;min-height:0}
    .controls{height:48px;display:flex;align-items:center;justify-content:center;gap:16px;background:#121a2c}
    button{padding:7px 14px;border:1px solid #4b577b;background:#252f49;color:#fff;border-radius:8px;cursor:pointer}
    ${styles.replaceAll("</style", "<\\/style")}
  </style>
</head>
<body>
  <main id="player"></main>
  <div class="controls">
    <button id="previous" aria-label="Previous slide">←</button>
    <span id="position"></span>
    <button id="next" aria-label="Next slide">→</button>
  </div>
  <script id="presentation-data" type="application/json">${json}</script>
  <script>${javascript.replaceAll("</script", "<\\/script")}</script>
</body>
</html>`;
await writeFile(resolve(destination), html, "utf8");
console.log(`Exported ${project.slides.length} slides to ${resolve(destination)}`);
