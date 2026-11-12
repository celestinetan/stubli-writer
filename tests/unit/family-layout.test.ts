import { describe, expect, it } from "vitest";
import { characters } from "../../src/app/characters";
import { CARD_H, familyLayout, familyLines, readPlaces, writePlaces } from "../../src/app/family-layout";
import { describeNote } from "../../src/app/library";

const note = (path: string, text: string) => describeNote(path, text, 0);
const card = (name: string, links = "") => note(`Books/B/Characters/${name}.md`, `# ${name}\n\n## Connections\n\n${links}`);

const cast = characters(
  [
    note("Books/B.md", "---\ntype: book\n---\n# B\n"),
    card("Ana", "- Marta: mother\n- Rui: brother\n- Gio: old rival\n"),
    card("Marta", "- Zé: husband\n"),
    card("Zé"),
    card("Rui"),
    card("Gio"),
    card("Nobody"),
  ],
  { path: "Books/B.md", chapters: [] },
);
const at = (places: Record<string, { x: number; y: number }>, name: string) => places[`Books/B/Characters/${name}.md`];

describe("the family tree", () => {
  const places = familyLayout(cast);

  it("puts parents above children, partners and siblings on the same row", () => {
    expect(at(places, "Marta").y).toBe(0);
    expect(at(places, "Zé").y).toBe(0);
    expect(at(places, "Ana").y).toBeGreaterThan(0);
    expect(at(places, "Rui").y).toBe(at(places, "Ana").y);
    expect(Math.abs(at(places, "Marta").x - at(places, "Zé").x)).toBeLessThan(250);
  });

  it("puts people without family here on a row of their own underneath", () => {
    expect(at(places, "Gio").y).toBeGreaterThan(at(places, "Ana").y);
    expect(at(places, "Nobody").y).toBe(at(places, "Gio").y);
    expect(at(places, "Gio").y % (CARD_H + 96)).toBe(0);
  });

  it("draws each connection once, parent lines from the parent", () => {
    const lines = familyLines(cast).map((l) => `${l.from.split("/").pop()}>${l.to.split("/").pop()} ${l.kind} ${l.words}`.trim());
    expect(lines.sort()).toEqual(["Ana.md>Gio.md other old rival", "Ana.md>Rui.md sibling brother", "Marta.md>Ana.md parent mother", "Marta.md>Zé.md partner husband"].sort());
  });

  it("keeps places the writer chose, saved as one plain line", () => {
    const saved = readPlaces("Ana 500 20; Nobody 7 9; Someone else 1 1", cast);
    expect(at(familyLayout(cast, saved), "Ana")).toEqual({ x: 500, y: 20 });
    expect(writePlaces(saved, cast)).toBe("Ana 500 20; Nobody 7 9");
  });
});
