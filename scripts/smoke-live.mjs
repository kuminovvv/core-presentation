import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temp = await mkdtemp(join(tmpdir(), "presentation-live-"));
process.env.CORE_PRESENTATION_PROJECTS_DIR = temp;
const server = await createServer({
  configFile: "vite.config.ts",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
  logLevel: "error",
});
const mcp = new Client({ name: "live-sync-test", version: "1.0.0" });
let browser;
function verify(test, description) {
  if (!test) throw new Error(description);
  console.log("PASS", description);
}
async function invoke(tool, args) {
  const result = await mcp.callTool({ name: tool, arguments: args });
  if (result.isError) throw new Error(tool + ": " + result.content.map(part => part.text).join(" "));
  return JSON.parse(result.content.find(part => part.type === "text").text);
}
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const root = resolve(".");
  await mcp.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "scripts", "launch-mcp.mjs"), "--projects-dir", temp],
    cwd: temp,
    env: { ...process.env, CORE_PRESENTATION_PROJECTS_DIR: temp },
  }));
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.locator("#new-project").click();
  await page.locator("#new-project-title").fill("Live collaboration");
  await page.locator("#new-project-name").fill("live-sync");
  await page.locator("#confirm-project").click();
  await page.locator("#create-project-dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.querySelector("#project-picker")?.value === "live-sync" &&
    document.querySelector("#sync-status")?.dataset.state === "synced");
  verify(true, "Browser creates a shared project");

  await page.locator("#add-slide").click();
  await page.locator("#add-text").click();
  await page.waitForFunction(() => document.querySelector("#sync-status")?.dataset.state === "synced");
  const saved = JSON.parse(await readFile(join(temp, "live-sync", "presentation.json"), "utf8"));
  verify(saved.slides.length === 1 && saved.slides[0].elements.length === 1,
    "Editor auto-saves slide and element into MCP-shared folder");

  const slideId = saved.slides[0].id;
  const elementId = saved.slides[0].elements[0].id;
  await invoke("presentation_update_elements", {
    project: "live-sync",
    changes: [{ elementId, properties: { text: "Edited by the MCP agent", fontSize: 78 } }],
  });
  await page.locator(".cp-element.cp-text").filter({ hasText: "Edited by the MCP agent" }).waitFor({ timeout: 10000 });
  verify(await page.locator("#sync-status").getAttribute("data-state") === "synced",
    "MCP edits appear in browser automatically without importing JSON");
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#project-picker")?.value === "live-sync");
  await page.locator(".cp-element.cp-text").filter({ hasText: "Edited by the MCP agent" }).waitFor();
  verify(true, "Last opened shared project is restored after a browser reload");

  const second = await context.newPage();
  second.on("pageerror", error => errors.push(error.message));
  await second.goto(url);
  await second.locator("#project-picker").selectOption("live-sync", {force:true});
  await second.locator(".cp-element.cp-text").filter({ hasText: "Edited by the MCP agent" }).waitFor();
  verify(true, "A second browser tab can open the same project");

  // Hold tab B's full-document write until the agent has saved a newer revision.
  let pending;
  let release;
  const intercepted = new Promise(resolve => { pending = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  await second.route("**/api/projects/live-sync", async route => {
    if (route.request().method() === "PUT") {
      pending();
      await hold;
    }
    await route.continue();
  });
  await second.locator("#add-shape").click();
  await intercepted;
  await invoke("presentation_update_elements", {
    project: "live-sync",
    changes: [{ elementId, properties: { text: "Agent latest version" } }],
  });
  release();
  await second.waitForFunction(() => document.querySelector("#sync-status")?.dataset.state === "conflict",
    { timeout: 10000 });
  verify(await second.locator("#sync-remote").isVisible() &&
         await second.locator("#sync-copy").isVisible(),
    "Stale browser write cannot overwrite the agent; conflict offers recovery");

  const afterRace = JSON.parse(await readFile(join(temp, "live-sync", "presentation.json"), "utf8"));
  verify(afterRace.slides[0].elements.length === 1 &&
         afterRace.slides[0].elements[0].text === "Agent latest version",
    "Agent changes survive a browser revision conflict");

  second.once("dialog", async dialog => {
    verify(dialog.type() === "prompt", "Copy conflict prompts for a new project name");
    await dialog.accept("live-copy");
  });
  await second.locator("#sync-copy").click();
  await second.waitForFunction(() =>
    document.querySelector("#project-picker")?.value === "live-copy" &&
    document.querySelector("#sync-status")?.dataset.state === "synced", { timeout: 10000 });
  const copy = JSON.parse(await readFile(join(temp, "live-copy", "presentation.json"), "utf8"));
  verify(copy.slides[0].elements.length === 2, "Conflicting browser work survives in a separate copy");

  // Editing the original should update the first browser and preserve its active slide.
  await invoke("presentation_update_elements", {
    project: "live-sync",
    changes: [{ elementId, properties: { text: "Updated again by agent" } }],
  });
  await page.locator(".cp-element.cp-text").filter({ hasText: "Updated again by agent" }).waitFor({ timeout: 10000 });
  verify(true, "Original browser stays subscribed after resolving a conflict in another tab");

  // Browser-local changes should not depend on the MCP process still being alive.
  await mcp.close();
  await page.locator("#add-shape").click();
  await page.waitForFunction(() => document.querySelector("#sync-status")?.dataset.state === "synced");
  const latest = JSON.parse(await readFile(join(temp, "live-sync", "presentation.json"), "utf8"));
  verify(latest.slides[0].elements.length === 2, "Browser and MCP can save independently using shared files");

  await page.locator("#project-actions summary").click();
  page.once("dialog", async dialog => {
    verify(dialog.type() === "prompt", "Project duplication requests a destination name");
    await dialog.accept("browser-copy");
  });
  await page.locator("#duplicate-project").click();
  await page.waitForFunction(() => document.querySelector("#project-picker")?.value === "browser-copy");
  verify(true, "Project can be duplicated from the browser UI");

  await page.locator("#project-actions summary").click();
  page.once("dialog", async dialog => {
    verify(dialog.type() === "confirm", "Project archive asks for confirmation");
    await dialog.accept();
  });
  await page.locator("#archive-project").click();
  await page.waitForFunction(() => document.querySelector("#project-picker")?.value === "");
  const trashEntries = await readdir(join(temp, ".trash"));
  verify(trashEntries.some(name => name.startsWith("browser-copy-")),
    "Project archive preserves a recoverable copy under .trash");

  verify(errors.length === 0, "No browser runtime errors: " + errors.join("; "));
  console.log("Live sync integration test passed.");
} finally {
  await mcp.close().catch(() => undefined);
  await browser?.close();
  await server.close();
  await rm(temp, { recursive: true, force: true });
}
