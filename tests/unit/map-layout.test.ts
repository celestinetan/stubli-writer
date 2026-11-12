import { describe, expect, it } from "vitest";
import { characters } from "../../src/app/characters";
import { CARD_H, CARD_W, mapLines, mapPlaces, readPlaces, writePlaces } from "../../src/app/map-layout";
import { describeNote } from "../../src/app/library";

const note = (path: string, text: string) => describeNote(path, text, 0);
const card = (name: string, links = "") => note(`Books/B/Characters/${name}.md`, `# ${name}\n\n## Connections\n\n${links}`);

const cast = characters(
  [
    note("Books/B.md", "---\ntype: book\n---\n# B\n"),
    card("Ana", "- Marta: owes her a bicycle\n- Rui\n"),
    card("Marta", "- Ana: owes her a bicycle\n- Gio: the dog she talks to\n"),
    card("Rui"),
    card("Gio"),
    card("Zé"),
  ],
  { path: "Books/B.md", chapters: [] },
);
const p = (name: string) => `Books/B/Characters/${name}.md`;

describe("the characters map", () => {
  it("draws any connection once per pair, with each side's own words", () => {
    const name = (p: string) => p.split("/").pop()!.replace(".md", "");
    expect(mapLines(cast).map((l) => [name(l.a), name(l.b), l.aIs, l.bIs])).toEqual([
      // On Ana's card, Marta "owes her a bicycle"; on Marta's card, Ana does too.
      ["Ana", "Marta", "owes her a bicycle", "owes her a bicycle"],
      ["Ana", "Rui", "", ""],
      // Written on Marta's card: what Gio is to her.
      ["Gio", "Marta", "the dog she talks to", ""],
    ]);
  });

  it("places new cards loosely, never on top of each other or of cards you placed", () => {
    const saved = { [p("Rui")]: { x: 0, y: 0 } };
    const places = mapPlaces(cast, saved);
    expect(places[p("Rui")]).toEqual({ x: 0, y: 0 });
    const all = Object.values(places);
    for (const a of all)
      for (const b of all) if (a !== b) expect(Math.abs(a.x - b.x) >= CARD_W + 16 || Math.abs(a.y - b.y) >= CARD_H + 16).toBe(true);
  });

  it("keeps places as one plain line", () => {
    const saved = readPlaces("Ana 500 20; Zé 7 9; Someone else 1 1", cast);
    expect(saved[p("Ana")]).toEqual({ x: 500, y: 20 });
    expect(writePlaces(saved, cast)).toBe("Ana 500 20; Zé 7 9");
  });
});
