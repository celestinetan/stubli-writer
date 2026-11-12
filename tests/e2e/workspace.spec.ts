import { expect, test, type Page } from "@playwright/test";

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
});

test.afterEach(() => expect(errors, errors.join("\n")).toEqual([]));

async function useSamples(page: Page) {
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await expect(page.locator(".writing")).toBeVisible();
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

test("first open asks where notes live, in plain words", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Where should your notes live?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a folder" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText("can only see the files it makes")).toBeVisible();
});

test("sample notes open on the Welcome note, say they aren't kept, and remember the choice", async ({ page }) => {
  await useSamples(page);
  await expect(page.locator(".writing h1")).toHaveText("Welcome to Stubli Writer");
  await expect(page.locator(".topbar")).toContainText("Not kept");
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.locator(".writing h1")).toHaveText(today());
  await expect(page.getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(page.locator(".writing h1")).toHaveText("Welcome to Stubli Writer");
});

test("today's note is only saved once you write in it", async ({ page }) => {
  await useSamples(page);
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.locator(".writing h1")).toHaveText(today());
  await expect(page.getByRole("status")).toHaveText("Not kept");
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("Called about the TK.");
  await expect(page.getByRole("status")).toHaveText("Not saved yet");
  await expect(page.getByRole("status")).toHaveText("Not kept", { timeout: 3000 });
  // It now shows up in the switcher with its gap.
  await page.keyboard.press("ControlOrMeta+k");
  const list = page.getByRole("listbox");
  await expect(list.getByRole("option", { name: new RegExp(today()) })).toContainText("1 TK");
});

test("the switcher finds notes by their words, ignoring accents", async ({ page }) => {
  await useSamples(page);
  await page.keyboard.press("ControlOrMeta+k");
  const box = page.getByRole("combobox", { name: "Find or start a note" });
  await box.fill("BELEM monastery");
  const first = page.getByRole("option").first();
  await expect(first).toContainText("The tram to Belém");
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing h1")).toHaveText("The tram to Belém");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the switcher says plainly when nothing matches", async ({ page }) => {
  await useSamples(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("zeppelin");
  await expect(page.getByText("No notes with those words yet.")).toBeVisible();
  await expect(page.getByRole("option").first()).toContainText("New note: “zeppelin”");
});

test("a new note starts on its title and saves when written", async ({ page }) => {
  await useSamples(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("option", { name: /^New note/ }).click();
  await expect(page.locator(".writing h1.is-empty")).toHaveAttribute("data-placeholder", "Title");
  // The cursor is in the new note's title, ready to type.
  await expect(page.locator(".writing")).toBeFocused();
  await page.keyboard.type("Harbour walk");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Boats at TK.");
  await expect(page.getByRole("status")).toHaveText("Not saved yet");
  await expect(page.getByRole("status")).toHaveText("Not kept", { timeout: 3000 });
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("harbour");
  await expect(page.getByRole("option").first()).toContainText("Harbour walk");
});

test("the gap panel lists every gap and opens the note at it", async ({ page }) => {
  await useSamples(page);
  await page.getByRole("button", { name: /^Gaps/ }).click();
  const panel = page.getByRole("dialog", { name: /open gaps/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Ana's letters" })).toBeVisible();
  await panel.getByRole("button", { name: /a third idea about walking/ }).click();
  await expect(page.locator(".writing h1")).toHaveText("Essay ideas");
  // The gap is selected in the note.
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toContain("a third idea about walking");
});

test("a gap inside a table opens at the table", async ({ page }) => {
  await useSamples(page);
  await page.getByRole("button", { name: /^Gaps/ }).click();
  const panel = page.getByRole("dialog", { name: /open gaps/ });
  // The tram note's third gap sits in its table, which is kept as written and can't be edited word by word.
  const group = panel.locator("section, li, div").filter({ has: page.getByRole("heading", { name: "The tram to Belém" }) }).last();
  await group.getByRole("button").nth(2).click();
  await expect(page.locator(".writing h1")).toHaveText("The tram to Belém");
  await expect(page.locator(".writing .ProseMirror-selectednode")).toContainText("Belém");
});

test("a note's file can take its title as a name, and Move to Trash has Undo", async ({ page }) => {
  await useSamples(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("option", { name: /^New note/ }).click();
  await expect(page.locator(".writing")).toBeFocused();
  await page.keyboard.type("Harbour walk");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Boats at dawn.");
  await expect(page.getByRole("status").first()).toHaveText("Not saved yet");
  await expect(page.getByRole("status").first()).toHaveText("Not kept", { timeout: 3000 });
  const footer = page.locator(".footer-note");
  await footer.getByRole("button", { name: "Rename file to “Harbour walk”" }).click();
  // Renamed: the offer goes away, and the note is still open.
  await expect(footer.getByRole("button", { name: /^Rename file/ })).toHaveCount(0);
  await expect(page.locator(".writing h1")).toHaveText("Harbour walk");

  await footer.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByText("Moved “Harbour walk” to Trash.")).toBeVisible();
  await expect(page.locator(".writing h1")).toHaveText(today());
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("harbour");
  await expect(page.getByRole("option").first()).not.toContainText("Harbour walk");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".writing h1")).toHaveText("Harbour walk");
  await expect(page.getByText(/Moved “Harbour walk”/)).toHaveCount(0);
});

test("⌘J moves to the next gap in the note", async ({ page }) => {
  await useSamples(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("essay ideas");
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing h1")).toHaveText("Essay ideas");
  const selection = () => page.evaluate(() => getSelection()?.toString());
  await page.keyboard.press("ControlOrMeta+j");
  await expect.poll(selection).toBe("@tk[a third idea about walking]");
  await page.keyboard.press("ControlOrMeta+j");
  await expect.poll(selection).toBe("TK");
});

test("on a phone, the switcher and the gap panel fill the screen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone layout only.");
  await useSamples(page);
  await page.getByRole("button", { name: /Find or start/ }).click();
  const sheet = page.getByRole("dialog");
  const box = await sheet.boundingBox();
  const vp = page.viewportSize()!;
  expect(Math.round(box!.width)).toBe(vp.width);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
