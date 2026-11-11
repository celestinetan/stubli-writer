import { describe, expect, it } from "vitest";
import { allGaps, dailyPath, dailyTemplate, describeNote, newNotePath, search, titleOf } from "../../src/app/library";
import { checkFilePath, NotePathError, relativeFrom, resolveRelative } from "../../src/store/store";

describe("note titles", () => {
  it.each([
    ["# The tram\n\nText", "The tram"],
    ["Intro line\n\n## Later heading", "Later heading"],
    ["Just a first line with **bold** and a [link](https://x.y)", "Just a first line with bold and a link"],
    ["- a list item first", "a list item first"],
    ["| table | first |\n|---|---|\n\nThen text", "Then text"],
    ["# Gap @tk[the name] here", "Gap TK here"],
    ["", ""],
  ])("%j → %j", (body, title) => expect(titleOf(body)).toBe(title));

  it("falls back to the file name", () => {
    expect(describeNote("Folder/2026-11-11 15.42.md", "---\ncreated: 2026-11-11\n---\n", 0).title).toBe("2026-11-11 15.42");
  });
});

describe("search", () => {
  const notes = [
    describeNote("a.md", "# Café in Lisbon\n\nThe pastry shop.", 3),
    describeNote("b.md", "# Trams\n\nThe café on the corner had a tram stop.", 2),
    describeNote("c.md", "# Unrelated\n\nNothing here.", 1),
  ];

  it("ignores accents and case", () => {
    expect(search(notes, "CAFE").map((h) => h.note.path)).toEqual(["a.md", "b.md"]);
  });
  it("needs every word", () => {
    expect(search(notes, "cafe tram").map((h) => h.note.path)).toEqual(["b.md"]);
  });
  it("ranks a title match first", () => {
    expect(search(notes, "tram")[0].note.path).toBe("b.md");
  });
  it("finds nothing for an empty query", () => expect(search(notes, "   ")).toEqual([]));
  it("gives a short snippet", () => {
    expect(search(notes, "corner")[0].snippet).toContain("corner");
  });
});

describe("gaps across notes", () => {
  it("lists each gap with context", () => {
    const notes = [describeNote("a.md", "# A\n\nThe year was TK and @tk[the place].", 1)];
    const gaps = allGaps(notes);
    expect(gaps.map((g) => [g.gap.kind, g.gap.request, g.index])).toEqual([
      ["tk", "", 0],
      ["request", "the place", 1],
    ]);
    expect(gaps[0].context).toBe("The year was ▢ and TK.");
  });

  it("keeps to the gap's own line, cut at whole words, without list or table marks", () => {
    const text = "# A\n\n- First item\n- Second item with a long run of words before the gap TK and after\n\n| Belém | TK |";
    const gaps = allGaps([describeNote("a.md", text, 1)]);
    expect(gaps[0].context).toBe("Second item with a long run of words before the gap ▢ and after");
    expect(gaps[1].context).toBe("Belém ▢");
    const long = "x ".repeat(5) + "word ".repeat(30) + "TK " + "after ".repeat(20);
    const c = allGaps([describeNote("b.md", long, 1)])[0].context;
    expect(c.startsWith("… word")).toBe(true);
    expect(c.endsWith(" …")).toBe(true);
  });
});

describe("daily and new notes", () => {
  const d = new Date(2026, 10, 11, 15, 42);
  it("puts today's note in Daily/", () => expect(dailyPath(d)).toBe("Daily/2026-11-11.md"));
  it("gives today's note a dated title", () => {
    expect(dailyTemplate(d, "en-GB")).toBe("---\ncreated: 2026-11-11\n---\n# Wednesday 11 November\n\n");
  });
  it("names new notes by date and time, never twice the same", () => {
    const taken = new Set(["2026-11-11 15.42.md", "2026-11-11 15.42 (2).md"]);
    expect(newNotePath(d, (p) => taken.has(p))).toBe("2026-11-11 15.42 (3).md");
  });
});

describe("image paths", () => {
  it("resolves addresses relative to the note", () => {
    expect(resolveRelative("Daily/2026-11-11.md", "../images/a.jpg")).toBe("images/a.jpg");
    expect(resolveRelative("Note.md", "images/a%20b.png")).toBe("images/a b.png");
    expect(resolveRelative("Note.md", "https://example.com/a.jpg")).toBeNull();
    expect(resolveRelative("Note.md", "../outside.jpg")).toBeNull();
  });
  it("writes addresses relative to the note", () => {
    expect(relativeFrom("Daily/2026-11-11.md", "images/a.jpg")).toBe("../images/a.jpg");
    expect(relativeFrom("Note.md", "images/a b.jpg")).toBe("images/a%20b.jpg");
    expect(relativeFrom("Stories/One.md", "Stories/pic.png")).toBe("pic.png");
  });
  it("only accepts pictures", () => {
    expect(() => checkFilePath("images/a.jpg")).not.toThrow();
    expect(() => checkFilePath("images/a.svg")).toThrow(NotePathError);
    expect(() => checkFilePath("../a.png")).toThrow(NotePathError);
  });
});
