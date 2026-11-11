import { describe, expect, it } from "vitest";
import { checkPath, NotePathError } from "../../src/store/store";
import { MemoryStore } from "../../src/store/memory-store";

describe("note paths", () => {
  it.each(["Lisbon trip.md", "Daily/2026-11-11.md", "Books/The Tram/01 Arrival.md"])("allows %s", (p) => {
    expect(() => checkPath(p)).not.toThrow();
  });

  it.each(["", "/etc/passwd.md", "../outside.md", "a/../b.md", ".hidden.md", "Notes/.git/x.md", "a//b.md", "note.txt", "C:\\x.md"])(
    "refuses %s",
    (p) => {
      expect(() => checkPath(p)).toThrow(NotePathError);
    },
  );
});

describe("memory store", () => {
  it("writes, lists, reads and reports what exists", async () => {
    const s = new MemoryStore();
    await s.write("Daily/2026-11-11.md", "Today TK\n");
    expect(await s.exists("Daily/2026-11-11.md")).toBe(true);
    expect(await s.exists("Daily/2026-11-12.md")).toBe(false);
    expect(await s.read("Daily/2026-11-11.md")).toBe("Today TK\n");
    expect((await s.list()).map((r) => [r.path, r.name])).toEqual([["Daily/2026-11-11.md", "2026-11-11"]]);
  });

  it("says plainly when a note isn't there", async () => {
    await expect(new MemoryStore().read("Missing.md")).rejects.toThrow('There\'s no note called "Missing".');
  });
});
