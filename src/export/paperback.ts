/**
 * A paperback interior, laid out by the browser's print engine and saved as PDF: the trim size
 * you choose, a wider inside margin for the binding (by Amazon KDP's rules for the page count),
 * a title page, a copyright page, an optional dedication, contents and chapter 1 on right-hand
 * pages, each later chapter on a new page, page numbers on the outside corners, and (if you like)
 * running heads: the book's title on left pages, the chapter's on right pages.
 *
 * The browser's print engine can't start every chapter on a right-hand page, or leave the running
 * head off a chapter's first page. The front pages always come in the same order, so blank pages
 * are put in by hand to keep the contents and chapter 1 on the right; running heads are a choice,
 * off by default.
 */
import { esc, wordCount, type BookDetails, type Chapter } from "./model";
import { chapterHtml, type HtmlOptions } from "./html";

export type Trim = "5x8" | "5.25x8" | "5.5x8.5" | "6x9";

export const TRIMS: { id: Trim; name: string; note: string }[] = [
  { id: "5x8", name: "5 × 8 in", note: "Compact; many novels" },
  { id: "5.25x8", name: "5.25 × 8 in", note: "A little wider" },
  { id: "5.5x8.5", name: "5.5 × 8.5 in", note: "Fiction and memoir" },
  { id: "6x9", name: "6 × 9 in", note: "The most common size" },
];

export interface PaperbackOptions {
  trim: Trim;
  runningHeads: boolean;
  isbn: string;
  dedication: string;
  year: number;
}

const SIZE: Record<Trim, { w: number; h: number; pt: number; wordsPerPage: number }> = {
  "5x8": { w: 5, h: 8, pt: 10.5, wordsPerPage: 230 },
  "5.25x8": { w: 5.25, h: 8, pt: 10.5, wordsPerPage: 245 },
  "5.5x8.5": { w: 5.5, h: 8.5, pt: 11, wordsPerPage: 270 },
  "6x9": { w: 6, h: 9, pt: 11.5, wordsPerPage: 310 },
};

/** About how many pages the book will have (front pages, chapters on right-hand pages). */
export function estimatePages(chapters: Chapter[], trim: Trim): number {
  const body = Math.ceil(wordCount(chapters) / SIZE[trim].wordsPerPage);
  return 4 + body + chapters.length;
}

/** Amazon KDP's inside margin (for the binding) by page count, plus a little to read comfortably. */
export function insideMargin(pages: number): number {
  const kdp = pages <= 150 ? 0.375 : pages <= 300 ? 0.5 : pages <= 500 ? 0.625 : pages <= 700 ? 0.75 : 0.875;
  return kdp + 0.125;
}

/** How many pages the contents take (about 20 chapter titles fit on a page). */
function contentsPages(chapters: number, trim: Trim): number {
  const perPage = trim === "6x9" ? 24 : trim === "5x8" || trim === "5.25x8" ? 18 : 20;
  return Math.max(1, Math.ceil(chapters / perPage));
}

