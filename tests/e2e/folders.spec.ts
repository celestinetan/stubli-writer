import { expect, test, type Page } from "@playwright/test";
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

const row = (side: Awaited<ReturnType<typeof sidebar>>, name: string) => side.getByRole("button", { name, exact: true });

/** The menu for a row: right-click on a computer, the … button on a phone (as people would). */
async function menuFor(page: Page, name: string, isMobile: boolean) {
  const side = await sidebar(page);
  if (isMobile) await side.getByRole("button", { name: new RegExp(`^More for (the folder )?“${name}”$`) }).click();
  else await row(side, name).click({ button: "right" });
  return page.getByRole("menu");
}

async function newFolder(page: Page, name: string) {
  const side = await sidebar(page);
  await side.getByRole("button", { name: "New folder" }).click();
  await side.getByRole("textbox", { name: "Folder name" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(row(side, name)).toBeVisible();
}

test("a new folder, and a note moved into it from its menu, with Undo", async ({ page, isMobile }) => {
  await newFolder(page, "Essays");
  const menu = await menuFor(page, "Essay ideas", isMobile);
  await menu.getByRole("menuitem", { name: "Move to…" }).click();
  await menu.getByRole("menuitem", { name: "Essays", exact: true }).click();
  await expect(page.getByText("Moved “Essay ideas” to “Essays”.")).toBeVisible();
  const side = await sidebar(page);
  await expect(row(side, "Essays")).toHaveAttribute("aria-expanded", "true");
  await expect(side.locator("li", { has: page.getByRole("button", { name: "Essays", exact: true }) }).getByRole("button", { name: "Essay ideas", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(side.locator("li", { has: page.getByRole("button", { name: "Not in a folder", exact: true }) }).getByRole("button", { name: "Essay ideas", exact: true })).toBeVisible();
});

test("rename a note in place: its title and file change together", async ({ page, isMobile }) => {
  const menu = await menuFor(page, "Essay ideas", isMobile);
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  const side = await sidebar(page);
  await side.getByRole("textbox", { name: "New name" }).fill("Walking essays");
  await page.keyboard.press("Enter");
  await expect(row(side, "Walking essays")).toBeVisible();
  await row(side, "Walking essays").click();
  await expect(page.locator(".writing h1")).toHaveText("Walking essays");
  // Escape leaves a name as it was.
  const again = await menuFor(page, "Walking essays", isMobile);
  await again.getByRole("menuitem", { name: "Rename" }).click();
  await (await sidebar(page)).getByRole("textbox", { name: "New name" }).fill("Something else");
  await page.keyboard.press("Escape");
  await expect(row(await sidebar(page), "Walking essays")).toBeVisible();
});

test("drag a note into a folder, and a folder into another", async ({ page, isMobile }) => {
  test.skip(isMobile, "Dragging is for a mouse; phones use Move to.");
  await newFolder(page, "Essays");
  await newFolder(page, "Archive");
  const side = await sidebar(page);
  await row(side, "Essay ideas").dragTo(row(side, "Essays"));
  await expect(page.getByText("Moved “Essay ideas” to “Essays”.")).toBeVisible();
  await row(side, "Essays").dragTo(row(side, "Archive"));
  await expect(page.getByText("Moved “Essays” to “Archive”.")).toBeVisible();
  await expect(row(side, "Archive")).toHaveAttribute("aria-expanded", "true");
  await row(side, "Essays").click();
  await expect(side.getByRole("button", { name: "Essay ideas", exact: true })).toBeVisible();
});

test("a chapter moves within its book from the sidebar, and a note becomes a chapter", async ({ page, isMobile }) => {
  const side = await sidebar(page);
  await row(side, "Lisbon stories").click();
  const menu = await menuFor(page, "Ana's letters", isMobile);
  await menu.getByRole("menuitem", { name: "Move earlier" }).click();
  const chapters = side.locator("li", { has: page.getByRole("button", { name: "Lisbon stories", exact: true }) }).locator(".side-nested .side-item:not(.side-quiet)");
  await expect(chapters).toHaveText(["Ana's letters", "The tram to Belém"]);

  const m2 = await menuFor(page, "Essay ideas", isMobile);
  await m2.getByRole("menuitem", { name: "Add to a book…" }).click();
  await m2.getByRole("menuitem", { name: "Lisbon stories" }).click();
  await expect(chapters).toHaveText(["Ana's letters", "The tram to Belém", "Essay ideas"]);
});

test("a folder goes to Trash with everything in it, and Undo brings it back", async ({ page, isMobile }) => {
  await newFolder(page, "Old");
  const side = await sidebar(page);
  const menu = await menuFor(page, "Essay ideas", isMobile);
  await menu.getByRole("menuitem", { name: "Move to…" }).click();
  await menu.getByRole("menuitem", { name: "Old", exact: true }).click();
  const m2 = await menuFor(page, "Old", isMobile);
  await m2.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(page.getByText("Moved the folder “Old” to Trash.")).toBeVisible();
  await expect(row(side, "Old")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row(await sidebar(page), "Old")).toBeVisible();
});
