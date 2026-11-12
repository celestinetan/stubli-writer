/**
 * The Welcome note: written into a brand-new notebook once, so the first thing you open shows
 * how gaps and formatting work, by example. It's an ordinary note: edit it or delete it.
 */
import { isoDate } from "./library";

export const WELCOME_PATH = "Welcome to Stubli Writer.md";

export function welcomeNote(d: Date): string {
  return `---
created: ${isoDate(d)}
---
# Welcome to Stubli Writer

#### A calm place to write. This note shows how it works; change it however you like.

When something isn't ready yet, a date, a name, the right word, type TK and keep writing. Like this: the tram line opened in TK.

To say what's missing, write @tk[the year the line opened]. Both show up under Gaps at the top, and ⌘J (Ctrl+J) jumps to the next one.

## Formatting

Select some words for the bar: **bold**, *italic*, links, \`code\`, two heading sizes and quotes.

> [!pull]
> Press the quote button twice for a pull quote like this one.

An empty line shows a + for pictures, code, a break and a drop cap. You can also type Markdown as you go: # for a heading, > for a quote, - for a list, --- for a break.

---

## Finding things

⌘K (Ctrl+K) finds any note by its words, or starts a new one. Today opens a fresh note for the day.

## Books

A book holds chapters, as cards you can drag into a new order, and characters: in a chapter, type @ and a name to bring someone in. Open Books from the menu at the top left.

Press ? or the ? button at the top for every shortcut.
`;
}

const FLAG = "stubli-writer:welcomed:";

/** Whether this notebook already had its Welcome note (so deleting it doesn't bring it back). */
export function wasWelcomed(notebook: string): boolean {
  try {
    return localStorage.getItem(FLAG + notebook) === "1";
  } catch {
    return true; // If we can't tell, don't write anything.
  }
}

export function markWelcomed(notebook: string): void {
  try {
    localStorage.setItem(FLAG + notebook, "1");
  } catch {
    // Not remembered; at worst the note is offered again in an empty notebook.
  }
}
