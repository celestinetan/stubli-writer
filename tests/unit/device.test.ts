import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DeviceStore, memoryDeviceDb } from "../../src/store/device-store";
import { makeBackup, restoreBackup, unzip } from "../../src/app/backup";
import { loadLibrary } from "../../src/app/library";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9]);

async function filled() {
  const s = new DeviceStore(memoryDeviceDb());
  await s.write("Daily/2026-11-18.md", "# Wednesday\n\nOn the tram. TK\n");
  await s.write("Essays/Walking.md", "# Walking\n\n![Rua](images/rua.png)\n");
  await s.write("Trash/Old.md", "# Old\n");
  await s.writeFile("Essays/images/rua.png", new Blob([png], { type: "image/png" }));
  return s;
}

describe("notes on this device", () => {
  it("writes, lists newest first, reads, removes, and keeps pictures", async () => {
    const s = await filled();
    expect((await s.list()).map((r) => r.path).sort()).toEqual(["Daily/2026-11-18.md", "Essays/Walking.md", "Trash/Old.md"]);
    expect(await s.read("Essays/Walking.md")).toContain("![Rua]");
    await s.remove("Trash/Old.md");
    expect(await s.exists("Trash/Old.md")).toBe(false);
    expect(new Uint8Array(await (await s.readFile("Essays/images/rua.png")).arrayBuffer())).toEqual(png);
    expect(await s.listFiles()).toEqual(["Essays/images/rua.png"]);
    await expect(s.read("Nope.md")).rejects.toThrow('There\'s no note called "Nope".');
  });
});

describe("backups", () => {
  it("one .zip with every note but the Trash, and the pictures, inside a dated folder", async () => {
    const s = await filled();
    const b = await makeBackup(s, await loadLibrary(s), new Date(2026, 10, 18));
    expect(b.name).toBe("Stubli Writer backup 2026-11-18.zip");
    expect([b.notes, b.pictures]).toEqual([2, 1]);
    // Opens with the Mac's own unzip.
    const dir = mkdtempSync(join(tmpdir(), "stubli-backup-"));
    writeFileSync(join(dir, b.name), b.bytes);
    execFileSync("unzip", ["-q", b.name], { cwd: dir });
    expect(readFileSync(join(dir, "Stubli Writer backup 2026-11-18/Essays/Walking.md"), "utf8")).toContain("# Walking");
  });

  it("restores into an empty place exactly, and keeps both when a note has changed since", async () => {
    const s = await filled();
    const b = await makeBackup(s, await loadLibrary(s));
    const files = await unzip(b.bytes);

    const empty = new DeviceStore(memoryDeviceDb());
    const r1 = await restoreBackup(empty, files, []);
    expect(r1).toMatchObject({ restored: 2, keptBoth: 0, pictures: 1 });
    expect(await empty.read("Daily/2026-11-18.md")).toBe("# Wednesday\n\nOn the tram. TK\n");

    await s.write("Daily/2026-11-18.md", "# Wednesday\n\nChanged after the backup.\n");
    const r2 = await restoreBackup(s, files, await loadLibrary(s));
    expect(r2).toMatchObject({ restored: 0, keptBoth: 1, same: 1 });
    expect(await s.read("Daily/2026-11-18.md")).toContain("Changed after the backup.");
    expect(await s.read("Daily/2026-11-18 (restored).md")).toContain("On the tram.");
  });

  it("reads a .zip the Mac made (compressed), skipping its extras", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stubli-zip-"));
    writeFileSync(join(dir, "Note.md"), "# Note\n\n" + "words ".repeat(200));
    execFileSync("zip", ["-q", "-9", "notes.zip", "Note.md"], { cwd: dir });
    const files = await unzip(new Uint8Array(readFileSync(join(dir, "notes.zip"))));
    expect(files.map((f) => f.path)).toEqual(["Note.md"]);
    expect(new TextDecoder().decode(files[0].data)).toContain("words words");
  });

  it("says plainly when a file isn't a .zip", async () => {
    await expect(unzip(new TextEncoder().encode("not a zip at all, sorry"))).rejects.toThrow("That isn't a .zip file.");
  });
});
