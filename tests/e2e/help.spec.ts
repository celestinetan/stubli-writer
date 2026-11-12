import { expect, test } from "@playwright/test";

test("Help opens from the menu (and the ? button on a computer), and Close shuts it", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  if (isMobile) {
    await page.getByRole("button", { name: /^Menu/ }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: /^Help/ }).click();
  } else await page.getByRole("button", { name: "Help", exact: true }).click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help).toBeVisible();
  await expect(help.getByRole("heading", { name: "Gaps" })).toBeVisible();
  await expect(help.getByRole("heading", { name: "Shortcuts" })).toBeVisible();
  await expect(help).toContainText("only in this page, as samples");
  await help.getByRole("button", { name: "Close" }).click();
  await expect(help).toBeHidden();
});

test("the ? key opens Help when you're not typing in a note", async ({ page, isMobile }) => {
  test.skip(isMobile, "A keyboard shortcut.");
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  await expect(page.locator(".writing")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Help" })).toBeVisible();
  await page.keyboard.press("Escape");
  // Typing ? in a note just types it.
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("Why?");
  await expect(page.getByRole("dialog", { name: "Help" })).toBeHidden();
  await expect(page.locator(".writing")).toContainText("Why?");
});

test("a brand-new folder starts with the Welcome note, once", async ({ page, isMobile }) => {
  test.skip(isMobile, "Folders are a computer feature.");
  const name = `fresh-${Date.now()}`;
  await page.addInitScript((n) => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(n, { create: true });
  }, name);
  await page.goto("/");
  await page.getByRole("button", { name: "Choose a folder" }).click();
  await expect(page.locator(".writing h1")).toHaveText("Welcome to Stubli Writer");
  await expect(page.locator(".writing .gap").first()).toHaveText("TK");
  await expect(page.locator(".writing blockquote.pull-quote")).toBeVisible();
  // It's an ordinary file in the folder.
  const files = await page.evaluate(async (n) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(n);
    const out: string[] = [];
    for await (const [k] of dir.entries()) out.push(k);
    return out;
  }, name);
  expect(files).toContain("Welcome to Stubli Writer.md");
});
