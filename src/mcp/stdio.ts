import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ProjectRepository } from "./project-repository";
import { createMcpServer } from "./server";

// This server intentionally has no HTTP listener or credentials.
// The MCP client starts this process and talks through stdin/stdout.
const flag = process.argv.indexOf("--projects-dir");
if (flag >= 0) {
  const directory = process.argv[flag + 1];
  if (!directory) {
    console.error("--projects-dir requires a directory path");
    process.exit(2);
  }
  process.env.CORE_PRESENTATION_PROJECTS_DIR = directory;
}
const repo = new ProjectRepository();
// Never log on stdout; that stream belongs exclusively to MCP JSON-RPC.
console.error(`Core Presentation MCP · project root: ${repo.root}`);
serveStdio(() => createMcpServer(repo));
