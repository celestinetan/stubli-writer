/**
 * The editor never loses writing.
 *
 * 1. Markdown in Medium's set (what the editor writes) comes back byte for byte.
 * 2. Formatting outside the set (tables, code, HTML, strikethrough, checkboxes) comes back
 *    byte for byte too: protected or kept quietly.
 * 3. A few equivalent spellings from other apps are rewritten the standard way; the meaning
 *    and every word stay.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MarkdownConverter, joinBody, splitBody } from "../../src/editor/markdown";
import { parseNote, serializeNote } from "../../src/notes/note";

const conv = new MarkdownConverter();

const MEDIUM_SET: Record<string, string> = {
  paragraphs: "The tram was slow.\n\nThe second paragraph.",
  "title and headings": "# The tram to Belém\n\n## Arrival\n\nText.\n\n### A smaller heading\n\nMore text.",
  "bold and italic": "Some **bold**, some *italic*, and ***both***.",
  link: "See [the timetable](https://example.com/trams) first.",
  quote: "> You don’t ride it to arrive.\n\nAfter the quote.",
  "bulleted list": "- One\n- Two\n- Three",
  "numbered list": "1. First\n2. Second\n3. Third",
  "nested list": "- Outer\n  - Inner\n- Back out",
  divider: "Before.\n\n---\n\nAfter.",
  image: "![A tram on the hill](images/tram.jpg)",
  gaps: "The 15 left at TK, and the bakery opened in @tk[the year it opened].",
  "gap at the start and end": "TK starts it and ends with TK",
  "gap in bold and in a link": "**TK** and [see TK](https://example.com/TK)",
  "gap next to Japanese": "今日はTKへ行った。",
  unicode: "Café, 東京, emoji 🚋, quotes “like this” — and dashes.",
  "hard break": "Line one  \nLine two",
  "a whole chapter":
    "# Chapter one\n\nThe 15 left Praça da Figueira at TK, full of **school children**.\n\n> “You don’t ride it to arrive,” Ana said.\n\n## The monastery\n\n- Pastry shop\n- The *queue*\n\n---\n\n1. Tickets\n2. @tk[the price]\n\n![Belém](belem.jpg)",
};

const PROTECTED: Record<string, string> = {
  "code block": "Before.\n\n```js\nconst TK = 1;\n```\n\nAfter.",
  "tilde code block": "~~~\nplain\n~~~",
  table: "| Year | Event |\n|---|---|\n| TK | Law passed |",
  "table between paragraphs": "Intro.\n\n| A | B |\n|:--|--:|\n| 1 | 2 |\n\nOutro.",
  "html block": "<div class=\"note\">\n  raw <b>html</b>\n</div>\n\nAfter.",
  "inline html": "Text with <kbd>Ctrl</kbd> keys.",
  "html comment": "Visible.\n\n<!-- a comment -->\n\nAfter.",
  "inline code": "Run `npm test` now, `TK` is not a gap.",
  strikethrough: "This is ~~gone~~.",
  "task list": "- [ ] todo\n- [x] done",
};

const REWRITTEN: [string, string, string][] = [
  ["underscore emphasis", "Some _italic_ and __bold__.", "Some *italic* and **bold**."],
  ["star bullets", "* One\n* Two", "- One\n- Two"],
  ["underlined heading", "Title\n=====\n\nText.", "# Title\n\nText."],
  ["reference link", "A [link][1].\n\n[1]: https://example.com", "A [link](https://example.com)."],
  ["web address in angle brackets", "See <https://example.com/a>.", "See https://example.com/a."],
  ["HTML entities", "Entities &amp; and &lt;b&gt;.", "Entities & and &lt;b>."],
];

describe("Medium's set comes back byte for byte", () => {
  for (const [name, text] of Object.entries(MEDIUM_SET)) it(name, () => expect(conv.roundTrip(text)).toBe(text));
});

describe("other formatting is protected and comes back byte for byte", () => {
  for (const [name, text] of Object.entries(PROTECTED)) it(name, () => expect(conv.roundTrip(text)).toBe(text));

  it("a table becomes one protected block, labelled as a table", () => {
    const doc = conv.toDoc(PROTECTED.table);
    expect(doc.content?.map((n) => [n.type, n.attrs?.kind])).toEqual([["rawBlock", "table"]]);
  });

});

describe("equivalent spellings are rewritten the standard way, keeping every word", () => {
  for (const [name, before, after] of REWRITTEN) it(name, () => expect(conv.roundTrip(before)).toBe(after));
});

describe("plain text stays as typed", () => {
  it.each([
    "Tom & Jerry, a < b and 3 > 2.",
    "snake_case_name and file_v2.md",
    "Prices: 5 * 3 = 15",
    "An empty @tk[] request and @tk[   ] too.",
    "A [bracket] on its own.",
    "Path C:\\Users\\ana",
    "A literal \\*star\\* stays escaped.",
  ])("%s", (text) => expect(conv.roundTrip(text)).toBe(text));
});

describe("the 32 sample notes", () => {
  const DIR = fileURLToPath(new URL("../fixtures/notes", import.meta.url));
  const samples = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
  const words = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");

  for (const name of samples) {
    it(`${name}: opening and saving in the editor keeps every word`, () => {
      const text = readFileSync(join(DIR, name), "utf8");
      const note = parseNote(text);
      const parts = splitBody(note.body);
      const saved = serializeNote({ ...note, body: joinBody({ ...parts, markdown: conv.roundTrip(parts.markdown) }, note.eol) });
      // Every word survives (formatting marks may be respelled). Reference links are written
      // inline, so their label ("[1]") goes; the address stays.
      const expected = name === "26-reference-links.md" ? "A ref link https example com TK with TK" : words(text);
      expect(words(saved)).toBe(expected);
      // The header and the line endings are untouched.
      expect(parseNote(saved).header).toBe(note.header);
      if (note.eol === "\r\n" && !text.includes("\n\n\n")) expect(saved.replace(/\r\n/g, "")).not.toContain("\n");
    });
  }

  it("most sample notes come back byte for byte", () => {
    const changed: string[] = [];
    for (const name of samples) {
      const text = readFileSync(join(DIR, name), "utf8");
      const note = parseNote(text);
      const parts = splitBody(note.body);
      const saved = serializeNote({ ...note, body: joinBody({ ...parts, markdown: conv.roundTrip(parts.markdown) }, note.eol) });
      if (saved !== text) changed.push(name);
    }
    console.log("Sample notes respelled by the editor:", changed.join(", ") || "none");
    expect(changed.length).toBeLessThanOrEqual(6);
  });
});
