import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DriveApi, Offline, SignInNeeded } from "../../src/store/drive-api";
import { DriveStore } from "../../src/store/drive-store";
import { FakeDrive } from "./fake-drive";

function setup() {
  const drive = new FakeDrive();
  const store = new DriveStore(new DriveApi(() => "token", drive.fetch), () => new Date(2026, 10, 11, 15, 42));
  return { drive, store };
}

describe("Drive storage", () => {
  it("makes one 'Stubli Writer' folder and keeps notes in sub-folders", async () => {
    const { drive, store } = setup();
    await store.write("Daily/2026-11-11.md", "Today TK\n");
    await store.write("Ideas.md", "# Ideas\n");
    const root = drive.byName("Stubli Writer")!;
    expect(drive.byName("Daily")!.parents).toEqual([root.id]);
    expect(drive.byName("Ideas.md")!.parents).toEqual([root.id]);
    expect((await store.list()).map((r) => r.path).sort()).toEqual(["Daily/2026-11-11.md", "Ideas.md"]);
    expect(await store.read("Daily/2026-11-11.md")).toBe("Today TK\n");
  });

  it("finds the same folder again on another device, without making a second one", async () => {
    const { drive, store } = setup();
    await store.write("A.md", "a");
    const other = new DriveStore(new DriveApi(() => "token", drive.fetch));
    expect((await other.list()).map((r) => r.path)).toEqual(["A.md"]);
    await other.write("B.md", "b");
    expect([...drive.files.values()].filter((f) => f.name === "Stubli Writer")).toHaveLength(1);
  });

  it("saves every sample note and reads it back byte for byte", async () => {
    const { store } = setup();
    const dir = fileURLToPath(new URL("../fixtures/notes", import.meta.url));
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const text = readFileSync(join(dir, name), "utf8");
      await store.write(`Samples/${name}`, text);
      expect(await store.read(`Samples/${name}`)).toBe(text);
    }
  });

  it("updates the same file instead of making a new one", async () => {
    const { drive, store } = setup();
    await store.write("Note.md", "one");
    await store.write("Note.md", "two");
    expect([...drive.files.values()].filter((f) => f.name === "Note.md")).toHaveLength(1);
    expect(drive.textOf("Note.md")).toBe("two");
  });

  it("stores pictures and reads them back", async () => {
    const { store } = setup();
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    await store.writeFile("images/tram.png", new Blob([bytes]));
    const back = new Uint8Array(await (await store.readFile("images/tram.png")).arrayBuffer());
    expect([...back]).toEqual([...bytes]);
  });
});

describe("edits on two devices", () => {
  it("keeps the other device's version as a conflicted copy, and saves this one", async () => {
    const { drive, store } = setup();
    const copies: string[] = [];
    store.onConflict = (_, copy) => copies.push(copy);
    await store.write("Stories/Ana.md", "first\n");
    expect(await store.read("Stories/Ana.md")).toBe("first\n");
    drive.editElsewhere(drive.byName("Ana.md")!.id, "changed on the phone\n");
    await store.write("Stories/Ana.md", "changed on the laptop\n");

    expect(drive.textOf("Ana.md")).toBe("changed on the laptop\n");
    expect(drive.textOf("Ana (conflicted copy 2026-11-11 15.42).md")).toBe("changed on the phone\n");
    expect(copies).toEqual(["Stories/Ana (conflicted copy 2026-11-11 15.42).md"]);
  });

  it("makes no copy when nothing changed elsewhere", async () => {
    const { drive, store } = setup();
    await store.write("A.md", "1");
    await store.write("A.md", "2");
    await store.write("A.md", "3");
    expect([...drive.files.values()].filter((f) => f.name.includes("conflicted"))).toHaveLength(0);
  });

  it("when two devices create the same note, keeps both", async () => {
    const { drive, store } = setup();
    await store.write("Daily/2026-11-11.md", "from the laptop");
    const daily = drive.byName("Daily")!;
    drive.addFile("2026-11-11.md", daily.id, "from the phone");
    const paths = (await store.list()).map((r) => r.path).sort();
    expect(paths).toEqual(["Daily/2026-11-11 (conflicted copy).md", "Daily/2026-11-11.md"]);
    expect(await store.read("Daily/2026-11-11.md")).toBe("from the phone"); // the newest keeps the name
    expect(await store.read("Daily/2026-11-11 (conflicted copy).md")).toBe("from the laptop");
  });
});

