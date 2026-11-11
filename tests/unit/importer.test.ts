import { describe, expect, it } from "vitest";
import { importFiles, importFolderName } from "../../src/app/importer";
import { MemoryStore } from "../../src/store/memory-store";

const now = new Date(2026, 10, 11, 16, 0);
const text = (s: string) => new Blob([s]);

describe("importing notes", () => {
  it("brings a whole exported folder in, keeping its sub-folders and pictures", async () => {
    const store = new MemoryStore();
    const result = await importFiles(
      store,
      [
        { path: "Bear export/Lisbon.md", file: text("# Lisbon\n\n![tram](images/tram.jpg)") },
        { path: "Bear export/images/tram.jpg", file: new Blob([new Uint8Array([255, 216, 255])]) },
        { path: "Bear export/Trips/Porto.markdown", file: text("# Porto") },
        { path: "Bear export/.obsidian/workspace.json", file: text("{}") },
        { path: "Bear export/.DS_Store", file: text("") },
        { path: "Bear export/notes.pdf", file: text("%PDF") },
      ],
      now,
    );
    expect(result.folder).toBe("Imported/Bear export");
    expect(result.notes.sort()).toEqual(["Imported/Bear export/Lisbon.md", "Imported/Bear export/Trips/Porto.md"]);
    expect(result.pictures).toEqual(["Imported/Bear export/images/tram.jpg"]);
    expect(result.skipped).toEqual(["Bear export/notes.pdf"]);
    // Copied exactly; the picture link still points the right way.
    expect(await store.read("Imported/Bear export/Lisbon.md")).toBe("# Lisbon\n\n![tram](images/tram.jpg)");
  });

  it("puts loose files in a dated folder", async () => {
    expect(importFolderName([{ path: "A.md", file: text("") }], now)).toBe("Imported/2026-11-11");
  });

  it("never overwrites a note: a taken name gets (2)", async () => {
    const store = new MemoryStore({ "Imported/2026-11-11/Ideas.md": "mine" });
    const r = await importFiles(store, [{ path: "Ideas.md", file: text("theirs") }], now);
    expect(r.notes).toEqual(["Imported/2026-11-11/Ideas (2).md"]);
    expect(await store.read("Imported/2026-11-11/Ideas.md")).toBe("mine");
  });

  it("turns plain-text notes into .md and keeps a byte-order mark", async () => {
    const store = new MemoryStore();
    const r = await importFiles(store, [{ path: "Old.txt", file: text("﻿From Windows") }], now);
    expect(r.notes).toEqual(["Imported/2026-11-11/Old.md"]);
    expect(await store.read("Imported/2026-11-11/Old.md")).toBe("﻿From Windows");
  });

  it("makes odd file names safe", async () => {
    const store = new MemoryStore();
    const r = await importFiles(store, [{ path: 'What? "Yes": no.md', file: text("x") }], now);
    expect(r.notes).toEqual(["Imported/2026-11-11/What- -Yes-- no.md"]);
  });
});
