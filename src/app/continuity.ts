/**
 * Continuity check: compares one chapter with the fixed facts on the book's cards, using the small
 * AI model that is part of Chrome and runs on the writer's own computer. Nothing is sent anywhere.
 *
 * A small model invents things when asked an open question, so it is never asked one. For each
 * fixed fact on a card the chapter names:
 *
 *   1. The model is asked only to copy out the chapter's sentences about that one detail. It is
 *      not asked what they mean.
 *   2. Each copied sentence must really be in the chapter, or it is dropped.
 *   3. A second, separate step sees only the card's fact and one sentence, and says whether they
 *      fit, conflict, or are about something else. Only "conflict" is shown.
 *   4. Where both give a number, the numbers are compared by rule, not by the model.
 *
 * What's shown is a question for the writer ("worth a look"), never a verdict, and nothing in the
 * chapter or the cards is changed.
 */
import { parseNote } from "../notes/note";
import type { Character } from "./characters";
import type { LoreEntry } from "./lore";

/** Whether this browser and computer can run the check. */
export type Readiness = "unsupported" | "unavailable" | "downloadable" | "downloading" | "ready";

export interface Session {
  /** One question, answered as JSON in the given shape. */
  ask(text: string, shape: object, signal?: AbortSignal): Promise<string>;
  clone(): Promise<Session>;
  destroy(): void;
}

export interface Model {
  readiness(): Promise<Readiness>;
  /** Starts a session. The first one may download the model; `onDownload` gets 0 to 1. */
  open(instructions: string, onDownload?: (fraction: number) => void, signal?: AbortSignal): Promise<Session>;
}

// The parts of Chrome's built-in Prompt API this uses.
interface BrowserSession {
  prompt(text: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  clone(): Promise<BrowserSession>;
  destroy(): void;
}
interface BrowserModel {
  availability(options?: object): Promise<string>;
  create(options?: object): Promise<BrowserSession>;
}

const LANGUAGES = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

function wrap(s: BrowserSession): Session {
  return {
    ask: (text, shape, signal) => s.prompt(text, { responseConstraint: shape, signal }),
    clone: async () => wrap(await s.clone()),
    destroy: () => s.destroy(),
  };
}

/** Chrome's built-in model, or null where the browser has none. */
export function browserModel(): Model | null {
  const api = (globalThis as { LanguageModel?: BrowserModel }).LanguageModel;
  if (!api || typeof api.availability !== "function" || typeof api.create !== "function") return null;
  return {
    async readiness() {
      try {
        const a = await api.availability(LANGUAGES);
        return a === "available" ? "ready" : a === "downloadable" || a === "downloading" ? a : "unavailable";
      } catch {
        return "unavailable";
      }
    },
    async open(instructions, onDownload, signal) {
      return wrap(
        await api.create({
          ...LANGUAGES,
          initialPrompts: [{ role: "system", content: instructions }],
          signal,
          monitor(m: EventTarget) {
            m.addEventListener("downloadprogress", (e) => onDownload?.((e as ProgressEvent).loaded));
          },
        }),
      );
    },
  };
}

export async function readiness(model: Model | null): Promise<Readiness> {
  return model ? model.readiness() : "unsupported";
}

const KEY = "stubli-writer:continuity";

/** Whether the writer has set the check up and left it on. Kept on this device. */
export function continuityOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setContinuityOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Not remembered in a private window.
  }
}

export interface Question {
  card: string;
  key: string;
  value: string;
  /** What the model is given to look for: the card and the detail, never the value. */
  text: string;
}

export interface ContinuityFinding {
  /** For setting it aside: the same while the card's fact and the chapter's words are. */
  key: string;
  card: string;
  /** The card's fact, as written: "Eyes: grey". */
  fact: string;
  /** The chapter's words. */
  quote: string;
}

/** A chapter's writing as the model reads it: no header, and gaps left as plain marks. */
export function chapterBody(text: string): string {
  return parseNote(text)
    .body.replace(/@tk\[([^\]]*)\]/gi, "[TK]")
    .trim();
}

