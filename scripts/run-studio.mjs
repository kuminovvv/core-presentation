import "tsx/esm";
const { createStudioServer } = await import("../src/server/production.ts");
const server = createStudioServer();
const raw = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(raw) || raw < 1 || raw > 65535) throw new Error("Invalid PORT");
server.listen(raw, "127.0.0.1", () => {
  console.log("Core Presentation Studio: http://127.0.0.1:" + raw);
});
const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
