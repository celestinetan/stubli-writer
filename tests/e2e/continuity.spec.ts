import { expect, test, type Page } from "@playwright/test";

const errors: string[] = [];

/**
 * A stand-in for Chrome's built-in model (the test browser has none). It "finds" one sentence
 * about Marta's hair and calls it a conflict, and records everything it was asked.
 */
function fakeModel(availability: string) {
  return `
    window.__asked = [];
    window.__availability = ${JSON.stringify(availability)};
    const session = (system) => ({
      async prompt(text) {
        window.__asked.push(text);
        if (system.startsWith("A novelist's card")) return JSON.stringify({ answer: "conflict" });
        if (!system.includes("Marta's hair was red")) return JSON.stringify({ quotes: [] });
        if (text.includes("Marta — Hair")) return JSON.stringify({ quotes: ["Marta's hair was red in the photograph"] });
        if (text.includes("Marta — Born")) return JSON.stringify({ quotes: ["Marta was born in Lisbon", "A sentence the chapter never had."] });
        return JSON.stringify({ quotes: [] });
      },
      clone: async () => session(system),
      destroy() {},
    });
    window.LanguageModel = {
      availability: async () => window.__availability,
      async create(options) {
        if (window.__availability !== "available") {
          const monitor = new EventTarget();
          options.monitor?.(monitor);
          monitor.dispatchEvent(Object.assign(new Event("downloadprogress"), { loaded: 0.5 }));
          await new Promise((r) => setTimeout(r, 150));
          window.__availability = "available";
        }
        return session(options.initialPrompts?.[0]?.content ?? "");
      },
    };
  `;
}

