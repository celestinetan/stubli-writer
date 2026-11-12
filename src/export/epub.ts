/**
 * EPUB 3, for Apple Books, Kobo, Google Play and Amazon KDP: a title page, a contents page, one
 * file per chapter, the pictures, and a simple book stylesheet. Also readable by older readers
 * (a toc.ncx is included).
 */
import { esc, type BookDetails, type Chapter, type ExportImage } from "./model";
import { chapterHtml } from "./html";
import { zip } from "./zip";

interface Options {
  details: BookDetails;
  chapters: Chapter[];
  images: Map<string, ExportImage>;
  /** Language of the book, e.g. "en". */
  lang?: string;
  /** A stable id for the book (kept in the book note). */
  id: string;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

const CSS = `body { font-family: Georgia, serif; line-height: 1.5; margin: 0 5%; }
h1 { font-size: 1.6em; text-align: center; margin: 3em 0 0.4em; page-break-before: always; }
p { margin: 0; text-indent: 1.4em; }
h1 + p, h1 + .subtitle + p, h2 + p, h3 + p, hr + p, figure + p, blockquote + p, .title-page p { text-indent: 0; }
.subtitle { text-align: center; font-style: italic; margin-bottom: 2em; text-indent: 0; }
h2 { font-size: 1.25em; margin: 1.6em 0 0.4em; }
h3 { font-size: 1.05em; margin: 1.4em 0 0.3em; }
hr.break { border: 0; text-align: center; margin: 1.4em 0; }
hr.break::after { content: "* * *"; }
blockquote { margin: 1em 1.5em; }
blockquote p { text-indent: 0; }
blockquote.pull { font-style: italic; font-size: 1.2em; text-align: center; }
figure { margin: 1.4em 0; text-align: center; }
figure img { max-width: 100%; }
figcaption { font-size: 0.85em; font-style: italic; margin-top: 0.4em; }
pre { font-size: 0.85em; white-space: pre-wrap; }
table { border-collapse: collapse; margin: 1em auto; }
td, th { border: 1px solid #999; padding: 0.2em 0.5em; }
ul, ol { margin: 0.6em 0 0.6em 1.4em; padding: 0; }
li p { text-indent: 0; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { page-break-before: auto; font-size: 2em; margin: 0 0 0.4em; }
.title-page .author { margin-top: 2em; }
nav ol { list-style: none; padding: 0; }
nav li { margin: 0.4em 0; }`;

export function epub({ details, chapters, images, lang = "en", id }: Options): Uint8Array<ArrayBuffer> {
  const title = details.title || chapters[0]?.title || "Untitled";
  // Pictures the chapters use, as files in the book.
  const files = new Map<string, { name: string; img: ExportImage }>();
  for (const [path, img] of images) {
    if (!EXT[img.type]) continue;
    files.set(path, { name: `images/image${files.size + 1}.${EXT[img.type]}`, img });
  }
  const page = (heading: string, body: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><meta charset="UTF-8"/><title>${esc(heading)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;

  const chapterFiles = chapters.map((c, i) => ({
    name: `chapter-${String(i + 1).padStart(3, "0")}.xhtml`,
    title: c.title || `Chapter ${i + 1}`,
    html: page(c.title || `Chapter ${i + 1}`, `<section epub:type="chapter">${chapterHtml(c, { xhtml: true, src: (p) => files.get(p)?.name ?? null }, `Chapter ${i + 1}`)}</section>`),
  }));

  const titlePage = page(
    title,
    `<section class="title-page" epub:type="titlepage"><h1>${esc(title)}</h1>${details.subtitle ? `<p class="subtitle">${esc(details.subtitle)}</p>` : ""}${details.author ? `<p class="author">${esc(details.author)}</p>` : ""}</section>`,
  );
  const nav = page(
    "Contents",
    `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${chapterFiles.map((c) => `<li><a href="${c.name}">${esc(c.title)}</a></li>`).join("")}</ol></nav>`,
  );
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(id)}"/></head><docTitle><text>${esc(title)}</text></docTitle><navMap>${chapterFiles
    .map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="${c.name}"/></navPoint>`)
    .join("")}</navMap></ncx>`;

  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>',
    ...chapterFiles.map((c, i) => `<item id="c${i + 1}" href="${c.name}" media-type="application/xhtml+xml"/>`),
    ...[...files.values()].map((f, i) => `<item id="img${i + 1}" href="${f.name}" media-type="${f.img.type}"/>`),
  ].join("");
  const spine = ['<itemref idref="title"/>', '<itemref idref="nav"/>', ...chapterFiles.map((_, i) => `<itemref idref="c${i + 1}"/>`)].join("");
  const opf = `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${esc(id)}</dc:identifier><dc:title>${esc(title)}</dc:title>${details.author ? `<dc:creator>${esc(details.author)}</dc:creator>` : ""}<dc:language>${lang}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest>${manifest}</manifest><spine toc="ncx">${spine}</spine></package>`;

  return zip([
    // Must come first, and be stored as it is.
    { name: "mimetype", data: "application/epub+zip" },
    {
      name: "META-INF/container.xml",
      data: '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    },
    { name: "OEBPS/content.opf", data: opf },
    { name: "OEBPS/toc.ncx", data: ncx },
    { name: "OEBPS/nav.xhtml", data: nav },
    { name: "OEBPS/style.css", data: CSS },
    { name: "OEBPS/title.xhtml", data: titlePage },
    ...chapterFiles.map((c) => ({ name: `OEBPS/${c.name}`, data: c.html })),
    ...[...files.values()].map((f) => ({ name: `OEBPS/${f.name}`, data: f.img.data })),
  ]);
}
