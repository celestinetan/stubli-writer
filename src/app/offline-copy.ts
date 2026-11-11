/**
 * Keeps a copy of the app on this device (the service worker in the built site), and tells the
 * app when a new version is ready.
 */

const listeners = new Set<() => void>();
let waiting: ServiceWorker | null = null;

export function onUpdateReady(listener: () => void): () => void {
  listeners.add(listener);
  if (waiting) listener();
  return () => listeners.delete(listener);
}

/** Switches to the new version and reloads. */
export function updateNow(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
  waiting.postMessage("update-now");
}

export function startOfflineCopy(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((reg) => {
        const ready = (w: ServiceWorker | null) => {
          // Only an update: the very first install has nothing to replace.
          if (w && navigator.serviceWorker.controller) {
            waiting = w;
            listeners.forEach((l) => l());
          }
        };
        if (reg.waiting) ready(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => w.state === "installed" && ready(w));
        });
      })
      .catch(() => {
        // No offline copy (for example in a private window). The app still works online.
      });
  });
}

/**
 * Asks the browser to keep this site's data (Drive notes kept on the device) instead of
 * clearing it when space runs low or after weeks without a visit. Browsers may say no.
 */
export async function keepDataOnDevice(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
