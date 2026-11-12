import { expect, test } from "@playwright/test";

test("has what's needed to install: manifest, icons, Home Screen title", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(new URL(href!, page.url()).href)).json();
  expect(manifest).toMatchObject({ name: "Stubli Writer", short_name: "Writer", display: "standalone", start_url: "./" });
  for (const icon of manifest.icons) {
    const res = await request.get(new URL(icon.src, page.url()).href);
    expect(res.status(), icon.src).toBe(200);
  }
  expect(manifest.icons.some((i: { sizes: string; purpose: string }) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(new URL(apple!, page.url()).href)).status()).toBe(200);
});

test("opens with no connection once it has been opened before", async ({ page, context }) => {
  await page.goto("/");
  // Wait until the offline copy is in place and looking after this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
  });
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await expect(page.locator(".writing h1")).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".writing h1")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('20px "Literata"'))).toBe(true);
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("Written on a plane, TK.");
  await expect(page.locator(".writing")).toContainText("Written on a plane");
  await context.setOffline(false);
});

test("the offline copy never handles requests to Google", async ({ page }) => {
  await page.goto("/");
  const sw = await (await page.request.get("/sw.js")).text();
  expect(sw).toContain("url.origin !== self.location.origin");
  expect(sw).not.toContain("googleapis");
});

test("the privacy page opens from the app, with its own strict policy, and without a connection", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
  });
  await page.getByRole("link", { name: "Privacy and terms" }).click();
  await expect(page.getByRole("heading", { name: "Privacy and terms", level: 1 })).toBeVisible();
  await expect(page.getByText("Your notes never reach us.")).toBeVisible();
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("script-src 'none'");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Privacy and terms", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Back to Stubli Writer" }).click();
  await expect(page.getByRole("heading", { name: "Where should your notes live?" })).toBeVisible();
  await context.setOffline(false);
});
