import { expect, test, type Page } from "@playwright/test";

const writing = (page: Page) => page.locator(".writing");

async function open(page: Page, words: string) {
  await page.addInitScript(() => localStorage.setItem("stubli-writer:storage", "sample"));
  await page.goto("/");
  await expect(writing(page)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill(words);
  await page.keyboard.press("Enter");
}

async function cursorAtEnd(page: Page) {
  await page.evaluate(() => {
    const p = [...document.querySelectorAll(".writing > p")].pop()!;
    const r = document.createRange();
    r.selectNodeContents(p);
    r.collapse(false);
    (document.querySelector(".writing") as HTMLElement).focus();
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.waitForTimeout(50);
}

test("paragraphs have a visible space between them, headings sit close to their text", async ({ page }) => {
  await open(page, "ana letters");
  await expect(writing(page).locator("h1")).toHaveText("Ana's letters");
  const gaps = await page.evaluate(() => {
    const ps = [...document.querySelectorAll(".writing > p")];
    const between = ps[1].getBoundingClientRect().top - ps[0].getBoundingClientRect().bottom;
    return { between, size: parseFloat(getComputedStyle(ps[0]).fontSize) };
  });
  expect(gaps.between).toBeGreaterThanOrEqual(gaps.size * 0.9);
});

test("the top bar never fades on a touch screen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch screens only.");
  await open(page, "tram belem");
  await cursorAtEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Writing on the phone.");
  const opacity = await page.getByRole("button", { name: "Today" }).evaluate((el) => getComputedStyle(el.closest(".topbar-left")!).opacity);
  expect(opacity).toBe("1");
  await expect(page.getByRole("status")).toBeVisible();
});

test("on a computer, typing fades only the buttons; the bar stays solid and the save status stays", async ({ page, isMobile }) => {
  test.skip(isMobile, "Pointer devices only.");
  await open(page, "tram belem");
  await cursorAtEnd(page);
  await page.keyboard.type(" More.");
  await expect.poll(() => page.locator(".topbar-left").evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  expect(await page.locator(".topbar").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  expect(await page.locator(".topbar").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await page.getByRole("status").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await page.mouse.move(400, 300);
  await expect.poll(() => page.locator(".topbar-left").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});

test("the line being typed stays well above the bottom of the window", async ({ page, isMobile }) => {
  test.skip(isMobile, "Measured on a laptop window.");
  await open(page, "tram belem");
  await cursorAtEnd(page);
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`Line ${i} of a long note, to fill the window.`);
  }
  const { caretBottom, height } = await page.evaluate(() => ({
    caretBottom: getSelection()!.getRangeAt(0).getBoundingClientRect().bottom,
    height: window.innerHeight,
  }));
  expect(caretBottom).toBeLessThan(height * 0.8);
});

test("on a narrow screen the + sits at the end of the empty line and adds a break", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Narrow screens.");
  await open(page, "tram belem");
  await cursorAtEnd(page);
  await page.keyboard.press("Enter");
  const plus = page.getByRole("button", { name: "Add a picture, code, a break and more" });
  await expect(plus).toBeVisible();
  const placement = await plus.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const col = document.querySelector(".writing")!.getBoundingClientRect();
    return { rightGap: col.right - r.right, inside: r.left >= 0 && r.right <= window.innerWidth };
  });
  expect(placement.inside).toBe(true);
  expect(Math.abs(placement.rightGap)).toBeLessThan(8);
  await plus.click();
  await page.getByRole("button", { name: "Break" }).click();
  await expect(writing(page).locator("hr")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Gaps is calm: no count in the bar, tinted only when this note has gaps, this note first", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("stubli-writer:storage", "sample"));
  await page.goto("/");
  const gapsButton = page.getByRole("button", { name: /^Gaps/ });
  await expect(gapsButton).toHaveText("Gaps");
  await page.getByRole("button", { name: "Today" }).click();
  await expect(gapsButton).not.toHaveClass(/has-gaps/); // today's note is empty
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("essay ideas");
  await page.keyboard.press("Enter");
  await expect(gapsButton).toHaveClass(/has-gaps/);
  await gapsButton.click();
  await expect(page.getByRole("dialog", { name: /open gaps/ }).locator(".gap-group h3").first()).toContainText("Essay ideas · this note");
});
