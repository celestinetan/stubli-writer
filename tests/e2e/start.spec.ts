import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "Folders are a computer feature.");

test("if Chrome never opens the folder window, say so and how to fix it", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<never> }).showDirectoryPicker = async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose a folder" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Chrome didn't open the folder window");
  await expect(alert).toContainText("File editing");
});

test("a folder Chrome refuses after you pick it gets a plain explanation", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<never> }).showDirectoryPicker = () =>
      new Promise((_, reject) => setTimeout(() => reject(new DOMException("The user aborted a request.", "AbortError")), 900));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose a folder" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("No folder was opened", { timeout: 3000 });
  await expect(alert).toContainText("inside Documents");
  await expect(alert).toContainText("choose Allow");
  await expect(alert).not.toContainText("AbortError");
});

test("choosing a folder opens Today in it", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(`picked-${Date.now()}`, { create: true });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose a folder" }).click();
  await expect(page.locator(".writing h1")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Menu: Notes in “picked-/ })).toBeVisible();
});
