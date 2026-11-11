/**
 * A note on disk: Markdown with an optional small header ("front matter") between `---` lines.
 *
 *   ---
 *   created: 2026-11-11
 *   tags: [travel]
 *   ---
 *   # Lisbon trip
 *
 * The one promise this file keeps: reading a note and saving it again, without edits, gives back
 * exactly the same text, byte for byte. The header is kept as the original text; only fields we
 * change are rewritten, line by line, so anything another app put there survives.
 */

export interface NoteFields {
  created?: string;
  tags?: string[];
  /** Reserved for book mode (v2): "chapter", "character" or "book". */
  type?: string;
  /** Reserved for book mode (v2): the one-line synopsis on a chapter card. */
  synopsis?: string;
}

export interface Note {
  /** A byte-order mark at the very start, kept if the file had one. */
  bom: string;
  /** The header exactly as written, including both `---` lines and their line endings; null if none. */
  header: string | null;
  /** Everything after the header. */
  body: string;
  /** The line ending this file uses, so new header lines match it. */
  eol: "\n" | "\r\n";
}

const BOM = "﻿";

export function parseNote(text: string): Note {
  const bom = text.startsWith(BOM) ? BOM : "";
  const rest = bom ? text.slice(1) : text;
  const eol: Note["eol"] = /\r\n/.test(rest.slice(0, rest.indexOf("\n") + 1)) ? "\r\n" : "\n";

  const open = /^---[ \t]*\r?\n/.exec(rest);
  if (!open) return { bom, header: null, body: rest, eol };

  // Find the closing `---` (or YAML's `...`) on a line of its own.
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
  closing.lastIndex = open[0].length;
  const close = closing.exec(rest);
  if (!close) return { bom, header: null, body: rest, eol };

  const end = close.index + close[0].length;
  return { bom, header: rest.slice(0, end), body: rest.slice(end), eol };
}

export function serializeNote(note: Note): string {
  return note.bom + (note.header ?? "") + note.body;
}

/** The fields we understand, read from the header. Anything else in the header is left alone. */
export function readFields(note: Note): NoteFields {
  const fields: NoteFields = {};
  if (!note.header) return fields;
  const lines = headerLines(note.header);

  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][\w-]*):[ \t]*(.*?)[ \t]*$/.exec(lines[i]);
    if (!m) continue;
    const [, key, raw] = m;
    if (key === "tags") {
      if (raw === "") {
        const items: string[] = [];
        while (i + 1 < lines.length && /^[ \t]+-[ \t]+/.test(lines[i + 1])) {
          items.push(unquote(lines[++i].replace(/^[ \t]+-[ \t]+/, "").trim()));
        }
        fields.tags = items;
      } else {
        fields.tags = parseInlineList(raw);
      }
    } else if (key === "created" || key === "type" || key === "synopsis") {
      fields[key] = unquote(raw);
    }
  }
  return fields;
}

/**
 * Changes some header fields and returns a new note. Untouched lines stay exactly as they were.
 * Passing `undefined` for a field removes it. A note without a header gets a new one.
 */
export function writeFields(note: Note, updates: NoteFields): Note {
  const keys = Object.keys(updates) as (keyof NoteFields)[];
  if (keys.length === 0) return note;

  const { eol } = note;
  let open = "---" + eol;
  let close = "---" + eol;
  let lines: string[] = [];

  if (note.header) {
    const all = note.header.split(/\r?\n/);
    // Last element after the final line ending is "" (or the closing line if the file ends there).
    open = all[0] + eol;
    const closeIndex = findCloseIndex(all);
    close = all[closeIndex] + (note.header.endsWith("\n") ? eol : "");
    lines = all.slice(1, closeIndex);
  }

  for (const key of keys) {
    const value = updates[key];
    const at = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
    let span = 0;
    if (at >= 0) {
      span = 1;
      while (at + span < lines.length && /^[ \t]+-[ \t]+/.test(lines[at + span])) span++;
    }
    const replacement = value === undefined ? [] : [formatField(key, value)];
    if (at >= 0) lines.splice(at, span, ...replacement);
    else lines.push(...replacement);
  }

  if (lines.length === 0 && !note.header) return note;
  const header = open + lines.map((l) => l + eol).join("") + close;
  return { ...note, header };
}

// --- helpers -----------------------------------------------------------------------------------

function headerLines(header: string): string[] {
  const all = header.split(/\r?\n/);
  return all.slice(1, findCloseIndex(all));
}

function findCloseIndex(all: string[]): number {
  for (let i = all.length - 1; i > 0; i--) {
    if (/^(?:---|\.\.\.)[ \t]*$/.test(all[i])) return i;
  }
  return all.length - 1;
}

function parseInlineList(raw: string): string[] {
  const inner = /^\[(.*)\]$/.exec(raw);
  if (!inner) return raw ? [unquote(raw)] : [];
  const out: string[] = [];
  const re = /\s*("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,]+?)\s*(?:,|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner[1])) && m[0] !== "") {
    const item = unquote(m[1].trim());
    if (item !== "") out.push(item);
  }
  return out;
}

function unquote(raw: string): string {
  if (/^".*"$/.test(raw)) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (/^'.*'$/.test(raw)) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}

function formatField(key: string, value: string | string[]): string {
  if (Array.isArray(value)) return `${key}: [${value.map(formatScalar).join(", ")}]`;
  return `${key}: ${formatScalar(value)}`;
}

/** Plain when that's unambiguous YAML, otherwise double-quoted (which is also valid YAML). */
function formatScalar(value: string): string {
  const plain =
    /^[\p{L}\p{N}][\p{L}\p{N} _.()/+'’-]*$/u.test(value) &&
    !/^(true|false|yes|no|on|off|null|~)$/i.test(value) &&
    !/\s$/.test(value);
  return plain || /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : JSON.stringify(value);
}
