import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const playerEntry = fileURLToPath(new URL("../standalone.ts", import.meta.url));
let bundle;

/** Bundles the browser player and embeds one presentation as an offline-ready HTML page. */
export async function buildStandaloneHtml(project) {
  bundle ??= build({
    entryPoints: [playerEntry],
    bundle: true,
    minify: true,
    write: false,
    format: "iife",
    target: "es2022",
    outdir: "presentation-bundle",
    loader: { ".css": "css" },
  }).catch(error => { bundle = undefined; throw error; });

  const result = await bundle;
  const script = result.outputFiles.find(file => file.path.endsWith(".js"))?.text ?? "";
  const styles = result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";
  // Escaping '<' in JSON avoids closing the data script with embedded HTML content.
  const data = JSON.stringify(project).replace(/</g, "\\u003c");
  const title = String(project.title ?? "Presentation").replace(/[&<>"]/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    html,body{height:100%;margin:0;background:#080b14;color:#fff;font-family:system-ui,sans-serif}
    body{display:flex;flex-direction:column}
    #player{flex:1;min-height:0}
    .controls{height:48px;display:flex;align-items:center;justify-content:center;gap:16px;background:#121a2c}
    button{padding:7px 14px;border:1px solid #4b577b;background:#252f49;color:#fff;border-radius:8px;cursor:pointer}
    ${styles.replace(/<\/style/gi, "<\\/style")}
  </style>
</head>
<body>
  <main id="player"></main>
  <div class="controls">
    <button id="previous" aria-label="Previous slide">←</button>
    <span id="position"></span>
    <button id="next" aria-label="Next slide">→</button>
  </div>
  <script id="presentation-data" type="application/json">${data}</script>
  <script>${script.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>`;
}
