/** Browser smoke test using an already installed Chrome; no browser download needed. */
import { readFile } from "node:fs/promises";
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
  await page.getByRole("button", { name: "Разгруппировать" }).waitFor();
  check(true, "Ctrl+G groups selected elements");

  await page.locator("#timeline-toggle").click();
  check(await page.locator("#timeline-panel").isVisible(), "Animation timeline opens");
  check(await page.locator(".timeline-row").count() > 1, "Timeline contains editable element tracks");

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
  page.on("dialog", async dialog => {
    pdfAlerts.push(dialog.message());
    console.log("PDF_ALERT:", dialog.message());
    await dialog.dismiss();
  });
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
  const pendingPdf = page.waitForEvent("download", { timeout: 15000 });
  await page.locator("#export-pdf").click({ timeout: 5000 });
  console.log("PDF_CLICK_FINISHED");
  const pdfDownload = await pendingPdf;
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
  const drag = page.locator(".slide-row").last();
  const lastId = await drag.getAttribute("data-slide-id");
  await drag.dragTo(page.locator(".slide-row").first(), { timeout: 10000 });
  check(await page.locator(".slide-row").first().getAttribute("data-slide-id") === lastId,
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

  check(errors.length === 0, "No uncaught browser errors: " + errors.join("; "));
  console.log("Browser smoke test passed.");
} finally {
  await browser?.close();
  await server.close();
}
