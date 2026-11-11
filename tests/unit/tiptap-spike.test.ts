/**
 * Milestone 2, step 1: can Tiptap open Markdown and save it back unchanged?
 *
 * Each sample goes Markdown → Tiptap document (through the real editor schema, as the editor
 * would hold it) → Markdown, and must come back identical.
 */
import { getSchema, type JSONContent } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";

// Medium's formatting set (design decision 3): title, two heading sizes, bold, italic, link,
// quote, bulleted and numbered lists, divider, image. Nothing else.
const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
  }),
  Image,
];

const schema = getSchema(extensions);
const md = new MarkdownManager({ extensions });

function roundTrip(markdown: string): string {
  const json = md.parse(markdown);
  // Through the real schema, exactly as the editor would hold it.
  const doc = PMNode.fromJSON(schema, json as JSONContent);
  return md.serialize(doc.toJSON());
}

// Markdown already written the way the editor writes it.
const MEDIUM_SET: Record<string, string> = {
  "paragraphs": "The tram was slow.\n\nThe second paragraph.",
  "title and headings": "# The tram to Belém\n\n## Arrival\n\nText.\n\n### A smaller heading\n\nMore text.",
  "bold and italic": "Some **bold**, some *italic*, and ***both***.",
  "link": "See [the timetable](https://example.com/trams) first.",
  "quote": "> You don’t ride it to arrive.\n\nAfter the quote.",
  "bulleted list": "- One\n- Two\n- Three",
  "numbered list": "1. First\n2. Second\n3. Third",
  "nested list": "- Outer\n  - Inner\n- Back out",
  "divider": "Before.\n\n---\n\nAfter.",
  "image": "![A tram on the hill](images/tram.jpg)",
  "gaps": "The 15 left at TK, and the bakery opened in @tk[the year it opened].",
  "unicode": "Café, 東京, emoji 🚋, quotes “like this” — and dashes.",
  "hard break": "Line one  \nLine two",
  "a whole chapter":
    "# Chapter one\n\nThe 15 left Praça da Figueira at TK, full of **school children**.\n\n> “You don’t ride it to arrive,” Ana said.\n\n## The monastery\n\n- Pastry shop\n- The *queue*\n\n---\n\n1. Tickets\n2. @tk[the price]\n\n![Belém](belem.jpg)",
};

// Markdown other apps write, which the editor may not keep as written.
const OTHER: Record<string, string> = {
  "underscore italic": "Some _italic_ and __bold__.",
  "star bullets": "* One\n* Two",
  "setext heading": "Title\n=====\n\nText.",
  "code span": "Run `npm test` now.",
  "code block": "```js\nconst a = 1;\n```",
  "table": "| A | B |\n|---|---|\n| 1 | 2 |",
  "strikethrough": "This is ~~gone~~.",
  "task list": "- [ ] todo\n- [x] done",
  "html": "<div>raw html</div>",
  "trailing newline": "Text.\n",
  "header (front matter)": "---\ncreated: 2026-11-11\n---\nBody.",
  "three blank lines": "One.\n\n\n\nTwo.",
  "escaped characters": "A literal \\*star\\* and 5 \\* 3.",
  "reference link": "A [link][1].\n\n[1]: https://example.com",
};

describe("Medium's set: Markdown → editor → Markdown is unchanged", () => {
  // Known until the gap chip exists: without it, the brackets in @tk[...] get escaped.
  const needsGapChip = new Set(["gaps", "a whole chapter"]);
  for (const [name, text] of Object.entries(MEDIUM_SET)) {
    (needsGapChip.has(name) ? it.fails : it)(name, () => expect(roundTrip(text)).toBe(text));
  }
});

describe("other Markdown: what the editor does with it (report, not pass/fail)", () => {
  it("prints the result for each sample", () => {
    const rows = Object.entries(OTHER).map(([name, text]) => {
      const out = roundTrip(text);
      return { name, kept: out === text, before: text, after: out };
    });
    console.log(
      "\nOTHER MARKDOWN REPORT\n" +
        rows
          .map((r) => `${r.kept ? "KEPT   " : "CHANGED"} ${r.name}\n   before: ${JSON.stringify(r.before)}\n   after:  ${JSON.stringify(r.after)}`)
          .join("\n"),
    );
    expect(rows.length).toBe(Object.keys(OTHER).length);
  });
});
