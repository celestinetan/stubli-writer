import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { sidebar } from "./sidebar";

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("stubli-writer:storage", "sample");
    // The print window can't be shown in a test; note that it was asked for instead.
    window.print = () => void ((window as unknown as { printed: number }).printed = ((window as unknown as { printed?: number }).printed ?? 0) + 1);
  });
  await page.goto("/");
  await expect(page.locator(".writing h1")).toBeVisible();
});

test.afterEach(() => expect(errors, errors.join("\n")).toEqual([]));

async function exportBook(page: Page, isMobile: boolean) {
  const side = await sidebar(page);
  if (isMobile) await side.getByRole("button", { name: "More for “Lisbon stories”" }).click();
  else await side.getByRole("button", { name: "Lisbon stories", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export the book…" }).click();
  const sheet = page.getByRole("dialog", { name: "Export “Lisbon stories”" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Lists a downloaded archive's files with Python's zipfile (which also checks it). */
function filesIn(path: string): string[] {
  return JSON.parse(execFileSync("python3", ["-I", "-c", "import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps(z.namelist()))", path], { encoding: "utf8" }));
}

test("a book as Word in manuscript format: open gaps listed first, author kept with the book", async ({ page, isMobile }) => {
  const sheet = await exportBook(page, isMobile);
  await expect(sheet.getByText("4 gaps are still open.")).toBeVisible();
  // A manuscript needs a name.
  await expect(sheet.getByRole("button", { name: "Export anyway" })).toBeDisabled();
  await sheet.getByLabel("Author").fill("Ana Writer");
  const [dl] = await Promise.all([page.waitForEvent("download"), sheet.getByRole("button", { name: "Export anyway" }).click()]);
  expect(dl.suggestedFilename()).toBe("Lisbon stories.docx");
  const file = await dl.path();
  expect(filesIn(file)).toEqual(expect.arrayContaining(["word/document.xml", "word/header1.xml"]));
  await expect(sheet.getByText("“Lisbon stories.docx” is in your downloads.")).toBeVisible();

  // The author is kept in the book note.
  await sheet.getByRole("button", { name: "Close" }).click();
  const again = await exportBook(page, isMobile);
  await expect(again.getByLabel("Author")).toHaveValue("Ana Writer");
});

test("a book as EPUB", async ({ page, isMobile }) => {
  const sheet = await exportBook(page, isMobile);
  await sheet.locator("label", { hasText: "EPUB" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), sheet.getByRole("button", { name: "Export anyway" }).click()]);
  expect(dl.suggestedFilename()).toBe("Lisbon stories.epub");
  const names = filesIn(await dl.path());
  expect(names[0]).toBe("mimetype");
  expect(names).toEqual(expect.arrayContaining(["OEBPS/chapter-001.xhtml", "OEBPS/chapter-002.xhtml", "OEBPS/nav.xhtml"]));
});

test("PDF: the book laid out for paper, then the print window", async ({ page, isMobile }) => {
  const sheet = await exportBook(page, isMobile);
  await sheet.locator("label", { hasText: "PDF" }).click();
  await sheet.locator("label", { hasText: "A4, to read or share" }).click();
  await sheet.getByRole("button", { name: "Open the print window" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: number }).printed ?? 0)).toBe(1);
  await page.emulateMedia({ media: "print" });
  const book = page.locator(".print-book");
  await expect(book.locator(".pb-title h1")).toHaveText("Lisbon stories");
  await expect(book.locator(".pb-contents li")).toHaveText(["The tram to Belém", "Ana's letters"]);
  await expect(book.locator(".pb-chapter h1")).toHaveText(["The tram to Belém", "Ana's letters"]);
  await expect(book).toContainText("[TK: the year it opened]");
  await expect(page.locator(".shell")).toBeHidden();
  // After printing, the page is back as it was.
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await expect(book).toHaveCount(0);
});

test("one note copied for the web, formatted", async ({ page, context, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== "chromium", "Clipboard checks run on the laptop.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator(".footer-note").getByRole("button", { name: "Export…" }).click();
  const sheet = page.getByRole("dialog", { name: "Export “Welcome to Stubli Writer”" });
  await sheet.locator("label", { hasText: "Copy for the web" }).click();
  await sheet.getByRole("button", { name: "Copy" }).click();
  await expect(sheet.getByText(/Copied\./)).toBeVisible();
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return (await items[0].getType("text/html")).text();
  });
  expect(html).toContain("<h1>Welcome to Stubli Writer</h1>");
  expect(html).toContain("<strong>bold</strong>");
  expect(html).toContain('<blockquote class="pull">');
});

test("PDF paperback: trim size, front pages in place, the binding margin, details kept", async ({ page, isMobile }) => {
  const sheet = await exportBook(page, isMobile);
  await sheet.locator("label", { hasText: "PDF" }).click();
  await expect(sheet.getByRole("radio", { name: "Paperback interior" })).toBeChecked();
  await sheet.locator("label", { hasText: "6 × 9 in" }).click();
  await sheet.getByLabel("Author").fill("Ana Writer");
  await sheet.getByLabel("ISBN (optional)").fill("978-1-23456-789-0");
  await sheet.getByLabel("Dedication (optional)").fill("For the 15");
  await sheet.getByRole("button", { name: "Open the print window" }).click();
  await expect(sheet.getByText(/turn off Headers and footers/)).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const book = page.locator(".print-book.is-paperback");
  await expect(book.locator(".pb-front.pb-copyright")).toContainText("ISBN 978-1-23456-789-0");
  await expect(book.locator(".pb-front.pb-dedication")).toHaveText("For the 15");
  await expect(book.locator(".pb-chapter")).toHaveCount(2);
  // The page rules were added for this print only, and go afterwards.
  expect(await page.evaluate(() => document.adoptedStyleSheets.some((s) => [...s.cssRules].some((r) => r.cssText.includes("6in 9in"))))).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  // ISBN and dedication are kept with the book.
  await sheet.getByRole("button", { name: "Close" }).click();
  const again = await exportBook(page, isMobile);
  await again.locator("label", { hasText: "PDF" }).click();
  await expect(again.getByLabel("ISBN (optional)")).toHaveValue("978-1-23456-789-0");
  await expect(again.getByLabel("Dedication (optional)")).toHaveValue("For the 15");
});
