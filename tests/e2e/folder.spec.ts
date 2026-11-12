import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// The real FolderStore, in real Chrome, on the browser's private storage (the same file API
// a folder picked by the person uses). Runs once, on the laptop size.
test.skip(({ isMobile }) => isMobile, "Folder storage is a computer feature.");

const DIR = fileURLToPath(new URL("../fixtures/notes", import.meta.url));
const samples = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => [f, readFileSync(join(DIR, f), "utf8")]),
);

test.beforeEach(async ({ page }) => {
  await page.goto("/selftest.html");
  await page.waitForFunction(() => "stubliSelftest" in window);
});

test("saves every sample note to a folder and reads it back unchanged", async ({ page }) => {
  const result = await page.evaluate(async (notes) => {
    const store = await window.stubliSelftest.freshFolder();
    const changed: string[] = [];
    for (const [name, text] of Object.entries(notes)) {
      await store.write(`Samples/${name}`, text);
      if ((await store.read(`Samples/${name}`)) !== text) changed.push(name);
      // Open and save again, as the app will.
      const again = window.stubliSelftest.serializeNote(window.stubliSelftest.parseNote(await store.read(`Samples/${name}`)));
      await store.write(`Samples/${name}`, again);
      if ((await store.read(`Samples/${name}`)) !== text) changed.push(`${name} (second save)`);
    }
    return { changed, listed: (await store.list()).length };
  }, samples);

  expect(result.changed).toEqual([]);
  expect(result.listed).toBe(Object.keys(samples).length);
});

test("lists notes in sub-folders, newest first, and skips hidden folders and other files", async ({ page }) => {
  const paths = await page.evaluate(async () => {
    const { store, dir } = await window.stubliSelftest.freshFolderWithHandle();
    await store.write("Older.md", "a");
    await new Promise((r) => setTimeout(r, 30));
    await store.write("Daily/2026-11-11.md", "b");
    // Things that aren't notes: a hidden folder (like .obsidian or .git), another tool's folder,
    // and a file that isn't Markdown.
    const put = async (folder: FileSystemDirectoryHandle, name: string) => {
      const w = await (await folder.getFileHandle(name, { create: true })).createWritable();
      await w.write("x");
      await w.close();
    };
    await put(await dir.getDirectoryHandle(".obsidian", { create: true }), "workspace.md");
    await put(await dir.getDirectoryHandle("node_modules", { create: true }), "readme.md");
    await put(dir, "photo.jpg");
    return (await store.list()).map((r) => r.path);
  });
  expect(paths).toEqual(["Daily/2026-11-11.md", "Older.md"]);
});

test("removes a note, and keeps the Trash folder out of the list", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const store = await window.stubliSelftest.freshFolder();
    await store.write("Ideas/Old.md", "# Old\n");
    await store.write("Trash/Older.md", "# Older\n");
    await store.write("Keep.md", "# Keep\n");
    await store.remove("Ideas/Old.md");
    return { exists: await store.exists("Ideas/Old.md"), listed: (await store.list()).map((r) => r.path) };
  });
  expect(result.exists).toBe(false);
  expect(result.listed).toEqual(["Keep.md"]);
});

test("refuses unsafe paths and reports missing notes plainly", async ({ page }) => {
  const out = await page.evaluate(async () => {
    const store = await window.stubliSelftest.freshFolder();
    const errors: string[] = [];
    for (const p of ["../escape.md", ".obsidian/workspace.md", "notes.txt"]) {
      try {
        await store.write(p, "x");
        errors.push(`wrote ${p}`);
      } catch (e) {
        errors.push((e as Error).name === "NotePathError" || (e as Error).message.includes("isn't") ? "refused" : String(e));
      }
    }
    return { errors, exists: await store.exists("Nope.md") };
  });
  expect(out.errors).toEqual(["refused", "refused", "refused"]);
  expect(out.exists).toBe(false);
});

