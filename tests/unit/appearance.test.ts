import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCENTS, DEFAULT_APPEARANCE, PAGES, parseAppearance } from "../../src/appearance";
import { CSP } from "../../vite.config";

describe("appearance settings", () => {
  it("starts Medium-like for someone new: white page, Charter, Moss", () => {
    expect(parseAppearance(null, null)).toEqual({ font: "charter", size: "medium", page: "white", accent: "moss" });
  });
  it("keeps the old look for someone from before (Light or Paper, Literata)", () => {
    expect(parseAppearance(null, "paper")).toEqual({ font: "literata", size: "medium", page: "paper", accent: "moss" });
    expect(parseAppearance(null, "light")).toEqual({ font: "literata", size: "medium", page: "light", accent: "moss" });
    expect(parseAppearance(null, "dark")).toEqual(DEFAULT_APPEARANCE);
  });
  it("reads a saved choice, and replaces anything it doesn't know", () => {
    expect(parseAppearance('{"font":"source","page":"paper","accent":"plum"}', null)).toEqual({ font: "source", size: "medium", page: "paper", accent: "plum" });
    expect(parseAppearance('{"font":"source","size":"large","page":"paper","accent":"plum"}', null)).toMatchObject({ size: "large" });
    expect(parseAppearance('{"size":"huge"}', null)).toMatchObject({ size: "medium" });
    expect(parseAppearance('{"font":"comic","page":"neon","accent":"plum"}', null)).toEqual({ ...DEFAULT_APPEARANCE, accent: "plum" });
    expect(parseAppearance("{broken", "paper")).toEqual({ font: "literata", size: "medium", page: "paper", accent: "moss" });
  });
});

describe("colour contrast, every page and accent (WCAG AA, 4.5:1)", () => {
  const css = readFileSync(fileURLToPath(new URL("../../src/styles/tokens.css", import.meta.url)), "utf8");
  const block = (selector: string) => {
    const m = new RegExp(`${selector.replace(/[[\]"]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css);
    if (!m) throw new Error(`No rule for ${selector}`);
    return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((x) => [x[1], x[2]]));
  };
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  for (const p of PAGES) {
    it(`${p.name}: text and secondary text on the page and on panels`, () => {
      const page = block(p.id === "white" ? `[data-page="white"]` : `[data-page="${p.id}"]`);
      expect(ratio(page.ink, page.bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(page.muted, page.bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(page.muted, page.surface)).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const a of ACCENTS) {
    it(`${a.name}: buttons, the selection bar and gap chips on every page`, () => {
      const base = block(`[data-accent="${a.id}"]`);
      expect(base.accent).toBe(a.colour);
      expect(ratio("#ffffff", base.accent)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(base["bar-active"], "#22201d")).toBeGreaterThanOrEqual(4.5);
      for (const p of PAGES) {
        const chip = block(`[data-accent="${a.id}"][data-page="${p.id}"]`);
        expect(ratio(chip["gap-ink"], chip["gap-bg"]), `${a.name} on ${p.name}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("content security policy", () => {
  it("allows the site's own files, and Google only for sign-in and Drive", () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).not.toContain("unsafe-inline");
    expect(CSP).not.toContain("unsafe-eval");
    const hosts = [...CSP.matchAll(/https:\/\/([^/\s;]+)/g)].map((m) => m[1]);
    expect(new Set(hosts)).toEqual(new Set(["accounts.google.com", "www.googleapis.com"]));
  });
});
