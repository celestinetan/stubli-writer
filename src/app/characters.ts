/**
 * Characters: a card per person in your story, kept as an ordinary note.
 *
 *   Characters/James.md
 *   ---
 *   type: character
 *   ---
 *   # James
 *
 *   Role: Lead
 *   Also called: Jim, Jimmy
 *
 *   The perfect employee; no family left.
 *
 *   ## Connections
 *
 *   - Gio: partner, met on the cruise
 *
 * A note is a card when it's in the Characters folder or says `type: character`. A connection is
 * written once, on either card, and shows on both. Mentions are found by name (and the names in
 * "Also called"), as whole words, with capitals as written.
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
  /** In a word or two: "partner", "his mother". May be empty. */
  label: string;
  /** Written on the other card, not this one. */
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
}

export function isCharacterNote(note: LibraryNote): boolean {
  return note.path.startsWith(`${CHARACTERS_FOLDER}/`) || readFields(parseNote(note.text)).type === "character";
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
    name: note.title,
    aliases: [...new Set(aliases.map((a) => a.trim()).filter((a) => a && a !== note.title))],
    role,
    summary,
    written,
  };
}

/** "Gio: partner", "[Gio](Gio.md): partner", "Gio — partner", or just "Gio". */
export function parseConnection(text: string): { name: string; label: string; target: string | null } | null {
  let t = text.trim();
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

/** Every card, with connections both ways and where each one is mentioned. */
export function characters(notes: LibraryNote[]): Character[] {
  const cards = notes
    .filter(isCharacterNote)
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
  }));
  const byPath = new Map(out.map((c) => [c.path, c]));

  // As written on each card.
  cards.forEach((c, i) => {
    for (const w of c.written) {
      const other = find(w.name, w.target);
      if (other?.path === c.path) continue;
      out[i].connections.push({ path: other?.path ?? null, name: other?.name ?? w.name, label: w.label, fromOther: false });
    }
  });
  // And the other way round, unless that card already says something about this one.
  for (const c of out) {
    for (const conn of c.connections) {
      if (conn.fromOther || !conn.path) continue;
      const other = byPath.get(conn.path)!;
      if (other.connections.some((x) => x.path === c.path)) continue;
      other.connections.push({ path: c.path, name: c.name, label: conn.label, fromOther: true });
    }
  }

  // Mentions, in every note that isn't a card.
  const stories = notes.filter((n) => !isCharacterNote(n));
  for (const c of out) {
    const pattern = namePattern([c.name, ...c.aliases]);
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

/** Whole words, capitals as written; longer names first so "Ana Sousa" wins over "Ana". */
export function namePattern(names: string[]): RegExp | null {
  const list = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  if (list.length === 0) return null;
  const escaped = list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
}

/** A new card's text. */
export function characterTemplate(name: string, created: string): string {
  return `---\ntype: character\ncreated: ${created}\n---\n# ${name}\n\nRole: \n\nAlso called: \n\n## Connections\n\n`;
}

/** Where a new card goes: Characters/Name.md, or null if the name can't be a file name. */
export function characterPath(name: string): string | null {
  const clean = name
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  return clean ? `${CHARACTERS_FOLDER}/${clean}.md` : null;
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
