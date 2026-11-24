import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalApiHandler } from "./project-api";
import { ProjectRepository } from "../mcp/project-repository";

const DEFAULT_BUILD_DIR = fileURLToPath(new URL("../../dist/", import.meta.url));
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
function send(res: import("node:http").ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
  res.end(message);
}

/** Serves compiled UI and the local MCP-compatible project API; no Vite dev runtime. */
export function createStudioServer(
  repository = new ProjectRepository(),
  buildDir = DEFAULT_BUILD_DIR,
) {
  const root = resolve(buildDir);
  const api = createLocalApiHandler(repository);
  return createServer((req, res) => {
    api(req, res, () => {
      void (async () => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          send(res, 405, "Unsupported method"); return;
        }
        let pathname: string;
        try { pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname); }
        catch { send(res, 400, "Invalid URL"); return; }
        if (pathname.includes("\\") || pathname.includes("\0")) {
          send(res, 400, "Invalid path"); return;
        }
        const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        const full = resolve(root, relative);
        if (full !== root && !full.startsWith(root + sep)) {
          send(res, 403, "Forbidden"); return;
        }
        let info;
        try { info = await lstat(full); }
        catch { send(res, 404, "Not found"); return; }
        if (!info.isFile() || info.isSymbolicLink()) { send(res, 404, "Not found"); return; }
        res.writeHead(200, {
          "Content-Type": MIME[extname(full).toLowerCase()] ?? "application/octet-stream",
          "Content-Length": String(info.size),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        if (req.method === "HEAD") { res.end(); return; }
        createReadStream(full).on("error", () => res.destroy()).pipe(res);
      })().catch(error => {
        console.error("Studio static server error:", error);
        if (!res.headersSent) send(res, 500, "Internal server error");
        else res.destroy();
      });
    });
  });
}
