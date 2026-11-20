import { describe, expect, it } from "vitest";
import { books } from "../../src/app/books";
import { cardFields, characters, writeCard } from "../../src/app/characters";
import { consistencyPrompt, distance, ignoredChecks, runChecks, withIgnoredCheck } from "../../src/app/checks";
import { describeNote } from "../../src/app/library";
import { lore } from "../../src/app/lore";

const note = (path: string, text: string) => describeNote(path, text, 0);

const BOOK = `---\ntype: book\npremise: A woman reads letters that aren't hers.\n---\n# Ash\n\n## Chapters\n\n1. [One](Ash/One.md)\n2. [Two](Ash/Two.md)\n`;
const KATHERINE = "# Katherine\n\nRole: Lead\nAlso called: Kat\n\nReads the letters.\n\n## Facts\n\n- Eyes: green\n- Age: 34\n\n## Connections\n\n- @Tomas: brother\n";
const ONE = `---
synopsis: She finds the box.
when: A Sunday
---
# One

Katherine found the box on a Sunday. Her green eyes went down the first page. She was 34 that year.

Tomas said nothing. He closed his eyes, and the blue door banged.

Later Rosalind came by. Nobody had asked Rosalind. But Rosalind stayed, and the Meridian sailed without her. The ship was quiet.
`;
const TWO = `# Two

Catherine read on. Kat had blue eyes like her mother, people said, and at 36 she felt old.

The Meridan was gone by morning. Sunday came and went. Tomas waited.
`;

const all = [
  note("Books/Ash.md", BOOK),
  note("Books/Ash/One.md", ONE),
  note("Books/Ash/Two.md", TWO),
  note("Books/Ash/Characters/Katherine.md", KATHERINE),
  note("Books/Ash/Characters/Tomas.md", "# Tomas\n"),
  note("Books/Ash/Lore/The Meridian.md", "# The Meridian\n\nKind: Place\nAlso called: the ship\n\nA liner.\n\n## Facts\n\n- Decks: 9\n"),
];
const book = books(all)[0];
const cast = characters(all, book);
const things = lore(all, book);

describe("checks", () => {
  it("counts the letters between two spellings", () => {
    expect(distance("Katherine", "Catherine")).toBe(1);
    expect(distance("Meridan", "Meridian")).toBe(1);
    expect(distance("Tomas", "Tomsa")).toBe(1);
    expect(distance("Ana", "Marta")).toBe(4);
  });

  it("cards keep fixed facts, as a plain list", () => {
    expect(cast[0].facts).toEqual([
      { key: "Eyes", value: "green" },
      { key: "Age", value: "34" },
    ]);
    const card = all[3];
    expect(writeCard(card.text, { ...cardFields(card), facts: ["Eyes: grey", " hair:auburn ", "nonsense"] })).toBe(
      "# Katherine\n\nRole: Lead\n\nAlso called: Kat\n\nReads the letters.\n\n## Facts\n\n- Eyes: grey\n- hair: auburn\n\n## Connections\n\n- @Tomas: brother\n",
    );
    // Not given: the facts on the card stay as they are.
    const { facts: _, ...without } = cardFields(card);
    expect(writeCard(card.text, without)).toContain("## Facts\n\n- Eyes: green\n- Age: 34\n");
  });

  it("finds near-miss spellings, facts said differently, and names without a card, in chapter order", () => {
    const found = runChecks(book, all, cast, things);
    expect(found.map((f) => [f.kind, f.chapter, f.message])).toEqual([
      ["no-card", "One", "“Rosalind” is named 3 times and has no card."],
      ["spelling", "Two", "“Catherine” is close to “Katherine”, which has a card. Is it the same?"],
      ["spelling", "Two", "“Meridan” is close to “Meridian”, which has a card. Is it the same?"],
      ["fact", "Two", "Katherine's card says “Eyes: green”. Here it's “blue eyes”."],
      ["fact", "Two", "Katherine's card says “Age: 34”. Here it's “at 36”."],
    ]);
    expect(found[3].context).toContain("Kat had blue eyes like her mother");
    // Not flagged: the right colour and age, another person's eyes, a blue door, and Sunday.
    expect(found.some((f) => f.chapter === "One" && f.kind !== "no-card")).toBe(false);
  });

  it("what's set aside stays aside, kept in the book's header", () => {
    const first = runChecks(book, all, cast, things)[1];
    const text = withIgnoredCheck(withIgnoredCheck(BOOK, first.key), "no-card:Rosalind");
    expect(text).toContain('checks-ignore: ["spelling:Catherine", "no-card:Rosalind"]');
    expect(withIgnoredCheck(text, first.key)).toBe(text);
    const left = runChecks(book, all, cast, things, ignoredChecks(text));
    expect(left.map((f) => f.key)).not.toContain("spelling:Catherine");
    expect(left.map((f) => f.kind)).toEqual(["spelling", "fact", "fact"]);
  });

  it("writes a question for any AI assistant, with the book's own record first", () => {
    const one = consistencyPrompt(book, all, cast, things, "Books/Ash/Two.md");
    expect(one).toContain("I'm writing a book called “Ash”.");
    expect(one).toContain("A woman reads letters that aren't hers.");
    expect(one).toContain("1. One (A Sunday): She finds the box.");
    expect(one).toContain("- Katherine (Lead), also called Kat: Reads the letters.\n  - Eyes: green\n  - Age: 34\n  - Tomas: brother");
    expect(one).toContain("- The Meridian (Place), also called the ship: A liner.\n  - Decks: 9");
    expect(one).toContain("## The chapter to check\n\n# Two");
    expect(one).not.toContain("Katherine found the box");
    expect(consistencyPrompt(book, all, cast, things, null)).toContain("Katherine found the box");
  });
});

describe("the story bible, for an assistant that reads the notes folder itself", () => {
  it("is the book's record with each chapter's file, and the same text until something changes", async () => {
    const { storyBible, shortRequest } = await import("../../src/app/checks");
    const { storyBiblePath, isCardNote } = await import("../../src/app/lore");
    const text = storyBible(book, all, cast, things);
    expect(text).toBe(storyBible(book, all, cast, things));
    expect(text).toContain("# Story bible: Ash\n");
    expect(text).toContain("## How to check a chapter against this");
    expect(text).toContain("1. One (file: Books/Ash/One.md) (A Sunday): She finds the box.");
    expect(text).toContain("2. Two (file: Books/Ash/Two.md)");
    expect(text).toContain("  - Eyes: green");
    expect(text).not.toContain("Katherine found the box");
    // It lives in the book's folder, and isn't listed with the writing.
    expect(storyBiblePath(book)).toBe("Books/Ash/Story bible.md");
    expect(isCardNote(note("Books/Ash/Story bible.md", text))).toBe(true);
    expect(isCardNote(note("Story bible.md", "# Mine\n"))).toBe(false);
    // One sentence sends the assistant there.
    expect(shortRequest(book, storyBiblePath(book), all[2], { kind: "drive", label: "Google Drive" })).toBe(
      "In my Google Drive, in the folder “Stubli Writer”, please read “Books/Ash/Story bible.md” and follow the instructions at its top to check the chapter “Two” (the file “Books/Ash/Two.md”).",
    );
    expect(shortRequest(book, storyBiblePath(book), null, { kind: "folder", label: "Writing" })).toBe(
      "In my notes folder “Writing”, please read “Books/Ash/Story bible.md” and follow the instructions at its top to check every chapter of “Ash” it lists, one at a time.",
    );
  });
});
