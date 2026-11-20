import { expect, test, type Page } from "@playwright/test";

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("stubli-writer:storage", "sample");
    localStorage.setItem("stubli-writer:tour", "seen");
    localStorage.setItem("stubli-writer:book-view", "wide");
  });
  await page.goto("/");
  await expect(page.locator(".writing h1")).toBeVisible();
});
test.afterEach(() => expect(errors, errors.join("\n")).toEqual([]));

async function openNote(page: Page, title: string) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill(title);
  await page.getByRole("option", { name: new RegExp(`^${title}`) }).first().click();
  await expect(page.locator(".writing h1")).toHaveText(title);
}

async function openLore(page: Page) {
  await page.locator(".footer-note").getByRole("button", { name: "In “Lisbon stories”" }).click();
  const board = page.locator("dialog.chapters-board");
  await board.getByRole("tab", { name: "Lore" }).click();
  return board;
}

test("lore: a card for what must stay true, underlined in the chapters, one click from the text", async ({ page }) => {
  await openNote(page, "The tram to Belém");
  // The sample book has one card already: its name is underlined, and choosing it shows the card.
  const name = page.locator(".writing .lore-name", { hasText: "Belém" }).first();
  await expect(name).toBeVisible();
  await name.click();
  const peek = page.getByRole("dialog", { name: "Belém" });
  await expect(peek).toContainText("Place");
  await expect(peek).toContainText("Always reached by tram");
  await peek.getByRole("button", { name: "See all lore" }).click();

  const board = page.getByRole("dialog", { name: "Lisbon stories" });
  await expect(board.getByRole("tab", { name: "Lore" })).toHaveAttribute("aria-selected", "true");
  const card = board.locator(".lore-card", { hasText: "Belém" });
  await expect(card.locator("summary")).toHaveText("In 1 chapter");

  // A new card, then what's true about it.
  await board.getByLabel("New lore").fill("The 15");
  await board.getByLabel("Kind").selectOption("Object");
  await board.getByRole("button", { name: "Add", exact: true }).click();
  const tram = board.locator('.lore-card[data-card$="/The 15.md"]');
  await expect(tram).toContainText("Object");
  await tram.getByRole("button", { name: "Edit The 15" }).click();
  const form = board.getByRole("form", { name: "About The 15" });
  await form.getByLabel("What's true about it").fill("The tram from Figueira to Belém. It never runs after midnight.");
  await form.getByLabel("Also called").fill("the tram");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(tram).toContainText("It never runs after midnight.");
  await expect(tram).toContainText("also the tram");

  // Back in the chapter, "the 15" is underlined too, small "the" and all.
  await board.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".writing .lore-name", { hasText: /^[Tt]he 15$/ }).first()).toBeVisible();
  // Lore isn't writing: search doesn't find the card.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("never runs after midnight");
  await expect(page.getByRole("option", { name: /The 15/ })).toHaveCount(0);
});

test("a world: books set in it share the lore and characters you choose to share", async ({ page }) => {
  await openNote(page, "The tram to Belém");
  const board = await openLore(page);
  await board.getByRole("button", { name: "Name this book's world" }).click();
  await board.getByLabel("This book's world").fill("Lisbon");
  await board.getByRole("button", { name: "Save" }).click();
  await expect(board.locator(".world-line")).toContainText("Set in Lisbon.");
  await board.locator(".lore-card", { hasText: "Belém" }).getByRole("button", { name: "Share across Lisbon" }).click();
  await expect(board.locator(".lore-card", { hasText: "Belém" })).toContainText("shared across Lisbon");
  // A character can be shared the same way.
  await board.getByRole("tab", { name: "Characters" }).click();
  const cards = board.getByRole("button", { name: "Cards", exact: true });
  if (await cards.isVisible()) await cards.click();
  await board.locator(".character-card", { has: page.locator(".card-name", { hasText: /^Marta$/ }) }).getByRole("button", { name: "Share across Lisbon" }).click();

  // A second book in the same world has both.
  await board.getByLabel("New book").fill("Night trams");
  await board.getByRole("button", { name: "Start a book" }).click();
  await expect(page.getByRole("heading", { name: "Night trams" })).toBeVisible();
  await board.getByRole("tab", { name: "Lore" }).click();
  await expect(board.locator(".lore-card")).toHaveCount(0);
  await board.getByRole("button", { name: "Name this book's world" }).click();
  await board.getByLabel("This book's world").fill("Lisbon");
  await board.getByRole("button", { name: "Save" }).click();
  await expect(board.locator(".lore-card")).toHaveText(/Belém/);
  await board.getByRole("tab", { name: "Characters" }).click();
  await expect(board.locator(".character-card .card-name")).toHaveText(["Marta"]);
});
