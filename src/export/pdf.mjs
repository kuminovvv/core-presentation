import { build } from "esbuild";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

const printEntry = fileURLToPath(new URL("../print.ts", import.meta.url));
let printBundle;

/** Export a presentation to searchable, text-preserving, one-page-per-slide PDF. */
export async function buildPdf(project) {
  const { width, height } = project.viewport;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 ||
      width > 2400 || height > 1600)
    throw new Error("PDF viewport must fit within 2400 × 1600");
  if (!project.slides.length || project.slides.length > 200)
    throw new Error("PDF needs between 1 and 200 slides");

  printBundle ??= build({
    entryPoints: [printEntry], bundle: true, minify: true, write: false,
    format: "iife", target: "es2022", outdir: "print-bundle",
  }).catch(error => { printBundle = undefined; throw error; });
  const result = await printBundle;
  const script = result.outputFiles.find(file => file.path.endsWith(".js"))?.text ?? "";
  const data = JSON.stringify(project).replace(/</g, "\\u003c");
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Print</title></head><body>' +
    '<script id="print-data" type="application/json">' + data + '</script>' +
    '<script>' + script.replace(/<\/script/gi, "<\\/script") + '</script></body></html>';
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: true, timeout: 20000,
  });
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      serviceWorkers: "block",
    });
    await context.route(/^(?:https?|file):/i, route => route.abort());
    await context.routeWebSocket("**/*", socket => socket.close());
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image =>
        image.complete ? Promise.resolve() :
          new Promise(resolve => { image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true }); })));
    });
    const bytes = await page.pdf({
      printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    await context.close();
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
}
