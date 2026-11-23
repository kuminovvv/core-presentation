import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { readFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "core-presentation-mcp-"));
const client = new Client({ name: "core-presentation-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(root, "scripts", "launch-mcp.mjs"), "--projects-dir", temp],
  cwd: temp,
  env: { ...process.env, CORE_PRESENTATION_PROJECTS_DIR: temp },
});

const check = (condition, description) => {
  if (!condition) throw new Error(description);
  console.log("PASS", description);
};
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content.map(c => c.text).join(" ")}`);
  const data = result.content.find(c => c.type === "text");
  return { body: data ? JSON.parse(data.text) : null, result };
};

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  check(tools.length >= 16 && tools.some(t => t.name === "presentation_render_slide"),
    "MCP handshake and tool discovery");

  const created = (await call("presentation_create", {
    name: "agent-demo", title: "Demo by MCP", width: 1600, height: 900,
  })).body;
  check(created.revision.length === 64 && created.name === "agent-demo", "Create a persisted project");

  const { body: list } = await call("presentation_list", {});
  check(list.projects.some(p => p.name === "agent-demo"), "Discover saved projects");
  const slide = (await call("presentation_add_slide", {
    project: "agent-demo", name: "Made by Codex",
    background: "linear-gradient(135deg, #112344, #1a498a)",
    transition: { type: "slide", duration: 500 },
    expectedRevision: created.revision,
  })).body;
  check(Boolean(slide.slideId), "Add a slide using a stable ID");

  const text = (await call("presentation_add_element", {
    project: "agent-demo", slideId: slide.slideId, type: "text",
    properties: { text: "Hello from an AI agent", x: 120, y: 150, width: 1250, height: 140,
      fontSize: 80, fontWeight: 700, color: "#ffffff",
      animation: { type: "slide-up", duration: 600, delay: 150 } },
  })).body;
  const shape = (await call("presentation_add_element", {
    project: "agent-demo", slideId: slide.slideId, type: "shape",
    properties: { x: 150, y: 440, width: 320, height: 210,
      fill: "#8899ff", borderRadius: 28 },
  })).body;
  check(Boolean(text.elementId && shape.elementId), "Add text and shape with style and animation");

  const updated = (await call("presentation_update_elements", {
    project: "agent-demo",
    changes: [
      { elementId: text.elementId, properties: { text: "The future is open", fontSize: 92 } },
      { elementId: shape.elementId, properties: { rotation: 12, opacity: 0.9 } },
    ],
  })).body;
  check(updated.editedElementIds.length === 2, "Atomic batch update of multiple elements");

  const beforeInvalid = (await call("presentation_get_slide", { project: "agent-demo", slideId: slide.slideId })).body;
  const invalid = await client.callTool({
    name: "presentation_update_elements",
    arguments: { project: "agent-demo", changes: [
      { elementId: text.elementId, properties: { x: 1000 } },
      { elementId: shape.elementId, properties: { width: -50 } },
    ] },
  }).catch(err => ({ isError: true, content: [{ type: "text", text: err.message }] }));
  const afterInvalid = (await call("presentation_get_slide", { project: "agent-demo", slideId: slide.slideId })).body;
  check(Boolean(invalid.isError) && beforeInvalid.revision === afterInvalid.revision,
    "Invalid batch is rejected without partial mutation");

  const group = (await call("presentation_group", {
    project: "agent-demo", slideId: slide.slideId,
    elementIds: [text.elementId, shape.elementId],
  })).body;
  check(group.revision !== updated.revision, "Group elements and change revision");

  const outOfDate = await client.callTool({
    name: "presentation_update",
    arguments: { project: "agent-demo", expectedRevision: created.revision, title: "Wrong overwrite" },
  });
  check(Boolean(outOfDate.isError), "Optimistic revision prevents stale writes");

  const afterGroup = (await call("presentation_get_slide", {
    project: "agent-demo", slideId: slide.slideId,
  })).body;
  const [a, b] = afterGroup.slide.elements;
  check(a.groupId && a.groupId === b.groupId, "Group identities survive file serialization");
  check(a.text === "The future is open" && a.animation?.type === "slide-up",
    "Text and animation survive JSON round-trip");

  const preview = await client.callTool({
    name: "presentation_render_slide",
    arguments: { project: "agent-demo", slideId: slide.slideId },
  });
  if (preview.isError) throw new Error(preview.content.map(item => item.text).join(" "));
  const pngBlock = preview.content.find(item => item.type === "image");
  const png = Buffer.from(pngBlock?.data ?? "", "base64");
  check(pngBlock?.mimeType === "image/png" && png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    "MCP render_slide returns a real PNG image");
  check(png.readUInt32BE(16) === 1600 && png.readUInt32BE(20) === 900,
    "Rendered screenshot matches slide viewport");
  const artifacts = resolve(root, ".artifacts");
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, "mcp-preview.png"), png);

  const exported = (await call("presentation_export_html", { project: "agent-demo" })).body;
  const html = await readFile(exported.file, "utf8");
  check(html.includes("The future is open") && html.includes("presentation-data"),
    "MCP exports a playable standalone HTML file");

  const saved = JSON.parse(await readFile(join(temp, "agent-demo", "presentation.json"), "utf8"));
  check(saved.slides[0].elements.length === 2, "Document persisted to disk without in-memory state");
  check((await stat(exported.file)).isFile(), "Standalone file is stored alongside the presentation");

  const removed = (await call("presentation_remove_slide", {
    project: "agent-demo", slideId: slide.slideId,
  })).body;
  check(removed.slideCount === 0, "Remove a slide using the public MCP tool");

  console.log("Core Presentation MCP smoke tests passed.");
} finally {
  await client.close().catch(() => undefined);
  await rm(temp, { recursive: true, force: true });
}
