import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clean, noteToChapter, picturesIn, wordCount } from "../../src/export/model";
import { crc32, zip } from "../../src/export/zip";
import { docx } from "../../src/export/docx";
import { epub } from "../../src/export/epub";

const NOTE = `---
created: 2026-11-12
---
# The cruise

#### Where it starts

@James was the perfect employee. He met @Gio in TK and @tk[the month].
A second line, **bold**, *italic*, \`code\` and [a link](https://example.com).

> [!pull]
> A pull quote.

- one
- two

---

![The deck](images/deck.png "The deck at night"){.wide}

| Port | Day |
|---|---|
| Lisbon | 1 |

## Later
Tom & Jerry <3.
`;

/** Opens the archive with Python's zipfile, checks every XML file parses, and lists the names. */
function check(bytes: Uint8Array): { names: string[]; text: (name: string) => string } {
  const dir = mkdtempSync(join(tmpdir(), "stubli-export-"));
  const file = join(dir, "out.zip");
  writeFileSync(file, bytes);
  const out = execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `import zipfile, json, sys, xml.dom.minidom as m
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
files = {}
for n in z.namelist():
    d = z.read(n)
    if n.endswith((".xml", ".xhtml", ".opf", ".ncx", ".rels")): m.parseString(d)
    files[n] = d.decode("utf-8", "replace")
print(json.dumps({"names": z.namelist(), "files": files, "first": z.infolist()[0].compress_type}))`,
      file,
    ],
    { encoding: "utf8" },
  );
  const r = JSON.parse(out) as { names: string[]; files: Record<string, string>; first: number };
  expect(r.first).toBe(0); // stored
  return { names: r.names, text: (n) => r.files[n] };
}

describe("the export model", () => {
  const c = noteToChapter("Books/B/The cruise.md", NOTE);

  it("takes the title and subtitle, and drops @ before names", () => {
    expect(c.title).toBe("The cruise");
    expect(c.subtitle).toBe("Where it starts");
    expect(c.blocks[0]).toEqual({
      t: "para",
      spans: [
        { text: "James was the perfect employee. He met Gio in [TK] and [TK: the month]. A second line, " },
        { text: "bold", bold: true },
        { text: ", " },
        { text: "italic", italic: true },
        { text: ", " },
        { text: "code", code: true },
        { text: " and " },
        { text: "a link", href: "https://example.com" },
        { text: "." },
      ],
    });
  });

  it("keeps quotes, lists, breaks, pictures (with their place in the notes folder) and tables", () => {
    expect(c.blocks.map((b) => b.t)).toEqual(["para", "quote", "list", "break", "image", "table", "heading", "para"]);
    expect(c.blocks[4]).toEqual({ t: "image", path: "Books/B/images/deck.png", alt: "The deck", caption: "The deck at night", size: "wide" });
    expect(c.blocks[5]).toEqual({ t: "table", rows: [["Port", "Day"], ["Lisbon", "1"]] });
    expect(picturesIn([c])).toEqual(["Books/B/images/deck.png"]);
    expect(wordCount([c])).toBeGreaterThan(30);
  });

  it("never marks a gap twice, and leaves email addresses alone", () => {
    expect(clean("TK, @tk[x] and ana@gio.com")).toBe("[TK], [TK: x] and ana@gio.com");
  });
});

describe("files", () => {
  const c = noteToChapter("Books/B/The cruise.md", NOTE);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const images = new Map([["Books/B/images/deck.png", { data: png, type: "image/png", width: 1200, height: 800 }]]);
  const details = { title: "The Surrendering", subtitle: "A novel", author: "Celestine Tan" };

  it("zip: a known checksum", () => {
    expect(crc32(new TextEncoder().encode("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
    const z = check(zip([{ name: "a/ü.txt", data: "hello" }]));
    expect(z.names).toEqual(["a/ü.txt"]);
  });

  it("Word, manuscript: title page with word count, running head, chapters, picture, link", () => {
    const z = check(docx({ details, chapters: [c, { ...c, title: "Two" }], images, style: "manuscript", titlePage: true }));
    expect(z.names).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "word/document.xml", "word/styles.xml", "word/header1.xml", "word/media/image1.png", "word/_rels/document.xml.rels"]),
    );
    const doc = z.text("word/document.xml");
    expect(doc).toContain("THE SURRENDERING");
    expect(doc).toMatch(/about \d+ words/);
    expect(doc).toContain("Tom &amp; Jerry &lt;3.");
    expect(doc).toContain('<w:pStyle w:val="ChapterTitle"/>');
    expect(doc).toContain("<w:titlePg/>");
    expect(doc).toContain(">#<");
    expect(z.text("word/header1.xml")).toContain("Tan / THE SURRENDERING / ");
    expect(z.text("word/styles.xml")).toContain('w:line="480"');
    expect(z.text("word/_rels/document.xml.rels")).toContain('Target="https://example.com" TargetMode="External"');
  });

  it("Word, clean: no running head, single note with its title on top", () => {
    const z = check(docx({ details: { ...details, author: "" }, chapters: [c], images: new Map(), style: "clean", titlePage: false }));
    const doc = z.text("word/document.xml");
    expect(doc).not.toContain("headerReference");
    expect(doc).toContain('<w:pStyle w:val="NoteTitle"/>');
    expect(doc).toContain("[Picture: The deck]");
  });

  it("EPUB: mimetype first, contents, chapters, pictures, well-formed XHTML", () => {
    const z = check(epub({ details, chapters: [c, { ...c, title: "Two" }], images, id: "urn:uuid:1234" }));
    expect(z.names[0]).toBe("mimetype");
    expect(z.text("mimetype")).toBe("application/epub+zip");
    expect(z.names).toEqual(expect.arrayContaining(["OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/chapter-001.xhtml", "OEBPS/chapter-002.xhtml", "OEBPS/images/image1.png"]));
    expect(z.text("OEBPS/nav.xhtml")).toContain('<a href="chapter-002.xhtml">Two</a>');
    expect(z.text("OEBPS/chapter-001.xhtml")).toContain('<img src="images/image1.png" alt="The deck"/>');
    expect(z.text("OEBPS/content.opf")).toContain("<dc:creator>Celestine Tan</dc:creator>");
  });
});
