import { describe, expect, it } from "vitest";
import { books, withWorld } from "../../src/app/books";
import { cardFields, cardsOutsideBooks, characters, writeCard } from "../../src/app/characters";
import { describeNote } from "../../src/app/library";
import { isCardNote, lore, lorePath, loreTemplate, sharedPath, worlds } from "../../src/app/lore";

const note = (path: string, text: string) => describeNote(path, text, 0);

const BOOK = (title: string, world = "") => `---\ntype: book\n${world ? `world: ${world}\n` : ""}---\n# ${title}\n\n## Chapters\n\n1. [One](${encodeURI(title)}/One.md)\n`;

const notes = [
  note("Books/Ash.md", BOOK("Ash", "Aster")),
  note("Books/Ash/One.md", "# One\n\nThe Meridian left Lisbon at dawn. Everyone on the ship knew the Rule. Mara did not.\n"),
  note("Books/Ember.md", BOOK("Ember", "Aster")),
  note("Books/Ember/One.md", "# One\n\nNobody spoke of the Rule in the north.\n"),
  note("Books/Alone.md", BOOK("Alone")),
  note("Books/Alone/One.md", "# One\n\nThe Rule meant nothing here.\n"),
  note("Books/Ash/Lore/The Meridian.md", "---\ntype: lore\n---\n# The Meridian\n\nKind: Place\nAlso called: the ship\n\nA liner on its last season. Nobody boards after Lisbon.\n\nMore notes kept as written.\n"),
  note("Worlds/Aster/Lore/The Rule.md", "# The Rule\n\nKind: Rule\n\nNo one may name the dead.\n"),
  note("Worlds/Aster/Characters/Mara.md", "# Mara\n\nRole: Lead\n"),
  note("Books/Ash/Characters/Tom.md", "# Tom\n"),
];
const [alone, ash, ember] = books(notes);

describe("lore", () => {
  it("a book has its own lore and its world's, with the chapters each is in", () => {
    const l = lore(notes, ash);
    expect(l.map((x) => [x.name, x.kind, x.shared, x.mentions.length])).toEqual([
      ["The Meridian", "Place", false, 1],
      ["The Rule", "Rule", true, 1],
    ]);
    expect(l[0].aliases).toEqual(["the ship"]);
    expect(l[0].summary).toBe("A liner on its last season. Nobody boards after Lisbon.");
    // Another book in the same world shares the Rule, not the ship; a book alone has neither.
    expect(lore(notes, ember).map((x) => x.name)).toEqual(["The Rule"]);
    expect(lore(notes, alone)).toEqual([]);
  });

  it("characters shared with the world are in every book set there", () => {
    expect(characters(notes, ash).map((c) => [c.name, c.shared])).toEqual([
      ["Mara", true],
      ["Tom", false],
    ]);
    expect(characters(notes, ember).map((c) => c.name)).toEqual(["Mara"]);
    expect(characters(notes, alone)).toEqual([]);
    expect(cardsOutsideBooks(notes, [alone, ash, ember])).toEqual([]);
  });

  it("cards are kept apart from the writing", () => {
    expect(notes.filter(isCardNote).map((n) => n.path)).toEqual(["Books/Ash/Lore/The Meridian.md", "Worlds/Aster/Lore/The Rule.md", "Worlds/Aster/Characters/Mara.md", "Books/Ash/Characters/Tom.md"]);
  });

  it("a card is written as plain words, and anything else on it stays", () => {
    const card = notes[6];
    const text = writeCard(card.text, { ...cardFields(card), role: "Ship", summary: "A liner.\nIts last season." }, "lore");
    expect(text).toBe("---\ntype: lore\n---\n# The Meridian\n\nKind: Ship\n\nAlso called: the ship\n\nA liner. Its last season.\n\nMore notes kept as written.\n");
    expect(loreTemplate("The Rule", "Rule", "2026-11-20")).toBe("---\ntype: lore\ncreated: 2026-11-20\n---\n# The Rule\n\nKind: Rule\n\n");
    expect(lorePath(ash, "The: Wall?")).toBe("Books/Ash/Lore/The Wall.md");
  });

  it("sharing moves a card to the world's folder, and back", () => {
    expect(sharedPath(ash, "Books/Ash/Lore/The Meridian.md", true)).toBe("Worlds/Aster/Lore/The Meridian.md");
    expect(sharedPath(ash, "Worlds/Aster/Lore/The Rule.md", false)).toBe("Books/Ash/Lore/The Rule.md");
    expect(sharedPath(ash, "Books/Ash/Characters/Tom.md", true)).toBe("Worlds/Aster/Characters/Tom.md");
    expect(sharedPath(ash, "Worlds/Aster/Lore/The Rule.md", true)).toBeNull();
    expect(sharedPath(alone, "Books/Alone/Lore/X.md", true)).toBeNull();
  });

  it("a book's world is one line in its header", () => {
    const named = withWorld(BOOK("Alone"), " Aster ");
    expect(named).toBe("---\ntype: book\nworld: Aster\n---\n# Alone\n\n## Chapters\n\n1. [One](Alone/One.md)\n");
    expect(withWorld(named, "")).toBe(BOOK("Alone"));
    expect(worlds(notes, [alone, ash, ember])).toEqual(["Aster"]);
  });
});
