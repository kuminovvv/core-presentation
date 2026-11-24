import { defineConfig } from "vite";
import { projectApiPlugin } from "./src/server/project-api";

export default defineConfig({
  root: "web",
  plugins: [projectApiPlugin()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: { fs: { allow: [".."] } },
});