test("a header change keeps the rest of the file", async ({ page }) => {
  const text = samples["12-unknown-fields.md"];
  const after = await page.evaluate(async (t) => {
    const s = window.stubliSelftest;
    const store = await s.freshFolder();
    await store.write("Note.md", t);
    const updated = s.serializeNote(s.writeFields(s.parseNote(await store.read("Note.md")), { tags: ["travel"] }));
    await store.write("Note.md", updated);
    return store.read("Note.md");
  }, text);
  expect(after).toContain("aliases: [Ana Sousa, Annie]\ncssclass: wide\nnested:\n  a: 1\n  b: [x, y]\ntags: [travel]\n---\n");
  expect(after.endsWith("Obsidian-style header.\n")).toBe(true);
});

test("saves a picture next to the notes and reads it back", async ({ page }) => {
  const out = await page.evaluate(async () => {
    const store = await window.stubliSelftest.freshFolder();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    await store.writeFile("images/20261111-tram.png", new Blob([bytes], { type: "image/png" }));
    const back = new Uint8Array(await (await store.readFile("images/20261111-tram.png")).arrayBuffer());
    let refused = false;
    try {
      await store.writeFile("images/evil.svg", new Blob(["<svg/>"]));
    } catch {
      refused = true;
    }
    return { same: back.join(",") === bytes.join(","), refused, notes: (await store.list()).length };
  });
  expect(out).toEqual({ same: true, refused: true, notes: 0 });
});

test.describe("edits made in another app", () => {
  test("a note changed outside since Writer read it is kept as a conflicted copy", async ({ page }) => {
    const out = await page.evaluate(async () => {
      const { store, dir } = await window.stubliSelftest.freshFolderWithHandle();
      const copies: string[] = [];
      store.onConflict = (_path, copy) => copies.push(copy);
      await store.write("Stories/Ana.md", "first\n");
      await store.read("Stories/Ana.md");
      // Another app (Obsidian, TextEdit…) saves the same file.
      await new Promise((r) => setTimeout(r, 20));
      const stories = await dir.getDirectoryHandle("Stories");
      const w = await (await stories.getFileHandle("Ana.md")).createWritable();
      await w.write("changed in Obsidian\n");
      await w.close();
      // Writer saves its own version.
      await store.write("Stories/Ana.md", "changed in Writer\n");
      const paths = (await store.list()).map((r) => r.path).sort();
      const copy = paths.find((p) => p.includes("conflicted copy"));
      return { paths, copies, mine: await store.read("Stories/Ana.md"), theirs: copy ? await store.read(copy) : null };
    });
    expect(out.paths).toHaveLength(2);
    expect(out.mine).toBe("changed in Writer\n");
    expect(out.theirs).toBe("changed in Obsidian\n");
    expect(out.copies).toHaveLength(1);
  });

  test("no copy when nothing changed outside, however often Writer saves", async ({ page }) => {
    const paths = await page.evaluate(async () => {
      const store = await window.stubliSelftest.freshFolder();
      await store.write("A.md", "1");
      await store.read("A.md");
      for (const t of ["2", "3", "4"]) await store.write("A.md", t);
      return (await store.list()).map((r) => r.path);
    });
    expect(paths).toEqual(["A.md"]);
  });

  test("no copy when the outside change is identical to Writer's", async ({ page }) => {
    const paths = await page.evaluate(async () => {
      const { store, dir } = await window.stubliSelftest.freshFolderWithHandle();
      await store.write("A.md", "same");
      await new Promise((r) => setTimeout(r, 20));
      const w = await (await dir.getFileHandle("A.md")).createWritable();
      await w.write("same new");
      await w.close();
      await store.write("A.md", "same new");
      return (await store.list()).map((r) => r.path);
    });
    expect(paths).toEqual(["A.md"]);
  });
});

test("a note that appeared on disk before Writer's first save is kept too", async ({ page, isMobile }) => {
  test.skip(isMobile);
  const out = await page.evaluate(async () => {
    const { store, dir } = await window.stubliSelftest.freshFolderWithHandle();
    // Today's note arrives from another computer (a sync service) after Writer opened Today.
    const daily = await dir.getDirectoryHandle("Daily", { create: true });
    const w = await (await daily.getFileHandle("2026-11-12.md", { create: true })).createWritable();
    await w.write("written on the other Mac\n");
    await w.close();
    await store.write("Daily/2026-11-12.md", "written here\n");
    return (await store.list()).map((r) => r.path).sort();
  });
  expect(out).toHaveLength(2);
  expect(out.some((p) => p.includes("conflicted copy"))).toBe(true);
});
