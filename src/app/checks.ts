/**
 * Checks: quiet reminders of what may not agree with a book's cards. Nothing here understands the
 * story; it looks for three plain things, in the chapters, in order:
 *
 *   1. A name spelled nearly, but not exactly, like one on a card ("Catherine", card "Katherine").
 *   2. A fixed fact on a card said differently nearby ("Eyes: green", then "her blue eyes").
 *   3. A name used several times that has no card yet.
 *
 * Each is a question, not a verdict, and can be set aside for good ("Not a problem"), which is
 * kept as one line in the book's header. For contradictions in meaning there's a ready-made
 * question to paste into any AI assistant (see `consistencyPrompt`).
 */
import { parseNote, readFields, serializeNote, writeFields } from "../notes/note";
import type { Book } from "./books";
import { readOutline, readPremise } from "./books";
import { mentionPattern, type Character, type Fact } from "./characters";
import type { LibraryNote } from "./library";
import { loreNames, type LoreEntry } from "./lore";

export interface Finding {
  /** What it is, for setting it aside: stays the same while the text does. */
  key: string;
  kind: "spelling" | "fact" | "no-card";
  /** The chapter it's in (the first, when it's in several). */
  path: string;
  chapter: string;
  /** One plain sentence. */
  message: string;
  /** A little of the text around it. */
  context: string;
  /** For "no-card": the name, to make a card from. */
  name?: string;
}

interface Card {
  name: string;
  names: string[];
  facts: Fact[];
  atOnly: boolean;
}

