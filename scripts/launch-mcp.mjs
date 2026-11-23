// Absolute-path launcher for Codex, Claude Code and other stdio hosts.
// Resolving tsx relative to this file works regardless of the host's cwd.
import "tsx/esm";
await import("../src/mcp/stdio.ts");
