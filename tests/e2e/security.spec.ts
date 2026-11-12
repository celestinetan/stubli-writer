/**
 * Security checks on the built site, and on what a note can contain.
 * See docs/security.md for what each check protects against.
 */
import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "Checked once, at laptop size.");

test("the built page has a strict policy and no inline code", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1].replace(/&#39;/g, "'");
  expect(csp).toBeTruthy();
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
  // No inline scripts, inline styles or event handlers in the page itself.
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  expect(html).not.toMatch(/<style|\sstyle="|\son[a-z]+="/i);
});

test("the app's code only contacts Google's sign-in and Drive", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  const hosts = new Set<string>();
  for (const src of scripts) {
    const js = await (await request.get(src.replace(/^\.\//, "/"))).text();
    expect(js).not.toMatch(/\beval\(|new Function\(/);
    for (const m of js.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1].toLowerCase());
  }
  // Addresses that appear only as text (XML namespaces, links inside error messages) are fine.
  const textOnly = new Set(["www.w3.org", "react.dev", "prosemirror.net", "github.com"]);
  expect([...hosts].filter((h) => !textOnly.has(h)).sort()).toEqual(["accounts.google.com", "www.googleapis.com"]);
});

test("a harmful note can't run code or load things from elsewhere", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  const outside: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "127.0.0.1") outside.push(r.url());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await page.getByRole("button", { name: "Import notes" }).click();
  const note = [
    "# Harmful",
    "",
    "[click me](javascript:alert('link'))",
    "",
    '<img src="x" onerror="alert(\'html\')">',
    "",
    '<script>alert("script")</script>',
    "",
    "Text with <b onmouseover=\"alert('inline')\">hover</b> in it.",
    "",
    "![tracker](https://tracker.example/pixel.png)",
  ].join("\n");
  await page
    .getByRole("dialog", { name: "Import notes" })
    .locator('input[type="file"][accept]')
    .setInputFiles({ name: "Harmful.md", mimeType: "text/markdown", buffer: Buffer.from(note) });
  await page.getByRole("dialog", { name: "Import notes" }).getByRole("button", { name: "Open the first one" }).click();
  await expect(page.locator(".writing h1")).toHaveText("Harmful");

  const writing = page.locator(".writing");
  // The link keeps its text, but not a javascript: address.
  const href = await writing.locator("a", { hasText: "click me" }).getAttribute("href");
  expect(href ?? "").not.toMatch(/^\s*javascript:/i);
  // HTML shows as text in protected blocks; no real <img>, <script> or event handler is made.
  await expect(writing.locator(".raw-block")).toHaveCount(2);
  await expect(writing.locator("script")).toHaveCount(0);
  expect(await writing.locator("[onerror], [onmouseover]").count()).toBe(0);
  // The outside picture isn't loaded; a quiet note says so.
  await expect(writing.locator(".note-image-missing")).toContainText("not loaded");

  await writing.locator("a", { hasText: "click me" }).click();
  await writing.locator(".raw-inline").first().hover();
  await page.waitForTimeout(300);
  expect(dialogs).toEqual([]);
  expect(outside).toEqual([]);
});
