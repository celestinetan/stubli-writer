import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseNote, readFields, serializeNote, writeFields } from "../../src/notes/note";
import { findGaps } from "../../src/notes/gaps";

const DIR = fileURLToPath(new URL("../fixtures/notes", import.meta.url));
const samples = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(DIR, name), "utf8") }));
const sample = (name: string) => samples.find((s) => s.name === name)!.text;

describe("reading and saving a note changes nothing", () => {
  it("has the full set of sample notes", () => expect(samples.length).toBeGreaterThanOrEqual(30));

  for (const { name, text } of samples) {
    it(name, () => {
      expect(serializeNote(parseNote(text))).toBe(text);
      // A second round trip, as after saving twice.
      expect(serializeNote(parseNote(serializeNote(parseNote(text))))).toBe(text);
    });
  }
});

describe("finding the header", () => {
  it.each([
    ["02-header.md", true],
    ["05-bom.md", true],
    ["09-header-dots.md", true],
    ["30-header-spaces.md", true],
    ["10-unclosed-header.md", false],
    ["11-rule-not-header.md", false],
    ["31-many-dashes.md", false],
    ["07-empty.md", false],
  ])("%s has a header: %s", (name, has) => {
    expect(parseNote(sample(name)).header !== null).toBe(has);
  });

  it("keeps the byte-order mark outside the header", () => {
    const n = parseNote(sample("05-bom.md"));
    expect(n.bom).toBe("﻿");
    expect(n.header?.startsWith("---")).toBe(true);
  });
});

describe("reading header fields", () => {
  it("reads inline tags and the date", () => {
    expect(readFields(parseNote(sample("02-header.md")))).toEqual({ created: "2026-11-11", tags: ["travel", "lisbon"] });
  });
  it("reads tags written as a list, with quotes", () => {
    expect(readFields(parseNote(sample("03-block-tags.md"))).tags).toEqual(["travel", "long read"]);
  });
  it("reads quoted synopsis and type for book mode", () => {
    expect(readFields(parseNote(sample("25-front-matter-quotes.md")))).toEqual({
      synopsis: "Ana finds the box: the letters are TK",
      type: "chapter",
    });
  });
  it("ignores fields it doesn't know", () => {
    expect(readFields(parseNote(sample("12-unknown-fields.md")))).toEqual({ created: "2026-11-11" });
  });
  it("trims spaces around values", () => {
    expect(readFields(parseNote(sample("30-header-spaces.md"))).created).toBe("2026-11-11");
  });
});

describe("changing header fields", () => {
  it("keeps every line it didn't change", () => {
    const before = sample("12-unknown-fields.md");
    const after = serializeNote(writeFields(parseNote(before), { tags: ["travel"] }));
    expect(after).toBe(before.replace("cssclass: wide\n", "cssclass: wide\n").replace("---\nObsidian", "tags: [travel]\n---\nObsidian"));
    expect(readFields(parseNote(after)).tags).toEqual(["travel"]);
    expect(after).toContain("nested:\n  a: 1\n  b: [x, y]\n");
  });

  it("replaces a list written over several lines", () => {
    const after = serializeNote(writeFields(parseNote(sample("03-block-tags.md")), { tags: ["one"] }));
    expect(after).toBe("---\ncreated: 2026-11-11\ntags: [one]\n---\nBody.\n");
  });

  it("removes a field", () => {
    const after = serializeNote(writeFields(parseNote(sample("02-header.md")), { tags: undefined }));
    expect(after).toBe("---\ncreated: 2026-11-11\n---\n# Lisbon trip\n\nThe tram was TK.\n");
  });

  it("adds a header to a note without one, leaving the text alone", () => {
    const before = sample("01-plain.md");
    const after = serializeNote(writeFields(parseNote(before), { created: "2026-11-12" }));
    expect(after).toBe("---\ncreated: 2026-11-12\n---\n" + before);
  });

  it("keeps Windows line endings", () => {
    const after = serializeNote(writeFields(parseNote(sample("04-crlf.md")), { tags: ["work"] }));
    expect(after).toBe("---\r\ncreated: 2026-11-11\r\ntags: [work]\r\n---\r\n# Windows note\r\n\r\nLine one.\r\nLine two with TK.\r\n");
  });

  it("quotes values that would confuse other apps", () => {
    const after = serializeNote(writeFields(parseNote(""), { synopsis: "Ana: the box", tags: ["yes", "C#"] }));
    expect(after).toBe('---\nsynopsis: "Ana: the box"\ntags: ["yes", "C#"]\n---\n');
    expect(readFields(parseNote(after))).toEqual({ synopsis: "Ana: the box", tags: ["yes", "C#"] });
  });

  it("changing nothing returns the same note", () => {
    const n = parseNote(sample("02-header.md"));
    expect(writeFields(n, {})).toBe(n);
  });
});

describe("finding gaps", () => {
  const count = (name: string) => findGaps(parseNote(sample(name)).body);

  it.each([
    ["01-plain.md", 0],
    ["02-header.md", 1],
    ["04-crlf.md", 1],
    ["06-no-final-newline.md", 1],
    ["14-code.md", 1],
    ["15-links.md", 1],
    ["16-words.md", 4],
    ["17-cjk.md", 2],
    ["18-emoji.md", 2],
    ["20-html-comment.md", 1],
    ["21-table.md", 1],
    ["25-front-matter-quotes.md", 0],
    ["26-reference-links.md", 1],
    ["27-image.md", 2],
    ["28-empty-request.md", 0],
  ])("%s has %i gap(s)", (name, n) => {
    expect(count(name)).toHaveLength(n);
  });

  it("reads requests, in any case, with their text and line", () => {
    const gaps = count("13-requests.md");
    expect(gaps.map((g) => [g.kind, g.request, g.line])).toEqual([
      ["request", "the year this law passed", 1],
      ["request", "find the sentence about trams", 1],
    ]);
  });

  it("gives offsets that point at the gap", () => {
    const body = "Before TK and @tk[a request] after.";
    const gaps = findGaps(body);
    expect(gaps.map((g) => body.slice(g.start, g.end))).toEqual(["TK", "@tk[a request]"]);
  });

  it("counts lines from 1", () => {
    expect(findGaps("one\ntwo\nthree TK")[0].line).toBe(3);
  });
});
