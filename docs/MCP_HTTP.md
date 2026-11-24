# MCP 2026-07-28 over HTTP

Core Presentation supports **two independent MCP transports** using the same 21 presentation tools and project directory:

- `npm run mcp`: local **stdio**, launched by Codex from an absolute path.
- `npm run mcp:http`: **Streamable HTTP**, supporting MCP `2026-07-28` through the official TypeScript SDK v2 `createMcpHandler`. Requests are stateless and do not share a transport session.

The HTTP service is **off by default**, bound to `127.0.0.1`, and always requires a bearer token. It uses the same file-backed project repository as the web editor; projects remain local. This is a personal token setup, **not OAuth 2.1**, and it is not a public internet deployment.

## Quick start on any Windows drive

After cloning the repository, run these PowerShell commands **in the project folder**, whether it is under `C:`, `D:` or another drive:

```powershell
npm ci
$env:CORE_PRESENTATION_MCP_TOKEN = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run mcp:http
```

The token is stored only in the current PowerShell environment. To copy it into a secure password manager or another trusted terminal, you can display it once by entering `$env:CORE_PRESENTATION_MCP_TOKEN`. Changing the token invalidates existing client configurations. To have the same token in another PowerShell terminal, securely set `CORE_PRESENTATION_MCP_TOKEN` there too. Do not put tokens in Git files or share them in screenshots.

Once running, the endpoint is **http://127.0.0.1:4174/mcp**. The token is **never printed by the server**. Use a **different terminal** to register it with Codex:

```powershell
codex mcp add core-presentation-http --url http://127.0.0.1:4174/mcp --bearer-token-env-var CORE_PRESENTATION_MCP_TOKEN
codex mcp list
```

When the terminal running Codex has the token in its environment, Codex can create slides, inspect presentations and export HTML/PDF using HTTP. For everyday use on the same computer, the already-supported `stdio` command remains simpler.

## Connecting from another computer

The MCP endpoint deliberately does **not** bind to `0.0.0.0`; binding it to an untrusted network would expose write access to your presentation projects over plaintext HTTP. Use an authenticated **SSH tunnel**, trusted VPN with authenticated TLS reverse proxy, or an OAuth-enabled MCP gateway.

For example, when the computer running Core Presentation has an SSH server reachable by the client machine:

```powershell
ssh -N -L 4174:127.0.0.1:4174 user@your-host
```

The client machine can now access `http://127.0.0.1:4174/mcp` through the tunnel, using the same secret token. The HTTP MCP process and the Studio can run separately with their shared `presentations/` directory.

**Do not publish port 4174 directly to the internet.** OAuth 2.1 protected-resource metadata, client registration, per-user access control and remote TLS termination are not part of this release.

## Verification

```powershell
npm run test:mcp:http
```

The test exercises the **official SDK v2 HTTP client** (including 2026-07-28 discovery and stateless tool calls), an older handshake client for compatibility, authentication failures, Origin/Host checks, and project read/write operations using a temporary project directory.

## Security properties

- Only loopback connections and loopback `Host` headers are accepted; invalid `Origin` headers are rejected to reduce DNS rebinding and cross-site request risks.
- A 32+ character bearer token is required for **every** request, including read operations. Authentication compares SHA-256 digests using constant-time comparison.
- The maximum POST body is 1 MiB. Neither credentials nor payloads are logged.
- No HTTP state or session ID is shared between clients; each MCP request creates its own SDK server instance, while project operations share validated, revision-checked files.
- The browser Studio API on port 4173 is a **separate local interface**. Only the /mcp endpoint on 4174 requires the bearer token. Keep both ports local.
- The server does not implement OAuth, MCP Tasks, subscriptions or a globally deployed Cloudflare Worker; protocol compatibility is not the same as enabling every optional MCP extension.

Specification: https://modelcontextprotocol.io/specification/2026-07-28/
