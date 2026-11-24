import { parsePresentation } from "./core/validation";
import { createSlideNode } from "./renderer/dom";

const project = parsePresentation(document.getElementById("print-data")?.textContent ?? "");
const { width, height } = project.viewport;
const style = document.createElement("style");
style.textContent = '@page { size: ' + width + 'px ' + height + 'px; margin: 0 }' +
  'html,body { margin:0;padding:0; background:#fff; -webkit-print-color-adjust:exact;print-color-adjust:exact }' +
  '.print-page { display:block; position:relative; width:' + width + 'px;height:' + height +
  'px; overflow:hidden; break-after:page; page-break-after:always }' +
  '.print-page:last-child { break-after:auto; page-break-after:auto }';
document.head.append(style);
for (const slide of project.slides) {
  const page = document.createElement("section");
  page.className = "print-page";
  page.append(createSlideNode(slide, project));
  document.body.append(page);
}
document.documentElement.dataset.ready = "true";