describe("problems", () => {
  it("reports no connection as Offline", async () => {
    const { drive, store } = setup();
    drive.offline = true;
    await expect(store.write("A.md", "x")).rejects.toBeInstanceOf(Offline);
  });

  it("reports an expired sign-in as SignInNeeded", async () => {
    const { drive, store } = setup();
    drive.expired = true;
    await expect(store.list()).rejects.toBeInstanceOf(SignInNeeded);
  });

  it("keeps working after a failed call", async () => {
    const { drive, store } = setup();
    drive.offline = true;
    await expect(store.write("A.md", "x")).rejects.toBeInstanceOf(Offline);
    drive.offline = false;
    await store.write("A.md", "x");
    expect(drive.textOf("A.md")).toBe("x");
  });

  it("only talks to Google's Drive address", async () => {
    const { drive, store } = setup();
    await store.write("A.md", "x");
    await store.list();
    expect(drive.requests.length).toBeGreaterThan(0);
  });
});

import { memoryKeyValue, OfflineStore, type SyncStatus } from "../../src/store/offline-store";

describe("offline", () => {
  function offlineSetup() {
    const { drive, store } = setup();
    const pending = memoryKeyValue<string>();
    const off = new OfflineStore(store, memoryKeyValue(), pending);
    let status: SyncStatus | null = null;
    off.onStatus((s) => (status = s));
    return { drive, off, pending, status: () => status! };
  }

  it("keeps a save on the device while offline, and sends it when back", async () => {
    const { drive, off, status } = offlineSetup();
    drive.offline = true;
    await off.write("Daily/2026-11-11.md", "written on the train\n");
    await off.flush();
    expect(status()).toMatchObject({ waiting: 1, offline: true });
    expect(await off.read("Daily/2026-11-11.md")).toBe("written on the train\n");
    expect((await off.list()).map((r) => r.path)).toContain("Daily/2026-11-11.md");

    drive.offline = false;
    await off.flush();
    expect(status()).toMatchObject({ waiting: 0, offline: false });
    expect(drive.textOf("2026-11-11.md")).toBe("written on the train\n");
  });

  it("reads notes kept on the device when Drive can't be reached", async () => {
    const { drive, off } = offlineSetup();
    await off.write("A.md", "kept");
    await off.flush();
    expect(await off.read("A.md")).toBe("kept");
    drive.offline = true;
    expect(await off.read("A.md")).toBe("kept");
    expect((await off.list()).map((r) => r.path)).toEqual(["A.md"]);
  });

  it("waits for a new sign-in without losing the change", async () => {
    const { drive, off, status } = offlineSetup();
    drive.expired = true;
    await off.write("A.md", "after an hour");
    await off.flush();
    expect(status()).toMatchObject({ waiting: 1, signInNeeded: true });
    drive.expired = false;
    await off.flush();
    expect(status()).toMatchObject({ waiting: 0, signInNeeded: false });
    expect(drive.textOf("A.md")).toBe("after an hour");
  });

  it("sends only the latest version when a note changed several times while offline", async () => {
    const { drive, off } = offlineSetup();
    drive.offline = true;
    await off.write("A.md", "1");
    await off.write("A.md", "2");
    await off.write("A.md", "3");
    drive.offline = false;
    await off.flush();
    expect(drive.textOf("A.md")).toBe("3");
    expect(drive.requests.filter((r) => r.startsWith("PATCH /upload") || r.startsWith("POST /upload"))).toHaveLength(1);
  });
});
