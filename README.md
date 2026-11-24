# Core Presentation

**Open, agent-friendly presentation engine with a browser-based visual studio.**

Create presentations as versioned JSON documents and render them using standard **HTML, CSS and JavaScript**. The player does not require PowerPoint, a backend, a paid service, or the editor to run.

> Status: v0.9 release candidate. Engine, visual studio, grouping, alignment guides, animation timeline, standalone HTML export and an AI-agent MCP server are implemented. This is a foundation, not yet a PowerPoint/Figma feature-complete product.

## Start editing on Windows

After cloning the repository, double-click **start-core-presentation.cmd**. It installs dependencies if necessary, builds the current version, launches the local server and opens your browser. The server is localhost-only, and projects stay on your computer. See the [Windows quick start](docs/WINDOWS.md).

## Quick start

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/kuminovvv/core-presentation.git
cd core-presentation
npm install
npm run dev
```

Open the local URL printed by Vite (normally **http://127.0.0.1:5173/**). The studio starts with a three-slide demo.

The visual editor supports adding and removing slides; adding text, shapes, image URLs and HTML/JS blocks; dragging, resizing and rotating elements; multi-selection, grouping, alignment, snapping guides, z-index controls; editing properties; undo/redo; importing/exporting JSON; and previewing presentations with transitions and animations.

### Create presentations with an AI agent

Core Presentation now includes a **local stdio MCP server** supporting **18 typed tools** for creating and reading projects, editing slides, changing text/CSS/animations, grouping objects, screenshotting slides, and exporting standalone HTML. It works with Codex and any MCP client implementing stdio.

```powershell
npm run mcp
```

To connect Codex on Windows, see the complete setup and tool catalog in **[docs/MCP.md](docs/MCP.md)**. The server never needs a token or an HTTP port. It saves projects under an isolated `presentations/` directory. AI and browser edits now share the same file-backed projects. Choose a project in the top toolbar or create a new one. Browser changes auto-save and the editor fetches agent changes roughly every 1.4 seconds, without manual JSON import. Revision conflicts cannot silently overwrite newer edits: select **Версия агента** to discard the local copy, or **Сохранить копию** to preserve it as a separate project.

### Visual editing & shortcuts

| Gesture / Shortcut | Action |
| --- | --- |
| Drag element | Move; smart guides snap to slide center, edges and other elements |
| Drag a white square | Resize selected element or whole selection |
| Drag the cyan circular handle | Rotate selection (Shift: snap to 15° increments) |
| Shift + click | Add or remove element/group from selection |
| Drag empty canvas | Marquee-select intersecting objects |
| Alt + drag element | Move without smart snapping |
| Ctrl/Cmd + A | Select all elements on the current slide |
| Ctrl/Cmd + G | Group selected elements |
| Ctrl/Cmd + Shift + G | Ungroup |
| Ctrl/Cmd + D | Duplicate selected elements |
| Arrow keys / Shift + arrows | Nudge 1 px / 10 px |
| Ctrl/Cmd + Z or Y | Undo / redo (Shift + Z also redoes) |
| Delete / Backspace | Delete selected elements |
| Escape | Clear selection or exit preview |

The inspector provides exact X/Y/size, colors, rotation, layer ordering and 6 alignment commands.
Select **Анимации** in the canvas toolbar to open a basic timeline: inspect per-element tracks and edit animation delays/durations in milliseconds. Choose animation type in the properties panel.

Limitations in v0.2: rotation and resizing are supported, but rotated multi-selection uses logical unrotated group bounds for alignment and resizing; no aspect-ratio lock, multi-user collaboration, image asset embedding, keyframe timeline or native Rust UI yet.

### Run the complete built web studio locally

After building, you can run a real Node.js HTTP server that serves the production UI **and** the shared MCP project API. Vite development middleware is not required at runtime:

```bash
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4173/**. The server binds to localhost for safety, uses the same `presentations/` files as Codex/MCP and supports autosave and standalone HTML export. Use `PORT=...` to change its port. The backend is intentionally not exposed to the public internet; do not reverse-proxy this local editing API without adding authentication and TLS.

```bash
npm run test:built
```

### Full-screen presenting and PDF export

Use **Предпросмотр** to present the slide deck and **⛶ Полный экран** to enter full-screen slideshow mode. Arrow keys, Space, Home and End navigate slides; Escape exits presentation mode. The presentation can also be downloaded as a self-contained HTML file.

Use **PDF** to export every slide as its own page. PDF is generated with headless Chrome and preserves selectable text. Google Chrome must be installed locally; if it is not available in the default location, configure `CHROME_PATH` in the environment. Embedded images are printed. Remote resources are deliberately blocked during PDF export for privacy; use embedded image files for fully self-contained results.

### Your projects, always available

Choose a project from the top toolbar. The editor remembers your last project between browser sessions and restores it automatically. The menu beside the project selector allows you to make independent copies or archive old projects. Archiving preserves all files in `presentations/.trash/` for recovery instead of permanently removing them.

If you edit the local demo without creating a named project, the document is saved to browser localStorage so a page refresh does not discard your work. Download **Сохранить JSON** to keep a portable backup.

### Native editable slide layouts

The left sidebar offers a gallery of starter layouts: **Title**, **Section**, **Two columns**, **Quote**, and **Blank**. Each layout consists of ordinary editable text/shape objects and can be customized by hand or by an agent. Drag slide thumbnails to reorder slides; their IDs and element data remain intact.

### Work directly with HTML and images

Double-click a text object to edit its content on the slide (Ctrl+Enter to finish, Escape to cancel). Select an image object to upload PNG/JPEG/WebP/GIF files from your computer; uploaded images are embedded as data URLs and remain usable in offline presentations.

Click **Экспорт HTML** in the web editor to download a standalone HTML presentation directly, without using a terminal. The built-in export endpoint is available in both the Vite development server (`npm run dev`) and the compiled local Node studio (`npm start`). Exported presentations work independently of either server.

### Live editing between the agent and browser

Start the editor with `npm run dev`, open `http://127.0.0.1:5173`, and create/select a shared project using the top toolbar. Have Codex use MCP `presentation_get`, `presentation_add_slide`, and `presentation_update_elements` on that same project. Changes are automatically reflected on the canvas. In the other direction, browser edits are persisted to `presentations/<name>/presentation.json` after a short debounce.

- The project API is available through both the Vite development server and the compiled local Node studio, and accepts same-origin localhost requests only.
- Project files are shared through an isolated root directory; writes are protected by revision checks and a cross-process project lock.
- Unsaved browser drafts are backed up in localStorage. If another writer changes the project first, editing pauses in an explicit conflict state with two recovery choices.
- Standalone exported HTML files do **not** require this local API.
- Live editing synchronizes document state, not cursors or keystrokes; two simultaneous edits to one document may require conflict resolution.

```bash
npm run test:live
npm run test:built
```

## Export a presentation to a single HTML file

```bash
npm run export:html -- examples/basic.json presentation.html
```

Open `presentation.html` directly in a browser. Use arrows or the buttons to navigate. HTML/CSS/JS code and the player are bundled inside the exported file, so it works **without an editor or an internet connection**. Images referenced by remote URLs are *not* embedded; use data URLs for a completely offline presentation with images.

For quick export, click **Экспорт HTML** in the running web editor. The command-line exporter remains available for agents and automation.

## Architecture

```text
src/
  core/
    types.ts        Open document model, format v1
    validation.ts   Input checking, JSON parsing/serialization
    document.ts     Immutable editing functions, agent API
    store.ts        Undo/redo, event subscription
  editor/
    geometry.ts     Pure resize, rotate, snap and marquee functions
    layouts.ts      Editable starter slide layouts
  server/
    project-api.ts  Reusable local project API for dev and built server
    production.ts   Node HTTP server for the compiled web app
  mcp/
    project-repository.ts   File storage, revision checking, atomic saves
    server.ts       Typed MCP tools for AI agents
    stdio.ts        Local MCP stdio server
    preview.ts      Headless Chrome PNG screenshots
  export/
    standalone.mjs  Shared standalone HTML builder
    pdf.mjs         PDF export through isolated Chrome
  print.ts          Browser print layout for a PDF page per slide
  renderer/
    dom.ts          HTML element rendering, sandboxed widgets
    player.ts       Presentation navigation, transitions, animations
    player.css
  demo.ts           Example presentation
  standalone.ts     Tiny standalone player bootstrap
  index.ts          Public programmatic API
web/
  index.html        Studio interface
  main.ts           First visual editor implementation
  canvas-interactions.ts  Canvas manipulation / selection controller
  project-sync.ts  Debounced autosave, polling, conflict management
  style.css
scripts/
  export-html.mjs   Single-file HTML export
  launch-mcp.mjs    Portable Codex/stdio launcher
  run-studio.mjs   Local Node server for compiled editor
  smoke-built.mjs  Production-bundle integration test
  smoke-editor.mjs  Real Chrome editor gesture test
  smoke-mcp.mjs     MCP client end-to-end tool test
  smoke-live.mjs    Browser + MCP cross-process synchronization test
examples/
  basic.json        Open-format presentation with interactive JS
tests/
  core.test.ts      Schema, editing, undo/redo coverage
  geometry.test.ts  Geometry, grouping, layer and snapping tests
  mcp-project-repository.test.ts  File safety, concurrency and revisions
```

### JSON schema

Each document declares a version, viewport and slides. Every slide owns elements with **stable IDs**, coordinates, size and optional animation. Elements may be `text`, `shape`, `image`, or `html`. Layout is independent of viewport scaling.

```json
{
  "version": 1,
  "id": "deck-001",
  "title": "Hello",
  "viewport": { "width": 1600, "height": 900 },
  "slides": [
    {
      "id": "slide-001",
      "name": "Opening",
      "background": "#111827",
      "transition": { "type": "fade", "duration": 500 },
      "elements": [
        {
          "id": "headline",
          "type": "text",
          "text": "Hello, world!",
          "x": 100, "y": 300, "width": 1000, "height": 130,
          "fontSize": 88, "color": "#ffffff",
          "animation": { "type": "slide-up", "duration": 600 }
        }
      ]
    }
  ]
}
```

### Agent and developer API

Code agents can generate/edit the JSON directly or invoke the same immutable editing operations used by the studio:

```ts
import {
  createPresentation, createSlide, createElement,
  addSlide, addElement, updateElement, serializePresentation
} from "./src";

let deck = createPresentation("Quarterly results");
const slide = createSlide("Introduction");
deck = addSlide(deck, slide);

const headline = createElement("text");
headline.text = "Our results";
deck = addElement(deck, slide.id, headline);
deck = updateElement(deck, headline.id, { x: 200, fontSize: 96 });

console.log(serializePresentation(deck));
```

The same API also exposes `updateElements` for atomic multi-element operations, `groupElements`, `ungroupElements`, `reorderElements`, `duplicateElements`, and pure geometry helpers such as `resizeElements`, `rotateElements`, and `snapMove`. All are usable from TypeScript without the web editor. Group membership persists as an optional `groupId` string on each element.

The `PresentationStore` class provides history and subscriptions. The MCP server implements typed operations on the same document model, can supply visual PNG screenshots, exports PDF, and manages project copies and archives.

### Custom HTML / CSS / JS components

`html` elements have three fields: `html`, `css`, and `javascript`. They render inside **sandboxed iframes** (`sandbox="allow-scripts"`, without `allow-same-origin`), isolated from the parent editor. This makes it possible to display interactive charts and widgets written by agents or developers.

**Security:** sandboxing is not a substitute for reviewing third-party code. Custom scripts can still make network requests. Do not execute presentations from unknown sources without assessing the trust boundary. External image URLs also initiate network requests.

### Future native Rust application

The source-of-truth is an intentionally language-neutral JSON document (format v1). A future native Rust editor can read and update the same project format without embedding the web editor or copying its architecture. The current TypeScript renderer is browser-specific.

## Development quality

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:mcp
npm run test:live
```

The browser smoke suite uses **playwright-core** with an already installed Google Chrome and does **not** download a separate browser. GitHub Actions runs type checking, unit tests, browser smoke tests, MCP tool integration tests, live cross-process synchronization tests, production build and standalone export on each push to `main` and pull request.

## Stable release criteria

The v0.9 release candidate supports a complete authoring workflow: create/open projects, editable slide templates, content and styling, animation/transition preview, full-screen presentation, standalone HTML and PDF export, browser autosave, undo/redo, safe project archives, and automatic synchronization with AI agents. Tests cover both development and production Node server routes.

The desktop Rust application, keyframe animation editor, real-time multi-user cursors and advanced rich-text formatting are separate future roadmap items; they are **not** required for the usable web application.

## Planned work

- Rich editor interactions: aspect-ratio locking, precision rotated-group bounds, editable selection handles for skew, distributions and rulers.
- Rich text, typography, asset library, charts and reusable components.
- Advanced keyframe animation timeline, triggers and additional transitions.
- Real-time multi-user cursors, shared selections and more granular conflict merging.
- Offline file/project manager and improved export/asset packaging.
- Native Rust application **after** the engine and web editor have matured.

## License

No license has been selected yet. Until one is added, standard copyright rules apply.
