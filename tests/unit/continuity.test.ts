import { describe, expect, it } from "vitest";
import type { Character } from "../../src/app/characters";
import { chapterBody, chapterParts, checkChapter, countQuestions, numbersAgree, numbersIn, questionsFor, quoteIn, type Model, type Session } from "../../src/app/continuity";
import type { LoreEntry } from "../../src/app/lore";

const person = (name: string, facts: [string, string][], aliases: string[] = []): Character => ({
  path: `Books/Ash/Characters/${name}.md`,
  name,
  aliases,
  role: "",
  summary: "",
  facts: facts.map(([key, value]) => ({ key, value })),
  connections: [],
  mentions: [],
  tint: 0,
  atOnly: false,
  shared: false,
});
const thing = (name: string, facts: [string, string][]): LoreEntry => ({ path: `Books/Ash/Lore/${name}.md`, name, aliases: [], kind: "", summary: "", facts: facts.map(([key, value]) => ({ key, value })), mentions: [], shared: false });

const CAST = [person("Ines Varga", [["Age", "34"], ["Eyes", "grey"]]), person("Tomas Lund", [["Age", "36"]]), person("Old Maren", [["Sight", "nearly blind"]])];
const LORE = [thing("The ferry", [["Runs", "Tuesdays and Fridays only"]])];
const BODY = "# The lamp room\n\nAt twenty-nine she had thought she was finished here. In the lens she saw her tired brown eyes.\n\nTomas's shop was the brightest. The Sunday ferry had gone.";

/**
 * A stand-in for Chrome's model. `read` answers a question about the chapter; `judge` compares.
 * It records what it was asked, so a test can see that nothing else reached it.
 */
function fake(read: (detail: string) => string[], judge: (text: string) => string = () => "conflict") {
  const asked: { to: string; text: string }[] = [];
  let open = 0;
  const session = (to: string): Session => {
    open++;
    return {
      async ask(text, _shape, signal) {
        signal?.throwIfAborted();
        asked.push({ to, text });
        return JSON.stringify(to === "judge" ? { answer: judge(text) } : { quotes: read(text) });
      },
      clone: async () => session(to),
      destroy: () => void open--,
    };
  };
  const model: Model = {
    readiness: async () => "ready",
    open: async (instructions) => session(instructions.startsWith("You find sentences") ? "reader" : "judge"),
  };
  return { model, asked, stillOpen: () => open };
}

const chapter = { title: "The lamp room", body: BODY, toldBy: "Ines Varga" };

