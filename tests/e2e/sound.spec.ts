import { expect, test } from "@playwright/test";

// The browser's sound maker is replaced by a counter: the test checks when a stroke is asked for,
// not what it sounds like.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("stubli-writer:storage", "sample");
    const w = window as unknown as { strokes: number; AudioContext: unknown };
    w.strokes = 0;
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({
      connect: (n: unknown) => n,
      start() {},
      stop() {},
      frequency: param(),
      Q: param(),
      gain: param(),
      pan: param(),
      threshold: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      type: "",
      buffer: null,
    });
    w.AudioContext = class {
      state = "running";
      currentTime = 0;
      sampleRate = 48000;
      destination = {};
      resume() {}
      createBuffer() {
        return { getChannelData: () => new Float32Array(8) };
      }
      createBiquadFilter = node;
      createGain = node;
      createBufferSource = node;
      createStereoPanner = node;
      createConvolver = node;
      createDynamicsCompressor = node;
      createOscillator() {
        w.strokes++;
        return node();
      }
    };
  });
  await page.goto("/");
  await expect(page.locator(".writing h1")).toBeVisible();
});

const strokes = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { strokes: number }).strokes);

test("typing is silent until a sound is chosen; then each key sounds once, and Off is silent again", async ({ page }) => {
  await page.locator(".writing").click();
  await page.keyboard.type("abc");
  expect(await strokes(page)).toBe(0);

  await page.getByRole("button", { name: /^Appearance/ }).click();
  const panel = page.getByRole("dialog", { name: "Appearance" });
  await expect(panel.getByRole("radio", { name: "Off" })).toBeChecked();
  await panel.getByText("Thocky", { exact: true }).click();
  await expect(panel.getByRole("radio", { name: "Thocky" })).toBeChecked();
  // Choosing one plays it: a few words' worth of keys going down (the counter hears downstrokes).
  expect(await strokes(page)).toBe(10);
  await panel.getByRole("button", { name: "Done" }).click();

  await page.locator(".writing").click();
  await page.keyboard.type("abc ");
  expect(await strokes(page)).toBe(14);
  // Shortcuts and arrows make no sound.
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ArrowLeft");
  expect(await strokes(page)).toBe(14);

  // It's remembered on this device.
  await page.reload();
  await expect(page.locator(".writing h1")).toBeVisible();
  await page.locator(".writing").click();
  await page.keyboard.type("d");
  expect(await strokes(page)).toBe(1);

  await page.getByRole("button", { name: /^Appearance/ }).click();
  await panel.getByText("Off", { exact: true }).click();
  await panel.getByRole("button", { name: "Done" }).click();
  await page.locator(".writing").click();
  await page.keyboard.type("e");
  expect(await strokes(page)).toBe(1);
});
