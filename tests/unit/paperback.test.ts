import { describe, expect, it } from "vitest";
import { noteToChapter } from "../../src/export/model";
import { estimatePages, insideMargin, paperback } from "../../src/export/paperback";

const chapter = (title: string, words: number) => noteToChapter(`${title}.md`, `# ${title}\n\n${"word ".repeat(words)}\n`);
const details = { title: "Lisbon stories", subtitle: "", author: "Ana Writer" };
const base = { trim: "6x9" as const, runningHeads: false, isbn: "", dedication: "", year: 2026 };

describe("a paperback interior", () => {
  it("uses Amazon KDP's inside margin for the page count, plus a little", () => {
    expect(insideMargin(100)).toBe(0.5);
    expect(insideMargin(250)).toBe(0.625);
    expect(insideMargin(820)).toBe(1);
    expect(estimatePages([chapter("One", 31000)], "6x9")).toBe(4 + 101 + 1); // 31,001 words with the title
  });

  it("sets the trim size and mirrored margins, and the binding margin grows with the book", () => {
    const small = paperback(details, [chapter("One", 1000)], base, { src: () => null }).css;
    const big = paperback(details, [chapter("One", 120000)], base, { src: () => null }).css;
    expect(small).toContain("size: 6in 9in;");
    expect(small).toMatch(/@page :left \{\s*margin-left: 0.5in; margin-right: 0.5in;/);
    expect(big).toMatch(/@page :left \{\s*margin-left: 0.5in; margin-right: 0.75in;/);
    expect(big).toMatch(/@page :right \{\s*margin-left: 0.75in; margin-right: 0.5in;/);
  });

  it("front pages: title, copyright (with ISBN), dedication, a blank page, contents, a blank page before chapter 1", () => {
    const { html } = paperback(details, [chapter("One", 10), chapter("Two", 10)], { ...base, isbn: "978-1-23456-789-0", dedication: "For the 15" }, { src: () => null });
    const order = [...html.matchAll(/class="pb-(?:front|chapter) pb-([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(order).toEqual(["title", "copyright", "dedication", "blank", "contents", "blank", "ch-1", "ch-2"]);
    expect(html).toContain("Copyright © 2026 Ana Writer. All rights reserved.");
    expect(html).toContain("ISBN 978-1-23456-789-0");
  });

  it("running heads only when asked: the book's title on the left, each chapter's on the right", () => {
    const off = paperback(details, [chapter("One", 10)], base, { src: () => null }).css;
    const on = paperback(details, [chapter("One", 10), chapter("Two \"quoted\"", 10)], { ...base, runningHeads: true }, { src: () => null }).css;
    expect(off).not.toContain("@top-left { content: \"");
    expect(on).toContain('@top-left { content: "LISBON STORIES"');
    expect(on).toContain('@page ch2:right { @top-right { content: "Two \\"quoted\\""');
    expect(on).toContain(".is-paperback .pb-ch-2 { page: ch2; }");
  });
});
