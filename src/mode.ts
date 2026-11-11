export type Mode = "light" | "paper";

const KEY = "stubli-writer:mode";

/** The reading mode saved on this device, or Light. Storage may be blocked; that's fine. */
export function loadMode(): Mode {
  try {
    return parseMode(localStorage.getItem(KEY));
  } catch {
    return "light";
  }
}

export function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private windows can refuse storage; the choice just won't be remembered.
  }
}

export function parseMode(value: string | null): Mode {
  return value === "paper" ? "paper" : "light";
}

export function applyMode(mode: Mode): void {
  document.documentElement.dataset.mode = mode;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = mode === "paper" ? "#f5efe6" : "#fbfaf8";
}
