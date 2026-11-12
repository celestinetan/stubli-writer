import { describe, expect, it } from "vitest";
import {
  cardFields,
  cardsOutsideBooks,
  characterPath,
  characters,
  characterTemplate,
  connectionLabel,
  mentionPattern,
  parseConnection,
  relation,
  writeCard,
} from "../../src/app/characters";
import { books } from "../../src/app/books";
import { describeNote } from "../../src/app/library";

const note = (path: string, text: string) => describeNote(path, text, 0);

const BOOK = `---\ntype: book\n---\n# The Surrendering\n\n## Chapters\n\n1. [The cruise](The%20Surrendering/The%20cruise.md)\n`;
const JAMES = `---
type: character
---
# James

Role: Lead
Also called: Jim

The perfect employee; no family left.

## Connections

- @Gio: partner, met on the cruise
- [Mrs Lopes](Mrs%20Lopes.md) — his landlady
- The captain
`;
const CHAPTER = `# The cruise\n\n@James was the perfect employee. Jim, they called him. James, again; but not james or Jameson.\n\nJames met Gio on his second week. Write to james@gio.com. Will will come.\n`;

const notes = [
  note("Books/The Surrendering.md", BOOK),
  note("Books/The Surrendering/The cruise.md", CHAPTER),
  note("Books/The Surrendering/Characters/James.md", JAMES),
  note("Books/The Surrendering/Characters/Gio.md", "# Gio\n\nThe Italian version of @James.\n"),
  note("Books/The Surrendering/Characters/Mrs Lopes.md", "# Mrs Lopes\n"),
  note("Books/The Surrendering/Characters/Will.md", "---\ntype: character\nunderline: only-with-@\n---\n# Will\n"),
  note("Books/Another/Characters/Zé.md", "# Zé\n"),
  note("Characters/Old.md", "# Old\n"),
  note("Essay.md", "# Essay\n\n@James is mentioned outside the book.\n"),
];
const book = books(notes)[0];

describe("a book's characters", () => {
  const cast = characters(notes, book);
  const james = cast.find((c) => c.name === "James")!;
  const gio = cast.find((c) => c.name === "Gio")!;

  it("are the cards in that book's Characters folder, and no others", () => {
    expect(cast.map((c) => c.name)).toEqual(["Gio", "James", "Mrs Lopes", "Will"]);
    expect(characters(notes, null)).toEqual([]);
  });

  it("read name, role, other names and the first paragraph as the summary", () => {
    expect(james).toMatchObject({ role: "Lead", aliases: ["Jim"], summary: "The perfect employee; no family left." });
  });

  it("connect both ways from one line, by name, @name or link", () => {
    expect(james.connections).toEqual([
      { path: "Books/The Surrendering/Characters/Gio.md", name: "Gio", label: "partner, met on the cruise", fromOther: false, kind: "partner" },
      { path: "Books/The Surrendering/Characters/Mrs Lopes.md", name: "Mrs Lopes", label: "his landlady", fromOther: false, kind: "other" },
      { path: null, name: "The captain", label: "", fromOther: false, kind: "other" },
    ]);
    expect(gio.connections).toEqual([{ path: "Books/The Surrendering/Characters/James.md", name: "James", label: "partner, met on the cruise", fromOther: true, kind: "partner" }]);
  });

  it("are found by name once named, in the book's chapters only, never inside a word or an email address", () => {
    // @James, Jim, James, James: capitals as written, so not "james" or "Jameson".
    expect(james.mentions.map((m) => [m.note.path, m.count])).toEqual([["Books/The Surrendering/The cruise.md", 4]]);
    expect(gio.mentions.map((m) => m.count)).toEqual([1]);
  });

  it("a name that's also a word can count only where it's written @Name", () => {
    const will = cast.find((c) => c.name === "Will")!;
    expect(will.atOnly).toBe(true);
    expect(will.mentions).toEqual([]);
  });

  it("cards made outside any book are found, so they can be moved into one", () => {
    // "Another" has no book note, so Zé isn't in a book either.
    expect(cardsOutsideBooks(notes, books(notes)).map((n) => n.path)).toEqual(["Books/Another/Characters/Zé.md", "Characters/Old.md"]);
  });
});

