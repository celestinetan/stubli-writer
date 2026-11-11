import { expect, test, type Page } from "@playwright/test";

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("stubli-writer:storage", "sample"));
  await page.goto("/");
  await expect(page.locator(".writing")).toBeVisible();
  // Open the tram sample note.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("tram belem");
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing h1")).toHaveText("The tram to Belém");
});

test.afterEach(() => {
  // Includes anything the security policy blocked.
  expect(errors, errors.join("\n")).toEqual([]);
});

const writing = (page: Page) => page.locator(".writing");

/** Puts the cursor at the very end of the note's last paragraph. */
async function endOfNote(page: Page) {
  await page.evaluate(() => {
    const editor = document.querySelector(".writing") as HTMLElement;
    const last = [...editor.querySelectorAll(":scope > p")].pop()!;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(last);
    range.collapse(false);
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  // Let the editor pick up the new cursor position.
  await page.waitForTimeout(50);
}

test("shows the sample note: title, chips, protected table", async ({ page }) => {
  await expect(writing(page).locator("h1")).toHaveText("The tram to Belém");
  await expect(writing(page).locator(".gap").first()).toHaveText("TK");
  await expect(writing(page).locator(".gap-request")).toHaveText("the year it opened");
  await expect(writing(page).locator(".raw-block .raw-label")).toHaveText("Table · kept as written");
  await expect(page.getByRole("status")).toHaveText("Saved");
});

test("typing TK makes a chip, and the note saves", async ({ page }) => {
  await endOfNote(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("The price was TK and the year @tk[look this up] too.");
  const last = writing(page).locator("p").last();
  await expect(last.locator(".gap").first()).toHaveText("TK");
  await expect(last.locator(".gap-request")).toHaveText("look this up");
  await expect(page.getByRole("status")).toHaveText("Not saved yet");
  await expect(page.getByRole("status")).toHaveText("Saved", { timeout: 3000 });
});

test("Markdown shortcuts work as you type", async ({ page }) => {
  await endOfNote(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("## A new section");
  await expect(writing(page).locator("h2").last()).toHaveText("A new section");
  await page.keyboard.press("Enter");
  await page.keyboard.type("> a quote");
  await expect(writing(page).locator("blockquote").last()).toHaveText("a quote");
});

test("the bar appears on a selection and makes text bold", async ({ page }) => {
  await endOfNote(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("make me bold");
  await page.keyboard.down("Shift");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  const bar = page.locator(".bar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Bold" }).click();
  await expect(writing(page).locator("p").last().locator("strong")).toHaveText("bold");
  // Every bar button is big enough to tap.
  for (const box of await bar.getByRole("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)))
    expect(box).toBeGreaterThanOrEqual(44);
});

test("undo takes back typing", async ({ page }) => {
  await endOfNote(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("temporary words");
  await expect(writing(page)).toContainText("temporary words");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(writing(page)).not.toContainText("temporary words");
});

test("pasting from the web keeps only Medium's formatting", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await endOfNote(page);
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    const html = '<p>Pasted <b>bold</b>, <s>struck</s>, <code>code</code> and <a href="https://example.com">a link</a>.</p><table><tr><td>cell</td></tr></table>';
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", "Pasted bold, struck, code and a link. cell");
    document.querySelector(".writing")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  const pasted = writing(page).locator("p", { hasText: "Pasted" });
  await expect(pasted.locator("strong")).toHaveText("bold");
  await expect(pasted.locator("a")).toHaveText("a link");
  await expect(pasted.locator("s, del, code")).toHaveCount(0);
  await expect(pasted).toContainText("struck");
  await expect(pasted).toContainText("code");
});

test("a long note (about 20,000 words) stays quick to type in", async ({ page, isMobile }) => {
  test.skip(isMobile, "Measured once, at laptop size.");
  const long = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} ${"word ".repeat(48)}TK`).join("\n\n");
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    document.querySelector(".writing")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, long);
  await expect(writing(page).locator("p", { hasText: /^Paragraph 399 / })).toHaveCount(1, { timeout: 10000 });
  await endOfNote(page);
  const start = Date.now();
  await page.keyboard.type("Twenty quick characters", { delay: 0 });
  const perKey = (Date.now() - start) / "Twenty quick characters".length;
  console.log(`Long note: ${perKey.toFixed(1)} ms per keystroke`);
  expect(perKey).toBeLessThan(50);
});
