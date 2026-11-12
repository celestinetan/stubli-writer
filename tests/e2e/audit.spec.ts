/**
 * The build-loop audit, measured on screen: every screen, laptop and phone, Light and Paper.
 * Fails on: text contrast under WCAG AA, text under 12 px, tap targets under 44 px, sideways
 * scrolling, and focus that can't be seen.
 */
import { expect, test, type Page } from "@playwright/test";

type Finding = { screen: string; kind: string; detail: string };

async function measure(page: Page, screen: string): Promise<Finding[]> {
  // Measure still screens, not sheets halfway through sliding in.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const found = await page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) {
        const c = rgb(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return c;
      }
      return rgb(getComputedStyle(document.body).backgroundColor);
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.opacity !== "0" && !el.closest("[aria-hidden='true'], dialog:not([open])");
    };
    const label = (el: Element) => `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""} “${(el.textContent ?? "").trim().slice(0, 30)}”`;

    // Text: contrast and size, for every element that has its own text.
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el) || el.closest(".raw-source, .gap-open, .gap-close")) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own) continue;
      const s = getComputedStyle(el);
      const size = parseFloat(s.fontSize);
      if (size > 0 && size < 12) out.push({ kind: "small text", detail: `${label(el)} ${size}px` });
      const fg = rgb(s.color);
      const bg = bgOf(el);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      const disabled = (el as HTMLButtonElement).disabled || el.closest("[disabled]");
      if (!disabled && ratio < (large ? 3 : 4.5)) out.push({ kind: "contrast", detail: `${label(el)} ${ratio.toFixed(2)}:1` });
    }

    // Tap targets: buttons, links that aren't inside a sentence, inputs.
    for (const el of document.querySelectorAll("button, a, input:not([type=hidden]), [role=option]")) {
      if (!visible(el) || (el as HTMLInputElement).type === "file") continue;
      const inText = el.matches(".link, .writing a, .start-privacy a, main p a, .sheet-hint a");
      if (inText) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) out.push({ kind: "tap target", detail: `${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}` });
    }

    if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ kind: "sideways scroll", detail: `${document.documentElement.scrollWidth} > ${innerWidth}` });
    return out;
  });
  return found.map((f) => ({ screen, ...f }));
}

async function focusRingsVisible(page: Page): Promise<string[]> {
  const missing: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.classList.contains("ProseMirror")) return null;
      const s = getComputedStyle(el);
      const ring = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2;
      return ring ? null : `${el.tagName.toLowerCase()} “${(el.textContent ?? "").trim().slice(0, 25)}”`;
    });
    if (info) missing.push(info);
  }
  return [...new Set(missing)];
}

// The default, each page, and every accent at least once.
const LOOKS = [
  { font: "charter", page: "white", accent: "moss" },
  { font: "literata", page: "light", accent: "rust" },
  { font: "source", page: "paper", accent: "ink" },
  { font: "figtree", page: "white", accent: "plum" },
  { font: "charter", page: "light", accent: "sea" },
];

for (const look of LOOKS) {
  const mode = `${look.page}, ${look.font}, ${look.accent}`;
  test(`audit in ${mode}`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("stubli-writer:appearance", JSON.stringify(l)), look);
    const findings: Finding[] = [];

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Where should your notes live?" })).toBeVisible();
    findings.push(...(await measure(page, "start")));
    for (const f of await focusRingsVisible(page)) findings.push({ screen: "start", kind: "focus", detail: f });

    await page.getByRole("button", { name: "Try it with sample notes" }).click();
    await expect(page.locator(".writing h1")).toBeVisible();
    findings.push(...(await measure(page, "today")));

    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox", { name: "Find or start a note" }).fill("tram");
    findings.push(...(await measure(page, "switcher")));
    await page.keyboard.press("Enter");
    await expect(page.locator(".writing h1")).toHaveText("The tram to Belém");
    findings.push(...(await measure(page, "note")));

    await page.getByRole("button", { name: /^Gaps/ }).click();
    await expect(page.getByRole("dialog", { name: /open gaps/ })).toBeVisible();
    findings.push(...(await measure(page, "gap panel")));
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Import notes" }).click();
    findings.push(...(await measure(page, "import")));
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Appearance/ }).click();
    await expect(page.getByRole("dialog", { name: "Appearance" })).toBeVisible();
    findings.push(...(await measure(page, "appearance")));
    await page.keyboard.press("Escape");

    await page.goto("/privacy.html");
    findings.push(...(await measure(page, "privacy")));

    const report = findings.map((f) => `${f.screen} · ${f.kind} · ${f.detail}`);
    console.log(`AUDIT ${mode} (${test.info().project.name}): ${report.length} findings\n${report.join("\n")}`);
    expect(report).toEqual([]);
  });
}
