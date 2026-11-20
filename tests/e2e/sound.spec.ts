import { expect, test } from "@playwright/test";

// The browser's sound player is replaced by a counter: the test checks when a stroke is played,
// not what it sounds like. Thocky has no separate upstrokes, so one key is one stroke.
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
      createStereoPanner = node;
      createConvolver = node;
      createDynamicsCompressor = node;
      createBufferSource() {
        return { ...node(), playbackRate: param(), start: () => void w.strokes++ };
      }
      decodeAudioData() {
        return Promise.resolve({});
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
  // Choosing one fetches that keyboard's recording and plays a few words' worth of keys.
  await expect.poll(() => strokes(page)).toBe(10);
  await panel.getByRole("button", { name: "Done" }).click();

  await page.locator(".writing").click();
  await page.keyboard.type("abc ");
  await expect.poll(() => strokes(page)).toBe(14);
  // Shortcuts and arrows make no sound.
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ArrowLeft");
  expect(await strokes(page)).toBe(14);

  // It's remembered on this device.
  await page.reload();
  await expect(page.locator(".writing h1")).toBeVisible();
  await page.locator(".writing").click();
  await page.keyboard.type("d");
  await expect.poll(() => strokes(page)).toBe(1);

  await page.getByRole("button", { name: /^Appearance/ }).click();
  await panel.getByText("Off", { exact: true }).click();
  await panel.getByRole("button", { name: "Done" }).click();
  await page.locator(".writing").click();
  await page.keyboard.type("e");
  expect(await strokes(page)).toBe(1);
});

test.describe("with the browser's real sound player", () => {
  test("no sound file is fetched while Off; choosing a keyboard fetches only that one, and it decodes and plays", async ({ browser }) => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const fetched: string[] = [];
    page.on("response", (r) => r.url().includes("/sounds/") && fetched.push(`${r.status()} ${r.url().split("/").pop()}`));
    await page.addInitScript(() => {
      localStorage.setItem("stubli-writer:storage", "sample");
      const w = window as unknown as { played: number[] };
      w.played = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when?: number, offset?: number, duration?: number) {
        w.played.push(this.buffer ? this.buffer.duration : -1);
        return start.call(this, when, offset, duration);
      };
    });
    await page.goto("/");
    await expect(page.locator(".writing h1")).toBeVisible();
    await page.locator(".writing").click();
    await page.keyboard.type("abc");
    expect(fetched).toEqual([]);

    await page.getByRole("button", { name: /^Appearance/ }).click();
    await page.getByRole("dialog", { name: "Appearance" }).getByText("Clacky", { exact: true }).click();
    const played = () => page.evaluate(() => (window as unknown as { played: number[] }).played);
    // Ten presses and ten releases, all from a recording several seconds long.
    await expect.poll(async () => (await played()).length).toBe(20);
    expect(Math.min(...(await played()))).toBeGreaterThan(2);
    expect(fetched).toEqual(["200 clacky.wav"]);
    expect(errors).toEqual([]);
    await page.close();
  });
});
