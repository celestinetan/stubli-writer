import { expect, test } from "@playwright/test";
import { sidebar } from "./sidebar";

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

test("the sidebar lists books with their chapters, and folders, without repeating chapters", async ({ page }) => {
  const side = await sidebar(page);
  await side.getByRole("button", { name: "Lisbon stories" }).click();
  await expect(side.getByRole("button", { name: "The tram to Belém" })).toHaveCount(1);
  await side.getByRole("button", { name: "Ana's letters" }).click();
  await expect(page.locator(".writing h1")).toHaveText("Ana's letters");
  const side2 = await sidebar(page);
  await expect(side2.getByRole("button", { name: "Ana's letters" })).toHaveAttribute("aria-current", "page");
  await side2.getByRole("button", { name: "Characters", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Characters" })).toHaveAttribute("aria-selected", "true");
});

test("on a computer the sidebar sits beside the page, and ☰ hides it (remembered)", async ({ page, isMobile }) => {
  test.skip(isMobile, "On a phone it's a drawer.");
  const side = await sidebar(page);
  await page.getByRole("button", { name: "Hide the sidebar" }).click();
  await expect(side).toBeHidden();
  await page.reload();
  await expect(page.locator(".writing h1")).toBeVisible();
  await expect(side).toBeHidden();
});

test("on a phone the sidebar slides over the page and closes when you choose something", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone only.");
  const side = await sidebar(page);
  // The open note's folder is already open.
  await expect(side.getByRole("button", { name: "Not in a folder" })).toHaveAttribute("aria-expanded", "true");
  await side.getByRole("button", { name: "Essay ideas" }).click();
  await expect(side).toBeHidden();
  await expect(page.locator(".writing h1")).toHaveText("Essay ideas");
});

test("Trash: a note keeps its place, goes back where it was, or is deleted for good after asking", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("essay ideas");
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing h1")).toHaveText("Essay ideas");
  await page.locator(".footer-note").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByText("Moved “Essay ideas” to Trash.")).toBeVisible();

  await (await sidebar(page)).getByRole("button", { name: /^Trash/ }).click();
  const trash = page.getByRole("dialog", { name: "Trash" });
  await expect(trash).toContainText("Essay ideas");
  await trash.getByRole("button", { name: "Put back" }).click();
  await expect(trash).toContainText("The Trash is empty.");
  await trash.getByRole("button", { name: "Close" }).click();

  // Back where it was, and found again.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("essay ideas");
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing h1")).toHaveText("Essay ideas");

  // Deleting for good asks first, and "Keep it" keeps it.
  await page.locator(".footer-note").getByRole("button", { name: "Move to Trash" }).click();
  await (await sidebar(page)).getByRole("button", { name: /^Trash/ }).click();
  await trash.getByRole("button", { name: "Delete for good…" }).click();
  await expect(trash.getByRole("alert")).toContainText("Delete “Essay ideas” for good?");
  await trash.getByRole("button", { name: "Keep it" }).click();
  await expect(trash).toContainText("Essay ideas");
  await trash.getByRole("button", { name: "Delete for good…" }).click();
  await trash.getByRole("button", { name: "Delete for good", exact: true }).click();
  await expect(trash).toContainText("The Trash is empty.");
});

test("changing where notes are kept has a way back, and changes nothing until you choose", async ({ page }) => {
  await (await sidebar(page)).getByRole("button", { name: /Sample notes \(not kept\)/ }).click();
  await expect(page.getByRole("heading", { name: "Where should your notes be kept?" })).toBeVisible();
  await page.getByRole("button", { name: /Back to the sample notes/ }).click();
  await expect(page.locator(".writing h1")).toBeVisible();
});