async function open(page: Page, script?: string) {
  await page.addInitScript(() => {
    localStorage.setItem("stubli-writer:storage", "sample");
    localStorage.setItem("stubli-writer:tour", "seen");
    localStorage.setItem("stubli-writer:book-view", "wide");
  });
  if (script) await page.addInitScript(script);
  await page.goto("/");
  await expect(page.locator(".writing h1")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Find or start a note" }).fill("Ana's letters");
  await page.getByRole("option", { name: /^Ana's letters/ }).first().click();
  await expect(page.locator(".writing h1")).toHaveText("Ana's letters");
}

async function checks(page: Page) {
  await page.locator(".footer-note").getByRole("button", { name: "In “Lisbon stories”" }).click();
  const board = page.locator("dialog.chapters-board");
  await board.getByRole("tab", { name: /Checks/ }).click();
  return board;
}

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, errors.join("\n")).toEqual([]));

test("continuity check: set up in three steps, check a chapter, set a finding aside, turn it off", async ({ page }) => {
  await open(page, fakeModel("available"));

  // Give Marta a fixed fact, then write against it.
  let board = await checks(page);
  await board.getByRole("tab", { name: "Characters" }).click();
  const cards = board.getByRole("button", { name: "Cards", exact: true });
  if (await cards.isVisible()) await cards.click();
  const marta = board.locator(".character-card", { has: page.locator(".card-name", { hasText: /^Marta$/ }) });
  await marta.getByRole("button", { name: "Edit" }).click();
  await board.getByLabel("Fixed facts").fill("Hair: grey\nBorn: in Porto");
  await board.getByRole("button", { name: "Save" }).click();
  await board.getByRole("button", { name: "Close" }).click();
  await page.locator(".writing > p").last().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Marta's hair was red in the photograph. Marta was born in Lisbon.");
  // The app's own reminder appearing shows the new sentence has reached the book.
  await expect(page.locator(".footer-note").getByRole("button", { name: "1 to check" })).toBeVisible();

  // Off until it's set up.
  board = await checks(page);
  const section = board.getByRole("region", { name: "Continuity check" });
  await expect(section).toContainText("It runs on this computer; nothing is sent anywhere.");
  await expect(section.getByRole("button", { name: /^Check “/ })).toHaveCount(0);
  await section.getByRole("button", { name: "Set up the continuity check" }).click();

  const steps = section.getByRole("group", { name: /Set up the continuity check, step/ });
  await expect(steps).toContainText("Step 1 of 3");
  await expect(steps).toContainText("It can be wrong, and it can miss things.");
  await expect(steps).toContainText("It never changes your writing or your cards.");
  await steps.getByRole("button", { name: "Next" }).click();
  await expect(steps).toContainText("Step 2 of 3");
  await expect(steps).toContainText("This computer is ready");
  await steps.getByRole("button", { name: "Next" }).click();
  await expect(steps).toContainText("Step 3 of 3");
  await expect(steps).toContainText("This book has 2 facts on 1 card.");
  await steps.getByRole("button", { name: "Turn on the continuity check" }).click();

  // Two facts to compare. The hair is already in the reminders above, so only the birthplace is listed here.
  await expect(section).toContainText("2 facts to compare, under a minute.");
  await section.getByRole("button", { name: "Check “Ana's letters”" }).click();
  const list = section.getByRole("list", { name: "Worth a look" });
  await expect(list.locator(".check-message")).toHaveText("Marta's card says “Born: in Porto”.");
  await expect(list.locator(".check-context")).toHaveText("Here: “Marta was born in Lisbon”");
  await expect(section).toContainText("It can be wrong, and it can miss things. Nothing is changed.");

  // The model is asked about the detail, then to compare the card with the one sentence that is really in the chapter.
  const asked: string[] = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked).toEqual([
    "Detail: Marta — Hair",
    'Card: Marta — Hair: grey. Chapter: "Marta\'s hair was red in the photograph". Answer:',
    "Detail: Marta — Born",
    'Card: Marta — Born: in Porto. Chapter: "Marta was born in Lisbon". Answer:',
  ]);

  // Set aside for good: it stays away after another check, and after closing the book.
  await list.getByRole("button", { name: "Not a problem: Marta, Born: in Porto" }).click();
  await expect(section.getByRole("status")).toContainText("Nothing worth a look in “Ana's letters”: it compared 2 facts. It can still miss things.");
  await section.getByRole("button", { name: "Check again" }).click();
  await expect(section.getByRole("status")).toContainText("Nothing worth a look");
  await board.getByRole("button", { name: "Close" }).click();
  board = await checks(page);
  await expect(board.getByRole("region", { name: "Continuity check" }).getByRole("status")).toContainText("Nothing worth a look");

  // The setting is kept on this device, and turning it off brings the setup back.
  expect(await page.evaluate(() => localStorage.getItem("stubli-writer:continuity"))).toBe("on");
  await board.getByRole("button", { name: "Turn off the continuity check" }).click();
  await expect(board.getByRole("button", { name: "Set up the continuity check" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("stubli-writer:continuity"))).toBe("off");
});

test("continuity check: the model is downloaded in step 2 when Chrome doesn't have it yet", async ({ page }) => {
  await open(page, fakeModel("downloadable"));
  const board = await checks(page);
  const section = board.getByRole("region", { name: "Continuity check" });
  await section.getByRole("button", { name: "Set up the continuity check" }).click();
  const steps = section.getByRole("group", { name: /Set up the continuity check, step/ });
  await steps.getByRole("button", { name: "Next" }).click();
  await expect(steps).toContainText("Chrome needs to download its AI model once.");
  await expect(steps.getByRole("button", { name: "Next" })).toHaveCount(0);
  await steps.getByRole("button", { name: "Download the model" }).click();
  await expect(steps).toContainText("This computer is ready");
  await steps.getByRole("button", { name: "Next" }).click();
  await expect(steps).toContainText("Step 3 of 3");
});

test("continuity check: a computer that can't run the model is told so, with the other way", async ({ page }) => {
  await open(page, fakeModel("unavailable"));
  const board = await checks(page);
  const section = board.getByRole("region", { name: "Continuity check" });
  await section.getByRole("button", { name: "Set up the continuity check" }).click();
  const steps = section.getByRole("group", { name: /Set up the continuity check, step/ });
  await steps.getByRole("button", { name: "Next" }).click();
  await expect(steps).toContainText("Chrome can't run its AI model on this computer.");
  await expect(steps.getByRole("button", { name: "Download the model" })).toHaveCount(0);
  await steps.getByRole("button", { name: "Close" }).click();
  await expect(section.getByRole("button", { name: "Set up the continuity check" })).toBeVisible();
});

test("continuity check: a browser without the model says where it works", async ({ page }) => {
  // The test browser may have the interface; here it's taken away, as in Safari or Firefox.
  await open(page, 'Object.defineProperty(window, "LanguageModel", { value: undefined });');
  const board = await checks(page);
  const section = board.getByRole("region", { name: "Continuity check" });
  await expect(section).toContainText("This needs Chrome on a laptop or desktop computer. In this browser, use “Ask your own AI assistant” below.");
  await expect(section.getByRole("button")).toHaveCount(0);
  // The other way is still there.
  await board.getByRole("button", { name: "Ask your own AI assistant" }).click();
  await expect(board.getByRole("heading", { name: "Ask an AI to read for contradictions" })).toBeVisible();
});
