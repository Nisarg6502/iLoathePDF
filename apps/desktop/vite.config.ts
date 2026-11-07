import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";

// package.json's version is the single source the app reports about itself.
const { version } = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
};

// Tauri drives the dev server; keep the port fixed and fail loudly if taken.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/sidecar/**", "**/.venv/**"] },
  },
});
