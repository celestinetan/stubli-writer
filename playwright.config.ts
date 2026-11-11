import { defineConfig, devices } from "@playwright/test";

// Runs against the production build (with its Content-Security-Policy), in the Google Chrome
// already installed on this computer, so no extra browser download is needed.
export default defineConfig({
  testDir: "tests/e2e",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4174", channel: "chrome" },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
});
