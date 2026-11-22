import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/**
 * Content Security Policy for the deployed site. GitHub Pages can't send
 * response headers, so it goes in a <meta> tag (which can't express
 * frame-ancestors; see SECURITY notes in the PR). Build only: Vite's dev server
 * injects inline scripts this policy forbids.
 *
 * - script-src 'self': no inline or third-party script can run, so an injected
 *   <script> is inert. 'wasm-unsafe-eval' lets OCR's WebAssembly compile; it
 *   does not allow eval().
 * - worker-src blob: pdf.js may start its worker from a blob URL.
 * - img/media/connect blob: and data: cover previews, results and downloads,
 *   which are all made in the page from the user's own files.
 * - connect-src 'self': the page can't send anything to another server.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) =>
        html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
