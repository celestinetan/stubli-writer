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
