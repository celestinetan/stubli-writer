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
  await expect(alert).toContainText("AbortError");
});

test("closing the folder window yourself shows nothing", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<never> }).showDirectoryPicker = () =>
      new Promise((_, reject) => setTimeout(() => reject(new DOMException("The user aborted a request.", "AbortError")), 900));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose a folder" }).click();
  await page.waitForTimeout(1200);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("choosing a folder opens Today in it", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(`picked-${Date.now()}`, { create: true });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose a folder" }).click();
  await expect(page.locator(".writing h1")).toBeVisible();
  await expect(page.getByText(/Notes in “picked-/)).toBeVisible();
});
