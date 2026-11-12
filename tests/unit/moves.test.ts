import { describe, expect, it } from "vitest";
import { folderMoves, freePath, isWithin, rewriteLinks, safeName, withTitle } from "../../src/app/moves";

describe("moving notes", () => {
  const text = `---\ncreated: 2026-11-12\n---\n# Trip\n\n![Tram](images/tram%2015.jpg "The 15"){.wide}\n\nSee [ideas](../Ideas.md#walks), [the web](https://example.com) and <img src="images/a.png">.\n`;

  it("keeps pictures and links pointing at the same files from the new place", () => {
    expect(rewriteLinks(text, "Travel/Trip.md", "Archive/2026/Trip.md")).toBe(
      `---\ncreated: 2026-11-12\n---\n# Trip\n\n![Tram](../../Travel/images/tram%2015.jpg "The 15"){.wide}\n\nSee [ideas](../../Ideas.md#walks), [the web](https://example.com) and <img src="../../Travel/images/a.png">.\n`,
    );
  });

  it("changes nothing when the note stays in its folder", () => {
    expect(rewriteLinks(text, "Travel/Trip.md", "Travel/Lisbon trip.md")).toBe(text);
  });

  it("moves everything inside a folder, keeping its place", () => {
    expect(folderMoves(["Essays/A.md", "Essays/Old/B.md", "Essayist.md", "C.md"], "Essays", "Archive/Essays")).toEqual([
      ["Essays/A.md", "Archive/Essays/A.md"],
      ["Essays/Old/B.md", "Archive/Essays/Old/B.md"],
    ]);
    expect(isWithin("Essays/Old", "Essays")).toBe(true);
    expect(isWithin("Essayist", "Essays")).toBe(false);
  });

  it("never overwrites, and makes names files can have", () => {
    expect(freePath("A.md", (p) => p === "A.md" || p === "A 2.md")).toBe("A 3.md");
    expect(safeName(" Notes: 2026/11 ")).toBe("Notes 2026 11");
  });

  it("renames by changing the title line, or adding one", () => {
    expect(withTitle("---\nx: 1\n---\n# Old\n\nText\n", "New")).toBe("---\nx: 1\n---\n# New\n\nText\n");
    expect(withTitle("Just text\n", "New")).toBe("# New\n\nJust text\n");
  });
});
