# Core Presentation

**Open, agent-friendly presentation engine with a browser-based visual studio.**

Create presentations as versioned JSON documents and render them using standard **HTML, CSS and JavaScript**. The player does not require PowerPoint, a backend, a paid service, or the editor to run.

> Status: v0.1 alpha. The engine, minimal visual studio and offline HTML export are implemented. This is a foundation, not yet a PowerPoint/Figma feature-complete product.

## Quick start

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/kuminovvv/core-presentation.git
cd core-presentation
npm install
npm run dev
```

Open the local URL printed by Vite (normally **http://127.0.0.1:5173/**). The studio starts with a three-slide demo.

The visual editor supports adding and removing slides; adding text, shapes, image URLs and HTML/JS blocks; selecting and dragging elements; editing properties; undo/redo; importing/exporting JSON; and previewing the presentation with transitions and animations. It is a first iteration: resizing by handles, multi-select, templates, timelines, asset management and native desktop interfaces are future work.

## Export a presentation to a single HTML file

```bash
npm run export:html -- examples/basic.json presentation.html
```

Open `presentation.html` directly in a browser. Use arrows or the buttons to navigate. HTML/CSS/JS code and the player are bundled inside the exported file, so it works **without an editor or an internet connection**. Images referenced by remote URLs are *not* embedded; use data URLs for a completely offline presentation with images.

To export a project created visually, first click **Сохранить JSON** in the editor, then pass the downloaded JSON file to the command above.

## Architecture

```text
src/
  core/
    types.ts        Open document model, format v1
    validation.ts   Input checking, JSON parsing/serialization
    document.ts     Immutable editing functions, agent API
    store.ts        Undo/redo, event subscription
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
  style.css
scripts/
  export-html.mjs   Single-file HTML export
examples/
  basic.json        Open-format presentation with interactive JS
tests/
  core.test.ts      Schema, editing, undo/redo coverage
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

The `PresentationStore` class provides history and subscriptions. A dedicated MCP server can be built on this API later without redesigning the document model.

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
```

GitHub Actions runs type checking, tests, production build and standalone export on each push to `main` and pull request.

## Planned work

- Full visual-editor interactions: resize, rotate handles, selection groups and alignment guides.
- Rich text, typography, asset library, charts and reusable components.
- Animation timeline, triggers and advanced transitions.
- Dedicated command protocol/MCP integration for AI agents.
- Offline file/project manager and improved export/asset packaging.
- Native Rust application **after** the engine and web editor have matured.

## License

No license has been selected yet. Until one is added, standard copyright rules apply.
