# MCP server for Core Presentation

Core Presentation contains a local **stdio MCP server** built on the official MCP TypeScript SDK v2. It provides AI coding agents with typed tools to create, edit, inspect, render and export HTML presentations. The server runs without a paid account, background daemon or hosted API.

## Quick start

From the repository root:

```powershell
npm ci
npm run mcp
```

This is expected to appear idle: an MCP server waits for a client on stdin. The banner is sent to stderr, never stdout. To use the tools, configure an MCP-capable client such as Codex (below).

**Node.js 22+** and, for PNG screenshots, **Google Chrome** are needed. Set `CHROME_PATH` to your Chrome executable path if Chrome is not available through the default installation channel. All other tools and standalone HTML export work without Chrome.

## Connect Codex (Windows)

In PowerShell, after installing dependencies:

```powershell
codex mcp add core-presentation -- node "D:\Project\core-presentation\scripts\launch-mcp.mjs" --projects-dir "D:\Project\core-presentation\presentations"
codex mcp list
```

If the repository lives elsewhere, replace both paths. The launcher resolves its own dependencies and does not depend on the current working directory. On other operating systems, use their equivalent absolute paths.

Codex can now call tools named `presentation_*`. Restart the current Codex session if it was already open.

Equivalent manual TOML configuration:

```toml
[mcp_servers.core-presentation]
command = "node"
args = [
  "D:\\Project\\core-presentation\\scripts\\launch-mcp.mjs",
  "--projects-dir",
  "D:\\Project\\core-presentation\\presentations"
]
```

For another MCP client, register an stdio command `node`, with those same arguments and a working Node.js installation. No HTTP URL, API token or MCP authentication is required: the host controls access by starting a local process.

## Typical AI workflow

Ask your agent:

> Create a presentation called `product-launch` with five slides, dark backgrounds, smooth transitions, and an interactive chart built with HTML/CSS/JS. Render the opening slide as PNG, inspect its layout and fix any awkward spacing. Then export standalone HTML.

The agent can:

1. Call `presentation_create`, then `presentation_add_slide` for each slide.
2. Call `presentation_add_element` for editable text, shapes, images, and isolated HTML/CSS/JS components.
3. Use `presentation_update_elements` to modify several elements in one transaction and add per-element animation.
4. Call `presentation_render_slide` to receive a PNG for visual feedback; use `presentation_get_slide` to inspect exact geometry.
5. Call `presentation_export_html`; open the resulting `presentation.html` in any browser.

The returned IDs and `revision` are stable references. You can pass `expectedRevision` on mutations to prevent silent overwriting when another agent or editor has saved a newer revision. If an expected revision fails, re-read the project before retrying.

## Tool catalog

| MCP tool | Purpose |
| --- | --- |
| `presentation_list` | Discover locally saved projects and their revisions |
| `presentation_create` | Create a project with a title and viewport |
| `presentation_get` | Read metadata and optionally all editable elements |
| `presentation_get_slide` | Read a single slide with its objects and code |
| `presentation_update` | Change presentation title or dimensions |
| `presentation_add_slide` | Create a slide with background and transition |
| `presentation_update_slide` | Edit a slide's name, background or transition |
| `presentation_remove_slide` | Remove a slide |
| `presentation_duplicate_slide` | Duplicate a slide and its elements |
| `presentation_move_slide` | Reorder a slide |
| `presentation_add_element` | Add text, shape, image or HTML/CSS/JS |
| `presentation_update_elements` | Atomic batch edits, animations and styles |
| `presentation_remove_element` | Remove an element |
| `presentation_group` | Group selected elements |
| `presentation_ungroup` | Ungroup selected elements |
| `presentation_layer` | Move elements to front or back |
| `presentation_render_slide` | Return a PNG screenshot (Chrome required) |
| `presentation_export_html` | Save a browser-ready standalone HTML file |

## Where projects live

By default, projects are in `<repository>/presentations/<project-name>/presentation.json`. The project directory and all its subfolders are ignored by Git. Exports are saved alongside their JSON file.

You may set the storage root with `--projects-dir <absolute-path>` or the `CORE_PRESENTATION_PROJECTS_DIR` environment variable. MCP project names only allow ASCII letters, digits, underscores and hyphens, not arbitrary paths. Documents are validated on every read/write and have a 5 MiB size limit. In-process mutations use per-project serialization and atomic file replacement.

## Safety and limitations

- The server is **local stdio only**. It never exposes a network listener, and never executes shell commands supplied by an agent.
- HTML/JS components execute inside sandboxed browser iframes; **preview mode blocks HTTP, WebSocket and file requests**. Rendering uses Chrome's default sandbox.
- An exported HTML file is ordinary website code, so opening presentations from untrusted sources is not inherently safe. Do not run arbitrary unreviewed JavaScript.
- Remote image URLs are not embedded. PNG preview blocks remote image requests, so use data URLs or local assets converted into data URLs for reliable rendering.
- Projects edited directly on disk can be imported into the current web editor using **Импорт JSON**. Live collaboration between MCP and the web editor is not implemented in this release.
- File operations on the same project are serialized within one MCP process. Multiple separate MCP server processes should coordinate with `expectedRevision` and must not write to the same project simultaneously without additional cross-process locking.

## Test MCP for real

```powershell
npm run test:mcp
```

The test starts a separate stdio MCP server via the same absolute-path launcher Codex uses, from an unrelated working directory. It checks the handshake, creates/edits/saves a project, rejects invalid/stale edits, returns a PNG, exports HTML and tears down its temporary projects afterward. It also writes a preview to the ignored `.artifacts/mcp-preview.png` folder.
