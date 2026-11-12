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

async function openBoard(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("characters");
  await page.getByRole("option", { name: /^Characters/ }).click();
  const board = page.getByRole("dialog", { name: "Characters" });
  await expect(board).toBeVisible();
  return board;
}

test("the board shows each card, its connections both ways, and where they appear", async ({ page }) => {
  const board = await openBoard(page);
  const ana = board.locator(".character-card", { hasText: "Lead" });
  const marta = board.locator(".character-card", { hasText: "The letter writer" });
  await expect(ana.getByRole("button", { name: /Marta · wrote the letters/ })).toBeVisible();
  // Written only on Ana's card, shown on Marta's too.
  await expect(marta.getByRole("button", { name: /Ana · wrote the letters/ })).toBeVisible();
  await expect(ana.locator("summary")).toHaveText("In 2 notes");

  // Choosing Marta steps the unconnected back (there are none here) and says whose connections.
  await board.getByRole("button", { name: "Marta", exact: true }).click();
  await expect(board.getByText("Showing Marta's connections.")).toBeVisible();
  await expect(marta).toHaveClass(/is-chosen/);
  await expect(ana).not.toHaveClass(/is-faded/);

  // A mention opens its note.
  await ana.locator("summary").click();
  await ana.getByRole("button", { name: /The tram to Belém/ }).click();
  await expect(board).toBeHidden();
  await expect(page.locator(".writing h1")).toHaveText("The tram to Belém");
});

test("a new card from the board opens, ready to fill in, and connects by name", async ({ page }) => {
  const board = await openBoard(page);
  await board.getByLabel("New character").fill("Rui");
  await board.getByRole("button", { name: "Add" }).click();
  await expect(page.locator(".writing h1")).toHaveText("Rui");
  await expect(page.locator(".writing")).toContainText("Connections");
  // Write a connection at the end of the card.
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("- Ana: her neighbour");
  await expect(page.getByRole("status").first()).toHaveText("Not kept", { timeout: 4000 });
  const again = await openBoard(page);
  await expect(again.locator(".character-card", { hasText: "Lead" }).getByRole("button", { name: /Rui · her neighbour/ })).toBeVisible();
});

test("Character in the selection bar makes a card without leaving the note", async ({ page, isMobile }) => {
  test.skip(isMobile, "Selecting by keyboard is a computer feature.");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("tram belem");
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing h1")).toHaveText("The tram to Belém");
  // Select "Belém" in the title.
  await page.locator(".writing h1").evaluate((h1) => {
    const text = h1.firstChild!;
    const r = document.createRange();
    r.setStart(text, "The tram to ".length);
    r.setEnd(text, "The tram to Belém".length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.getByRole("button", { name: "Character: make a card for “Belém”" }).click();
  await expect(page.getByText("Made a card for Belém.")).toBeVisible();
  await expect(page.locator(".writing h1")).toHaveText("The tram to Belém");
  await page.getByRole("button", { name: "Open card" }).click();
  await expect(page.locator(".writing h1")).toHaveText("Belém");
});

test("names can be underlined, and a click shows who they are", async ({ page }) => {
  const board = await openBoard(page);
  await board.getByRole("switch", { name: "Underline names in notes" }).check();
  await board.getByRole("button", { name: "Close" }).click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("letters attic");
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing h1")).toHaveText("Ana's letters");
  const marta = page.locator('.writing [data-character="Characters/Marta.md"]');
  await expect(marta).toHaveText("Marta");
  await marta.click();
  const peek = page.getByRole("dialog", { name: "Marta" });
  await expect(peek).toContainText("A name at the bottom of every letter");
  await page.keyboard.press("Escape");
  await expect(peek).toBeHidden();
  // Off again (⌘⇧U), and remembered.
  await page.keyboard.press("ControlOrMeta+Shift+u");
  await expect(page.locator(".writing [data-character]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".writing h1")).toBeVisible();
  await expect(page.locator(".writing [data-character]")).toHaveCount(0);
});
