/**
 * Writes dist/sw.js after each build: a small service worker that keeps a copy of every file
 * of this version on the device, so Stubli Writer opens with no connection.
 *
 * - Only the app's own files. Requests to Google (sign-in, Drive) are never touched.
 * - Each build has its own cache; the old one is removed once the new version takes over.
 * - A new version waits until the writer chooses "Reload to update", so the app never changes
 *   in the middle of a sentence.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "stubli-writer-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split("\\").join("/"))
        .filter((f) => f !== "sw.js" && !f.startsWith("selftest") && !f.endsWith(".map"))
        .sort();
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = `stubli-writer-${hash.digest("hex").slice(0, 12)}`;
      writeFileSync(join(outDir, "sw.js"), workerSource(version, files.map((f) => `./${f}`)));
    },
  };
}

function workerSource(version: string, files: string[]): string {
  return `// Stubli Writer offline copy. Made by the build; see scripts/service-worker-plugin.ts.
const VERSION = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(["./", ...files], null, 0)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("stubli-writer-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "update-now") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Only this app's own files; Google sign-in and Drive go straight to the network.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // The page asked for (the app, or the privacy page); the app for any other address.
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(request.url, { ignoreSearch: true, ignoreVary: true })
          .then((hit) => hit || cache.match("./index.html", { ignoreVary: true }))
          .then((hit) => hit || fetch(request)),
      ),
    );
    return;
  }
  // ignoreVary: a server may say its answer "varies" by Origin; for our own files it doesn't.
  event.respondWith(
    caches.open(VERSION).then((cache) => cache.match(request.url, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(request))),
  );
});
`;
}
