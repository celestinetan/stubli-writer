import { sidebar } from "./sidebar";
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

/** Opens the book from the menu, on its Characters tab. */
async function openCast(page: Page) {
  const side = await sidebar(page);
  const book = side.getByRole("button", { name: "Lisbon stories" });
  if ((await book.getAttribute("aria-expanded")) !== "true") await book.click();
  await side.getByRole("button", { name: "Characters", exact: true }).click();
  const board = page.getByRole("dialog", { name: "Lisbon stories" });
  await expect(board).toBeVisible();
  await board.getByRole("tab", { name: "Characters" }).click();
  return board;
}

async function openNote(page: Page, words: string, title: string) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill(words);
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing h1")).toHaveText(title);
  await expect(page.locator(".writing")).toBeFocused();
  await page.waitForTimeout(100);
}

/** Puts the cursor at the end of the note's last line of writing. */
async function endOfNote(page: Page) {
  await page.evaluate(() => {
    const editor = document.querySelector(".writing") as HTMLElement;
    const last = [...editor.querySelectorAll(":scope > p")].filter((p) => p.textContent).pop()!;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(last);
    range.collapse(false);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await page.waitForTimeout(50);
}

const card = (board: ReturnType<Page["getByRole"]>, name: string) =>
  board.locator(".character-card").filter({ has: board.page().locator(".card-name", { hasText: new RegExp(`^${name}$`) }) });

test("a book's characters: who they are, connections both ways, and the chapters they're in", async ({ page }) => {
  const board = await openCast(page);
  const ana = card(board, "Ana");
  const marta = card(board, "Marta");
  await expect(ana).toContainText("Lead · also Annie");
  await expect(ana.getByRole("button", { name: /Marta · wrote the letters/ })).toBeVisible();
  // Written only on Ana's card, shown on Marta's too.
  await expect(marta.getByRole("button", { name: /Ana · wrote the letters/ })).toBeVisible();
  await expect(ana.locator("summary")).toHaveText("In 2 chapters");

  await board.getByRole("button", { name: "Marta", exact: true }).click();
  await expect(board.getByText("Showing Marta's connections.")).toBeVisible();

  await ana.locator("summary").click();
  await ana.getByRole("button", { name: /The tram to Belém/ }).click();
  await expect(board).toBeHidden();
  await expect(page.locator(".writing h1")).toHaveText("The tram to Belém");
});

test("characters are connected and edited with buttons, never by typing codes", async ({ page }) => {
  const board = await openCast(page);
  await board.getByLabel("New character").fill("Rui");
  await board.getByRole("button", { name: "Add", exact: true }).click();
  const rui = card(board, "Rui");
  await expect(rui).toContainText("Who are they?");

  // Connect.
  await card(board, "Ana").getByRole("button", { name: "Connect Ana to someone" }).click();
  await board.getByLabel("Connect Ana to").selectOption({ label: "Rui" });
  await board.getByLabel("How? (optional)").fill("her neighbour");
  await board.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(rui.getByRole("button", { name: "Ana · her neighbour" })).toBeVisible();

  // Edit who they are.
  await rui.getByRole("button", { name: "Edit" }).click();
  await board.getByLabel("Role in the story").fill("The neighbour");
  await board.getByLabel("Who they are").fill("Plays the accordion at night.");
  await board.getByRole("button", { name: "Save" }).click();
  await expect(rui).toContainText("The neighbour");
  await expect(rui).toContainText("Plays the accordion at night.");

  // Disconnect, from either card.
  await rui.getByRole("button", { name: "Disconnect Rui and Ana" }).click();
  await expect(card(board, "Ana").getByRole("button", { name: /Rui/ })).toHaveCount(0);

  // The card is a plain note underneath.
  await rui.getByRole("button", { name: "Open as a note" }).click();
  await expect(page.locator(".writing h1")).toHaveText("Rui");
  await expect(page.locator(".writing")).toContainText("Role: The neighbour");
});

test("typing @ in a chapter offers the book's characters, and can add someone new", async ({ page }) => {
  await openNote(page, "letters attic", "Ana's letters");
  await endOfNote(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Then @Ma");
  const line = page.locator(".writing > p", { hasText: "Then" });
  const list = page.getByRole("listbox", { name: "Characters in this book" });
  await expect(list.getByRole("option")).toHaveText(["Marta", "+New character: “Ma”"]);
  await page.keyboard.press("Enter");
  await expect(line).toHaveText("Then @Marta ");
  await expect(line.locator('.mention[data-character$="Marta.md"]')).toHaveText("@Marta");

  await page.keyboard.type("met @Rui");
  await list.getByRole("option", { name: /New character: “Rui”/ }).click();
  await expect(line.locator(".mention")).toHaveText(["@Marta", "@Rui"]);

  // Escape closes the list and leaves the text.
  await page.keyboard.type("and @");
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
});

test("clicking @Marta shows who she is", async ({ page }) => {
  await openNote(page, "letters attic", "Ana's letters");
  await page.locator('.writing .mention[data-character$="Marta.md"]').click();
  const peek = page.getByRole("dialog", { name: "Marta" });
  await expect(peek).toContainText("A name at the bottom of every letter");
  await peek.getByRole("button", { name: "See everyone" }).click();
  await expect(page.getByRole("tab", { name: "Characters" })).toHaveAttribute("aria-selected", "true");
});

test("outside a book, @ is just text, and cards stay out of search", async ({ page }) => {
  await openNote(page, "essay ideas", "Essay ideas");
  await endOfNote(page);
  await page.keyboard.type(" @An");
  await expect(page.getByRole("listbox", { name: "Characters in this book" })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("letter writer");
  await expect(page.getByRole("option", { name: /Marta/ })).toHaveCount(0);
});
