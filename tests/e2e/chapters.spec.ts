import { expect, test, type Page } from "@playwright/test";

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("stubli-writer:storage", "sample"));
  await page.goto("/");
  await expect(page.locator(".writing h1")).toBeVisible();
});

test.afterEach(() => expect(errors, errors.join("\n")).toEqual([]));

async function openChapters(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("books");
  await page.getByRole("option", { name: /^Books/ }).click();
  const board = page.getByRole("dialog", { name: "Lisbon stories" });
  await expect(board).toBeVisible();
  return board;
}

// Each title button starts with "Chapter 2: " for screen readers.
const titles = async (page: Page) => (await page.locator(".chapter-card .card-name").allTextContents()).map((t) => t.replace(/^Chapter \d+: /, ""));

test("a book's chapters show as cards, in order, with who's in them", async ({ page }) => {
  const board = await openChapters(page);
  expect(await titles(page)).toEqual(["The tram to Belém", "Ana's letters"]);
  await expect(board.getByRole("button", { name: "Chapter 2: Ana's letters" })).toBeVisible();
  const letters = board.locator(".chapter-card", { hasText: "Ana's letters" });
  await expect(letters).toContainText("43 words · 1 TK");
  await expect(letters.getByRole("list", { name: "Characters in this chapter" })).toHaveText(/Ana\s*Marta/);
});

test("the arrows move a chapter, and the book note keeps the new order", async ({ page }) => {
  const board = await openChapters(page);
  await board.getByRole("button", { name: "Move “Ana's letters” earlier" }).click();
  await expect.poll(() => titles(page)).toEqual(["Ana's letters", "The tram to Belém"]);
  await board.getByRole("button", { name: "Open the book note" }).click();
  const list = page.locator(".writing ol li");
  await expect(list).toHaveText(["Ana's letters", "The tram to Belém"]);
});

test("dragging a card moves it", async ({ page, isMobile }) => {
  test.skip(isMobile, "Dragging is for a mouse; phones use the arrows.");
  await openChapters(page);
  await page.locator(".chapter-card").nth(1).dragTo(page.locator(".chapter-card").nth(0));
  await expect.poll(() => titles(page)).toEqual(["Ana's letters", "The tram to Belém"]);
});

test("new chapters, notes you have, and taking one out", async ({ page }) => {
  const board = await openChapters(page);
  await board.getByLabel("New chapter").fill("The 28 at night");
  await board.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(() => titles(page)).toEqual(["The tram to Belém", "Ana's letters", "The 28 at night"]);
  await board.getByLabel("Or add a note you have").selectOption({ label: "Essay ideas" });
  await expect.poll(() => titles(page)).toEqual(["The tram to Belém", "Ana's letters", "The 28 at night", "Essay ideas"]);
  await board.locator(".chapter-card", { hasText: "Essay ideas" }).getByRole("button", { name: "Take out of the book" }).click();
  await expect.poll(() => titles(page)).toEqual(["The tram to Belém", "Ana's letters", "The 28 at night"]);
  // Taken out of the book, not deleted.
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("essay ideas");
  await expect(page.getByRole("option").first()).toContainText("Essay ideas");
  await page.keyboard.press("Enter");
  // A chapter opens from its card, and its footer leads back to the book.
  await openChapters(page);
  await page.getByRole("button", { name: "Chapter 3: The 28 at night" }).click();
  await expect(page.locator(".writing h1")).toHaveText("The 28 at night");
  await page.locator(".footer-note").getByRole("button", { name: "In “Lisbon stories”" }).click();
  await expect(page.getByRole("dialog", { name: "Lisbon stories" })).toBeVisible();
});

test("a new book starts empty and is shown straight away", async ({ page }) => {
  const board = await openChapters(page);
  await board.getByLabel("New book").fill("Night trams");
  await board.getByRole("button", { name: "Start a book" }).click();
  await expect(page.getByRole("heading", { name: "Night trams" })).toBeVisible();
  await expect(page.getByText("No chapters yet.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Books" }).getByRole("button")).toHaveText(["Lisbon stories", "Night trams"]);
});
