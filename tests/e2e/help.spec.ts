import { sidebar } from "./sidebar";
import { expect, test } from "@playwright/test";

test("Help opens from the menu (and the ? button on a computer), and Close shuts it", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  if (isMobile) {
    await (await sidebar(page)).getByRole("button", { name: "Help" }).click();
  } else await page.locator(".topbar").getByRole("button", { name: "Help", exact: true }).click();
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

test("Help is short topics that open one at a time, and can be searched", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample notes" }).click();
  if (isMobile) {
    await (await sidebar(page)).getByRole("button", { name: "Help" }).click();
  } else await page.locator(".topbar").getByRole("button", { name: "Help", exact: true }).click();
  const help = page.getByRole("dialog", { name: "Help" });
  // It starts on the first five minutes; everything else is a title until it's chosen.
  await expect(help.getByText("Know where it's kept.")).toBeVisible();
  await expect(help.getByText("Lore is a card for each place")).toBeHidden();
  await help.getByRole("heading", { name: "Lore: what must stay true" }).click();
  await expect(help.getByText("Lore is a card for each place")).toBeVisible();

  // Searching shows only the topics that mention the words, opened.
  await help.getByRole("searchbox", { name: "Search help" }).fill("paperback");
  await expect(help.locator(".help-topic")).toHaveCount(1);
  await expect(help.getByText("paperback interior")).toBeVisible();
  await help.getByRole("searchbox", { name: "Search help" }).fill("iphone folder");
  await expect(help.locator(".help-topic h4")).toHaveText(["How Stubli Writer works: where the app and your notes live", "On an iPhone or iPad, offline, and as an app", "My folder won't open"]);
  await help.getByRole("searchbox", { name: "Search help" }).fill("zzzz");
  await expect(help.getByRole("status")).toContainText("Nothing in Help mentions “zzzz”");
  await help.getByRole("searchbox", { name: "Search help" }).fill("");
  await expect(help.locator(".help-topic").first()).toBeVisible();
  expect(await help.locator(".help-topic").count()).toBeGreaterThan(20);
});
