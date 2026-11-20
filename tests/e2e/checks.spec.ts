import { expect, test } from "@playwright/test";

const errors: string[] = [];

test.beforeEach(async ({ page, context }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    localStorage.setItem("stubli-writer:storage", "sample");
    localStorage.setItem("stubli-writer:tour", "seen");
    localStorage.setItem("stubli-writer:book-view", "wide");
  });
  await page.goto("/");
  await expect(page.locator(".writing h1")).toBeVisible();
});
test.afterEach(() => expect(errors, errors.join("\n")).toEqual([]));

test("checks: a near-miss name and a fact said differently are raised, set aside, and copied for an AI", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("Ana's letters");
  await page.getByRole("option", { name: /^Ana's letters/ }).first().click();
  await expect(page.locator(".writing h1")).toHaveText("Ana's letters");
  const foot = page.locator(".footer-note");
  // The samples start with nothing to check in this chapter.
  await expect(foot.getByRole("button", { name: /to check/ })).toHaveCount(0);

  // Give Marta a fixed fact.
  await foot.getByRole("button", { name: "In “Lisbon stories”" }).click();
  const board = page.locator("dialog.chapters-board");
  await board.getByRole("tab", { name: "Characters" }).click();
  const cards = board.getByRole("button", { name: "Cards", exact: true });
  if (await cards.isVisible()) await cards.click();
  const marta = board.locator(".character-card", { has: page.locator(".card-name", { hasText: /^Marta$/ }) });
  await marta.getByRole("button", { name: "Edit" }).click();
  await board.getByLabel("Fixed facts").fill("Hair: grey\nBorn: 1931");
  await board.getByRole("button", { name: "Save" }).click();
  await expect(marta.getByRole("list", { name: "Fixed facts about Marta" })).toHaveText(/Hair\s*grey\s*Born\s*1931/);
  await board.getByRole("button", { name: "Close" }).click();

  // Write against it, and misspell her once.
  await page.locator(".writing > p").last().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Marta's hair was red in the photograph. Martha never wrote back.");
  await expect(foot.getByRole("button", { name: "2 to check" })).toBeVisible();
  await foot.getByRole("button", { name: "2 to check" }).click();

  await expect(board.getByRole("tab", { name: /Checks/ })).toHaveAttribute("aria-selected", "true");
  const list = board.getByRole("list", { name: "To check" });
  await expect(list).toContainText("Marta's card says “Hair: grey”. Here it's “hair was red”.");
  await expect(list).toContainText("“Martha” is close to “Marta”, which has a card. Is it the same?");

  // "Not a problem" sets one aside for good.
  await list.getByRole("button", { name: /^Not a problem: “Martha”/ }).click();
  await expect(list.locator(".check-message")).toHaveText([/Hair: grey/]);

  // The question for an AI has the book's record, then this chapter.
  await board.getByRole("button", { name: "Copy for “Ana's letters”" }).click();
  await expect(board.getByRole("status")).toContainText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("I'm writing a book called “Lisbon stories”.");
  expect(copied).toContain("  - Hair: grey");
  expect(copied).toContain("- Belém (Place)");
  expect(copied).toContain("Marta's hair was red in the photograph.");
  expect(copied).not.toContain("The 15 left Praça da Figueira");

  await board.getByRole("button", { name: "Close" }).click();
  await expect(foot.getByRole("button", { name: "1 to check" })).toBeVisible();
});

test("a story bible file is kept in the book's folder, a one-sentence request is copied, and stopping removes it", async ({ page, isMobile }) => {
  test.skip(isMobile, "Folders are a computer feature.");
  const name = `bible-${Date.now()}`;
  await page.addInitScript((n) => {
    localStorage.removeItem("stubli-writer:storage");
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(n, { create: true });
  }, name);
  await page.goto("/");
  await page.getByRole("button", { name: "Choose a folder" }).click();
  await expect(page.locator(".writing h1")).toBeVisible();

  // A book with one chapter.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("books");
  await page.getByRole("option", { name: /^Books/ }).click();
  const board = page.locator("dialog.chapters-board");
  await board.getByLabel("New book").fill("Ash");
  await board.getByRole("button", { name: "Start a book" }).click();
  await board.getByRole("tab", { name: "Arrange" }).click();
  await board.getByLabel("New chapter").fill("The box");
  await board.getByRole("button", { name: "Add", exact: true }).click();
  await board.getByRole("tab", { name: "Overview" }).click();
  await board.getByLabel("What the book is about").fill("A woman reads letters that aren't hers.");
  await board.getByRole("tab", { name: /Checks/ }).click();

  await board.getByRole("button", { name: "Keep a story bible for this book" }).click();
  const read = () =>
    page.evaluate(async (n) => {
      try {
        const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(n);
        const dir = await (await root.getDirectoryHandle("Books")).getDirectoryHandle("Ash");
        return await (await (await dir.getFileHandle("Story bible.md")).getFile()).text();
      } catch {
        return null;
      }
    }, name);
  await expect.poll(read, { timeout: 8000 }).toContain("A woman reads letters that aren't hers.");
  expect(await read()).toContain("1. The box (file: Books/Ash/The box.md)");

  // It follows the book: a character added later is in the file a moment after.
  await board.getByRole("tab", { name: "Characters" }).click();
  await board.getByLabel("New character").fill("Katherine");
  await board.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(read, { timeout: 8000 }).toContain("- Katherine");

  // The file isn't listed with the writing.
  await expect(page.getByRole("complementary")).not.toContainText("Story bible");

  await board.getByRole("tab", { name: /Checks/ }).click();
  await board.getByRole("button", { name: "Copy a request for the whole book" }).click();
  await expect(board.getByRole("status")).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("please read “Books/Ash/Story bible.md” and follow the instructions at its top to check every chapter of “Ash”");

  await board.getByRole("button", { name: "Stop keeping a story bible" }).click();
  await expect(board.getByRole("button", { name: "Keep a story bible for this book" })).toBeVisible();
  await expect.poll(read, { timeout: 8000 }).toBeNull();
});
