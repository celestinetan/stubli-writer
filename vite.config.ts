/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Content-Security-Policy for the built site.
 *
 * GitHub Pages can't send headers, so the policy goes in a <meta> tag. It is added to the
 * production build only: the dev server injects inline scripts for hot reload, which a
 * strict policy would block.
 *
 * The page may load its own files, plus Google's sign-in (accounts.google.com, loaded only in
 * Google Drive mode) and talk to Google Drive (www.googleapis.com). Nothing else.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' https://accounts.google.com/gsi/style",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src https://accounts.google.com/gsi/",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "stubli-writer-csp",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  // Relative paths so the site works at any address (github.io/stubli-writer/ or a domain).
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  build: {
    // Keep fonts as separate files: inlined data: fonts would need a looser font-src.
    assetsInlineLimit: 0,
    sourcemap: false,
    // The self-test page exists only in the browser-test build (SELFTEST=1), never in the site.
    rollupOptions: {
      input: process.env.SELFTEST ? { main: "index.html", selftest: "selftest.html" } : { main: "index.html" },
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
