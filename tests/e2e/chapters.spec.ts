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
  // A book opens on its Overview; the cards to move around are under Arrange.
  await board.getByRole("tab", { name: "Arrange" }).click();
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

test("the overview: what the book is about, and each chapter's summary, when, teller and status", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("books");
  await page.getByRole("option", { name: /^Books/ }).click();
  const board = page.getByRole("dialog", { name: "Lisbon stories" });
  // It opens on the Overview, with the book's totals and what's already written about each chapter.
  await expect(board.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(board.getByLabel("What the book is about")).toHaveValue(/Short pieces about Lisbon/);
  await expect(board.locator(".overview-totals")).toContainText("2 chapters");
  await expect(board.locator(".overview-totals")).toContainText("1 revised");
  const rows = board.locator(".outline-row");
  await expect(rows.nth(0)).toContainText("A slow ride west along the river");
  await expect(rows.nth(0)).toContainText("Revised");
  await expect(rows.nth(1)).toContainText("No summary yet. It begins: Ana found the box of letters");

  // Say what happens in the second chapter.
  await board.getByRole("button", { name: "Add a summary for “Ana's letters”" }).click();
  const form = board.getByRole("form", { name: "About “Ana's letters”" });
  await form.getByLabel("What happens").fill("Ana finds Marta's letters and reads them in order.");
  await form.getByLabel("When").fill("A Sunday in autumn");
  await form.getByLabel("Told by").fill("Ana");
  await form.getByLabel("How far along").selectOption("Done");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(rows.nth(1).locator(".outline-summary")).toHaveText("Ana finds Marta's letters and reads them in order.");
  await expect(rows.nth(1).locator(".outline-meta")).toHaveText("A Sunday in autumn · Told by Ana · 43 words · 1 TK");
  await expect(rows.nth(1).locator(".outline-status")).toHaveText("Done");
  await expect(board.locator(".overview-totals")).toContainText("1 revised, 1 done");

  // What the book is about is kept when you leave the box.
  await board.getByLabel("What the book is about").fill("Stories of a city, told by the people who stayed.");
  await board.getByRole("tab", { name: "Arrange" }).click();
  await expect(board.locator(".chapter-card", { hasText: "Ana's letters" })).toContainText("Ana finds Marta's letters");
  await board.getByRole("tab", { name: "Overview" }).click();
  await expect(board.getByLabel("What the book is about")).toHaveValue("Stories of a city, told by the people who stayed.");

  // None of it is in the writing: the chapter opens as it was.
  await rows.nth(1).getByRole("button", { name: "Chapter 2: Ana's letters" }).click();
  await expect(page.locator(".writing")).not.toContainText("reads them in order");
  await expect(page.locator(".writing h1")).toHaveText("Ana's letters");
});
