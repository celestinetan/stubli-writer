/**
 * Characters: a card per person in a book, kept as an ordinary note in that book's folder.
 *
 *   Books/The Surrendering/Characters/James.md
 *   ---
 *   type: character
 *   ---
 *   # James
 *
 *   Role: Lead
 *   Also called: Jim
 *
 *   The perfect employee; no family left.
 *
 *   ## Connections
 *
 *   - @Gio: partner, met on the cruise
 *
 * In the chapters, a character is named once (type @ and pick or add them); from then on every
 * "James" in the book is theirs, underlined lightly. A name that's also an ordinary word ("Will")
 * can be set to count only where it's written @Will (`underline: only-with-@` in the header).
 * A connection is written once, on either card, and shows on both. Cards aren't listed with the
 * other notes or found by search: they're reached from the book.
 */
import { parseNote, readFields } from "../notes/note";
import { fold, type LibraryNote } from "./library";

export const CHARACTERS_FOLDER = "Characters";

/** How many underline colours there are (see tokens.css). */
export const TINTS = 6;

export interface Connection {
  /** The other card's path, when there is a card by that name. */
  path: string | null;
  name: string;
  /** What they are to this character, as written on this card ("mother"). May be empty. */
  label: string;
  /** What this character is to them, as written on their card ("daughter"). May be empty. */
  theirLabel: string;
  /** Written only on the other card, not this one. */
  fromOther: boolean;
}

export interface Mention {
  note: LibraryNote;
  count: number;
  /** A little text around the first mention. */
  context: string;
}

export interface Character {
  path: string;
  name: string;
  aliases: string[];
  role: string;
  summary: string;
  connections: Connection[];
  mentions: Mention[];
  tint: number;
  /** Counted only where written @Name (for names that are also ordinary words). */
  atOnly: boolean;
}

/** The parts of a book characters need (books.ts has the rest). */
export interface BookRef {
  path: string;
  chapters: { path: string }[];
}

export function isCharacterNote(note: LibraryNote): boolean {
  return isCharacterPath(note.path) || readFields(parseNote(note.text)).type === "character";
}

export function isCharacterPath(path: string): boolean {
  return new RegExp(`(^|/)${CHARACTERS_FOLDER}/[^/]+$`).test(path);
}

/** Where a book keeps its characters: "Books/The Surrendering/Characters". */
export function castFolder(book: BookRef): string {
  return `${book.path.replace(/\.md$/i, "")}/${CHARACTERS_FOLDER}`;
}

/** Cards that aren't in any book's folder (made before characters belonged to books). */
export function cardsOutsideBooks(notes: LibraryNote[], books: BookRef[]): LibraryNote[] {
  const folders = books.map((b) => `${castFolder(b)}/`);
  return notes.filter((n) => isCharacterNote(n) && !folders.some((f) => n.path.startsWith(f)));
}

