import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("stubli-writer:storage", "sample"));
  await page.goto("/");
  await expect(page.locator(".writing h1")).toBeVisible();
});

test("someone new is offered the tour once; it walks through, and ends where they left", async ({ page }) => {
  const offer = page.getByRole("note").filter({ hasText: "New here?" });
  await expect(offer).toBeVisible();
  await offer.getByRole("button", { name: "Take the tour" }).click();
  const card = page.getByRole("dialog", { name: "Your page" });
  await expect(card).toBeVisible();
  await expect(card.getByLabel("Step 1 of 9")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Gaps: TK" })).toBeVisible();
  // The arrow keys move too.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "Formatting" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: "Gaps: TK" })).toBeVisible();
  for (let i = 0; i < 7; i++) await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Help, any time" })).toBeVisible();
  await page.getByRole("button", { name: "Start writing" }).click();
  await expect(page.locator(".tour")).toHaveCount(0);
  // Not offered again.
  await page.reload();
  await expect(page.locator(".writing h1")).toBeVisible();
  await expect(page.getByText("New here?")).toHaveCount(0);
});

test("no thanks means no tour, and Help can start it any time; Escape ends it", async ({ page, isMobile }) => {
  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByText("New here?")).toHaveCount(0);
  if (isMobile) {
    await page.getByRole("button", { name: "Show books, folders and Trash" }).click();
    await page.getByRole("complementary").getByRole("button", { name: "Help" }).click();
  } else await page.locator(".topbar").getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("button", { name: "Take the one-minute tour" }).click();
  await expect(page.getByRole("dialog", { name: "Your page" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour")).toHaveCount(0);
});
