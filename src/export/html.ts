/**
 * Chapters as HTML: for EPUB (as XHTML), for printing to PDF, and for pasting into Medium,
 * Substack or WordPress. Plain, semantic HTML; the look comes from each place's own styles.
 */
import { esc, type Block, type Chapter, type Span } from "./model";

export interface HtmlOptions {
  /** Where a picture is, by its path in the notes folder (a file in the EPUB, or a data: URL). */
  src: (path: string) => string | null;
  /** XHTML for EPUB: self-closing empty tags. */
  xhtml?: boolean;
}

export function spansHtml(spans: Span[], o: HtmlOptions): string {
  return spans
    .map((s) => {
      let h = esc(s.text).replace(/\n/g, o.xhtml ? "<br/>" : "<br>");
      if (s.code) h = `<code>${h}</code>`;
      if (s.italic) h = `<em>${h}</em>`;
      if (s.bold) h = `<strong>${h}</strong>`;
      if (s.href && /^(https?:|mailto:)/i.test(s.href)) h = `<a href="${esc(s.href)}">${h}</a>`;
      return h;
    })
    .join("");
}

export function blocksHtml(blocks: Block[], o: HtmlOptions): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case "heading":
          return `<h${b.level + 1}>${spansHtml(b.spans, o)}</h${b.level + 1}>`;
        case "para":
          return `<p>${spansHtml(b.spans, o)}</p>`;
        case "quote":
          return b.pull ? `<blockquote class="pull">${blocksHtml(b.blocks, o)}</blockquote>` : `<blockquote>${blocksHtml(b.blocks, o)}</blockquote>`;
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          const start = b.ordered && b.start !== 1 ? ` start="${b.start}"` : "";
          return `<${tag}${start}>${b.items.map((item) => `<li>${blocksHtml(item, o)}</li>`).join("")}</${tag}>`;
        }
        case "break":
          return o.xhtml ? '<hr class="break"/>' : '<hr class="break">';
        case "image": {
          const src = b.path ? o.src(b.path) : null;
          if (!src) return `<p class="missing">[Picture${b.alt ? `: ${esc(b.alt)}` : ""}]</p>`;
          const img = `<img src="${esc(src)}" alt="${esc(b.alt)}"${o.xhtml ? "/" : ""}>`;
          return `<figure${b.size ? ` class="${b.size}"` : ""}>${img}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
        }
        case "code":
          return `<pre><code>${esc(b.text)}</code></pre>`;
        case "table":
          return `<table>${b.rows
            .map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`)
            .join("")}</table>`;
      }
    })
    .join("\n");
}

export function chapterHtml(c: Chapter, o: HtmlOptions, fallbackTitle: string): string {
  return `<h1>${esc(c.title || fallbackTitle)}</h1>${c.subtitle ? `<p class="subtitle">${esc(c.subtitle)}</p>` : ""}\n${blocksHtml(c.blocks, o)}`;
}
