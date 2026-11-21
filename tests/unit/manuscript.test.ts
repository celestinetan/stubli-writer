import { describe, expect, it } from "vitest";
import { chaptersOf, makeBook, ManuscriptError, parseXml, readManuscript, readMarkdown, splitChoices } from "../../src/app/manuscript";
import { readBook } from "../../src/app/books";
import { docx } from "../../src/export/docx";
import { zip } from "../../src/export/zip";
import { novel, p, wordFile } from "../fixtures/manuscript";
import { MemoryStore } from "../../src/store/memory-store";

const now = new Date(2026, 10, 21, 10, 0);
const enc = (s: string) => new TextEncoder().encode(s);
describe("importing a manuscript", () => {
  it("reads the small XML inside a Word file", () => {
    const root = parseXml(`<?xml version="1.0"?><!-- c --><a x="1 &amp; 2"><b/>te&#233;xt<c y='z'>in</c></a>`);
    const a = root.kids[0];
    expect(a.attrs.x).toBe("1 & 2");
    expect(a.kids.map((k) => k.name)).toEqual(["b", "#text", "c"]);
    expect(a.kids[1].text).toBe("teéxt");
    expect(a.kids[2].attrs.y).toBe("z");
  });

  it("reads a Word file: title, chapters at Heading 1, and the formatting the app keeps", async () => {
    const draft = await readManuscript("salt_road final.docx", novel());
    expect(draft.title).toBe("The Salt Road");
    expect(draft.leftOut).toEqual(["comments", "text marked as deleted in tracked changes", "footnotes", "the table of contents"]);

    const choices = splitChoices(draft);
    expect(choices.map((c) => [c.label, c.chapters])).toEqual([
      ["Each “Heading 1”", 3],
      ["Each “Heading 2”", 4],
      ["Each line like “Chapter 1” or “Prologue”", 3],
      ["Nowhere: one chapter", 1],
    ]);

    const { chapters, empty } = chaptersOf(draft, choices[0].split);
    expect(chapters.map((c) => [c.title, c.words])).toEqual([
      ["Before the first chapter", 3],
      ["Chapter One", 39],
      ["Chapter Two", 8],
    ]);
    // "Part Two" has nothing under it before the next chapter.
    expect(empty).toEqual(["Part Two"]);
    expect(chapters[1].markdown).toBe(
      [
        "Ines came **home** in *the rain*. 2 \\* 3 \\< 7 & so on.",
        "She read [the letter](https://example.org/a%20b) twice, fast.",
        "---",
        "1\\. The first thing she saw was the door.",
        "- Bread\n- Salt\n1. First",
        "> A line someone said.",
        "## The harbour",
        "Line one  \n*line two*",
        "![The quay at dusk](picture://0)",
        "![](picture://1)",
      ].join("\n\n"),
    );
    expect(chapters[2].markdown).toBe("| Year | What |\n| --- | --- |\n| 1901 | The storm \\| flood |\n\nThe end.");
  });

  it("makes the book: chapters in order, pictures saved, nothing written over", async () => {
    const store = new MemoryStore();
    await store.write("Books/The Salt Road.md", "---\ntype: book\n---\n# The Salt Road\n");
    const draft = await readManuscript("novel.docx", novel());
    const { chapters } = chaptersOf(draft, { by: "heading", level: 1 });
    const made = await makeBook(store, draft, [chapters[1], chapters[2], { ...chapters[2], title: "Chapter Two" }], " The Salt Road ", now);

    expect(made).toEqual({
      book: "Books/The Salt Road 2.md",
      title: "The Salt Road",
      chapters: ["Books/The Salt Road 2/Chapter One.md", "Books/The Salt Road 2/Chapter Two.md", "Books/The Salt Road 2/Chapter Two 2.md"],
      pictures: 1,
      picturesLeftOut: 1,
    });
    expect(await store.read("Books/The Salt Road.md")).toBe("---\ntype: book\n---\n# The Salt Road\n");
    const bookText = await store.read(made.book);
    expect(bookText).toContain("type: book\ncreated: 2026-11-21");
    const book = readBook({ path: made.book, title: "The Salt Road", text: bookText } as never);
    expect(book.chapters.map((c) => c.path)).toEqual(made.chapters);
    const one = await store.read(made.chapters[0]);
    expect(one.startsWith("---\ncreated: 2026-11-21\n---\n# Chapter One\n\nInes came **home**")).toBe(true);
    // The picture the app can show is saved and linked; the one it can't is taken out.
    expect(one).toContain("![The quay at dusk](../../images/The-Salt-Road-2-1.png)");
    expect(one).not.toContain("picture://");
    expect((await store.readFile("images/The-Salt-Road-2-1.png")).size).toBe(4);
  });

  it("finds chapters by lines like “Chapter 1” when there are no heading styles", async () => {
    const body = p("My Book") + p("Prologue") + p("It began.") + p("CHAPTER 1") + p("Chapter one of my life was dull, she said.") + p("Chapter 2: The Road") + p("Part of me knew.") + p("Epilogue") + p("Done.");
    const draft = await readManuscript("My Book.docx", wordFile(body));
    expect(draft.title).toBe("My Book");
    const choices = splitChoices(draft);
    expect(choices[0].label).toBe("Each line like “Chapter 1” or “Prologue”");
    expect(chaptersOf(draft, choices[0].split).chapters.map((c) => c.title)).toEqual(["Before the first chapter", "Prologue", "CHAPTER 1", "Chapter 2: The Road", "Epilogue"]);
  });

  it("reads a Markdown file as Google Docs saves it: one title, chapters, pictures written out at the end", () => {
    const md = [
      "---\ntags: draft\n---",
      "# The Salt Road",
      "*by A. Writer*",
      "## Chapter One",
      "Ines came **home**.\n\n![][image1]",
      "```\n## not a heading\n\nstill code\n```",
      "### The harbour",
      "Wet stone.",
      "## Chapter Two ##",
      "The end.",
      "[image1]: <data:image/png;base64,iVBORw==>",
    ].join("\n\n");
    const draft = readMarkdown(md);
    // The title is found the same way for every kind of file.
    expect(draft.pieces.filter((x) => x.heading).map((x) => [x.heading, x.text])).toEqual([[1, "The Salt Road"], [2, "Chapter One"], [3, "The harbour"], [2, "Chapter Two"]]);
    expect(draft.pictures.map((x) => [x.ext, [...x.data]])).toEqual([["png", [137, 80, 78, 71]]]);
  });

  it("cuts a Markdown manuscript at the level under its title", async () => {
    const md = "# The Salt Road\n\n*by A. Writer*\n\n## Chapter One\n\nInes came **home**.\n\n### The harbour\n\nWet stone.\n\n## Chapter Two\n\nThe end.\n";
    const draft = await readManuscript("road.md", new TextEncoder().encode(md));
    expect(draft.title).toBe("The Salt Road");
    const choices = splitChoices(draft);
    expect(choices[0]).toEqual({ split: { by: "heading", level: 2 }, label: "Each “Heading 2”", chapters: 3 });
    const { chapters } = chaptersOf(draft, choices[0].split);
    expect(chapters.map((c) => c.title)).toEqual(["Before the first chapter", "Chapter One", "Chapter Two"]);
    expect(chapters[1].markdown).toBe("Ines came **home**.\n\n## The harbour\n\nWet stone.");
    // As one chapter, the book's title names it and the headings keep their order of size.
    const whole = chaptersOf(draft, { by: "none" }).chapters;
    expect(whole.map((c) => c.title)).toEqual(["The Salt Road"]);
    expect(whole[0].markdown).toContain("## Chapter One\n\nInes came **home**.\n\n### The harbour");
  });

  it("reads back a Word file the app itself exported", async () => {
    const chapter = (title: string, text: string) => ({ title, subtitle: "", blocks: [{ t: "para" as const, spans: [{ text }, { text: " really", italic: true }] }, { t: "break" as const }, { t: "para" as const, spans: [{ text: "After." }] }] });
    for (const style of ["manuscript", "clean"] as const) {
      const bytes = docx({ details: { title: "Lisbon stories", subtitle: "", author: "A. Writer" }, chapters: [chapter("The tram", "It left"), chapter("The letters", "Ana wrote")], images: new Map(), style, titlePage: true });
      const draft = await readManuscript("Lisbon.docx", bytes);
      const best = splitChoices(draft)[0];
      const chapters = chaptersOf(draft, best.split).chapters.filter((c) => c.title !== "Before the first chapter");
      expect(chapters.map((c) => c.title.toLowerCase()), style).toEqual(["the tram", "the letters"]);
      expect(chapters[0].markdown, style).toBe("It left *really*\n\n---\n\nAfter.");
    }
  });

  it("says what it can't read, in plain words", async () => {
    await expect(readManuscript("old.doc", enc("x"))).rejects.toThrow("Older Word files (.doc) can't be read.");
    await expect(readManuscript("book.pdf", enc("x"))).rejects.toThrow(ManuscriptError);
    await expect(readManuscript("broken.docx", enc("not a zip"))).rejects.toThrow("couldn't be opened as a Word document");
    await expect(readManuscript("empty.docx", zip([{ name: "a.txt", data: "x" }]))).rejects.toThrow("couldn't be opened as a Word document");
    // A text file with no headings is one chapter, named after the file.
    const draft = await readManuscript("My_story.txt", enc("Once.\n\nTwice."));
    expect(draft.title).toBe("My story");
    expect(splitChoices(draft).map((c) => c.label)).toEqual(["Nowhere: one chapter"]);
    expect(chaptersOf(draft, { by: "none" }).chapters).toEqual([{ title: "My story", markdown: "Once.\n\nTwice.", words: 2 }]);
  });
});
