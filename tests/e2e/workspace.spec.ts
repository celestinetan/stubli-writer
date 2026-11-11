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

test("sample notes open on today's note, and remember the choice", async ({ page }) => {
  await useSamples(page);
  await expect(page.locator(".writing h1")).toHaveText(today());
  await expect(page.getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(page.locator(".writing h1")).toHaveText(today());
});

test("today's note is only saved once you write in it", async ({ page }) => {
  await useSamples(page);
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("Called about the TK.");
  await expect(page.getByRole("status")).toHaveText("Not saved yet");
  await expect(page.getByRole("status")).toHaveText("Saved", { timeout: 3000 });
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
  await expect(page.getByRole("status")).toHaveText("Saved", { timeout: 3000 });
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("harbour");
  await expect(page.getByRole("option").first()).toContainText("Harbour walk");
});

test("the gap panel lists every gap and opens the note at it", async ({ page }) => {
  await useSamples(page);
  await page.getByRole("button", { name: /\d+ gaps/ }).click();
  const panel = page.getByRole("dialog", { name: /open gaps/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Ana's letters" })).toBeVisible();
  await panel.getByRole("button", { name: /a third idea about walking/ }).click();
  await expect(page.locator(".writing h1")).toHaveText("Essay ideas");
  // The gap is selected in the note.
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toContain("a third idea about walking");
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
  await page.getByRole("button", { name: "Notes" }).or(page.getByRole("button", { name: /Find or start/ })).first().click();
  const sheet = page.getByRole("dialog");
  const box = await sheet.boundingBox();
  const vp = page.viewportSize()!;
  expect(Math.round(box!.width)).toBe(vp.width);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
