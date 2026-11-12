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
  const book = side.getByRole("button", { name: "Lisbon stories", exact: true });
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
  await expect(ana.getByRole("button", { name: /^Marta: wrote the letters/ })).toBeVisible();
  // Written only on Ana's card, shown on Marta's too.
  await expect(marta.getByRole("button", { name: /^Ana · Marta: wrote the letters/ })).toBeVisible();
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
  await board.getByLabel("New character").fill("Zé");
  await board.getByRole("button", { name: "Add", exact: true }).click();
  const ze = card(board, "Zé");
  await expect(ze).toContainText("Who are they?");

  // Connect.
  await card(board, "Ana").getByRole("button", { name: "Connect Ana to someone" }).click();
  await board.getByLabel("Connect Ana to").selectOption({ label: "Zé" });
  await board.getByLabel("What is Zé to Ana? (optional)").fill("her neighbour");
  await board.getByLabel("What is Ana to Zé? (optional)").fill("the one who borrows sugar");
  await board.getByRole("button", { name: "Connect", exact: true }).click();
  // Both sides, each written on its own card and shown on both.
  await expect(ze.getByRole("button", { name: "Ana: the one who borrows sugar · Zé: her neighbour" })).toBeVisible();
  await expect(card(board, "Ana").getByRole("button", { name: "Zé: her neighbour · Ana: the one who borrows sugar" })).toBeVisible();

  // Edit who they are.
  await ze.getByRole("button", { name: "Edit" }).click();
  await board.getByLabel("Role in the story").fill("The neighbour");
  await board.getByLabel("Who they are").fill("Plays the accordion at night.");
  await board.getByRole("button", { name: "Save" }).click();
  await expect(ze).toContainText("The neighbour");
  await expect(ze).toContainText("Plays the accordion at night.");

  // Disconnect, from either card.
  await ze.getByRole("button", { name: "Disconnect Zé and Ana" }).click();
  await expect(card(board, "Ana").getByRole("button", { name: /Zé/ })).toHaveCount(0);

  // A name that's also a word can count only where it's written @Name.
  await card(board, "Marta").getByRole("button", { name: "Edit" }).click();
  await board.getByRole("checkbox", { name: /Every “Marta” in this book is them/ }).uncheck();
  await board.getByRole("button", { name: "Save" }).click();
  await expect(card(board, "Marta")).toContainText("Not in a chapter yet.");

  // The card is a plain note underneath.
  await ze.getByRole("button", { name: "Open as a note" }).click();
  await expect(page.locator(".writing h1")).toHaveText("Zé");
  await expect(page.locator(".writing")).toContainText("Role: The neighbour");
});

test("typing @ names a character once; after that every mention is underlined", async ({ page }) => {
  await openNote(page, "letters attic", "Ana's letters");
  await endOfNote(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Then @Ma");
  const line = page.locator(".writing > p", { hasText: "Then" });
  const list = page.getByRole("listbox", { name: "Characters in this book" });
  await expect(list.getByRole("option")).toHaveText(["Marta", "+New character: “Ma”"]);
  await page.keyboard.press("Enter");
  // Just the name is written, and it's known from now on.
  await expect(line).toHaveText("Then Marta ");
  await expect(line.locator('.character-name[data-character$="Marta.md"]')).toHaveText("Marta");

  await page.keyboard.type("met @Zé");
  await list.getByRole("option", { name: /New character: “Zé”/ }).click();
  await expect(line.locator(".character-name")).toHaveText(["Marta", "Zé"]);
  // Named once: typing "Zé" again, without @, is him too.
  await page.keyboard.type(" and Zé again.");
  await expect(line.locator(".character-name")).toHaveText(["Marta", "Zé", "Zé"]);

  // Escape closes the list and leaves the text.
  await page.keyboard.type("and @");
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
});

test("clicking Marta's name shows who she is", async ({ page }) => {
  await openNote(page, "letters attic", "Ana's letters");
  await page.locator('.writing .character-name[data-character$="Marta.md"]').click();
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

test("the map: connect anyone by drawing a line, write anything on it, change or remove it", async ({ page, isMobile }) => {
  test.skip(isMobile, "The map needs a wider screen; phones show the cards.");
  const board = await openCast(page);
  await board.getByRole("button", { name: "Map" }).click();
  await expect(board.locator(".map-words", { hasText: "mother, not speaking" })).toBeVisible();

  // Draw from Marta's dot to Rui: a line, then both sides' words.
  const marta = board.locator(".map-card", { hasText: "The letter writer" });
  const rui = board.locator(".map-card", { hasText: "Ana's younger brother" });
  await marta.hover();
  const dot = (await marta.locator(".map-handle").boundingBox())!;
  const to = (await rui.boundingBox())!;
  await page.mouse.move(dot.x + 9, dot.y + 9);
  await page.mouse.down();
  await page.mouse.move(to.x + 60, to.y + 28, { steps: 8 });
  await page.mouse.up();
  await board.getByLabel("What is Marta to Rui?").fill("knows more than she says");
  await board.getByLabel("What is Rui to Marta?").fill("someone she watches");
  await page.keyboard.press("Enter");
  await expect(board.locator(".map-words", { hasText: "knows more than she says" })).toBeVisible();
  await expect(board.locator(".map-words", { hasText: "someone she watches" })).toBeVisible();

  // On the cards too, with the same words both ways.
  await board.getByRole("button", { name: "Cards" }).click();
  await expect(card(board, "Rui").getByRole("button", { name: "Marta: knows more than she says · Rui: someone she watches" })).toBeVisible();

  // Change the words, then remove the line.
  await board.getByRole("button", { name: "Map" }).click();
  await board.locator(".map-words", { hasText: "knows more than she says" }).click();
  await board.getByLabel("What is Marta to Rui?").fill("pretends not to know him");
  await page.keyboard.press("Enter");
  await expect(board.locator(".map-words", { hasText: "pretends not to know him" })).toBeVisible();
  await board.locator(".map-words", { hasText: "pretends not to know him" }).click();
  await board.getByRole("button", { name: "Remove line" }).click();
  await expect(board.locator(".map-words", { hasText: "pretends not to know him" })).toHaveCount(0);
  await expect(board.locator(".map-words", { hasText: "someone she watches" })).toHaveCount(0);

  // Cards stay where they're put (the arrow keys move them too), and Tidy up starts again.
  const body = rui.locator(".map-card-body");
  const before = (await rui.boundingBox())!;
  await body.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await rui.boundingBox())!.x).toBeGreaterThan(before.x + 40);
  await board.getByRole("button", { name: "Tidy up" }).click();
  await expect.poll(async () => Math.round((await rui.boundingBox())!.x)).toBe(Math.round(before.x));
});
