import type { Presentation } from "../core/types";
import { chromium } from "playwright-core";
import { buildStandaloneHtml } from "../export/standalone.mjs";

/**
 * Renders a slide in an isolated, ephemeral headless Chrome instance.
 * Remote requests are denied so a generated widget cannot leak document data
 * through fetch/image/script requests during preview.
 */
export async function renderSlide(project: Presentation, slideId: string): Promise<Uint8Array> {
  const slide = project.slides.find(item => item.id === slideId);
  if (!slide) throw new Error(`Slide not found: ${slideId}`);
  const { width, height } = project.viewport;
  if (width > 2400 || height > 1600) throw new Error("Preview viewport is limited to 2400 × 1600");
  const html = await buildStandaloneHtml({ ...project, slides: [slide] });
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: true,
    timeout: 15000,
  });
  try {
    const context = await browser.newContext({
      viewport: { width, height: height + 48 },
      reducedMotion: "reduce",
      javaScriptEnabled: true,
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    await context.route(/^(?:https?|file):/i, route => route.abort());
    await context.routeWebSocket("**/*", socket => socket.close());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.setContent(html, { waitUntil: "load", timeout: 12000 });
    const screenshot = await page.locator(".cp-slide")
      .screenshot({ type: "png", animations: "disabled", timeout: 10000 });
    await context.close();
    return screenshot;
  } finally {
    await browser.close();
  }
}
