/** Which storage this browser uses, remembered on this device. */
export type StorageChoice = "folder" | "drive" | "sample";

const KEY = "stubli-writer:storage";

export function loadChoice(): StorageChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "folder" || v === "drive" || v === "sample" ? v : null;
  } catch {
    return null;
  }
}

export function saveChoice(choice: StorageChoice | null): void {
  try {
    if (choice) localStorage.setItem(KEY, choice);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage refused (private window): the start screen shows again next time.
  }
}