/** A CSS string. */
function str(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

export function paperback(details: BookDetails, chapters: Chapter[], o: PaperbackOptions, html: HtmlOptions): { html: string; css: string } {
  const s = SIZE[o.trim];
  const title = details.title || chapters[0]?.title || "Untitled";
  const inside = insideMargin(estimatePages(chapters, o.trim));
  const outside = 0.5;
  const none = "@top-left { content: none } @top-right { content: none } @bottom-left { content: none } @bottom-right { content: none } @bottom-center { content: none }";
  const heads = o.runningHeads;

  const css = `
@page { size: ${s.w}in ${s.h}in; margin: 0.65in ${outside}in 0.7in ${inside}in; ${none} }
@page :left {
  margin-left: ${outside}in; margin-right: ${inside}in;
  @bottom-left { content: counter(page); font: 9pt Georgia, serif; }
  ${heads ? `@top-left { content: ${str(title.toUpperCase())}; font: 8pt Georgia, serif; letter-spacing: 0.08em; }` : ""}
}
@page :right {
  margin-left: ${inside}in; margin-right: ${outside}in;
  @bottom-right { content: counter(page); font: 9pt Georgia, serif; }
}
@page front { ${none} }
${heads ? chapters.map((c, i) => `@page ch${i + 1}:right { @top-right { content: ${str(c.title || `Chapter ${i + 1}`)}; font: italic 8pt Georgia, serif; } }`).join("\n") : ""}
@media print {
  html.is-printing .print-book.is-paperback {
    font: ${s.pt}pt/1.42 var(--font-reading);
    text-align: justify;
    hyphens: auto;
  }
  .is-paperback .pb-front { page: front; }
  .is-paperback .pb-title { padding-top: 1.6in; text-align: center; }
  .is-paperback .pb-title h1 { margin: 0 0 0.15in; font-size: ${s.pt * 2.1}pt; }
  .is-paperback .pb-title .pb-author { margin-top: 0.6in; font-size: ${s.pt * 1.15}pt; }
  .is-paperback .pb-copyright { break-before: left; padding-top: ${s.h * 0.55}in; font-size: ${s.pt * 0.8}pt; text-align: left; }
  .is-paperback .pb-copyright p { text-indent: 0; margin: 0 0 0.6em; }
  .is-paperback .pb-dedication { break-before: page; padding-top: 1.8in; text-align: center; font-style: italic; }
  .is-paperback .pb-dedication p { text-indent: 0; }
  .is-paperback .pb-contents { break-before: page; }
  /* An empty left-hand page, so the contents start on the right after a dedication. */
  .is-paperback .pb-blank { break-before: page; height: 1px; }
  .is-paperback .pb-contents h2 { margin-top: 1in; }
  .is-paperback .pb-contents ol { line-height: 1.9; }
  .is-paperback .pb-chapter { break-before: page; }
  .is-paperback .pb-chapter h1 { margin: ${s.h * 0.2}in 0 0.1in; font-size: ${s.pt * 1.6}pt; }
  .is-paperback .pb-chapter .subtitle { margin-bottom: 0.35in; }
  .is-paperback .pb-chapter h1 + p, .is-paperback .pb-chapter .subtitle + p { text-indent: 0; }
  .is-paperback figure img { max-height: ${s.h * 0.6}in; }
  ${heads ? chapters.map((_, i) => `.is-paperback .pb-ch-${i + 1} { page: ch${i + 1}; }`).join("\n  ") : ""}
}`;

  const front =
    `<section class="pb-front pb-title"><h1>${esc(title)}</h1>${details.subtitle ? `<p class="pb-subtitle">${esc(details.subtitle)}</p>` : ""}${details.author ? `<p class="pb-author">${esc(details.author)}</p>` : ""}</section>` +
    `<section class="pb-front pb-copyright"><p>${esc(title)}${details.author ? ` by ${esc(details.author)}` : ""}</p><p>Copyright © ${o.year}${details.author ? ` ${esc(details.author)}` : ""}. All rights reserved.</p>${o.isbn.trim() ? `<p>ISBN ${esc(o.isbn.trim())}</p>` : ""}</section>` +
    // Title (page 1), copyright (2), dedication (3) and a blank page (4), so the contents are on a
    // right-hand page. The browser doesn't always add that blank page itself.
    (o.dedication.trim() ? `<section class="pb-front pb-dedication"><p>${esc(o.dedication.trim())}</p></section><section class="pb-front pb-blank"></section>` : "") +
    (chapters.length > 1
      ? `<section class="pb-front pb-contents"><h2>Contents</h2><ol>${chapters.map((c, i) => `<li>${esc(c.title || `Chapter ${i + 1}`)}</li>`).join("")}</ol></section>` +
        // The contents start on a right-hand page; if they fill an odd number of pages, a blank
        // page keeps chapter 1 on the right too.
        (contentsPages(chapters.length, o.trim) % 2 ? `<section class="pb-front pb-blank"></section>` : "")
      : // No contents: title (1), copyright (2), [dedication (3), blank (4)], so chapter 1 would be on
        // the left; one more blank page puts it on the right.
        `<section class="pb-front pb-blank"></section>`);
  const body = chapters.map((c, i) => `<section class="pb-chapter pb-ch-${i + 1}">${chapterHtml(c, html, `Chapter ${i + 1}`)}</section>`).join("");
  return { html: front + body, css };
}
