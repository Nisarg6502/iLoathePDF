import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // The website's setup: jsdom polyfills (createImageBitmap via node-canvas,
    // Blob.arrayBuffer, pdf.js worker) the engines need, and English strings.
    setupFiles: ["../web/src/test-setup.ts", "./src/test-setup.ts"],
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
  },
  resolve: { alias: [{ find: /^@\//, replacement: path.resolve(import.meta.dirname, "../web/src") + "/" }] },
});
