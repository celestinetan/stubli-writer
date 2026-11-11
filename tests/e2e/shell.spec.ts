import { expect, test } from "@playwright/test";

test("opens with no errors, no blocked files and no sideways scrolling", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The tram to Belém" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  expect(problems, problems.join("\n")).toEqual([]);

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("default-src 'self'");

  const fonts = await page.evaluate(() => ({
    figtree: document.fonts.check('16px "Figtree"'),
    literata: document.fonts.check('20px "Literata"'),
  }));
  expect(fonts).toEqual({ figtree: true, literata: true });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("switches to Paper and remembers it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Paper" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "paper");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "paper");
  await expect(page.getByRole("button", { name: "Paper" })).toHaveAttribute("aria-pressed", "true");
});

test("every button is at least 44 px tall", async ({ page }) => {
  await page.goto("/");
  const heights = await page.getByRole("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
});
