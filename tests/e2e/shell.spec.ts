import { expect, test } from "@playwright/test";

test("opens with no errors, no blocked files and no sideways scrolling", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Where should your notes live?" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  expect(problems, problems.join("\n")).toEqual([]);

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("default-src 'self'");

  expect(await page.evaluate(() => document.fonts.check('16px "Figtree"'))).toBe(true);
  // Literata loads once there's writing on the screen.
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await expect(page.locator(".writing h1")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('20px "Literata"'))).toBe(true);
  expect(problems, problems.join("\n")).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("switches to Paper and remembers it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await page.getByRole("button", { name: /Reading mode: Light/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "paper");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "paper");
  await expect(page.getByRole("button", { name: /Reading mode: Paper/ })).toBeVisible();
});

test("every button is at least 44 px tall", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await expect(page.locator(".writing")).toBeVisible();
  // Buttons that read as links inside a sentence are exempt, as text links are.
  const heights = await page
    .locator("button:not(.link)")
    .evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
});
