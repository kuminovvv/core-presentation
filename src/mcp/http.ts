/**
 * MCP 2026-07-28 Streamable HTTP transport, alongside the existing local stdio server.
 *
 * The SDK owns protocol negotiation and per-request lifecycle. This Node adapter
 * only handles the localhost boundary, bearer authentication and HTTP streams.
 * Never reuse an McpServer instance between requests.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { ProjectRepository } from "./project-repository";
import { createMcpServer } from "./server";

const MAX_BODY = 1024 * 1024;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export interface McpHttpOptions {
  token: string;
  repository?: ProjectRepository;
}

function response(res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(message);
}

function hostnameFromHeader(host: string | undefined): string | null {
  if (!host) return null;
  try {
    const url = new URL("http://" + host);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.hostname.toLowerCase();
  } catch { return null; }
}

function authorize(header: string | undefined, expectedDigest: Buffer): boolean {
  const match = /^Bearer ([!-~]+)$/.exec(header ?? "");
  if (!match) return false;
  const digest = createHash("sha256").update(match[1]!, "utf8").digest();
  return timingSafeEqual(digest, expectedDigest);
}

async function bodyOf(request: IncomingMessage): Promise<Buffer> {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY)
    throw new Error("body-too-large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of request) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part as string);
    size += bytes.length;
    if (size > MAX_BODY) throw new Error("body-too-large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

async function sendWebResponse(res: ServerResponse, reply: Response): Promise<void> {
  if (res.destroyed) return;
  const headers: Record<string, string> = {};
  reply.headers.forEach((value, key) => { headers[key] = value; });
  // MCP responses must not be reused by caches or MIME-sniffed by browsers.
  headers["cache-control"] = "no-store";
  headers["x-content-type-options"] = "nosniff";
  res.writeHead(reply.status, headers);
  if (!reply.body) { res.end(); return; }
  const reader = reply.body.getReader();
  try {
    while (!res.destroyed) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await new Promise<void>((resolve, reject) => {
          const drain = () => { cleanup(); resolve(); };
          const close = () => { cleanup(); reject(new Error("HTTP client disconnected")); };
          const cleanup = () => {
            res.off("drain", drain);
            res.off("close", close);
          };
          res.once("drain", drain);
          res.once("close", close);
        });
      }
    }
  } finally {
    if (res.destroyed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!res.destroyed) res.end();
}

/**
 * Secure localhost-only MCP server. To connect from another machine, tunnel
 * localhost over SSH or a private authenticated proxy with TLS.
 *
 * This token is a local shared secret, NOT an OAuth authorization server.
 */
export function createMcpHttpServer(options: McpHttpOptions) {
  if (typeof options.token !== "string" || options.token.length < 32 ||
      options.token.length > 512 || !/^[\x21-\x7e]+$/.test(options.token)) {
    throw new Error("CORE_PRESENTATION_MCP_TOKEN must be 32-512 printable ASCII characters without spaces");
  }
  const digest = createHash("sha256").update(options.token, "utf8").digest();
  const repo = options.repository ?? new ProjectRepository();
  const handler = createMcpHandler(() => createMcpServer(repo));
  const server = createServer(async (req, res) => {
    // Request security always executes BEFORE calling the MCP handler.
    if (!LOOPBACK_IPS.has(req.socket.remoteAddress ?? "")) {
      response(res, 403, "MCP is available only from localhost");
      return;
    }
    const hostname = hostnameFromHeader(req.headers.host);
    if (!hostname || !LOOPBACK.has(hostname)) {
      response(res, 403, "Invalid Host header");
      return;
    }
    if (req.url !== "/mcp") {
      response(res, 404, "Not found");
      return;
    }
    if (req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        if (origin.origin !== "http://" + req.headers.host) {
          response(res, 403, "Cross-origin requests are forbidden");
          return;
        }
      } catch {
        response(res, 403, "Invalid Origin header");
        return;
      }
    }
    if (!authorize(req.headers.authorization, digest)) {
      response(res, 401, "Bearer authentication required", {
        "WWW-Authenticate": 'Bearer realm="core-presentation-mcp"',
      });
      return;
    }
    if (req.method !== "POST") {
      response(res, 405, "Only POST is supported", { Allow: "POST" });
      return;
    }
    if ((req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() !== "application/json") {
      response(res, 415, "Content-Type must be application/json");
      return;
    }

    try {
      const body = await bodyOf(req);
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value)) for (const item of value) headers.append(name, item);
      }
      const controller = new AbortController();
      res.once("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      const webRequest = new Request("http://" + req.headers.host + "/mcp", {
        method: "POST", headers, body: new Uint8Array(body), signal: controller.signal,
      });
      const result = await handler.fetch(webRequest);
      await sendWebResponse(res, result);
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }
      if (error instanceof Error && error.message === "body-too-large") {
        response(res, 413, "MCP request exceeds 1 MiB");
      } else {
        console.error("MCP HTTP request error:", error instanceof Error ? error.message : String(error));
        response(res, 500, "MCP server request failed");
      }
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxRequestsPerSocket = 100;
  server.on("close", () => { void handler.close(); });
  return server;
}
