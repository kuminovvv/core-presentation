import "tsx/esm";
const { createMcpHttpServer } = await import("../src/mcp/http.ts");

const token = process.env.CORE_PRESENTATION_MCP_TOKEN;
if (!token) {
  console.error("Set CORE_PRESENTATION_MCP_TOKEN to a random secret (at least 32 characters).");
  console.error("See docs/MCP_HTTP.md. No HTTP endpoint was opened.");
  process.exit(2);
}
const port = Number(process.env.CORE_PRESENTATION_MCP_PORT ?? "4174");
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  console.error("CORE_PRESENTATION_MCP_PORT must be between 1 and 65535");
  process.exit(2);
}
const server = createMcpHttpServer({ token });
server.listen(port, "127.0.0.1", () => {
  console.error("Core Presentation MCP 2026-07-28 listening at http://127.0.0.1:" + port + "/mcp");
  console.error("Bearer token required. Network exposure is disabled.");
});
const stop = () => server.close();
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