const WORD = /[\p{L}][\p{L}\p{M}'’-]*/gu;

/** Capitalised words that are never worth a card. */
const ORDINARY = new Set(
  "I I'm I've I'd I'll Mr Mrs Ms Miss Dr Sir Lady Lord God Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Christmas Easter TK OK"
    .split(" ")
    .map((w) => w.toLowerCase()),
);

const COLOURS = "black blue brown green grey gray hazel amber red auburn blond blonde white silver gold golden pink purple violet orange yellow dark fair ginger chestnut".split(" ");

/** The writing in a chapter, a paragraph at a time, without its title, code or marks. */
function paragraphs(text: string): string[] {
  const body = parseNote(text)
    .body.replace(/^(```|~~~)[\s\S]*?^\1\s*$/gm, "")
    .replace(/^\s*#\s.*$/m, "");
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((p) =>
      p
        .replace(/^\s*(#{1,6}\s+|>\s*(\[!\w+\]\s*)?|[-*+]\s+|\d+[.)]\s+)/gm, "")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/@tk\[[^\]]*\]/gi, " ")
        .replace(/[*_`~|]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function around(paragraph: string, at: number, length: number): string {
  const from = Math.max(0, at - 60);
  const to = Math.min(paragraph.length, at + length + 60);
  const piece = paragraph.slice(from, to);
  return `${from > 0 ? "… " + piece.slice(piece.indexOf(" ") + 1) : piece}${to < paragraph.length ? " …" : ""}`;
}

/** How many letters must change, be added, removed or swapped to turn one word into the other. */
export function distance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The keys set aside in this book ("Not a problem"). */
export function ignoredChecks(bookText: string): string[] {
  return readFields(parseNote(bookText))["checks-ignore"] ?? [];
}

export function withIgnoredCheck(bookText: string, key: string): string {
  const note = parseNote(bookText);
  const now = readFields(note)["checks-ignore"] ?? [];
  return now.includes(key) ? bookText : serializeNote(writeFields(note, { "checks-ignore": [...now, key] }));
}

/** Everything worth a second look in a book, in chapter order. */
export function runChecks(book: Book, notes: LibraryNote[], cast: Character[], lore: LoreEntry[], ignored: string[] = []): Finding[] {
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const chapters = book.chapters.map((c) => byPath.get(c.path)).filter((n): n is LibraryNote => !!n);
  const cards: Card[] = [
    ...cast.map((c) => ({ name: c.name, names: [c.name, ...c.aliases], facts: c.facts, atOnly: c.atOnly })),
    ...lore.map((x) => ({ name: x.name, names: loreNames(x), facts: x.facts, atOnly: false })),
  ];
  const skip = new Set(ignored);
  const out = new Map<string, Finding>();
  const add = (f: Finding) => !skip.has(f.key) && !out.has(f.key) && out.set(f.key, f);

  // Every word on a card, as written; and every word the book writes in small letters.
  const known = new Set<string>();
  for (const c of cards) for (const n of c.names) for (const w of n.match(WORD) ?? []) known.add(w);
  const knownFolded = new Set([...known].map((w) => w.toLowerCase()));
  const pages = chapters.map((n) => ({ note: n, paragraphs: paragraphs(n.text) }));
  const small = new Set<string>();
  for (const p of pages) for (const para of p.paragraphs) for (const m of para.matchAll(WORD)) if (m[0][0] === m[0][0].toLowerCase()) small.add(bare(m[0]));

  // 1. Near-miss spellings, and 3. names without a card.
  const targets = [...known].filter((w) => w.length >= 4 && w[0] !== w[0].toLowerCase());
  const nearOf = new Map<string, string | undefined>();
  const unknown = new Map<string, { count: number; path: string; chapter: string; context: string }>();
  for (const { note, paragraphs: paras } of pages) {
    for (const para of paras) {
      for (const m of para.matchAll(WORD)) {
        const word = bare(m[0]);
        if (word.length < 3 || word[0] === word[0].toLowerCase() || known.has(word) || knownFolded.has(word.toLowerCase())) continue;
        if (small.has(word.toLowerCase()) || ORDINARY.has(word.toLowerCase())) continue;
        // Worked out once per word, however often it's written.
        if (!nearOf.has(word)) {
          nearOf.set(word, word.length >= 4 ? targets.find((t) => Math.abs(word.length - t.length) <= 2 && distance(word, t) <= (Math.max(word.length, t.length) >= 8 ? 2 : 1)) : undefined);
        }
        const near = nearOf.get(word);
        if (near) {
          add({
            key: `spelling:${word}`,
            kind: "spelling",
            path: note.path,
            chapter: note.title,
            message: `“${word}” is close to “${near}”, which has a card. Is it the same?`,
            context: around(para, m.index, m[0].length),
          });
          continue;
        }
        // Not the first word of a sentence: that one is capitalised whatever it is.
        const before = para.slice(0, m.index).trimEnd();
        if (before === "" || /[.!?…:“"‘(—–-]$/.test(before)) continue;
        const u = unknown.get(word);
        if (u) u.count++;
        else unknown.set(word, { count: 1, path: note.path, chapter: note.title, context: around(para, m.index, m[0].length) });
      }
    }
  }

  // 2. A fixed fact said differently, in a paragraph that's about this card and no other.
  const patterns = cards.map((c) => mentionPattern(c.names, c.atOnly));
  for (const { note, paragraphs: paras } of pages) {
    for (const para of paras) {
      const here = cards.filter((_, i) => patterns[i] && para.search(new RegExp(patterns[i]!.source, "u")) >= 0);
      if (here.length !== 1) continue;
      const card = here[0];
      for (const fact of card.facts) {
        const clash = clashWith(fact, para);
        if (!clash) continue;
        add({
          key: `fact:${card.name}:${fact.key}:${clash.said}`.toLowerCase(),
          kind: "fact",
          path: note.path,
          chapter: note.title,
          message: `${card.name}'s card says “${fact.key}: ${fact.value}”. Here it's “${clash.said}”.`,
          context: around(para, clash.at, clash.said.length),
        });
      }
    }
  }

  const findings = [...out.values()];
  const noCard = [...unknown.entries()]
    .filter(([, u]) => u.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([name, u]): Finding => ({
      key: `no-card:${name}`,
      kind: "no-card",
      path: u.path,
      chapter: u.chapter,
      message: `“${name}” is named ${u.count} times and has no card.`,
      context: u.context,
      name,
    }))
    .filter((f) => !skip.has(f.key));
  const order = new Map(chapters.map((n, i) => [n.path, i]));
  return [...findings, ...noCard].sort((a, b) => order.get(a.path)! - order.get(b.path)!);
}

function bare(word: string): string {
  return word.replace(/['’]s$/i, "").replace(/['’-]+$/, "");
}

/**
 * Where a paragraph says a fact differently: only for what can be told apart without
 * understanding, a colour ("Eyes: green" … "blue eyes") or a number ("Age: 34" … "aged 36").
 */
function clashWith(fact: Fact, para: string): { said: string; at: number } | null {
  const key = fact.key.toLowerCase().replace(/s$/, "");
  const value = fact.value.toLowerCase();
  const lower = para.toLowerCase();
  const number = /\d+/.exec(value)?.[0];
  if (number) {
    const forms =
      key === "age"
        ? [/\b(\d{1,3})[- ]years?[- ]old\b/g, /\baged? (\d{1,3})\b/g, /\bwas (\d{1,3})\b(?! (?:years|days|weeks|months|hours|minutes|miles|metres|meters|feet))/g, /, (\d{1,3}),/g, /\bat (\d{1,3})\b(?![:.]\d| (?:o'clock|am|pm)\b)/g]
        : [new RegExp(`\\b${escape(key)}s?\\b[^.!?]{0,30}?\\b(\\d+)\\b`, "g"), new RegExp(`\\b(\\d+)\\b[^.!?]{0,30}?\\b${escape(key)}s?\\b`, "g")];
    for (const re of forms) {
      for (const m of lower.matchAll(re)) if (m[1] !== number) return { said: para.substr(m.index, m[0].length).replace(/^, |,$/g, ""), at: m.index };
    }
    return null;
  }
  const mine = COLOURS.filter((c) => new RegExp(`\\b${c}\\b`).test(value));
  if (mine.length === 0) return null;
  // The thing itself must be named ("eyes"), with a different colour within a few words of it.
  for (const m of lower.matchAll(new RegExp(`\\b${escape(key)}s?\\b`, "g"))) {
    const from = Math.max(0, m.index - 40);
    const near = lower.slice(from, m.index + m[0].length + 40);
    for (const c of COLOURS) {
      if (mine.includes(c) || (c === "gray" && mine.includes("grey")) || (c === "grey" && mine.includes("gray"))) continue;
      const hit = new RegExp(`\\b${c}\\b`).exec(near);
      if (!hit) continue;
      // The same colour said in the same breath ("dark green eyes") is no clash.
      if (mine.some((own) => new RegExp(`\\b${own}\\b`).test(near)) && ["dark", "fair"].includes(c)) continue;
      const start = Math.min(from + hit.index, m.index);
      const end = Math.max(from + hit.index + c.length, m.index + m[0].length);
      return { said: para.slice(start, end), at: start };
    }
  }
  return null;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A question to paste into any AI assistant: the book's own record (what it's about, each
 * chapter's summary, the characters, the lore) and the writing to check against it.
 */
export function consistencyPrompt(book: Book, notes: LibraryNote[], cast: Character[], lore: LoreEntry[], only: string | null): string {
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const chapters = book.chapters.map((c) => byPath.get(c.path)).filter((n): n is LibraryNote => !!n);
  const premise = readPremise(byPath.get(book.path)?.text ?? "");
  const card = (name: string, kind: string, aliases: string[], summary: string, facts: Fact[], extra: string[] = []) =>
    [`- ${name}${kind ? ` (${kind})` : ""}${aliases.length ? `, also called ${aliases.join(", ")}` : ""}${summary ? `: ${summary}` : ""}`, ...facts.map((f) => `  - ${f.key}: ${f.value}`), ...extra.map((e) => `  - ${e}`)].join("\n");
  const lines: string[] = [
    `I'm writing a book called “${book.title}”. Please check ${only ? "the chapter" : "the chapters"} at the end against my own notes about the story, which come first.`,
    "",
    "List every place where the writing contradicts the notes, or contradicts itself: names, ages, looks, dates and the order of events, who knows what, where things are, and the rules of the world. For each one, quote the words, say what they contradict, and say how sure you are. Don't rewrite anything, and don't comment on style. If you find nothing, say so.",
    "",
    "## What the book is about",
    "",
    premise || "(not written yet)",
    "",
    "## Chapters, in order",
    "",
    ...chapters.map((n, i) => {
      const o = readOutline(n.text);
      return `${i + 1}. ${n.title}${o.when ? ` (${o.when})` : ""}${o.toldBy ? `, told by ${o.toldBy}` : ""}${o.summary ? `: ${o.summary}` : ""}`;
    }),
    "",
    "## Characters",
    "",
    ...(cast.length
      ? cast.map((c) => card(c.name, c.role, c.aliases, c.summary, c.facts, c.connections.filter((x) => x.label || x.theirLabel).map((x) => `${x.name}: ${[x.label, x.theirLabel && `${c.name} is their ${x.theirLabel}`].filter(Boolean).join("; ")}`)))
      : ["(none yet)"]),
    "",
    "## Lore: what must stay true",
    "",
    ...(lore.length ? lore.map((x) => card(x.name, x.kind, x.aliases, x.summary, x.facts)) : ["(none yet)"]),
    "",
    only ? "## The chapter to check" : "## The chapters to check",
  ];
  for (const n of chapters.filter((c) => !only || c.path === only)) {
    lines.push("", parseNote(n.text).body.replace(/@tk\[([^\]]*)\]/gi, "[TK: $1]").trim());
  }
  return lines.join("\n") + "\n";
}
