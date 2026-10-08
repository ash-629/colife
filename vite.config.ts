// 覆盖 D02, P01-P07：前端构建与同源API代理。
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4010" },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
