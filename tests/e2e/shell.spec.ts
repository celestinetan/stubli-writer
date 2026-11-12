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
  // The writing font (Charter, as Charis SIL, by default) loads once there's writing on the screen.
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await expect(page.locator(".writing h1")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('20px "Charis SIL"'))).toBe(true);
  expect(problems, problems.join("\n")).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("starts Medium-like, and remembers a new font, page and accent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-font", "charter");
  await expect(html).toHaveAttribute("data-page", "white");
  await expect(html).toHaveAttribute("data-accent", "moss");

  await page.getByRole("button", { name: /Appearance/ }).click();
  const sheet = page.getByRole("dialog", { name: "Appearance" });
  // People click the choice (the label); the radio inside it is only there for keyboards and screen readers.
  await sheet.locator("label", { hasText: "Source Serif" }).click();
  await sheet.locator("label", { hasText: "Paper" }).click();
  await sheet.locator("label", { hasText: "Plum" }).click();
  await sheet.locator("label", { hasText: "Large" }).click();
  await expect(sheet.getByRole("radio", { name: /Plum/ })).toBeChecked();
  // It sits under Aa without covering the note: the page behind changes as you choose.
  await expect(html).toHaveAttribute("data-size", "large");
  expect(await page.locator(".writing").evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(20);
  await expect(html).toHaveAttribute("data-page", "paper");
  expect(await page.locator(".writing").evaluate((e) => getComputedStyle(e).fontFamily)).toContain("Source Serif 4");
  await sheet.getByRole("button", { name: "Done" }).click();

  await page.reload();
  await expect(html).toHaveAttribute("data-font", "source");
  await expect(html).toHaveAttribute("data-page", "paper");
  await expect(html).toHaveAttribute("data-accent", "plum");
  await expect(html).toHaveAttribute("data-size", "large");

  await page.getByRole("button", { name: /Appearance/ }).click();
  await page.getByRole("button", { name: "Go back to the default look" }).click();
  await expect(html).toHaveAttribute("data-font", "charter");
  await expect(html).toHaveAttribute("data-size", "medium");
  // Escape closes it and puts the cursor back in the note.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Appearance" })).toBeHidden();
  await expect(page.locator(".writing")).toBeFocused();
});

test("someone from before keeps their Paper page and Literata", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("stubli-writer:mode", "paper"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-page", "paper");
  await expect(page.locator("html")).toHaveAttribute("data-font", "literata");
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
