import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const EXPORT = fileURLToPath(new URL("../fixtures/import/Bear export", import.meta.url));

test("imports a whole exported folder, with its picture, and opens a note", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await page.getByRole("button", { name: /^Menu/ }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: /^Import notes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Import notes" });
  await expect(sheet).toBeVisible();

  // The "Choose a folder" picker, given the whole folder.
  await sheet.locator('input[type="file"]:not([accept])').setInputFiles(EXPORT);
  await expect(sheet.getByRole("status")).toContainText("Brought in 2 notes and 1 picture, into “Imported/Bear export”.");
  await expect(sheet.getByRole("status")).toContainText("receipt.pdf");
  await expect(sheet.getByRole("status")).not.toContainText(".obsidian");

  await sheet.getByRole("button", { name: "Open the first one" }).click();
  await expect(page.locator(".writing h1")).toHaveText(/Lisbon|Porto/);

  // The imported notes are found by search, and their gaps are counted.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("lisbon tram");
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing h1")).toHaveText("Lisbon");
  await expect(page.locator(".writing img")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Gaps/ })).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("the Porto table comes in as a protected block", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await page.getByRole("button", { name: /^Menu/ }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: /^Import notes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Import notes" });
  await sheet.locator('input[type="file"]:not([accept])').setInputFiles(EXPORT);
  await expect(sheet.getByRole("status")).toContainText("Brought in");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("porto");
  await page.keyboard.press("Enter");
  await expect(page.locator(".writing .raw-label")).toHaveText("Table · kept as written");
});