const fold = (t: string) =>
  t
    .toLowerCase()
    .replace(/[“”"‘’'`*_]/g, "")
    .replace(/…|\.{3}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Whether the chapter names a card: any real word of its name or of another name it goes by. */
function names(body: string, all: string[]): boolean {
  return all.some((name) => (name.match(/[\p{L}][\p{L}\p{M}-]*/gu) ?? []).some((w) => w.length >= 4 && new RegExp(`(^|[^\\p{L}])${escape(w.toLowerCase())}([^\\p{L}]|$)`, "u").test(body)));
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One question for each fixed fact on a card this part of the chapter names. The teller's card is
 * always asked about: a chapter told as "I" or "she" may never write the name.
 */
export function questionsFor(body: string, toldBy: string, cast: Character[], lore: LoreEntry[]): Question[] {
  const lower = body.toLowerCase();
  const teller = toldBy.trim().toLowerCase();
  const cards = [
    ...cast.map((c) => ({ name: c.name, all: [c.name, ...c.aliases], facts: c.facts })),
    ...lore.map((x) => ({ name: x.name, all: [x.name, ...x.aliases], facts: x.facts })),
  ];
  const out: Question[] = [];
  for (const c of cards) {
    if (c.facts.length === 0) continue;
    const isTeller = teller !== "" && c.all.some((n) => n.toLowerCase() === teller);
    if (!isTeller && !names(lower, c.all)) continue;
    for (const f of c.facts) {
      if (!f.key.trim() || !f.value.trim()) continue;
      out.push({ card: c.name, key: f.key.trim(), value: f.value.trim(), text: `Detail: ${c.name} — ${f.key.trim()}` });
    }
  }
  return out;
}

/** A long chapter in parts the model can hold, split between paragraphs. */
export function chapterParts(body: string, maxWords = 3500): string[] {
  const paragraphs = body.split(/\r?\n\s*\r?\n/).filter((p) => p.trim());
  const parts: string[] = [];
  let now: string[] = [];
  let count = 0;
  for (const p of paragraphs) {
    const words = (p.match(/\S+/g) ?? []).length;
    if (count > 0 && count + words > maxWords) {
      parts.push(now.join("\n\n"));
      now = [];
      count = 0;
    }
    now.push(p);
    count += words;
  }
  if (now.length) parts.push(now.join("\n\n"));
  return parts;
}

/** The model's quote, if those words really are in the chapter; otherwise null. */
export function quoteIn(body: string, quote: string): string | null {
  const q = fold(quote);
  if (q.length < 4 || !fold(body).includes(q)) return null;
  return quote.replace(/\s+/g, " ").replace(/^[“”"'‘’\s]+|[“”"'‘’\s]+$/g, "").trim();
}

const READER =
  "You find sentences in a chapter of a novel. You are given one detail of the story. Copy, exactly, every sentence or phrase in the chapter that says something about that detail of that same person, place or thing, whatever it says. A sentence about someone or something else does not count. Copy at most three, the most direct first. Ignore anything marked [TK]. If the chapter says nothing about it, return an empty list. Answer in JSON.";
// Worked examples keep a small model from calling every change of wording a conflict.
const JUDGE = `A novelist's card records one detail of their story. A chapter has some words about it. Decide whether the chapter's words could be true in a story where the card is true.

"fits": both can be true. The chapter says the same thing in other words, or says only part of it, or adds detail the card lacks.
"conflict": both cannot be true. The chapter gives a different colour, number, place, day, month, order of events or ability.
"other": the chapter's words are not about this detail, or are about someone or something else.

Be slow to answer "conflict". Different wording is not a conflict.

Examples:
Card: Rosa — Eyes: green. Chapter: "her blue eyes". Answer: conflict
Card: Rosa — Hair: red, worn long. Chapter: "her long red braid". Answer: fits
Card: The library — Where: in the east wing. Chapter: "at the eastern end of the house". Answer: fits
Card: The library — Where: in the east wing. Chapter: "down in the cellar". Answer: conflict
Card: The market — Open: Mondays and Thursdays only. Chapter: "as on every Monday". Answer: fits
Card: The market — Open: Mondays and Thursdays only. Chapter: "the Saturday market". Answer: conflict
Card: The wedding — When: the day before the flood. Chapter: "yesterday's wedding". Answer: fits
Card: Paul — Born: in April. Chapter: "the garden was his now". Answer: other
Card: Rosa — Age: 41. Chapter: "He was fifty that year.". Answer: other
Card: The mill — Wheel: iron. Chapter: "It was never really a mill.". Answer: other

Answer in JSON.`;
const QUOTES = { type: "object", properties: { quotes: { type: "array", items: { type: "string" } } }, required: ["quotes"], additionalProperties: false };
const VERDICT = { type: "object", properties: { answer: { type: "string", enum: ["fits", "conflict", "other"] } }, required: ["answer"], additionalProperties: false };

const UNITS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const NUMBER_WORDS = new RegExp(`\\b(?:(${TENS.join("|")})(?:[- ](${UNITS.slice(1, 10).join("|")}))?|(${UNITS.join("|")}))\\b`, "g");

/** The numbers in a piece of text, written as figures or as words up to ninety-nine. */
export function numbersIn(text: string): number[] {
  const lower = text.toLowerCase();
  const out = [...lower.matchAll(/\d+/g)].map((m) => Number(m[0]));
  for (const m of lower.matchAll(NUMBER_WORDS)) out.push(m[1] ? (TENS.indexOf(m[1]) + 2) * 10 + (m[2] ? UNITS.indexOf(m[2]) : 0) : UNITS.indexOf(m[3]));
  return out;
}

/** A card's number against the chapter's, by rule: no model is needed to tell 34 from 29. */
export function numbersAgree(value: string, says: string): boolean | null {
  if (!/\d/.test(value)) return null;
  const card = numbersIn(value);
  const chapter = numbersIn(says);
  if (card.length === 0 || chapter.length === 0) return null;
  return card.some((n) => chapter.includes(n));
}

function parse<T>(json: string): T | null {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" ? (value as T) : null;
  } catch {
    return null;
  }
}

/** One question on a fresh copy of a session, so earlier answers can't colour it. */
async function once<T>(session: Session, text: string, shape: object, signal?: AbortSignal): Promise<T | null> {
  const copy = await session.clone();
  try {
    return parse<T>(await copy.ask(text, shape, signal));
  } finally {
    copy.destroy();
  }
}

/** A short, stable name for a finding, safe to keep in a note's header. */
function keyOf(card: string, fact: string, quote: string): string {
  let h = 5381;
  for (const ch of `${card}|${fact}|${fold(quote)}`) h = ((h << 5) + h + ch.codePointAt(0)!) >>> 0;
  return `ai:${h.toString(36)}`;
}

export interface Chapter {
  title: string;
  /** From `chapterBody`. */
  body: string;
  toldBy: string;
}

export interface Progress {
  done: number;
  total: number;
}

/** How many facts a check of this chapter would ask about. */
export function countQuestions(chapter: Chapter, cast: Character[], lore: LoreEntry[]): number {
  return chapterParts(chapter.body).reduce((n, part) => n + questionsFor(part, chapter.toldBy, cast, lore).length, 0);
}

/**
 * Checks one chapter against the cards. Resolves with what's worth a look, in the order asked;
 * rejects with an AbortError if stopped, or with the browser's error if the model fails.
 */
export async function checkChapter(model: Model, chapter: Chapter, cast: Character[], lore: LoreEntry[], onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<ContinuityFinding[]> {
  const parts = chapterParts(chapter.body).map((body) => ({ body, questions: questionsFor(body, chapter.toldBy, cast, lore) }));
  const total = parts.reduce((n, p) => n + p.questions.length, 0);
  let done = 0;
  onProgress?.({ done, total });
  const found = new Map<string, ContinuityFinding>();
  if (total === 0) return [];

  const judge = await model.open(JUDGE, undefined, signal);
  try {
    for (const part of parts) {
      if (part.questions.length === 0) continue;
      const told = chapter.toldBy.trim() ? ` (told by ${chapter.toldBy.trim()})` : "";
      const reader = await model.open(`${READER}\n\nTHE CHAPTER: ${chapter.title}${told}\n\n${part.body}`, undefined, signal);
      try {
        for (const q of part.questions) {
          signal?.throwIfAborted();
          const fact = `${q.key}: ${q.value}`;
          const copied = (await once<{ quotes?: unknown }>(reader, q.text, QUOTES, signal))?.quotes;
          const quotes = (Array.isArray(copied) ? copied : []).filter((x): x is string => typeof x === "string").slice(0, 3);
          for (const raw of quotes) {
            const quote = quoteIn(part.body, raw);
            if (!quote) continue;
            const key = keyOf(q.card, fact, quote);
            if (found.has(key)) continue;
            const verdict = (await once<{ answer?: string }>(judge, `Card: ${q.card} — ${fact}. Chapter: "${quote.slice(0, 240)}". Answer:`, VERDICT, signal))?.answer;
            if (verdict !== "fits" && verdict !== "conflict") continue; // about something else
            // "He was thirty-six" is Tomas's age, not a slip in Ines's: a number that matches another card's same detail is theirs.
            if (part.questions.some((o) => o.card !== q.card && o.key.toLowerCase() === q.key.toLowerCase() && numbersAgree(o.value, quote) === true)) continue;
            const byNumber = numbersAgree(q.value, quote);
            if (byNumber === null ? verdict === "conflict" : !byNumber) found.set(key, { key, card: q.card, fact, quote });
          }
          done++;
          onProgress?.({ done, total });
        }
      } finally {
        reader.destroy();
      }
    }
  } finally {
    judge.destroy();
  }
  return [...found.values()];
}
