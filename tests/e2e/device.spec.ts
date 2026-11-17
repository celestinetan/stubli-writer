import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { sidebar } from "./sidebar";

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("stubli-writer:tour", "seen"));
  await page.goto("/");
});

test.afterEach(() => expect(errors, errors.join("\n")).toEqual([]));

async function startOnDevice(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Keep notes on this device" }).click();
  await expect(page.locator(".writing h1")).toBeVisible();
}

test("notes on this device: kept across visits, with no folder or account", async ({ page }) => {
  await startOnDevice(page);
  // A new notebook starts with the Welcome note.
  await expect(page.locator(".writing h1")).toHaveText("Welcome to Stubli Writer");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("option", { name: /^Today/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // On a phone the cursor isn't placed by itself (the keyboard would pop up); tap into the note.
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("Kept on the phone. TK");
  await expect(page.getByRole("status").first()).toHaveText("Saved", { timeout: 4000 });
  await page.reload();
  await expect(page.locator(".writing h1")).toBeVisible();
  await expect(await sidebar(page)).toContainText("Notes on this device");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("kept on the phone");
  await expect(page.getByRole("option").first()).toContainText("Kept on the phone");
});

test("back up every note to a .zip, and restore it, keeping a changed note as well", async ({ page }) => {
  await startOnDevice(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), (await sidebar(page)).getByRole("button", { name: "Back up" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^Stubli Writer backup \d{4}-\d{2}-\d{2}\.zip$/);
  const file = await dl.path();
  const names: string[] = JSON.parse(execFileSync("python3", ["-I", "-c", "import zipfile,json,sys; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))", file], { encoding: "utf8" }));
  expect(names).toEqual([expect.stringMatching(/^Stubli Writer backup [\d-]+\/Welcome to Stubli Writer\.md$/)]);
  await expect(page.getByText(/Backed up 1 note to/)).toBeVisible();

  // Change the Welcome note, then restore the backup: both versions are kept.
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("A change after the backup.");
  await expect(page.getByRole("status").first()).toHaveText("Saved", { timeout: 4000 });
  await (await sidebar(page)).getByRole("button", { name: "Import notes" }).click();
  const sheet = page.getByRole("dialog", { name: "Import notes" });
  await sheet.getByLabel("Backup file").setInputFiles(file);
  await expect(sheet.getByText(/Restored: 1 note kept as well/)).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("welcome");
  await expect(page.getByRole("option")).toHaveCount(3); // the note, its restored copy, and New note
});

test("a gentle reminder to back up, after a few days without one; Later puts it off", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("stubli-writer:first-use:device:This device", String(Date.now() - 5 * 24 * 3600 * 1000)));
  await page.reload();
  await startOnDevice(page);
  const reminder = page.getByText("Your notes are only on this device.");
  await expect(reminder).toBeVisible();
  await page.getByRole("button", { name: "Later" }).click();
  await expect(reminder).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".writing h1")).toBeVisible();
  await expect(reminder).toHaveCount(0);
});
