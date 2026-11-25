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
    html,body{height:100%;margin:0;background:#fff;color:#202124;font-family:system-ui,sans-serif}
    body{display:flex;flex-direction:column;overflow:hidden}
    #player{flex:1;min-height:0}
    .controls{position:fixed;z-index:10;left:50%;bottom:12px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #dfe0e3;border-radius:18px;background:#fffffff0;box-shadow:0 4px 24px #0001;backdrop-filter:blur(16px);max-width:calc(100% - 24px)}
    .controls button,.controls select{font:inherit;padding:7px 10px;border:0;background:#f1f1f3;color:#202124;border-radius:11px;cursor:pointer}
    .controls button:disabled{opacity:.35;cursor:default}
    .controls select{max-width:200px;min-width:0}
    #position{font-size:12px;white-space:nowrap;color:#666}
    #speaker-notes{position:fixed;bottom:74px;left:50%;transform:translateX(-50%);width:min(620px,90%);padding:18px;box-sizing:border-box;background:#fffffff2;border:1px solid #ddd;border-radius:18px;z-index:11;white-space:pre-wrap;box-shadow:0 8px 28px #0002}
    [hidden]{display:none!important}
    ${styles.replace(/<\/style/gi, "<\\/style")}
  </style>
</head>
<body>
  <main id="player"></main>
  <div class="controls">
    <button id="previous" aria-label="Previous slide">←</button>
    <span id="position"></span>
    <select id="slide-picker" aria-label="Select slide"></select>
    <button id="next" aria-label="Next slide">→</button>
    <button id="notes-toggle" aria-expanded="false" aria-controls="speaker-notes">Notes</button>
  </div>
  <aside id="speaker-notes" hidden></aside>
  <script id="presentation-data" type="application/json">${data}</script>
  <script>${script.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>`;
}
