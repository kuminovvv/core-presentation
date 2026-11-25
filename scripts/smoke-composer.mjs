import { chromium } from "playwright-core";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildStandaloneHtml } from "../src/export/standalone.mjs";
const project = JSON.parse(await readFile(new URL("../examples/composer-demo.json", import.meta.url), "utf8"));
const root = await mkdtemp(join(tmpdir(), "composer-demo-"));
let browser;
function check(value, message) { if (!value) throw Error(message); console.log("PASS", message); }
try {
  const file = join(root, "composer.html");
  await writeFile(file, await buildStandaloneHtml(project));
  browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }), headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(pathToFileURL(file).href + "#8");
  await page.locator(".cp-slide[data-slide-id='composer-scene-8']").waitFor();
  await page.locator("#next").click();
  await page.waitForFunction(() => {
    const target = document.querySelector(".cp-slide[data-slide-id='composer-scene-9'] [data-morph-id='composer']");
    return target && target.getAnimations().length > 0;
  });
  check(true, "Native pill has a running morph animation");
  await page.waitForFunction(() => document.querySelectorAll(".cp-slide").length === 1 && location.hash === "#9");
  const width = await page.locator("[data-morph-id='composer']").evaluate(el => getComputedStyle(el).width);
  check(width === "732px", "Morph reaches exact target geometry");
  await page.locator("#previous").click();
  await page.waitForFunction(() => document.querySelectorAll(".cp-slide").length === 1 && location.hash === "#8");
  check(await page.locator("[data-morph-id='composer']").evaluate(el => getComputedStyle(el).width) === "2350px", "Reverse morph returns to source geometry");
  await page.locator("#slide-picker").selectOption("13");
  await page.waitForFunction(() => document.querySelectorAll(".cp-slide").length === 1 && location.hash === "#14");
  const frame = page.frameLocator(".cp-slide iframe");
  await frame.getByRole("textbox", {name:"Message"}).fill("Hello Core");
  await frame.getByRole("button", {name:"Send message"}).click();
  check(await frame.locator("output").textContent() === "You wrote: Hello Core", "Offline interactive widget responds");
  await page.locator("#notes-toggle").click();
  check(await page.locator("#speaker-notes").isVisible(), "Speaker notes are accessible");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#slide-picker").selectOption("0");
  await page.waitForFunction(() => location.hash === "#1");
  check(await page.locator(".cp-slide").count() === 1, "Reduced-motion navigation works");
  check(errors.length === 0, "No JavaScript errors: " + errors.join("; "));
} finally { await browser?.close(); await rm(root, {recursive:true,force:true}); }