/** Reads one card. Connections are as written; `characters()` resolves them. */
export function readCard(note: LibraryNote): Omit<Character, "connections" | "mentions" | "tint"> & { written: { name: string; label: string; target: string | null }[] } {
  const parsed = parseNote(note.text);
  const header = parsed.header ?? "";
  const aliases: string[] = [...headerList(header, "aliases")];
  let role = headerValue(header, "role");
  let summary = "";
  const written: { name: string; label: string; target: string | null }[] = [];

  let section: "top" | "connections" | "other" = "top";
  let seenTitle = false;
  const paragraph: string[] = [];
  const endParagraph = () => {
    if (!summary && paragraph.length) summary = plain(paragraph.join(" "));
    paragraph.length = 0;
  };

  for (const raw of parsed.body.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      endParagraph();
      if (heading[1].length === 1 && !seenTitle) {
        seenTitle = true;
        continue;
      }
      section = /^connections?$|^relationships?$|^people$/i.test(plain(heading[2])) ? "connections" : "other";
      continue;
    }
    if (section === "connections") {
      const item = /^[-*+]\s+(.*)$/.exec(line);
      if (item) {
        const c = parseConnection(item[1]);
        if (c) written.push(c);
      }
      continue;
    }
    if (section !== "top") continue;
    const field = /^(role|also called|aliases|nicknames?)\s*:\s*(.*)$/i.exec(line);
    if (field) {
      endParagraph();
      const value = plain(field[2]);
      if (/^role$/i.test(field[1])) role = role || value;
      else aliases.push(...value.split(/\s*,\s*/));
      continue;
    }
    if (line === "") endParagraph();
    else if (!/^([-*+]|\d+[.)]|>|```|~~~|\||<|!\[)/.test(line)) paragraph.push(line);
  }
  endParagraph();

  return {
    path: note.path,
    atOnly: /only|@/i.test(headerValue(header, "underline")),
    name: note.title,
    aliases: [...new Set(aliases.map((a) => a.trim()).filter((a) => a && a !== note.title))],
    role,
    summary,
    written,
  };
}

/** "Gio: partner", "[Gio](Gio.md): partner", "Gio — partner", or just "Gio". */
export function parseConnection(text: string): { name: string; label: string; target: string | null } | null {
  let t = text.trim().replace(/^@/, "");
  let target: string | null = null;
  let name: string;
  const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(t);
  if (link) {
    name = plain(link[1]);
    target = decodeURI(link[2]);
    t = t.slice(link[0].length);
  } else {
    const m = /^(.+?)(?=\s*(?::|\s[—–-]\s|$))/.exec(t);
    if (!m) return null;
    name = plain(m[1]);
    t = t.slice(m[0].length);
  }
  const label = plain(t.replace(/^\s*(?::|[—–-])\s*/, ""));
  return name ? { name, label, target } : null;
}

/** A book's cards, with connections both ways and the chapters each one is in. */
export function characters(notes: LibraryNote[], book: BookRef | null): Character[] {
  if (!book) return [];
  const folder = `${castFolder(book)}/`;
  const cards = notes
    .filter((n) => n.path.startsWith(folder) && !n.path.slice(folder.length).includes("/"))
    .map(readCard)
    .sort((a, b) => a.name.localeCompare(b.name));

  const byKey = new Map<string, (typeof cards)[number]>();
  for (const c of cards) {
    for (const n of [c.name, ...c.aliases]) if (!byKey.has(fold(n))) byKey.set(fold(n), c);
    byKey.set(`path:${c.path}`, c);
    byKey.set(`file:${fold(c.path.split("/").pop()!.replace(/\.md$/i, ""))}`, c);
  }
  const find = (name: string, target: string | null) => {
    if (target) {
      const file = target.split("/").pop()!.replace(/\.md$/i, "");
      const hit = byKey.get(`file:${fold(file)}`);
      if (hit) return hit;
    }
    return byKey.get(fold(name)) ?? null;
  };

  const out: Character[] = cards.map((c, i) => ({
    path: c.path,
    name: c.name,
    aliases: c.aliases,
    role: c.role,
    summary: c.summary,
    connections: [],
    mentions: [],
    tint: (i % TINTS) + 1,
    atOnly: c.atOnly,
  }));
  const byPath = new Map(out.map((c) => [c.path, c]));

  // As written on each card.
  cards.forEach((c, i) => {
    for (const w of c.written) {
      const other = find(w.name, w.target);
      if (other?.path === c.path) continue;
      out[i].connections.push({ path: other?.path ?? null, name: other?.name ?? w.name, label: w.label, theirLabel: "", fromOther: false });
    }
  });
  // Each side of a connection: what the other card says about this one is shown here too, and a
  // connection written on one card only still shows on the other.
  for (const c of out) {
    for (const conn of c.connections) {
      if (conn.fromOther || !conn.path) continue;
      const other = byPath.get(conn.path)!;
      const back = other.connections.find((x) => x.path === c.path);
      if (back && !back.fromOther) back.theirLabel = conn.label;
      else if (!back) other.connections.push({ path: c.path, name: c.name, label: "", theirLabel: conn.label, fromOther: true });
    }
  }

  // Mentions: @Name in the book's chapters, in the book's order.
  const byNote = new Map(notes.map((n) => [n.path, n]));
  const stories = book.chapters.map((c) => byNote.get(c.path)).filter((n): n is LibraryNote => !!n);
  for (const c of out) {
    const pattern = mentionPattern([c.name, ...c.aliases], c.atOnly);
    if (!pattern) continue;
    for (const note of stories) {
      const body = parseNote(note.text).body;
      const hits = [...body.matchAll(pattern)];
      if (hits.length === 0) continue;
      // The context comes from the writing, not the title, when there's a choice.
      const inText = hits.find((h) => !/^#\s/.test(body.slice(body.lastIndexOf("\n", h.index - 1) + 1))) ?? hits[0];
      c.mentions.push({ note, count: hits.length, context: contextAround(body, inText.index, inText[0].length) });
    }
  }
  return out;
}

/**
 * Any of these names, as a whole word, with or without an @ in front (or only with it, when
 * `atOnly`). Capitals as written, so "james" is not James; longer names first, so "Ana Sousa"
 * wins over "Ana". Never inside an email address, and never @tk[…].
 */
export function mentionPattern(names: string[], atOnly = false): RegExp | null {
  const list = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 1 && !/^tk$/i.test(n)))].sort((a, b) => b.length - a.length);
  if (list.length === 0) return null;
  const escaped = list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  return new RegExp(`(?<![\\p{L}\\p{N}_@.])@${atOnly ? "" : "?"}(?:${escaped.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
}

/** A new card's text. */
export function characterTemplate(name: string, created: string): string {
  return `---\ntype: character\ncreated: ${created}\n---\n# ${name}\n\n`;
}

/** Where a new card goes in a book, or null if the name can't be a file name. */
export function characterPath(book: BookRef, name: string): string | null {
  const clean = name
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  return clean ? `${castFolder(book)}/${clean}.md` : null;
}

// --- helpers -----------------------------------------------------------------------------------

function headerValue(header: string, key: string): string {
  const m = new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, "mi").exec(header);
  return m ? plain(m[1].replace(/^["']|["']$/g, "")) : "";
}

function headerList(header: string, key: string): string[] {
  const lines = header.split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^${key}:`, "i").test(l));
  if (at < 0) return [];
  const inline = lines[at].replace(new RegExp(`^${key}:\\s*`, "i"), "").trim();
  if (inline) return inline.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const out: string[] = [];
  for (let i = at + 1; i < lines.length && /^\s+-\s+/.test(lines[i]); i++) out.push(lines[i].replace(/^\s+-\s+/, "").trim().replace(/^["']|["']$/g, ""));
  return out;
}

/** Markdown marks out: links become their text, no emphasis or code marks. */
function plain(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/@tk\[([^\]]*)\]/gi, "TK")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function contextAround(body: string, at: number, length: number): string {
  const lineStart = body.lastIndexOf("\n", at - 1) + 1;
  const lineEnd = body.indexOf("\n", at + length);
  const line = body.slice(lineStart, lineEnd < 0 ? body.length : lineEnd);
  const cleaned = plain(line.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)*/, "").replace(/\|/g, " "));
  if (cleaned.length <= 140) return cleaned;
  const i = Math.max(0, cleaned.indexOf(body.slice(at, at + length)) - 50);
  const piece = cleaned.slice(i, i + 140);
  return (i > 0 ? "… " : "") + piece.slice(i > 0 ? piece.indexOf(" ") + 1 : 0, piece.lastIndexOf(" ")) + " …";
}

// --- Changing a card from the board ------------------------------------------------------------

export interface CardFields {
  name: string;
  /** Counted only where written @Name. */
  atOnly?: boolean;
  role: string;
  aliases: string[];
  summary: string;
  connections: { name: string; label: string }[];
}

/**
 * The card note with these fields written in, as plain Markdown. The header, any other sections
 * and any further paragraphs under the summary stay exactly as they were.
 */
export function writeCard(original: string, f: CardFields): string {
  const note = parseNote(original);
  const eol = note.eol;
  const lines = note.body.split(/\r?\n/);
  const isHeading = (l: string) => /^#{1,6}\s/.test(l.trim());
  const isConnections = (l: string) => /^#{2,6}\s+(connections?|relationships?|people)\s*$/i.test(l.trim());

  const titleAt = lines.findIndex((l) => /^#\s/.test(l.trim()));
  const afterTitle = titleAt >= 0 ? titleAt + 1 : 0;
  let topEnd = lines.findIndex((l, i) => i >= afterTitle && isHeading(l));
  if (topEnd < 0) topEnd = lines.length;

  // Paragraphs under the title (not Role or Also called). The first is the summary, written
  // afresh; any others are kept as they are.
  const paragraphs: string[][] = [];
  let current: string[] | null = null;
  for (const raw of lines.slice(afterTitle, topEnd)) {
    const l = raw.trim();
    if (l === "" || /^(role|also called|aliases|nicknames?)\s*:/i.test(l)) {
      current = null;
      continue;
    }
    if (!current) paragraphs.push((current = []));
    current.push(raw);
  }
  const extraTop = paragraphs.slice(1).flatMap((p, n) => (n === 0 ? p : ["", ...p]));

  // Other sections, kept in order; the Connections section is written afresh.
  const rest: string[] = [];
  let i = topEnd;
  while (i < lines.length) {
    const start = i;
    i++;
    while (i < lines.length && !isHeading(lines[i])) i++;
    if (!isConnections(lines[start])) rest.push(...lines.slice(start, i));
  }
  while (rest.length && rest[rest.length - 1].trim() === "") rest.pop();

  const out: string[] = [`# ${f.name}`, ""];
  if (f.role.trim()) out.push(`Role: ${f.role.trim()}`, "");
  const aliases = f.aliases.map((a) => a.trim()).filter(Boolean);
  if (aliases.length) out.push(`Also called: ${aliases.join(", ")}`, "");
  if (f.summary.trim()) out.push(f.summary.trim().replace(/\s*\n\s*/g, " "), "");
  if (extraTop.length) out.push(...extraTop, "");
  out.push("## Connections", "");
  for (const c of f.connections) out.push(`- @${c.name}${c.label.trim() ? `: ${c.label.trim()}` : ""}`);
  if (f.connections.length) out.push("");
  if (rest.length) out.push(...rest, "");
  const header = f.atOnly === undefined ? note.header : withHeaderLine(note.header, eol, "underline", f.atOnly ? "only-with-@" : null);
  return note.bom + (header ?? "") + out.join(eol);
}

/** The header with one line set (or removed); every other line stays as written. */
export function withHeaderLine(header: string | null, eol: string, key: string, value: string | null): string | null {
  const line = value === null ? null : `${key}: ${value}`;
  if (!header) return line ? `---${eol}${line}${eol}---${eol}` : null;
  const lines = header.split(/\r?\n/);
  const at = lines.findIndex((l, i) => i > 0 && new RegExp(`^${key}:`).test(l));
  if (at >= 0) {
    if (line) lines[at] = line;
    else lines.splice(at, 1);
  } else if (line) {
    const close = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    lines.splice(close, 0, line);
  }
  return lines.join(eol);
}

/** What's written on one card (its own connections, not the ones shown from other cards). */
export function cardFields(note: LibraryNote): CardFields {
  const c = readCard(note);
  return { name: c.name, atOnly: c.atOnly, role: c.role, aliases: c.aliases, summary: c.summary, connections: c.written.map(({ name, label }) => ({ name, label })) };
}
