import { sidebar } from "./sidebar";
/**
 * Google Drive mode in real Chrome, with the real security policy. Google's sign-in script and
 * the Drive API are stand-ins (the pretend Drive from the unit tests), so no Google account is
 * used. A separate, manual check signs in to the real Google.
 */
import { expect, test, type Page } from "@playwright/test";
import { FakeDrive } from "../unit/fake-drive";

const FAKE_GIS = `
window.google = { accounts: { oauth2: {
  initTokenClient: (c) => ({ requestAccessToken: () => setTimeout(() => c.callback({ access_token: "fake-token", expires_in: 3600, scope: c.scope }), 10) }),
  hasGrantedAllScopes: () => true,
  revoke: () => {},
} } };`;

async function withPretendGoogle(page: Page, drive: FakeDrive) {
  await page.route("https://accounts.google.com/gsi/client", (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_GIS }));
  await page.route("https://www.googleapis.com/**", async (route) => {
    const req = route.request();
    if (drive.offline) return route.abort("internetdisconnected");
    const res = await drive.fetch(req.url(), {
      method: req.method(),
      headers: await req.allHeaders(),
      body: req.postDataBuffer() ?? undefined,
    } as RequestInit);
    await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" } });
  });
}

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, errors.join("\n")).toEqual([]));

test("signs in, saves today's note to Drive, and lists it", async ({ page }) => {
  const drive = new FakeDrive();
  await withPretendGoogle(page, drive);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  // A brand-new notebook opens on the Welcome note, saved into Drive.
  await expect(page.locator(".writing h1")).toHaveText("Welcome to Stubli Writer");
  await expect.poll(() => drive.byName("Welcome to Stubli Writer.md")?.name ?? "").not.toBe("");
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.locator(".writing h1")).not.toHaveText("Welcome to Stubli Writer");
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("Written into Drive, with a TK.");
  await expect(page.getByRole("status")).toHaveText("Saved", { timeout: 5000 });
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.md`;
  await expect.poll(() => drive.byName(today)?.name ?? "").toBe(today);
  expect(drive.textOf(today)).toContain("Written into Drive, with a TK.");
  expect(drive.byName("Stubli Writer")).toBeTruthy();
  await expect(await sidebar(page)).toContainText("Notes in Google Drive");
});

test("offline: keeps writing on the device, uploads when the connection is back", async ({ page, context }) => {
  const drive = new FakeDrive();
  await withPretendGoogle(page, drive);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.locator(".writing h1")).toBeVisible();

  drive.offline = true;
  await context.setOffline(true);
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("On the train.");
  // Offline is said where you look while writing, not hidden in a menu.
  await expect(page.getByRole("status")).toHaveText("Offline · saved on this device", { timeout: 5000 });

  drive.offline = false;
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status")).toHaveText("Saved", { timeout: 5000 });
  const day = [...drive.files.values()].find((f) => f.name.endsWith(".md"))!;
  expect(new TextDecoder().decode(day.content)).toContain("On the train.");
});

test("after a reload, opens at once with the notes kept on this device and offers to sign in", async ({ page }) => {
  const drive = new FakeDrive();
  await withPretendGoogle(page, drive);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("Kept for later.");
  await expect(page.getByRole("status")).toHaveText("Saved", { timeout: 5000 });

  await page.reload();
  await expect(page.locator(".writing")).toContainText("Kept for later.");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
});

test("typing before signing in after a reload makes no conflicted copy", async ({ page }) => {
  const drive = new FakeDrive();
  await withPretendGoogle(page, drive);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.locator(".writing > p").last().click();
  await page.keyboard.type("Morning.");
  await expect(page.getByRole("status")).toHaveText("Saved", { timeout: 5000 });

  // A new visit: the notes open from this device; type before signing in.
  await page.reload();
  await expect(page.locator(".writing")).toContainText("Morning.");
  await page.locator(".writing > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" And afternoon.");
  await expect(page.getByRole("status")).toHaveText("Saved on this device", { timeout: 5000 });

  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved", { timeout: 5000 });
  const notes = [...drive.files.values()].filter((f) => f.name.endsWith(".md"));
  expect(notes.map((f) => f.name)).toHaveLength(1);
  expect(new TextDecoder().decode(notes[0].content)).toContain("And afternoon.");
  await expect(page.getByText("was also changed on another device")).toHaveCount(0);
});
