import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { Presentation } from "../core/types";
import { validatePresentation } from "../core/validation";
import { ProjectRepository } from "../mcp/project-repository";
import { buildStandaloneHtml } from "../export/standalone.mjs";

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const VALID_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const REVISION = /^[a-f0-9]{64}$/;
type Next = () => void;

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.includes("application/json"))
    throw new ApiError(415, "Expected application/json");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += bytes.length;
    if (size > MAX_REQUEST_BYTES) throw new ApiError(413, "Request exceeds 6 MiB");
    chunks.push(bytes);
  }
  try {
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("not an object");
    return input as Record<string, unknown>;
  } catch { throw new ApiError(400, "Invalid JSON object"); }
}
function json(res: ServerResponse, status: number, data: unknown, etag?: string): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(etag && { ETag: '"' + etag + '"' }),
  });
  res.end(status === 304 ? undefined : JSON.stringify(data));
}
function assertLocal(req: IncomingMessage): void {
  const ip = req.socket.remoteAddress ?? "";
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip))
    throw new ApiError(403, "Localhost access only");
  // The Host header must also be loopback: DNS rebinding must not expose this API.
  const host = (req.headers.host ?? "").replace(/:[0-9]+$/, "").toLowerCase();
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host))
    throw new ApiError(403, "Only localhost Host headers are permitted");
  const origin = req.headers.origin;
  if (origin) {
    try {
      const target = new URL(origin);
      if (!["http:", "https:"].includes(target.protocol) || target.host !== req.headers.host)
        throw new ApiError(403, "Cross-origin requests are not permitted");
    } catch { throw new ApiError(403, "Cross-origin requests are not permitted"); }
  }
}
async function processApi(
  req: IncomingMessage,
  res: ServerResponse,
  repository: ProjectRepository,
  pathname: string,
): Promise<void> {
  assertLocal(req);
  const method = req.method ?? "GET";
  if (pathname === "/api/export") {
    if (method !== "POST") throw new ApiError(405, "Unsupported method");
    const input = await bodyOf(req);
    validatePresentation(input.project);
    const html = await buildStandaloneHtml(input.project as Presentation);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": 'attachment; filename="presentation.html"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(html);
    return;
  }

  const name = pathname.slice("/api/projects".length).replace(/^\/|\/$/g, "");
  if (!name) {
    if (method === "GET") return json(res, 200, { projects: await repository.list() });
    if (method !== "POST") throw new ApiError(405, "Unsupported method");
    const input = await bodyOf(req);
    if (typeof input.name !== "string" || !VALID_NAME.test(input.name))
      throw new ApiError(400, "Invalid project name");
    if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 300)
      throw new ApiError(400, "A project title is required");
    const record = await repository.create(input.name, input.title);
    json(res, 201, { name: input.name, project: record.project, revision: record.revision });
    return;
  }
  if (!VALID_NAME.test(name)) throw new ApiError(404, "Unknown project");
  if (method === "GET") {
    const record = await repository.read(name);
    if (req.headers["if-none-match"] === '"' + record.revision + '"')
      return json(res, 304, null, record.revision);
    json(res, 200, { name, project: record.project, revision: record.revision }, record.revision);
    return;
  }
  if (method === "PUT") {
    const input = await bodyOf(req);
    if (typeof input.expectedRevision !== "string" || !REVISION.test(input.expectedRevision))
      throw new ApiError(428, "expectedRevision is required");
    validatePresentation(input.project);
    const record = await repository.replace(
      name, input.project as Presentation, input.expectedRevision);
    json(res, 200, { name, project: record.project, revision: record.revision }, record.revision);
    return;
  }
  throw new ApiError(405, "Unsupported method");
}

/** Shared by the Vite web studio and the built static Node.js server. */
export function createLocalApiHandler(repository = new ProjectRepository()) {
  return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch { return json(res, 400, { error: "Invalid URL" }); }
    if (pathname !== "/api/export" && pathname !== "/api/projects" &&
        !pathname.startsWith("/api/projects/")) {
      next();
      return;
    }
    void processApi(req, res, repository, pathname).catch((error: unknown) => {
      if (res.headersSent) return;
      const err = error as Error & { code?: string };
      const status = error instanceof ApiError ? error.status :
        err.code === "ENOENT" ? 404 :
        err.code === "EEXIST" || err.message.startsWith("Revision mismatch") ? 409 :
        err.name === "PresentationValidationError" ? 422 : 500;
      if (status === 500) console.error("Project API failure:", err);
      json(res, status, { error: status === 500 ? "Internal project API error" : err.message });
    });
  };
}

export function projectApiPlugin(repository = new ProjectRepository()): Plugin {
  const handler = createLocalApiHandler(repository);
  return {
    name: "core-presentation:local-project-api",
    apply: "serve",
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
