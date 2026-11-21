import { expect, test } from "@playwright/test";
import { novel } from "../fixtures/manuscript";
import { sidebar } from "./sidebar";


test("a Word manuscript comes in as a book: chapters shown first, then made and opened", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await (await sidebar(page)).getByRole("button", { name: "Import notes" }).click();
  const sheet = page.getByRole("dialog", { name: "Import notes" });
  await expect(sheet.getByRole("button", { name: "Choose a manuscript" })).toBeVisible();

  await sheet.getByLabel("Manuscript file").setInputFiles({ name: "salt road.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(novel()) });

  // Nothing is made yet: the chapters are shown, with what's left out.
  await expect(sheet.getByRole("status")).toHaveText("“salt road.docx”: 3 chapters, 50 words.");
  await expect(sheet.getByLabel("Book title")).toHaveValue("The Salt Road");
  const found = sheet.getByRole("list", { name: "Chapters found" });
  await expect(found.locator(".manuscript-name")).toHaveText(["Before the first chapter", "Chapter One", "Chapter Two"]);
  await expect(sheet).toContainText("Left out: comments, text marked as deleted in tracked changes, footnotes and the table of contents.");
  await expect(sheet).toContainText("1 heading has nothing under it and is left out: “Part Two”.");

  // Another place to cut, and back.
  await sheet.getByLabel("Start a new chapter at").selectOption({ label: "Each “Heading 2” (4 chapters)" });
  await expect(found.locator(".manuscript-name")).toHaveText(["Before the first chapter", "Chapter One", "The harbour", "Chapter Two"]);
  await sheet.getByLabel("Start a new chapter at").selectOption({ label: "Each “Heading 1” (3 chapters)" });

  await sheet.getByLabel("Book title").fill("Salt Road");
  await sheet.getByRole("button", { name: "Make the book" }).click();
  await expect(sheet.getByRole("status")).toContainText("Made “Salt Road” with 3 chapters and 1 picture. It's under Books.");
  await expect(sheet).toContainText("1 picture was left out");

  // The book opens with its chapters in order.
  await sheet.getByRole("button", { name: "Open the book" }).click();
  const board = page.locator("dialog.chapters-board, .book-side").first();
  await expect(board).toContainText("Salt Road");
  await expect(board).toContainText("Chapter One");
  await expect(board).toContainText("Chapter Two");

  // A chapter reads as it did in Word: bold, italic, a link, a list, a quote and its picture.
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("Chapter One");
  await page.getByRole("option", { name: /^Chapter One/ }).first().click();
  const writing = page.locator(".writing");
  await expect(writing.locator("h1")).toHaveText("Chapter One");
  await expect(writing.locator("strong")).toHaveText("home");
  await expect(writing.locator("em").first()).toHaveText("the rain");
  await expect(writing.locator("a")).toHaveText("the letter");
  await expect(writing.locator("p", { hasText: "1. The first thing she saw was the door." })).toBeVisible();
  await expect(writing.locator("ul li")).toHaveText(["Bread", "Salt"]);
  await expect(writing.locator("blockquote")).toContainText("A line someone said.");
  await expect(writing.locator("h2")).toHaveText("The harbour");
  await expect(writing.locator("img")).toHaveCount(1);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("a file that can't be read says why, and a text file with no headings is one chapter", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await (await sidebar(page)).getByRole("button", { name: "Import notes" }).click();
  const sheet = page.getByRole("dialog", { name: "Import notes" });

  await sheet.getByLabel("Manuscript file").setInputFiles({ name: "old.doc", mimeType: "application/msword", buffer: Buffer.from("x") });
  await expect(sheet.getByRole("alert")).toContainText("Older Word files (.doc) can't be read. Open it in Word or Google Docs and save it as .docx.");

  await sheet.getByLabel("Manuscript file").setInputFiles({ name: "A short story.txt", mimeType: "text/plain", buffer: Buffer.from("Once.\n\nTwice.") });
  await expect(sheet.getByRole("status")).toHaveText("“A short story.txt”: 1 chapter, 2 words.");
  await expect(sheet.getByLabel("Start a new chapter at")).toHaveCount(0);
  await expect(sheet).toContainText("No chapter headings were found, so this comes in as one chapter.");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet.getByRole("button", { name: "Choose a manuscript" })).toBeVisible();
});