describe("continuity check", () => {
  it("asks about each fixed fact on a card the chapter names, and always about the teller", () => {
    const qs = questionsFor(BODY, "Ines Varga", CAST, LORE);
    // Ines is never named ("she"), but tells the chapter. Tomas is named as "Tomas's". Maren isn't there.
    expect(qs.map((q) => `${q.card}/${q.key}`)).toEqual(["Ines Varga/Age", "Ines Varga/Eyes", "Tomas Lund/Age", "The ferry/Runs"]);
    expect(questionsFor(BODY, "", CAST, LORE).map((q) => q.card)).toEqual(["Tomas Lund", "The ferry"]);
    expect(countQuestions(chapter, CAST, LORE)).toBe(4);
  });

  it("reads numbers written as words, and compares them by rule", () => {
    expect(numbersIn("At twenty-nine, with 3 dogs and ninety steps")).toEqual([3, 29, 90]);
    expect(numbersAgree("34", "she was thirty-four")).toBe(true);
    expect(numbersAgree("34", "at twenty-nine")).toBe(false);
    expect(numbersAgree("34", "she felt old")).toBeNull();
    expect(numbersAgree("grey", "two brown eyes")).toBeNull();
  });

  it("only accepts a quote that is really in the chapter", () => {
    expect(quoteIn(BODY, "her tired brown eyes")).toBe("her tired brown eyes");
    expect(quoteIn(BODY, "“Tomas’s shop was the  brightest.”")).toBe("Tomas’s shop was the brightest.");
    expect(quoteIn(BODY, "her bright green eyes")).toBeNull();
    expect(quoteIn(BODY, "a")).toBeNull();
  });

  it("splits a long chapter between paragraphs", () => {
    const long = Array.from({ length: 10 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(999)).join("\n\n");
    const parts = chapterParts(long, 3500);
    expect(parts.length).toBe(4);
    expect(parts.join("\n\n")).toBe(long);
    expect(chapterParts("One short chapter.")).toEqual(["One short chapter."]);
  });

  it("leaves the note's header out of what the model reads", () => {
    expect(chapterBody("---\nsynopsis: A secret.\n---\n# One\n\nShe met @tk[the baker's name].")).toBe("# One\n\nShe met [TK].");
  });

  it("shows a conflict only when the quote is real and the comparison says so", async () => {
    const { model, asked, stillOpen } = fake(
      (detail) =>
        detail.includes("Eyes")
          ? ["her tired brown eyes"]
          : detail.includes("Ines Varga — Age")
            ? ["At twenty-nine she had thought she was finished here", "The Sunday ferry had gone."] // the second is about something else
            : detail.includes("Tomas")
              ? ["He was forty that spring"] // not in the chapter
              : ["The Sunday ferry had gone."],
      (text) => (text.includes("Eyes") ? "conflict" : text.includes("Age") && text.includes("ferry") ? "other" : "fits"),
    );
    const progress: number[] = [];
    const found = await checkChapter(model, chapter, CAST, LORE, (p) => progress.push(p.done));
    // The age is a conflict by rule (34 against twenty-nine), though the comparing step said "fits".
    expect(found.map((f) => [f.card, f.fact, f.quote])).toEqual([
      ["Ines Varga", "Age: 34", "At twenty-nine she had thought she was finished here"],
      ["Ines Varga", "Eyes: grey", "her tired brown eyes"],
    ]);
    expect(found[0].key).toMatch(/^ai:[a-z0-9]+$/);
    expect(progress).toEqual([0, 1, 2, 3, 4]);
    // The model is told which detail to look for, never the card's value; and the invented quote never reaches the comparing step.
    expect(asked.filter((a) => a.to === "reader").map((a) => a.text)).toEqual(["Detail: Ines Varga — Age", "Detail: Ines Varga — Eyes", "Detail: Tomas Lund — Age", "Detail: The ferry — Runs"]);
    expect(asked.filter((a) => a.to === "judge").map((a) => a.text)).toEqual([
      'Card: Ines Varga — Age: 34. Chapter: "At twenty-nine she had thought she was finished here". Answer:',
      'Card: Ines Varga — Age: 34. Chapter: "The Sunday ferry had gone.". Answer:',
      'Card: Ines Varga — Eyes: grey. Chapter: "her tired brown eyes". Answer:',
      'Card: The ferry — Runs: Tuesdays and Fridays only. Chapter: "The Sunday ferry had gone.". Answer:',
    ]);
    expect(stillOpen()).toBe(0);
  });

  it("shows nothing when the chapter fits, is silent, or the model answers nonsense", async () => {
    const fits = fake(() => ["her tired brown eyes"], () => "fits");
    expect(await checkChapter(fits.model, chapter, [person("Ines Varga", [["Eyes", "brown"]])], [])).toEqual([]);
    const sameNumber = fake(() => ["At twenty-nine she had thought she was finished here"], () => "conflict");
    expect(await checkChapter(sameNumber.model, chapter, [person("Ines Varga", [["Age", "29"]])], [])).toEqual([]);
    const silent = fake(() => []);
    expect(await checkChapter(silent.model, chapter, CAST, LORE)).toEqual([]);
    const broken: Model = { readiness: async () => "ready", open: async () => ({ ask: async () => "not json", clone: async function () { return this; }, destroy() {} }) };
    expect(await checkChapter(broken, chapter, CAST, LORE)).toEqual([]);
    expect(await checkChapter(silent.model, { ...chapter, toldBy: "" }, [person("Nobody Here", [["Age", "5"]])], [])).toEqual([]);
  });

  it("doesn't take another character's number for a slip", async () => {
    const body = "Ines watched Tomas on the quay. He was thirty-six now and looked it.";
    const { model } = fake(() => ["He was thirty-six now and looked it."], (text) => (text.includes("Age") ? "conflict" : "other"));
    expect(await checkChapter(model, { title: "One", body, toldBy: "" }, CAST, [])).toEqual([]);
    // With no card to explain the number, it's worth a look.
    const found = await checkChapter(model, { title: "One", body, toldBy: "" }, [CAST[0]], []);
    expect(found.map((f) => f.fact)).toEqual(["Age: 34"]);
  });

  it("stops when asked to", async () => {
    const stop = new AbortController();
    const { model, stillOpen } = fake(() => {
      stop.abort();
      return [];
    });
    await expect(checkChapter(model, chapter, CAST, LORE, undefined, stop.signal)).rejects.toThrow();
    expect(stillOpen()).toBe(0);
  });
});