describe("writing a card from the board", () => {
  it("writes the fields as plain Markdown and keeps everything else", () => {
    const original = `---\ntype: character\nmood: calm\n---\n# James\n\nRole: Lead\n\nOld summary\nsecond line.\n\nA second paragraph to keep.\n\n## Connections\n\n- Gio: partner\n\n## Backstory\n\nBorn in Porto.\n`;
    const text = writeCard(original, {
      name: "James",
      role: "Lead",
      aliases: ["Jim", " "],
      summary: "The perfect employee.",
      connections: [
        { name: "Gio", label: "partner" },
        { name: "Mrs Lopes", label: "" },
      ],
    });
    expect(text).toBe(
      `---\ntype: character\nmood: calm\n---\n# James\n\nRole: Lead\n\nAlso called: Jim\n\nThe perfect employee.\n\nA second paragraph to keep.\n\n## Connections\n\n- @Gio: partner\n- @Mrs Lopes\n\n## Backstory\n\nBorn in Porto.\n`,
    );
    // And reads back the same.
    expect(cardFields(note("Books/X/Characters/James.md", text))).toEqual({
      name: "James",
      atOnly: false,
      role: "Lead",
      aliases: ["Jim"],
      summary: "The perfect employee.",
      connections: [
        { name: "Gio", label: "partner" },
        { name: "Mrs Lopes", label: "" },
      ],
    });
  });

  it("the @-only setting is a header line, set and cleared without touching the rest", () => {
    const base = "---\ntype: character\n---\n# Will\n\n";
    const on = writeCard(base, { name: "Will", atOnly: true, role: "", aliases: [], summary: "", connections: [] });
    expect(on).toBe("---\ntype: character\nunderline: only-with-@\n---\n# Will\n\n## Connections\n");
    expect(writeCard(on, { name: "Will", atOnly: false, role: "", aliases: [], summary: "", connections: [] })).toBe("---\ntype: character\n---\n# Will\n\n## Connections\n");
  });

  it("a new card is just a title, ready for the board's fields", () => {
    expect(characterTemplate("Ana", "2026-11-12")).toBe("---\ntype: character\ncreated: 2026-11-12\n---\n# Ana\n\n");
    expect(writeCard(characterTemplate("Ana", "2026-11-12"), { name: "Ana", role: "", aliases: [], summary: "", connections: [] })).toBe(
      "---\ntype: character\ncreated: 2026-11-12\n---\n# Ana\n\n## Connections\n",
    );
  });
});

describe("what someone is to you", () => {
  it("is read from the first word, in plain English", () => {
    expect(relation("mother, wrote the letters")).toEqual({ kind: "parent", word: "mother", rest: "wrote the letters" });
    expect(relation("Daughter")).toEqual({ kind: "child", word: "Daughter", rest: "" });
    expect(relation("old rival")).toEqual({ kind: "other", word: "", rest: "old rival" });
    expect(relation("brotherly friend").kind).toBe("other");
  });
  it("reads the other way round on the other card", () => {
    const ana = note("Books/B/Characters/Ana.md", "# Ana\n\n## Connections\n\n- Marta: mother, wrote the letters\n");
    const marta = note("Books/B/Characters/Marta.md", "# Marta\n");
    const cast = characters([ana, marta, note("Books/B.md", "---\ntype: book\n---\n# B\n")], { path: "Books/B.md", chapters: [] });
    expect(cast.find((c) => c.name === "Ana")!.connections[0]).toMatchObject({ kind: "parent", label: "mother, wrote the letters" });
    expect(cast.find((c) => c.name === "Marta")!.connections[0]).toMatchObject({ kind: "child", label: "child, wrote the letters" });
  });
  it("writes a connection as words", () => {
    expect(connectionLabel("parent", "")).toBe("parent");
    expect(connectionLabel("sibling", "twin")).toBe("sibling, twin");
    expect(connectionLabel("other", "old rival")).toBe("old rival");
  });
});

describe("connections and names", () => {
  it("reads the ways people write a connection", () => {
    expect(parseConnection("@Gio: partner")).toEqual({ name: "Gio", label: "partner", target: null });
    expect(parseConnection("Gio – partner")).toEqual({ name: "Gio", label: "partner", target: null });
    expect(parseConnection("Ana Sousa")).toEqual({ name: "Ana Sousa", label: "", target: null });
    expect(parseConnection("[Ana](Ana.md): sister")).toEqual({ name: "Ana", label: "sister", target: "Ana.md" });
    expect(parseConnection("")).toBeNull();
  });
  it("names match whole, longer names first, with or without @, and leave @tk[…] alone", () => {
    const p = mentionPattern(["Ana", "Ana Sousa", "tk"])!;
    expect([..."@Ana Sousa and Ana, not Anabel or ana@Ana.com, @tk[x]".matchAll(p)].map((m) => m[0])).toEqual(["@Ana Sousa", "Ana"]);
    const at = mentionPattern(["Will"], true)!;
    expect([..."Will will come; @Will won't.".matchAll(at)].map((m) => m[0])).toEqual(["@Will"]);
  });
  it("puts a new card in the book's Characters folder", () => {
    expect(characterPath(book, "Mrs. Lopes / the landlady")).toBe("Books/The Surrendering/Characters/Mrs. Lopes the landlady.md");
    expect(characterPath(book, "  ")).toBeNull();
  });
});
