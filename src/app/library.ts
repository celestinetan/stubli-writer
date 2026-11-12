/**
 * Everything the app knows about the notes: their titles, their open gaps, and word search.
 * Loaded once from storage, then kept current as notes are saved.
 */
import { findGaps, type Gap } from "../notes/gaps";
import { parseNote, readFields } from "../notes/note";
import { noteName, type NoteStore } from "../store/store";

export interface LibraryNote {
  path: string;
  title: string;
  text: string;
  modified: number;
  gaps: Gap[];
  /** Lower-case text without accents, for search. */
  folded: string;
  isDaily: boolean;
}

export interface SearchHit {
  note: LibraryNote;
  snippet: string;
}

export const DAILY_FOLDER = "Daily";

export function describeNote(path: string, text: string, modified: number): LibraryNote {
  const note = parseNote(text);
  return {
    path,
    title: titleOf(note.body) || noteName(path),
    text,
    modified,
    gaps: findGaps(note.body),
    folded: fold(note.body),
    isDaily: path.startsWith(`${DAILY_FOLDER}/`),
  };
}

/** The first heading, or else the first line of text, without Markdown marks. */
export function titleOf(body: string): string {
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const heading = lines.find((l) => /^#{1,3}\s+\S/.test(l));
  const first = heading ?? lines.find((l) => l !== "" && !/^(---|\*\*\*|```|~~~|\||<)/.test(l)) ?? "";
  return first
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+|^\d+[.)]\s+/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/@tk\[([^\]]*)\]/gi, "TK")
    .replace(/[*_`~]/g, "")
    .trim()
    .slice(0, 120);
}

export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

export async function loadLibrary(store: NoteStore): Promise<LibraryNote[]> {
  const refs = await store.list();
  const notes = await Promise.all(
    refs.map(async (r) => {
      try {
        return describeNote(r.path, await store.read(r.path), r.modified);
      } catch {
        return null; // A file that can't be read is skipped, not fatal.
      }
    }),
  );
  return sortNotes(notes.filter((n): n is LibraryNote => n !== null));
}

export function sortNotes(notes: LibraryNote[]): LibraryNote[] {
  return [...notes].sort((a, b) => b.modified - a.modified || a.title.localeCompare(b.title));
}

/** Notes containing every word of the query (accents and case ignored), best first. */
export function search(notes: LibraryNote[], query: string, limit = 20): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: { note: LibraryNote; score: number; at: number }[] = [];
  for (const note of notes) {
    if (!words.every((w) => note.folded.includes(w))) continue;
    const title = fold(note.title);
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 10;
      score += Math.min(count(note.folded, w), 5);
    }
    hits.push({ note, score, at: note.folded.indexOf(words[0]) });
  }
  return hits
    .sort((a, b) => b.score - a.score || b.note.modified - a.note.modified)
    .slice(0, limit)
    .map(({ note, at }) => ({ note, snippet: snippetAt(parseNote(note.text).body, note.folded, at) }));
}

function count(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** A short piece of text around a match. Folding keeps lengths for most text, so positions line up. */
function snippetAt(body: string, folded: string, at: number): string {
  const source = folded.length === body.length ? body : folded;
  const start = Math.max(0, at - 40);
  const end = Math.min(source.length, at + 80);
  const piece = source.slice(start, end).replace(/\s+/g, " ").replace(/[#*_`>]/g, "").trim();
  return (start > 0 ? "… " : "") + piece + (end < source.length ? " …" : "");
}

/** Every open gap across all notes, newest notes first, with a little context from its line. */
export function allGaps(notes: LibraryNote[]): { note: LibraryNote; gap: Gap; index: number; context: string }[] {
  const out: { note: LibraryNote; gap: Gap; index: number; context: string }[] = [];
  for (const note of notes) {
    const body = parseNote(note.text).body;
    note.gaps.forEach((gap, index) => {
      const lineStart = body.lastIndexOf("\n", gap.start - 1) + 1;
      const lineEnd = body.indexOf("\n", gap.end);
      const before = cleanLine(body.slice(lineStart, gap.start), true);
      const after = cleanLine(body.slice(gap.end, lineEnd < 0 ? body.length : lineEnd), false);
      out.push({ note, gap, index, context: `${trimWords(before, 70, "start")}▢${trimWords(after, 50, "end")}` });
    });
  }
  return out;
}

/** A line of Markdown as plain words: no heading, quote, list or table marks, no other gaps' syntax. */
function cleanLine(text: string, isStart: boolean): string {
  let t = text;
  if (isStart) t = t.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)*/, "");
  return t
    .replace(/\|/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/@tk\[([^\]]*)\]/gi, "TK")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ");
}

/** Shortens text to about `max` characters at a word boundary, keeping the end nearest the gap. */
function trimWords(text: string, max: number, keep: "start" | "end"): string {
  if (text.length <= max) return keep === "start" ? text.trimStart() : text.trimEnd();
  if (keep === "start") {
    const cut = text.slice(text.length - max);
    return "… " + cut.slice(cut.indexOf(" ") + 1);
  }
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + " …";
}

// --- Daily notes and new notes ---------------------------------------------------------------

export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dailyPath(d: Date): string {
  return `${DAILY_FOLDER}/${isoDate(d)}.md`;
}

export function dailyTemplate(d: Date, locale?: string): string {
  const title = d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  return `---\ncreated: ${isoDate(d)}\n---\n# ${title}\n\n`;
}

/** A new note's file name: the date and time, so it never needs renaming. The title lives inside. */
export function newNotePath(d: Date, exists: (p: string) => boolean, folder = ""): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${folder ? `${folder}/` : ""}${isoDate(d)} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  let path = `${base}.md`;
  for (let i = 2; exists(path); i++) path = `${base} (${i}).md`;
  return path;
}

export function newNoteTemplate(d: Date): string {
  return `---\ncreated: ${isoDate(d)}\n---\n`;
}

/** The fields of a note's header, for display. */
export function fieldsOf(note: LibraryNote) {
  return readFields(parseNote(note.text));
}
