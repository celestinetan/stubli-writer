import { expect, type Page } from "@playwright/test";

/** The sidebar: beside the page on a computer, opened from ☰ on a phone. */
export async function sidebar(page: Page) {
  const aside = page.getByRole("complementary", { name: "Books, folders and Trash" });
  if (!(await aside.isVisible())) await page.getByRole("button", { name: "Show books, folders and Trash" }).click();
  await expect(aside).toBeVisible();
  return aside;
}
