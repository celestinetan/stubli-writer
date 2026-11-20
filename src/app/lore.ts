/**
 * Lore: what must stay true in a book's world. A card per place, rule, object, group or piece of
 * history, kept as an ordinary note in the book's folder:
 *
 *   Books/The Surrendering/Lore/The Meridian.md
 *   ---
 *   type: lore
 *   ---
 *   # The Meridian
 *
 *   Kind: Place
 *   Also called: the ship
 *
 *   A cruise liner on its last season. Nobody boards after Lisbon.
 *
 * Books set in the same world (`world: Aster` in each book's header) also share the cards in
 * "Worlds/Aster/Lore" (and the characters in "Worlds/Aster/Characters"). Once a card exists, its
 * name is underlined in the chapters and opens the card, so what's true is one click away while
 * writing. Like characters, lore isn't listed with the other notes or found by search.
 */
import { parseNote, readFields } from "../notes/note";
import { CHARACTERS_FOLDER, isCharacterNote, isInWorld, mentionsOf, readCard, worldFolder, WORLDS_FOLDER, type BookRef, type Fact, type Mention } from "./characters";
import type { LibraryNote } from "./library";

export const LORE_FOLDER = "Lore";

/** Suggested kinds; any words can be written instead. */
export const LORE_KINDS = ["Place", "Rule", "Object", "Group", "History", "Other"] as const;

export interface LoreEntry {
  path: string;
  name: string;
  aliases: string[];
  kind: string;
  /** What's true about it. */
  summary: string;
  facts: Fact[];
  mentions: Mention[];
  /** Kept in the book's world, so every book in that world has it. */
  shared: boolean;
}

export function isLorePath(path: string): boolean {
  return new RegExp(`(^|/)${LORE_FOLDER}/[^/]+$`).test(path);
}

export function isLoreNote(note: LibraryNote): boolean {
  return isLorePath(note.path) || readFields(parseNote(note.text)).type === "lore";
}

/** Cards (characters and lore): reached from the book, not listed with the writing. */
export function isCardNote(note: LibraryNote): boolean {
  return isCharacterNote(note) || isLoreNote(note) || isStoryBible(note.path);
}

/** The file a book can keep for an AI assistant to read: "Books/The Surrendering/Story bible.md". */
export const STORY_BIBLE = "Story bible.md";

export function storyBiblePath(book: BookRef): string {
  return `${book.path.replace(/\.md$/i, "")}/${STORY_BIBLE}`;
}

export function isStoryBible(path: string): boolean {
  return new RegExp(`^Books/[^/]+/${STORY_BIBLE.replace(".", "\\.")}$`).test(path);
}

export function loreFolder(book: BookRef): string {
  return `${book.path.replace(/\.md$/i, "")}/${LORE_FOLDER}`;
}

/** A book's lore (its own and its world's), by name, with the chapters each one is in. */
export function lore(notes: LibraryNote[], book: BookRef | null): LoreEntry[] {
  if (!book) return [];
  const folders = [`${loreFolder(book)}/`, ...(book.world ? [`${worldFolder(book.world)}/${LORE_FOLDER}/`] : [])];
  const byNote = new Map(notes.map((n) => [n.path, n]));
  const stories = book.chapters.map((c) => byNote.get(c.path)).filter((n): n is LibraryNote => !!n);
  return notes
    .filter((n) => folders.some((folder) => n.path.startsWith(folder) && !n.path.slice(folder.length).includes("/")))
    .map(readCard)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      path: c.path,
      name: c.name,
      aliases: c.aliases,
      kind: c.role,
      summary: c.summary,
      facts: c.facts,
      mentions: mentionsOf(loreNames(c), c.atOnly, stories),
      shared: isInWorld(c.path),
    }));
}

/**
 * How a card's name may be written in the chapters: as it is, and, for a name that starts with
 * "The" (or "A", "An"), with that word in small letters too: "The Meridian" is also "the Meridian".
 */
export function loreNames(x: { name: string; aliases: string[] }): string[] {
  const out = new Set<string>();
  for (const n of [x.name, ...x.aliases]) {
    out.add(n);
    const m = /^(The|An?)(\s.+)$/.exec(n);
    if (m) out.add(m[1].toLowerCase() + m[2]);
  }
  return [...out];
}

export function loreTemplate(name: string, kind: string, created: string): string {
  return `---\ntype: lore\ncreated: ${created}\n---\n# ${name}\n\n${kind ? `Kind: ${kind}\n\n` : ""}`;
}

function clean(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
}

/** Where a new lore card goes in a book, or null if the name can't be a file name. */
export function lorePath(book: BookRef, name: string): string | null {
  return clean(name) ? `${loreFolder(book)}/${clean(name)}.md` : null;
}

/**
 * Where a card (lore or character) goes when it's shared with the book's world, or brought back
 * into this book only. Null when the book has no world, or the card is already there.
 */
export function sharedPath(book: BookRef, path: string, share: boolean): string | null {
  const file = path.split("/").pop()!;
  const kind = isLorePath(path) ? LORE_FOLDER : CHARACTERS_FOLDER;
  if (share && !book.world) return null;
  const to = share ? `${worldFolder(book.world!)}/${kind}/${file}` : `${book.path.replace(/\.md$/i, "")}/${kind}/${file}`;
  return to === path ? null : to;
}

/** Every world named by a book, or with a folder of its own. */
export function worlds(notes: LibraryNote[], books: BookRef[]): string[] {
  const out = new Set(books.map((b) => b.world ?? "").filter(Boolean));
  for (const n of notes) {
    const m = new RegExp(`^${WORLDS_FOLDER}/([^/]+)/`).exec(n.path);
    if (m && ![...out].some((w) => worldFolder(w) === `${WORLDS_FOLDER}/${m[1]}`)) out.add(m[1]);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}
