import { expect, test } from "@playwright/test";

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, errors.join("\n")).toEqual([]));

async function samples(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("stubli-writer:storage", "sample");
    localStorage.setItem("stubli-writer:tour", "seen");
  });
  await page.goto("/");
  await expect(page.locator(".writing h1")).toBeVisible();
}

test("the start screen says what this is, suggests one place, and offers the samples first", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A calm place to write books, essays and notes.")).toBeVisible();
  await expect(page.locator(".start .primary")).toHaveCount(1);
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await expect(page.locator(".writing h1")).toBeVisible();
  // One notice at a time above the writing: the tour offer, then where the samples are kept.
  await expect(page.locator(".shell > .note")).toHaveCount(1);
  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.locator(".shell > .note")).toHaveText(/Sample notes, kept in this page only/);
  const link = await page.getByRole("button", { name: "Choose where to keep real notes" }).boundingBox();
  expect(link!.height).toBeGreaterThanOrEqual(44);
});

test("a dark device starts on the Night page; Aa changes it and it's remembered", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await samples(page);
  await expect(page.locator("html")).toHaveAttribute("data-page", "night");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(27, 26, 24)");
  await page.getByRole("button", { name: /Appearance/ }).click();
  const sheet = page.getByRole("dialog", { name: "Appearance" });
  await expect(sheet.getByRole("radio", { name: /Night/ })).toBeChecked();
  await sheet.locator("label", { hasText: "Paper" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-page", "paper");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-page", "paper");
  await context.close();
});

test("the word count: the note, what's selected, and hiding it under Aa", async ({ page }) => {
  await samples(page);
  const count = page.locator(".word-count");
  await expect(count).toHaveText(/^\d+ words$/);
  await page.locator(".writing > p").first().click({ clickCount: 3 });
  await expect(count).toHaveText(/^\d+ of \d+ words$/);
  await page.getByRole("button", { name: /Appearance/ }).click();
  await page.getByRole("button", { name: "Hide the word count" }).click();
  await expect(count).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".writing h1")).toBeVisible();
  await expect(count).toHaveCount(0);
});

test("New note, at the top of the sidebar, starts one with the cursor in its title", async ({ page, isMobile }) => {
  await samples(page);
  if (isMobile) await page.getByRole("button", { name: "Show books, folders and Trash" }).click();
  await page.getByRole("complementary").getByRole("button", { name: "New note" }).click();
  await expect(page.locator(".writing")).toBeFocused();
  await page.keyboard.type("A fresh start");
  await expect(page.locator(".writing h1")).toHaveText("A fresh start");
});

test("on a wide screen the book opens beside the text, follows the writing, and can be shown wide", async ({ page, isMobile }) => {
  test.skip(isMobile, "A phone shows the book full screen.");
  await samples(page);
  const side = page.getByRole("complementary");
  await side.getByRole("button", { name: "Lisbon stories", exact: true }).click();
  await side.getByRole("button", { name: "Ana's letters", exact: true }).click();
  await side.getByRole("button", { name: "Overview", exact: true }).click();
  const board = page.getByRole("dialog", { name: "Lisbon stories" });
  await expect(board).toBeVisible();
  // The text and the panel sit side by side, and the text can still be written in.
  const text = (await page.locator(".writing").boundingBox())!;
  const panel = (await board.boundingBox())!;
  expect(text.x + text.width).toBeLessThanOrEqual(panel.x);
  await page.locator(".writing > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Still writing.");
  await expect(page.locator(".writing")).toContainText("Still writing.");
  await expect(board).toBeVisible();
  // Opening another chapter from the overview keeps the book open.
  await board.getByRole("button", { name: "Chapter 1: The tram to Belém" }).click();
  await expect(page.locator(".writing h1")).toHaveText("The tram to Belém");
  await expect(board).toBeVisible();
  // The map needs room: choosing it shows the book wide, over the text.
  await board.getByRole("tab", { name: "Characters" }).click();
  await board.getByRole("button", { name: "Map", exact: true }).click();
  await expect(board.locator(".map")).toBeVisible();
  await board.getByRole("button", { name: "Show beside the text" }).click();
  await expect(board.getByRole("button", { name: "Show wide" })).toBeVisible();
  // Escape, pressed in the panel, closes it.
  await board.getByRole("tab", { name: "Overview" }).click();
  await page.keyboard.press("Escape");
  await expect(board).toBeHidden();
});
