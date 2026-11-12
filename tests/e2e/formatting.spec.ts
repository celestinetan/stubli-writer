import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const EXPORT = fileURLToPath(new URL("../fixtures/import/Bear export", import.meta.url));
const writing = (page: Page) => page.locator(".writing");

async function openNote(page: Page, words: string) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill(words);
  await page.keyboard.press("Enter");
  // The app puts the cursor back in the note once the switcher has closed; let that happen first.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".writing")).toBeFocused();
  await page.waitForTimeout(100);
}

/** Selects the last few characters of the note's last paragraph. */
async function selectEnd(page: Page, chars: number) {
  await page.evaluate((n) => {
    const p = [...document.querySelectorAll(".writing > p")].pop()!;
    const text = p.lastChild!;
    const len = text.textContent!.length;
    const r = document.createRange();
    r.setStart(text, len - n);
    r.setEnd(text, len);
    (document.querySelector(".writing") as HTMLElement).focus();
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  }, chars);
  await page.waitForTimeout(80);
}

async function typeNewLine(page: Page, text: string) {
  await page.evaluate(() => {
    const p = [...document.querySelectorAll(".writing > p")].pop()!;
    const r = document.createRange();
    r.selectNodeContents(p);
    r.collapse(false);
    (document.querySelector(".writing") as HTMLElement).focus();
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.waitForTimeout(50);
  await page.keyboard.press("Enter");
  await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("stubli-writer:storage", "sample"));
  await page.goto("/");
  await expect(writing(page)).toBeVisible();
  await openNote(page, "tram belem");
  await expect(writing(page).locator("h1")).toHaveText("The tram to Belém");
});

test("the sample shows a subtitle and a pull quote", async ({ page }) => {
  await expect(writing(page).locator("h1 + h4")).toHaveText("A morning on the 15, from Figueira to the monastery");
  await expect(writing(page).locator("blockquote.pull-quote")).toContainText("You don’t ride it to arrive");
  await expect(writing(page)).not.toContainText("[!pull]");
});

test("code in a line, from the bar", async ({ page }) => {
  await typeNewLine(page, "Run npm test");
  await selectEnd(page, 8);
  await page.locator(".bar").getByRole("button", { name: "Code" }).click();
  await expect(writing(page).locator("p code").last()).toHaveText("npm test");
});

test("the quote button goes quote, pull quote, plain", async ({ page }) => {
  await typeNewLine(page, "A line worth quoting");
  await selectEnd(page, 7);
  const bar = page.locator(".bar");
  await bar.getByRole("button", { name: /^Quote/ }).click();
  await expect(writing(page).locator("blockquote:not(.pull-quote)").last()).toHaveText("A line worth quoting");
  await bar.getByRole("button", { name: /Quote \(press again/ }).click();
  await expect(writing(page).locator("blockquote.pull-quote").last()).toHaveText("A line worth quoting");
  await bar.getByRole("button", { name: /Pull quote/ }).click();
  await expect(writing(page).locator(":scope > p", { hasText: "A line worth quoting" })).toHaveCount(1);
});

test("typing ``` makes an editable code block, with no gap chips inside", async ({ page }) => {
  await typeNewLine(page, "```");
  await page.keyboard.press("Enter");
  await page.keyboard.type("const x = TK;");
  await expect(writing(page).locator("pre code").last()).toHaveText("const x = TK;");
  await expect(writing(page).locator("pre .gap")).toHaveCount(0);
});

test("on a wide screen, + adds a break, code, and a drop cap", async ({ page, isMobile }) => {
  test.skip(isMobile, "The + needs a wide screen.");
  await typeNewLine(page, "");
  await page.getByRole("button", { name: "Add a picture, code, a break and more" }).click();
  await page.getByRole("button", { name: "Drop cap" }).click();
  await expect(page.locator(".has-dropcap .writing")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Not kept", { timeout: 4000 });
  // Reopening keeps it (saved as dropcap: true in the note's header).
  await openNote(page, "essay ideas");
  await openNote(page, "tram belem");
  await expect(page.locator(".has-dropcap .writing")).toBeVisible();
});

test("a picture gets a caption and a size", async ({ page }) => {
  await page.getByRole("button", { name: "Import notes" }).click();
  const sheet = page.getByRole("dialog", { name: "Import notes" });
  await sheet.locator('input[type="file"]:not([accept])').setInputFiles(EXPORT);
  await expect(sheet.getByRole("status")).toContainText("Brought in");
  await sheet.getByRole("button", { name: "Close" }).click();
  await openNote(page, "lisbon tram");
  const img = writing(page).locator(".note-image img");
  await expect(img).toBeVisible();
  await img.click();
  const bar = page.locator(".image-bar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Wider than the text" }).click();
  await expect(writing(page).locator(".note-image.is-wide")).toBeVisible();
  await writing(page).locator(".note-image img").click();
  await bar.getByRole("textbox", { name: "Caption" }).fill("The 15 at Belém");
  await bar.getByRole("textbox", { name: "Caption" }).press("Enter");
  await expect(writing(page).locator(".note-image-caption")).toHaveText("The 15 at Belém");
  await expect(page.getByRole("status")).toHaveText("Not kept", { timeout: 4000 });
  await openNote(page, "porto");
  await openNote(page, "lisbon tram");
  await expect(writing(page).locator(".note-image.is-wide .note-image-caption")).toHaveText("The 15 at Belém");
});
