import { request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createStudioServer } from "../src/server/production.ts";
import { ProjectRepository } from "../src/mcp/project-repository";

const root = await mkdtemp(join(tmpdir(), "core-presentation-built-"));
const server = createStudioServer(new ProjectRepository(root));
let browser;
const assert = (condition, description) => {
  if (!condition) throw new Error(description);
  console.log("PASS", description);
};
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  const url = "http://127.0.0.1:" + address.port;

  const home = await fetch(url + "/");
  const html = await home.text();
  assert(home.status === 200 && html.includes("Core Presentation"), "Built editor serves its HTML");
  const denied = await fetch(url + "/api/projects", { headers: { Origin: "https://evil.test" } });
  assert(denied.status === 403, "Cross-origin project API access is forbidden");
  // Node fetch normalizes Host automatically; use a raw HTTP request to test rebinding.
  const rebinding = await new Promise((resolve, reject) => {
    const call = httpRequest({
      hostname: "127.0.0.1", port: address.port, method: "GET", path: "/api/projects",
      headers: { Host: "untrusted.example" },
    }, response => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    call.on("error", reject);
    call.end();
  });
  assert(rebinding === 403, "DNS-rebinding Host header is rejected");

  const created = await fetch(url + "/api/projects", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "production-check", title: "Deployed studio" }),
  });
  const record = await created.json();
  assert(created.status === 201 && record.revision.length === 64,
    "Built server creates persistent shared projects");

  const deck = { ...record.project, slides: [{
    id: "hello", name: "Welcome", background: "#162039",
    elements: [{ id: "headline", type: "text", x: 90, y: 300,
      width: 1300, height: 150, text: "A production build",
      fontSize: 100, color: "#fff" }],
  }] };
  const saved = await fetch(url + "/api/projects/production-check", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: deck, expectedRevision: record.revision }),
  });
  assert(saved.status === 200, "Built server updates projects with revision validation");

  const exported = await fetch(url + "/api/export", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: deck }),
  });
  const result = await exported.text();
  assert(exported.status === 200 && result.includes("presentation-data") &&
    result.includes("A production build"), "Built server exports a standalone HTML file");

  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: true, args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.locator("#project-picker").selectOption("production-check");
  await page.locator(".cp-element.cp-text").filter({ hasText: "A production build" }).waitFor();
  assert(errors.length === 0, "Built studio opens shared project in real Chrome");
  console.log("Built studio smoke test passed.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
