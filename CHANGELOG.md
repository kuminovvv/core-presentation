# Changelog

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
