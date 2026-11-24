import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectRepository } from "../src/mcp/project-repository.ts";
import { createMcpHttpServer } from "../src/mcp/http.ts";

const temp = await mkdtemp(join(tmpdir(), "core-mcp-http-"));
const token = "test-only-0123456789abcdef0123456789abcdef0123456789abcdef";
const server = createMcpHttpServer({ token, repository: new ProjectRepository(temp) });
const clients = [];
function check(condition, description) {
  if (!condition) throw new Error(description);
  console.log("PASS", description);
}
async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(name + ": " + result.content.map(item => item.text).join("; "));
  return JSON.parse(result.content.find(item => item.type === "text").text);
}
function makeClient(url, mode = "auto") {
  const client = new Client(
    { name: "core-presentation-http-smoke", version: "1.0.0" },
    { versionNegotiation: { mode } },
  );
  clients.push(client);
  return { client, transport: new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: "Bearer " + token } },
  }) };
}
async function httpStatusWithHost(port, host) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: "127.0.0.1", port, method: "POST", path: "/mcp",
      headers: {
        Host: host,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
    }, response => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    req.once("error", reject);
    req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
  });
}
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const bound = server.address();
  if (!bound || typeof bound === "string") throw new Error("No test port");
  const port = bound.port, url = "http://127.0.0.1:" + port + "/mcp";
  const auth = { Authorization: "Bearer " + token };

  const unauthorized = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check(unauthorized.status === 401 && unauthorized.headers.has("www-authenticate"),
    "Unauthenticated MCP calls are rejected");
  const invalidToken = await fetch(url, { headers: { Authorization: "Bearer wrong-token" }, method: "POST" });
  check(invalidToken.status === 401, "Incorrect bearer tokens are rejected");
  const wrongHost = await httpStatusWithHost(port, "outside.example.com");
  check(wrongHost === 403, "DNS-rebinding Host headers are rejected");
  const forbiddenOrigin = await fetch(url, { method: "POST", headers: { ...auth,
    Origin: "https://evil.example.com", "Content-Type": "application/json",
  }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  check(forbiddenOrigin.status === 403, "Cross-origin requests are rejected");
  const notFound = await fetch("http://127.0.0.1:" + port + "/missing", { headers: auth });
  check(notFound.status === 404, "Unknown paths are rejected");
  const noGet = await fetch(url, { headers: auth });
  check(noGet.status === 405, "Legacy streaming GET is not exposed");
  const huge = await fetch(url, { method: "POST", headers: {
    ...auth, "Content-Type": "application/json",
  }, body: JSON.stringify({ data: "x".repeat(1024 * 1024) }) });
  check(huge.status === 413, "Requests larger than 1 MiB are rejected");

  const first = makeClient(url);
  await first.client.connect(first.transport);
  check(Boolean(first.client.getDiscoverResult()),
    "Official client negotiates MCP 2026-07-28 without initialize sessions");
  const available = await first.client.listTools();
  const names = new Set(available.tools.map(tool => tool.name));
  check(names.has("presentation_create") && names.has("presentation_render_slide") &&
    names.has("presentation_export_pdf"), "Modern HTTP client discovers all presentation tools");

  const created = await call(first.client, "presentation_create", {
    name: "remote-demo", title: "MCP HTTP shared project",
  });
  check(created.revision?.length === 64, "Modern MCP client creates a persisted project");

  const second = makeClient(url);
  await second.client.connect(second.transport);
  const listed = await call(second.client, "presentation_list", {});
  check(listed.projects.some(item => item.name === "remote-demo"),
    "Two independent HTTP clients see the same project without transport sessions");
  const slide = await call(second.client, "presentation_add_slide", {
    project: "remote-demo", name: "Remote slide", expectedRevision: created.revision,
  });
  check(Boolean(slide.slideId), "Second client adds slides safely");

  const read = await call(first.client, "presentation_get", { project: "remote-demo" });
  check(read.slides.length === 1 && read.slides[0].id === slide.slideId,
    "First client sees changes created through second HTTP client");

  const legacy = makeClient(url, "legacy");
  await legacy.client.connect(legacy.transport);
  check(legacy.client.getDiscoverResult() === undefined,
    "Earlier MCP client uses legacy initialize fallback");
  const oldTools = await legacy.client.listTools();
  check(oldTools.tools.some(tool => tool.name === "presentation_get"),
    "Legacy Streamable HTTP can still list MCP tools");

  console.log("MCP 2026-07-28 HTTP smoke test passed");
} finally {
  for (const client of clients) await client.close().catch(() => undefined);
  await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
