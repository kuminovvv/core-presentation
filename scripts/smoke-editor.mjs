/** Browser smoke test using an already installed Chrome; no browser download needed. */
process.env.CORE_PRESENTATION_PDF_DEBUG = "1";
import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({
  configFile: "vite.config.ts",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
  logLevel: "error",
});
let browser;
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", error => { errors.push(error.message); console.error("BROWSER_PAGEERROR:", error.message); });
  await page.goto(url);
  await page.locator(".cp-slide[data-slide-id='cover']").waitFor();

  const check = (assertion, message) => {
    if (!assertion) throw new Error(message);
    console.log("PASS", message);
  };

  // Theme must affect only the studio chrome, never the slide document.
  const slideBackground = await page.locator("#editor-stage .cp-slide").evaluate(el => getComputedStyle(el).background);
  await page.locator("#theme-picker").selectOption("light", {force:true});
  check(await page.locator("html").getAttribute("data-theme") === "light", "Light theme is available");
  const light = await page.locator(".studio-sidebar").evaluate(el => getComputedStyle(el).backgroundColor);
  await page.locator("#theme-picker").selectOption("dark", {force:true});
  check(await page.locator("html").getAttribute("data-theme") === "dark", "Dark theme is available");
  const dark = await page.locator(".studio-sidebar").evaluate(el => getComputedStyle(el).backgroundColor);
  check(light !== dark, "Theme changes studio surfaces");
  check(await page.locator("#editor-stage .cp-slide").evaluate(el => getComputedStyle(el).background) === slideBackground,
    "Switching themes preserves slide colors");
  await page.reload();
  check(await page.locator("#theme-picker").inputValue() === "dark", "Theme choice persists after reload");
  await page.emulateMedia({ colorScheme: "light" });
  await page.locator("#theme-picker").selectOption("system", {force:true});
  check(await page.locator("html").getAttribute("data-theme") === "light", "System mode follows light OS preference");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  check(true, "System mode reacts to OS theme changes");
  await page.locator("#theme-picker").selectOption("light", {force:true});
  check(await page.locator(".studio-sidebar").evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius)) >= 18,
    "Rounded panel styling is applied");
  const originalWidth = await page.locator("#slides-panel").evaluate(el => el.getBoundingClientRect().width);
  const rightWidth = await page.locator("#inspector-panel").evaluate(el => el.getBoundingClientRect().width);
  check(Math.abs(originalWidth - rightWidth) < 1, "Side panels have equal default widths");
  const gaps = await page.evaluate(() => {
    const a = document.querySelector("#slides-panel").getBoundingClientRect();
    const b = document.querySelector(".workspace").getBoundingClientRect();
    const c = document.querySelector("#inspector-panel").getBoundingClientRect();
    return [b.left - a.right, c.left - b.right];
  });
  check(gaps.every(gap => gap >= 0 && gap < 20), "Canvas fills the center with no empty columns");
  await page.locator(".theme-control [role=combobox]").click();
  await page.locator(".theme-control [role=option]").filter({hasText:"Тёмная"}).click();
  check(await page.locator("html").getAttribute("data-theme") === "dark", "Basecoat dropdown changes theme with real pointer");
  await page.locator(".theme-control [role=combobox]").click();
  await page.locator(".theme-control [role=option]").filter({hasText:"Светлая"}).click();
  await page.locator("#slides-resizer").focus();
  await page.keyboard.press("ArrowRight");
  const resizedWidth = await page.locator("#slides-panel").evaluate(el => el.getBoundingClientRect().width);
  check(resizedWidth > originalWidth, "Slide panel can be resized with keyboard");
  await page.keyboard.press("ArrowLeft");
  await page.locator("#toggle-inspector").click();
  check(await page.locator("#inspector-panel").isHidden(), "Inspector can be collapsed");
  await page.locator("#toggle-inspector").click();
  check(await page.locator("#inspector-panel").isVisible(), "Inspector can be restored");
  await page.locator("#toggle-slides").click();
  check(await page.locator("#slides-panel").isHidden(), "Slide panel can be collapsed");
  await page.locator("#toggle-slides").click();
  check(await page.locator("#slides-panel").isVisible(), "Slide panel can be restored");
  if (process.env.STUDIO_THEME_SCREENSHOTS) {
    await mkdir(dirname(process.env.STUDIO_THEME_SCREENSHOTS), { recursive: true });
    await page.screenshot({ path: process.env.STUDIO_THEME_SCREENSHOTS + "-light.png" });
    await page.locator("#theme-picker").selectOption("dark", {force:true});
    await page.screenshot({ path: process.env.STUDIO_THEME_SCREENSHOTS + "-dark.png" });
    await page.locator("#theme-picker").selectOption("light", {force:true});
  }

  await page.locator("#add-text").click();
  const selectedBox = page.locator(".selection-box");
  await selectedBox.waitFor();
  const width = Number(await page.locator('input[data-field="width"]').inputValue());
  const corner = await page.locator(".selection-handle.se").boundingBox();
  check(Boolean(corner), "Resize handle is visible");
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 60, corner.y + corner.height / 2 + 28, { steps: 10 });
  await page.mouse.up();
  const afterResize = Number(await page.locator('input[data-field="width"]').inputValue());
  check(afterResize > width + 20, "Dragging a handle resizes the element and commits its width");

  const field = page.locator('textarea[data-field="text"]');
  await field.fill("Automated browser test");
  await field.blur();
  await page.locator(".cp-element.cp-text").filter({ hasText: "Automated browser test" }).waitFor();
  check(true, "Editing text updates the DOM");

  const rotateHandle = await page.locator(".selection-rotate").boundingBox();
  check(Boolean(rotateHandle), "Rotation handle is visible");
  await page.mouse.move(rotateHandle.x + rotateHandle.width / 2, rotateHandle.y + rotateHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(rotateHandle.x + rotateHandle.width / 2 + 65, rotateHandle.y + rotateHandle.height / 2 + 35, { steps: 10 });
  await page.mouse.up();
  const rotation = Number(await page.locator('input[data-field="rotation"]').inputValue());
  check(Math.abs(rotation) > 1, "Rotation gesture commits a non-zero angle");

  await page.locator("#add-shape").click();
  await page.locator('.cp-element[data-element-id="cover-title"]').click({ modifiers: ["Shift"] });
  await page.getByText("Выделено: 2").waitFor();
  check(true, "Shift-click multi-selection works");

  await page.keyboard.press("Control+g");
  await page.locator("#inspector-more").click();
  check(await page.locator('[data-menu-action="ungroup"]').isEnabled(), "Ctrl+G groups selected elements");
  await page.keyboard.press("Escape");

  await page.locator("#timeline-toggle").click();
  check(await page.locator("#timeline-panel").isVisible(), "Animation timeline opens");
  check(await page.locator(".timeline-row").count() > 1, "Timeline contains editable element tracks");
  const animated = page.locator(".timeline-row").filter({has:page.locator(".timeline-bar")}).first();
  const trackBox = await animated.locator(".timeline-track").boundingBox();
  const barBox = await animated.locator(".timeline-bar").boundingBox();
  const startDelay = Number(await animated.locator('[data-timeline="delay"]').inputValue());
  const startDuration = Number(await animated.locator('[data-timeline="duration"]').inputValue());
  await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(barBox.x + barBox.width / 2 + trackBox.width * .1, barBox.y + barBox.height / 2,{steps:8});
  await page.mouse.up();
  check(Number(await animated.locator('[data-timeline="delay"]').inputValue()) > startDelay, "Dragging animation bar changes delay");
  check(Number(await animated.locator('[data-timeline="duration"]').inputValue()) === startDuration, "Moving bar preserves duration");
  const edge = await animated.locator(".timeline-edge.end").boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + trackBox.width * .06, edge.y + edge.height / 2,{steps:8});
  await page.mouse.up();
  check(Number(await animated.locator('[data-timeline="duration"]').inputValue()) > startDuration, "Dragging end handle changes duration");
  const panelHeight = await page.locator("#timeline-panel").evaluate(el => el.getBoundingClientRect().height);
  const grip = await page.locator("#timeline-resizer").boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 - 65,{steps:8});
  await page.mouse.up();
  check(await page.locator("#timeline-panel").evaluate(el => el.getBoundingClientRect().height) > panelHeight + 30, "Timeline height can be resized with pointer");
  await page.locator("#timeline-resizer").focus();
  await page.keyboard.press("ArrowDown");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#save").click(),
  ]);
  const project = JSON.parse(await readFile(await download.path(), "utf8"));
  const groups = project.slides[0].elements.filter(element => element.groupId);
  check(groups.length === 2 && groups[0].groupId === groups[1].groupId,
    "JSON export preserves a stable group ID");

  await page.locator("#preview").click();
  await page.locator("#preview-surface .cp-slide[data-slide-id='cover']").waitFor();
  await page.locator("#preview-next").click();
  await page.locator("#preview-surface .cp-slide[data-slide-id='features']").waitFor();
  check(true, "Preview navigates between slides");
  await page.locator("#preview-close").click();
  check(await page.locator("#preview-overlay").isHidden(), "Preview closes");

  await page.locator("#add-slide").click();
  await page.locator("#add-shape").click();
  // Create a clip directly on a previously empty track using a real double-click.
  if (await page.locator("#timeline-panel").isHidden()) await page.locator("#timeline-toggle").click();
  const emptyTrack = page.locator(".timeline-track[data-empty]").first();
  const emptyBox = await emptyTrack.boundingBox();
  await page.mouse.dblclick(emptyBox.x + emptyBox.width * 0.4, emptyBox.y + emptyBox.height / 2);
  const createdClip = page.locator(".timeline-row .timeline-bar").first();
  await createdClip.waitFor();
  check(Math.abs(Number(await page.locator('.timeline-row [data-timeline="delay"]').first().inputValue()) - 1000) <= 10,
    "Double-click creates an animation at the clicked time");
  check(await page.locator('.timeline-row [data-timeline="duration"]').first().inputValue() === "600",
    "New animation has the default duration");
  await page.locator("#undo").click();
  check(await page.locator(".timeline-track[data-empty]").count() === 1, "Undo removes newly created animation");
  await page.locator("#redo").click();
  check(await page.locator(".timeline-bar").count() === 1, "Redo restores newly created animation");
  const stage = await page.locator("#editor-stage").boundingBox();
  const shape = await page.locator(".cp-slide .cp-element[data-element-id^='element-']").boundingBox();
  const zoom = stage.width / 1600;
  await page.mouse.move(shape.x + shape.width / 2, shape.y + shape.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + (800 - 4) * zoom, stage.y + (450 - 4) * zoom, { steps: 12 });
  check(await page.locator(".snap-guide.x").count() > 0 &&
        await page.locator(".snap-guide.y").count() > 0,
    "Smart alignment guides appear near the slide center");
  await page.mouse.up();
  check(await page.locator('input[data-field="x"]').inputValue() === "660" &&
        await page.locator('input[data-field="y"]').inputValue() === "360",
    "Dragging snaps the shape center to the slide center");

  await page.keyboard.press("ArrowRight");
  check(await page.locator('input[data-field="x"]').inputValue() === "661", "Arrow key nudges selection by 1 px");
  await page.keyboard.press("Control+z");
  check(await page.locator('input[data-field="x"]').inputValue() === "660", "Ctrl+Z undoes a transformation");
  await page.keyboard.press("Control+y");
  check(await page.locator('input[data-field="x"]').inputValue() === "661", "Ctrl+Y redoes a transformation");

  await page.keyboard.press("Escape");
  const stageAgain = await page.locator("#editor-stage").boundingBox();
  await page.mouse.move(stageAgain.x + 500 * zoom, stageAgain.y + 220 * zoom);
  await page.mouse.down();
  await page.mouse.move(stageAgain.x + 1100 * zoom, stageAgain.y + 700 * zoom, { steps: 12 });
  await page.mouse.up();
  check(await page.locator(".cp-element.chosen").count() === 1,
    "Drag-selection marquee selects the intersecting shape");

  await page.keyboard.press("Control+d");
  check(await page.locator(".cp-slide .cp-element").count() === 2,
    "Ctrl+D duplicates the selected shape");
  await page.keyboard.press("Control+a");
  await page.getByText("Выделено: 2").waitFor();
  check(true, "Ctrl+A selects every slide element");

  if (process.env.SMOKE_SCREENSHOT) {
    await page.screenshot({ path: process.env.SMOKE_SCREENSHOT });
  }

  // Editing text directly on the slide should update the saved document model.
  await page.locator("#add-text").click();
  const editable = page.locator(".cp-element.cp-text").filter({ hasText: "Your text" });
  await editable.dblclick();
  await page.locator(".cp-element[contenteditable='true']").fill("Edited inline");
  await page.locator("#add-image").click();
  await page.locator(".cp-element.cp-text").filter({ hasText: "Edited inline" }).waitFor();
  check(true, "Double-click text editing updates the slide document");

  // Embedded raster images must remain available in standalone offline HTML.
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aZkAAAAASUVORK5CYII=",
    "base64"
  );
  await page.locator("#image-upload").setInputFiles({
    name: "pixel.png", mimeType: "image/png", buffer: pixel,
  });
  await page.locator(".cp-element img[src^='data:image/png;base64,']").waitFor();
  check(true, "Image upload embeds data URL into the slide");

  const [htmlDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-html").click(),
  ]);
  const html = await readFile(await htmlDownload.path(), "utf8");
  check(html.includes("presentation-data") && html.includes("Edited inline"),
    "Browser exports a complete standalone HTML presentation");
  check(html.includes("data:image/png;base64,"),
    "Offline export contains the uploaded embedded image");
  const pdfAlerts = [];
  const onPdfDialog = async dialog => {
    pdfAlerts.push(dialog.message());
    console.log("PDF_ALERT:", dialog.message());
    await dialog.dismiss();
  };
  page.on("dialog", onPdfDialog);
  page.on("response", response => {
    if (response.url().includes("/api/export/pdf")) console.log("PDF_HTTP:", response.status());
  });
  console.log("PDF_BUTTON_RECT:", JSON.stringify(await page.locator("#export-pdf").boundingBox()));
    const hit = await page.evaluate(() => {
    const element = document.querySelector("#export-pdf");
    const rect = element.getBoundingClientRect();
    const front = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { front: front?.outerHTML.slice(0, 250), disabled: element.disabled };
  });
  console.log("PDF_HIT_TEST:", JSON.stringify(hit));
  const pendingPdf = page.waitForEvent("download", { timeout: 65000 });
  await page.locator("#export-pdf").click({ timeout: 5000 });
  console.log("PDF_CLICK_FINISHED");
  const pdfDownload = await pendingPdf;
  page.off("dialog", onPdfDialog);
  const pdf = await readFile(await pdfDownload.path());
  check(pdfAlerts.length === 0, "No PDF browser error alerts");
  check(pdf.subarray(0, 5).toString("utf8") === "%PDF-",
    "PDF export button downloads a real PDF file");
  check(await page.locator("#preview-fullscreen").count() === 1,
    "Presentation controls offer full-screen mode");


  // Native layout templates are fully editable objects.
  await page.locator(".layout-menu summary").click();
  await page.locator('[data-layout="two-columns"]').click();
  await page.locator(".cp-element.cp-text").filter({ hasText: "Сравнение двух подходов" }).waitFor();
  check(await page.locator(".cp-slide .cp-element").count() >= 5,
    "Layout gallery inserts a native editable two-column slide");

  // Slide thumbnails can be rearranged without changing their stable IDs.
  // Both drag endpoints must be simultaneously visible in the scrollable list.
  // Wider slide previews may put the last thumbnail below the fold.
  const drag = page.locator(".slide-row").nth(1);
  const first = page.locator(".slide-row").first();
  const movedId = await drag.getAttribute("data-slide-id");
  await first.scrollIntoViewIfNeeded();
  await drag.scrollIntoViewIfNeeded();
  await drag.dragTo(first, { timeout: 10000 });
  check(await page.locator(".slide-row").first().getAttribute("data-slide-id") === movedId,
    "Dragging thumbnails changes slide order");

  await page.reload();
  const [afterReload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#save").click(),
  ]);
  const recovered = JSON.parse(await readFile(await afterReload.path(), "utf8"));
  check(recovered.slides.some(slide => slide.elements.some(element =>
    element.type === "text" && element.text === "Edited inline")),
    "Local unsaved example survives a full browser reload");

  await page.locator('input[data-field="viewportWidth"]').fill("1280");
  await page.locator('input[data-field="viewportWidth"]').blur();
  check((await page.locator("#viewport-label").textContent()).includes("1280 × 900"),
    "Inspector updates slide dimensions and canvas status");
  await page.locator("#add-text").click();
  await page.locator('input[data-field="fontFamily"]').fill("Georgia, serif");
  await page.locator('input[data-field="fontFamily"]').blur();
  const family = await page.locator(".cp-element.cp-text").filter({ hasText: "Your text" })
    .evaluate(element => getComputedStyle(element).fontFamily);
  check(family.includes("Georgia"), "Typography inspector applies a custom font family");

  // Auto Layout must be editable using the existing Basecoat controls and native objects.
  await page.locator("#add-slide").click();
  await page.locator("#add-shape").click();
  await page.locator("#add-shape").click();
  await page.locator('[data-action="layout-settings"]').count().then(async count => {
    if (count) await page.locator('[data-action="layout-settings"]').click();
    else await page.keyboard.press("Escape");
  });
  await page.locator('[data-action="layout-direction-row"]').click();
  await page.locator('input[data-field="layoutGap"]').fill("32");
  await page.locator('input[data-field="layoutGap"]').blur();
  const layoutPositions = await page.locator("#editor-stage .cp-element").evaluateAll(nodes => nodes.map(el => [parseFloat(el.style.left),parseFloat(el.style.top)]));
  check(layoutPositions.length===2 && layoutPositions[0][0]===64 && layoutPositions[1][0]===376 && layoutPositions[0][1]===layoutPositions[1][1],
    "Slide Auto Layout positions native shapes horizontally using padding and gap");
  await page.locator('[data-action="layout-direction-column"]').click();
  const column = await page.locator("#editor-stage .cp-element").evaluateAll(nodes => nodes.map(el=>[parseFloat(el.style.left),parseFloat(el.style.top)]));
  check(column[0][0]===column[1][0] && column[1][1]-column[0][1]===212, "Vertical Auto Layout reflows on direction change");
  const [layoutDownload] = await Promise.all([page.waitForEvent("download"),page.locator("#save").click()]);
  const layoutDoc = JSON.parse(await readFile(await layoutDownload.path(),"utf8"));
  check(layoutDoc.slides.at(-1).layout.direction==="column" && layoutDoc.slides.at(-1).layout.gap===32,
    "Auto Layout is persisted in editable JSON");
  await page.locator('[data-action="layout-point-center-center"]').click();
  check(await page.locator('[data-action="layout-point-center-center"]').getAttribute("aria-pressed")==="true","Icon alignment grid changes layout");
  await page.locator("#editor-stage .cp-element").first().click({button:"right"});
  check(await page.locator(".studio-context-menu").isVisible(),"Right-click opens object context menu");
  await page.locator('[data-menu-action="duplicate"]').click();
  check(await page.locator("#editor-stage .cp-element").count()===3,"Context menu duplicates selected object");
  await page.locator("#undo").click();
  await page.locator("#slide-source").click();
  const source=page.locator("#source-editor");
  const sourceDoc=JSON.parse(await source.inputValue());
  sourceDoc.name="Edited through source";
  await source.fill("{invalid");
  await page.locator("#source-apply").click();
  check((await page.locator("#source-error").textContent()).length>0,"Invalid source stays open and is not applied");
  await source.fill(JSON.stringify(sourceDoc,null,2));
  await page.locator("#source-apply").click();
  check(await page.locator("#slide-source-dialog").isHidden(),"Valid JSON source applies");
  check(await page.locator(".slide-row.active .slide-title").textContent()==="Edited through source","Source edits update native slide");
  await page.locator("#slide-source").click();
  await page.locator('[data-source-tab="html"]').click();
  await source.fill('<h1 id="custom">Custom HTML</h1>');
  await page.locator('[data-source-tab="css"]').click();
  await source.fill('body{margin:0;color:red}');
  await page.locator('[data-source-tab="javascript"]').click();
  await source.fill('document.querySelector("h1").textContent="Executed";');
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#source-apply").click();
  await page.locator("#editor-stage iframe").waitFor();
  check(await page.locator("#editor-stage iframe").getAttribute("sandbox")==="","HTML scripts are disabled in the editor");
  check(await page.frameLocator("#editor-stage iframe").locator("h1").textContent()==="Custom HTML","HTML code replaces slide content");
  await page.locator("#preview").click();
  check(await page.frameLocator("#preview-surface iframe").locator("h1").textContent()==="Executed","HTML JavaScript runs in sandboxed preview");
  await page.locator("#preview-close").click();
  await page.locator("#undo").click();
  check(await page.locator("#editor-stage .cp-element").count()===2,"Undo restores native slide after HTML conversion");
  await page.locator("#add-slide").click();
  await page.keyboard.press("f");
  const boxFrame=await page.locator("#editor-stage").boundingBox();
  await page.mouse.move(boxFrame.x+boxFrame.width*.15,boxFrame.y+boxFrame.height*.15);
  await page.mouse.down();
  await page.mouse.move(boxFrame.x+boxFrame.width*.65,boxFrame.y+boxFrame.height*.65,{steps:8});
  await page.mouse.up();
  await page.locator(".frame-inspector").waitFor();
  check(await page.locator("#editor-stage .cp-frame").count()===1,"F draws a native frame");
  await page.locator("#add-shape").click();
  check(await page.locator("#editor-stage .cp-frame > .cp-element").count()===1,"New shape is nested in the frame");
  const frameId=await page.locator("#editor-stage .cp-frame").getAttribute("data-element-id");
  await page.locator('[data-layer-id="'+frameId+'"]').click();
  await page.locator('[data-action="layout-direction-row"]').click();
  await page.locator('input[data-field="layoutPaddingX"]').fill("25");
  await page.locator('input[data-field="layoutPaddingX"]').blur();
  check(await page.locator("#editor-stage .cp-frame > .cp-element").evaluate(el=>parseFloat(el.style.left))===25,"Frame Auto Layout controls child position");
  await page.locator('input[data-field="clipContent"]').uncheck();
  check(await page.locator("#editor-stage .cp-frame").evaluate(el=>getComputedStyle(el).overflow)==="visible","Clip content can be toggled");
  await page.locator('[data-action="frame-align-left"]').click();
  check(await page.locator("#editor-stage .cp-frame").evaluate(el=>parseFloat(el.style.left))===0,"Frame aligns to slide edge");
  if(process.env.STUDIO_THEME_SCREENSHOTS)await page.screenshot({path:process.env.STUDIO_THEME_SCREENSHOTS+"-frame.png"});
  check(errors.length === 0, "No uncaught browser errors: " + errors.join("; "));
  console.log("Browser smoke test passed.");
} finally {
  await browser?.close();
  await server.close();
}
