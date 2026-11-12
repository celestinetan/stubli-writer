import { describe, expect, it } from "vitest";
import { bookTemplate, books, chapterCards, moveItem, newChapterPath, withChapters } from "../../src/app/books";
import { characters } from "../../src/app/characters";
import { describeNote } from "../../src/app/library";

const note = (path: string, text: string) => describeNote(path, text, 0);

const BOOK = `---
type: book
---
# The Surrendering

A short novel. Working title.

## Chapters

1. [The cruise](The%20Surrendering/The%20cruise.md)
2. [Gio](The%20Surrendering/Gio.md)
3. [Gone](The%20Surrendering/Gone.md)

## Notes for later

Ending TBC.
`;

describe("books", () => {
  const notes = [
    note("Books/The Surrendering.md", BOOK),
    note("Books/The Surrendering/The cruise.md", "# The cruise\n\n@James was the perfect employee. TK\n"),
    note("Books/The Surrendering/Gio.md", "---\nsynopsis: James meets Gio.\n---\n# Gio\n\n@James met @Gio on his second week.\n"),
    note("Books/The Surrendering/Characters/James.md", "# James\n"),
    note("Books/The Surrendering/Characters/Gio.md", "# Gio\n"),
  ];

  it("reads the chapters, in order, from the book's links", () => {
    expect(books(notes)[0].chapters.map((c) => c.path)).toEqual([
      "Books/The Surrendering/The cruise.md",
      "Books/The Surrendering/Gio.md",
      "Books/The Surrendering/Gone.md",
    ]);
  });

  it("makes a card per chapter: a line about it, length, gaps and who's in it", () => {
    const cards = chapterCards(books(notes)[0], notes, characters(notes, books(notes)[0]));
    expect(cards.map((c) => [c.title, c.synopsis, c.words, c.gaps, c.characters.map((x) => x.name)])).toEqual([
      ["The cruise", "@James was the perfect employee. TK", 6, 1, ["James"]],
      ["Gio", "James meets Gio.", 7, 0, ["Gio", "James"]],
      ["Gone", "", 0, 0, []],
    ]);
    expect(cards[2].note).toBeNull();
  });

  it("moving a chapter rewrites only the list, leaving the rest as written", () => {
    const book = books(notes)[0];
    const moved = moveItem(book.chapters, 2, 0);
    const text = withChapters(BOOK, book.path, moved, (p) => notes.find((n) => n.path === p)?.title ?? "");
    expect(text).toBe(
      BOOK.replace(
        "1. [The cruise](The%20Surrendering/The%20cruise.md)\n2. [Gio](The%20Surrendering/Gio.md)\n3. [Gone](The%20Surrendering/Gone.md)",
        "1. [Gone](The%20Surrendering/Gone.md)\n2. [The cruise](The%20Surrendering/The%20cruise.md)\n3. [Gio](The%20Surrendering/Gio.md)",
      ),
    );
  });

  it("a new book gets its list under Chapters, with links that work from the book", () => {
    const text = bookTemplate("Trams", "2026-11-12");
    const book = { path: "Books/Trams.md", title: "Trams", chapters: [] };
    const path = newChapterPath(book, "Line 28 (night)", () => false)!;
    expect(path).toBe("Books/Trams/Line 28 (night).md");
    expect(withChapters(text, book.path, [{ path, label: "" }], () => "Line 28 (night)")).toBe(
      "---\ntype: book\ncreated: 2026-11-12\n---\n# Trams\n\n## Chapters\n\n1. [Line 28 (night)](Trams/Line%2028%20%28night%29.md)\n",
    );
    expect(books([note(book.path, withChapters(text, book.path, [{ path, label: "" }], () => "x"))])[0].chapters[0].path).toBe(path);
  });

  it("new chapter names never overwrite one that's there", () => {
    const book = { path: "Books/Trams.md", title: "Trams", chapters: [] };
    expect(newChapterPath(book, "One", (p) => p === "Books/Trams/One.md")).toBe("Books/Trams/One 2.md");
  });
});
