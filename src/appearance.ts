/**
 * How the page looks: the writing font, the page colour and the accent. Saved on this device.
 *
 * A brand-new person starts Medium-like: a white page, Charter, Moss.
 * Someone who used Stubli Writer before this choice existed keeps what they had.
 */

export type FontId = "charter" | "literata" | "source" | "figtree";
export type PageId = "white" | "light" | "paper";
export type AccentId = "moss" | "ink" | "sea" | "plum" | "rust";

export interface Appearance {
  font: FontId;
  page: PageId;
  accent: AccentId;
}

export const FONTS: { id: FontId; name: string; note: string }[] = [
  { id: "charter", name: "Charter", note: "Classic and sturdy" },
  { id: "literata", name: "Literata", note: "Stubli's book serif" },
  { id: "source", name: "Source Serif", note: "Calm and modern" },
  { id: "figtree", name: "Figtree", note: "Sans-serif" },
];

export const PAGES: { id: PageId; name: string; colour: string; theme: string }[] = [
  { id: "white", name: "White", colour: "#ffffff", theme: "#ffffff" },
  { id: "light", name: "Light", colour: "#fbfaf8", theme: "#fbfaf8" },
  { id: "paper", name: "Paper", colour: "#f5efe6", theme: "#f5efe6" },
];

export const ACCENTS: { id: AccentId; name: string; colour: string }[] = [
  { id: "moss", name: "Moss", colour: "#4f6a4a" },
  { id: "ink", name: "Ink", colour: "#2f2d2a" },
  { id: "sea", name: "Sea", colour: "#3d5468" },
  { id: "plum", name: "Plum", colour: "#6b3f5a" },
  { id: "rust", name: "Rust", colour: "#8a4b2c" },
];

export const DEFAULT_APPEARANCE: Appearance = { font: "charter", page: "white", accent: "moss" };

const KEY = "stubli-writer:appearance";
/** Before fonts and accents could be chosen, only Light or Paper was saved, under this key. */
const OLD_MODE_KEY = "stubli-writer:mode";

export function parseAppearance(saved: string | null, oldMode: string | null): Appearance {
  try {
    if (saved) {
      const v = JSON.parse(saved) as Partial<Appearance>;
      return {
        font: FONTS.some((f) => f.id === v.font) ? v.font! : DEFAULT_APPEARANCE.font,
        page: PAGES.some((p) => p.id === v.page) ? v.page! : DEFAULT_APPEARANCE.page,
        accent: ACCENTS.some((a) => a.id === v.accent) ? v.accent! : DEFAULT_APPEARANCE.accent,
      };
    }
  } catch {
    // A damaged setting falls back to the default below.
  }
  // Someone from before: keep their page and Literata, as it looked for them.
  if (oldMode === "light" || oldMode === "paper") return { font: "literata", page: oldMode, accent: "moss" };
  return { ...DEFAULT_APPEARANCE };
}

export function loadAppearance(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(KEY), localStorage.getItem(OLD_MODE_KEY));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // Private windows can refuse storage; the choice just won't be remembered.
  }
}

/** Data attributes only (no inline styles), so the security policy stays strict. */
export function applyAppearance(a: Appearance): void {
  const html = document.documentElement;
  html.dataset.font = a.font;
  html.dataset.page = a.page;
  html.dataset.accent = a.accent;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = PAGES.find((p) => p.id === a.page)!.theme;
}
