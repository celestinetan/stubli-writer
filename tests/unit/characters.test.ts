import { describe, expect, it } from "vitest";
import { characterPath, characters, characterTemplate, namePattern, parseConnection } from "../../src/app/characters";
import { describeNote } from "../../src/app/library";

const note = (path: string, text: string) => describeNote(path, text, 0);

const JAMES = `---
type: character
---
# James

Role: Lead
Also called: Jim

The perfect employee; no family left.

## Connections

- Gio: partner, met on the cruise
- [Mrs Lopes](Mrs%20Lopes.md) — his landlady
- The captain
`;
const GIO = `# Gio\n\nThe Italian version of James.\n`;
const STORY = `# The Surrendering\n\nJames was the perfect employee. Jim, they called him.\n\nJames met Gio on his second week. Gioia is not Gio.\n`;

describe("character cards", () => {
  const notes = [note("Characters/James.md", JAMES), note("Characters/Gio.md", GIO), note("Characters/Mrs Lopes.md", "# Mrs Lopes\n"), note("Story.md", STORY)];
  const cast = characters(notes);
  const james = cast.find((c) => c.name === "James")!;
  const gio = cast.find((c) => c.name === "Gio")!;

  it("reads name, role, other names and the first paragraph as the summary", () => {
    expect(james).toMatchObject({ role: "Lead", aliases: ["Jim"], summary: "The perfect employee; no family left." });
    expect(gio.summary).toBe("The Italian version of James.");
  });

  it("connects cards both ways from one line, by name or by link", () => {
    expect(james.connections).toEqual([
      { path: "Characters/Gio.md", name: "Gio", label: "partner, met on the cruise", fromOther: false },
      { path: "Characters/Mrs Lopes.md", name: "Mrs Lopes", label: "his landlady", fromOther: false },
      { path: null, name: "The captain", label: "", fromOther: false },
    ]);
    expect(gio.connections).toEqual([{ path: "Characters/James.md", name: "James", label: "partner, met on the cruise", fromOther: true }]);
  });

  it("finds mentions as whole words, counting other names, never inside a word", () => {
    expect(james.mentions.map((m) => [m.note.path, m.count])).toEqual([["Story.md", 3]]);
    expect(gio.mentions.map((m) => [m.note.path, m.count])).toEqual([["Story.md", 2]]);
    expect(james.mentions[0].context).toBe("James was the perfect employee. Jim, they called him.");
  });

  it("gives each card its own tint, in turn", () => {
    expect(cast.map((c) => c.tint)).toEqual([1, 2, 3]);
  });

  it("a note says it's a card with type: character, wherever it is", () => {
    const cast2 = characters([note("Ana.md", "---\ntype: character\n---\n# Ana\n"), note("Plain.md", "# Plain\n")]);
    expect(cast2.map((c) => c.name)).toEqual(["Ana"]);
  });
});

describe("connections and names", () => {
  it("reads the ways people write a connection", () => {
    expect(parseConnection("Gio: partner")).toEqual({ name: "Gio", label: "partner", target: null });
    expect(parseConnection("Gio – partner")).toEqual({ name: "Gio", label: "partner", target: null });
    expect(parseConnection("Ana Sousa")).toEqual({ name: "Ana Sousa", label: "", target: null });
    expect(parseConnection("[Ana](Ana.md): sister")).toEqual({ name: "Ana", label: "sister", target: "Ana.md" });
    expect(parseConnection("")).toBeNull();
  });
  it("matches longer names first", () => {
    const p = namePattern(["Ana", "Ana Sousa"])!;
    expect([..."Ana Sousa and Ana, not Anabel".matchAll(p)].map((m) => m[0])).toEqual(["Ana Sousa", "Ana"]);
  });
  it("makes a safe file name and a starting card", () => {
    expect(characterPath("Mrs. Lopes / the landlady")).toBe("Characters/Mrs. Lopes the landlady.md");
    expect(characterPath("  ")).toBeNull();
    expect(characterTemplate("Ana", "2026-11-12")).toContain("# Ana\n\nRole: \n\nAlso called: \n\n## Connections\n");
  });
});
