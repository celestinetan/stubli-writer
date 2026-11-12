/**
 * Books: a note that lists its chapters, in order, as links. The chapters are ordinary notes.
 *
 *   Books/The Surrendering.md
 *   ---
 *   type: book
 *   ---
 *   # The Surrendering
 *
 *   ## Chapters
 *
 *   1. [The cruise](The%20Surrendering/The%20cruise.md)
 *   2. [Gio](The%20Surrendering/Gio.md)
 *
 * Moving a chapter rewrites only that list; everything else in the book note stays as written.
 * A chapter can be in more than one book.
 */
import { parseNote, readFields } from "../notes/note";
import { relativeFrom, resolveRelative } from "../store/store";
import type { Character } from "./characters";
import type { LibraryNote } from "./library";

export const BOOKS_FOLDER = "Books";

export interface ChapterRef {
  /** The chapter note's path, resolved from the link. */
  path: string;
  /** The link's text, used when the note is missing. */
  label: string;
}

export interface Book {
  path: string;
  title: string;
  chapters: ChapterRef[];
}

export interface ChapterCard {
  ref: ChapterRef;
  note: LibraryNote | null;
  title: string;
  synopsis: string;
  words: number;
  gaps: number;
  characters: Pick<Character, "path" | "name" | "tint">[];
}

const CHAPTER_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[([^\]]*)\]\(<?([^)>]+?\.md)>?\)\s*$/i;

export function isBookNote(note: LibraryNote): boolean {
  return readFields(parseNote(note.text)).type === "book";
}

export function readBook(note: LibraryNote): Book {
  const chapters: ChapterRef[] = [];
  for (const line of parseNote(note.text).body.split(/\r?\n/)) {
    const m = CHAPTER_LINE.exec(line);
    if (!m) continue;
    const path = resolveRelative(note.path, m[2]);
    if (path) chapters.push({ path, label: m[1] });
  }
  return { path: note.path, title: note.title, chapters };
}

export function books(notes: LibraryNote[]): Book[] {
  return notes
    .filter(isBookNote)
    .map(readBook)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Each chapter as a card: title, a line about it, length, gaps and who's in it. */
export function chapterCards(book: Book, notes: LibraryNote[], cast: Character[]): ChapterCard[] {
  const byPath = new Map(notes.map((n) => [n.path, n]));
  return book.chapters.map((ref) => {
    const note = byPath.get(ref.path) ?? null;
    if (!note) return { ref, note, title: ref.label, synopsis: "", words: 0, gaps: 0, characters: [] };
    const parsed = parseNote(note.text);
    return {
      ref,
      note,
      title: note.title,
      synopsis: readFields(parsed).synopsis || firstParagraph(parsed.body),
      // Words in the writing, not counting the title.
      words: (parsed.body.replace(/^\s*#\s.*$/m, "").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length,
      gaps: note.gaps.length,
      characters: cast.filter((c) => c.mentions.some((m) => m.note.path === note.path)).map(({ path, name, tint }) => ({ path, name, tint })),
    };
  });
}

/**
 * The book note with its chapter list replaced by these chapters, in this order. The list stays
 * where it was; a book without one gets it at the end.
 */
export function withChapters(bookText: string, bookPath: string, chapters: ChapterRef[], titleOf: (path: string) => string): string {
  const note = parseNote(bookText);
  const eol = note.eol;
  const lines = note.body.split(/\r?\n/);
  const at = lines.map((l, i) => (CHAPTER_LINE.test(l) ? i : -1)).filter((i) => i >= 0);
  const list = chapters.map((c, i) => `${i + 1}. [${escapeLabel(titleOf(c.path) || c.label)}](${linkTo(bookPath, c.path)})`);

  let out: string[];
  if (at.length > 0) {
    const first = at[0];
    out = lines.filter((_, i) => !at.includes(i));
    out.splice(first, 0, ...list);
  } else {
    // After a "Chapters" heading if there is one, else at the end.
    out = [...lines];
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    const heading = out.findIndex((l) => /^#{2,3}\s+chapters\s*$/i.test(l.trim()));
    if (heading < 0) out.push("", "## Chapters");
    const insertAt = heading < 0 ? out.length : heading + 1;
    out.splice(insertAt, 0, "", ...list);
    out.push("");
  }
  return note.bom + (note.header ?? "") + out.join(eol).replace(new RegExp(`(${eol})*$`), eol);
}

export function bookTemplate(title: string, created: string): string {
  return `---\ntype: book\ncreated: ${created}\n---\n# ${title}\n\n## Chapters\n\n`;
}

export function chapterTemplate(title: string, created: string): string {
  return `---\ncreated: ${created}\n---\n# ${title}\n\n`;
}

/** Where a new book goes, and where its new chapters go. */
export function bookPath(title: string): string | null {
  const name = safeName(title);
  return name ? `${BOOKS_FOLDER}/${name}.md` : null;
}

export function newChapterPath(book: Book, title: string, exists: (p: string) => boolean): string | null {
  const name = safeName(title);
  if (!name) return null;
  const folder = book.path.replace(/\.md$/i, "");
  let path = `${folder}/${name}.md`;
  for (let i = 2; exists(path); i++) path = `${folder}/${name} ${i}.md`;
  return path;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

function safeName(text: string): string {
  return text
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 100)
    .trim();
}

function linkTo(from: string, to: string): string {
  return relativeFrom(from, to).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function escapeLabel(text: string): string {
  return text.replace(/([[\]\\])/g, "\\$1");
}

function firstParagraph(body: string): string {
  const para: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line) || /^(```|~~~|\||<|!\[|---$)/.test(line)) {
      if (para.length) break;
      continue;
    }
    if (line === "") {
      if (para.length) break;
      continue;
    }
    para.push(line);
  }
  const text = para
    .join(" ")
    .replace(/^>\s*(\[!\w+\]\s*)?/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/@tk\[([^\]]*)\]/gi, "TK")
    .replace(/[*_`~]/g, "");
  return text.length > 180 ? `${text.slice(0, text.lastIndexOf(" ", 180))} …` : text;
}
