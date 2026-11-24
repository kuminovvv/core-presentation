# Changelog

## [0.9.0] — 2026-11-24

### Added

- Local project duplication, safe archive into `.trash/`, and automatic restoration of the last opened project.
- Browser toolbar project management and a persistent browser-local draft for the demo document.
- MCP operations for copying/archiving projects and exporting printable PDF presentations.
- Double-click Windows launcher with install/build/open flow.
- Browser, repository and MCP regression tests covering the full project lifecycle.

### Fixed

- Prevent loss of local demo edits when refreshing the page.
- Revision-guarded archives ensure an old tab cannot archive a newer agent revision.


## [0.8.0] — 2026-11-24

### Added

- PDF export from the web editor with one page per slide and selectable text.
- Dedicated print renderer shared by local Node server and Vite development server.
- Fullscreen presentation mode available from the preview overlay.
- PDF format and UI smoke tests (including built Node server).

### Safety

- PDF generation denies remote network and file requests in its isolated Chrome context.
- The PDF renderer limits viewport dimensions and page count to prevent runaway work.


## [0.7.0] — 2026-11-24

### Added

- Editable starter slide gallery: title, section, two-column comparison, quote and blank.
- Drag-and-drop slide sorting from the thumbnail sidebar.
- Unit tests for layout geometry, ID stability, serialization and browser gesture regression.


## [0.6.0] — 2026-11-24

### Added

- Local Node.js server to run the compiled web studio independently of Vite development mode.
- Shared API handler for development, Vite preview and built static UI.
- Built-server Chrome integration test, verifying persistent project creation, editing, export and same-origin protection.

### Notes

- The server is localhost-only by design. Remote access requires a separately secured deployment configuration.
- The bundled Node runtime still expects dependencies installed via `npm ci` and a prior `npm run build`.


## [0.5.0] — 2026-11-24

### Added

- Direct standalone HTML export button in the browser editor.
- Image upload with embedded offline-friendly PNG/JPEG/WebP/GIF data URLs and size validation.
- Inline text editing by double-click on the slide (Ctrl+Enter to save, Escape to cancel).
- Browser regression coverage for offline image embedding, HTML download and inline editing.

### Limitations

- Browser HTML export uses the local Vite development server; static deployment without this API must provide a compatible export backend.
- Embedded raster images count against the 5 MiB project document limit.


## [0.4.0] — 2026-11-24

### Added

- Two-way synchronization between the browser studio and MCP project directory.
- Localhost-only same-origin project API embedded in the Vite development server.
- Project picker, new-project dialog, save status, local JSON drafts and conflict recovery.
- Browser autosave and automatic refresh for MCP writes, without importing JSON.
- Cross-process lockfiles and mandatory revision checks for browser full-document writes.
- End-to-end browser+MCP test for autosave, remote refresh, conflicting edits and saved copies.

### Known limits

- Whole-document synchronization is near-live (approximately 1.4 seconds), not cursor-level co-editing.
- The API is available in the development server only; standalone HTML remains self-contained.
- Simultaneous writes to the same project require explicit conflict resolution.


## [0.3.0] — 2026-11-23

### Added

- Local stdio MCP server using the official TypeScript SDK v2, with 18 typed tools for presentation editing.
- Project repository with isolated storage root, atomic file replacements, 5 MiB document limit and revision checks.
- MCP tools for project/slide CRUD, text/shapes/images/HTML, bulk style and animation updates, grouping, layers and export.
- PNG slide preview tool driven by a real headless Chrome renderer; remote requests blocked while rendering.
- Portable MCP launcher for Codex with absolute paths, independent of the host's working directory.
- End-to-end MCP client smoke test, with revision conflicts, invalid writes, PNG validation and standalone HTML export.
- MCP usage docs with Windows Codex setup and agent workflow examples.

### Changed

- Standalone HTML builder shared between the CLI exporter and the MCP exporter.
- Upgraded Vitest to a patched version; `npm audit` reports no vulnerabilities.

### Limitations

- The MCP server and the web editor share the same document format, but there is no automatic live sync yet.
- MCP tools do not expose an HTTP server; stdio is intentionally scoped to local agent clients.

## [0.2.0] — 2026-11-23

### Added

- Eight resize handles for single elements and multi-selection.
- Rotation handle for single elements and selected groups; Shift snaps to 15°.
- Shift-click, drag-to-select marquee and Ctrl/Cmd+A selection.
- Explicit non-destructive grouping via stable `groupId` in format v1.
- Alignment controls, front/back stacking, duplication and keyboard nudging.
- Smart snapping to slide centers/edges and other elements (Alt disables snapping).
- Basic per-element animation timeline with delay/duration inputs.
- Pure geometry utilities, atomic batch editing functions and an extended public TypeScript API.
- Real browser E2E smoke test with Playwright and installed Chrome.
- Unit tests for geometry, grouping, duplication, z-order and invalid updates.

### Quality

- 17 unit tests; real-browser smoke coverage for rendering, selecting, resizing, rotating, grouping, snapping, undo/redo, preview and export.
- Resized and rotated gestures are committed as single undoable transactions.

### Known limits

- Multi-selection bounds are logical axis-aligned bounds, even for individually rotated objects.
- Timeline supports animation delay/duration and selection, not arbitrary keyframes.
- Assets referenced by URL are not embedded in standalone HTML.
- No dedicated MCP server or native Rust editor yet.

## [0.1.0] — 2026-11-23

- Initial JSON-based presentation engine, DOM renderer and sandboxed HTML/CSS/JS elements.
- Three-slide sample, minimal web studio, preview transitions and standalone HTML export.
- Immutable document API, undo/redo store and GitHub Actions CI.
