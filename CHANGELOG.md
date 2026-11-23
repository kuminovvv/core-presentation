# Changelog

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
