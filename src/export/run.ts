/**
 * Putting an export together in the browser: read the chapters and their pictures, make the file,
 * and hand it to the browser as a download (or print it, or copy it). Nothing leaves the device.
 */
import type { NoteStore } from "../store/store";
import { IMAGE_TYPES } from "../store/store";
import { docx, type WordStyle } from "./docx";
import { epub } from "./epub";
import { chapterHtml } from "./html";
import { esc, fileName, noteToChapter, picturesIn, type BookDetails, type Chapter, type ExportImage } from "./model";

export type Format = "word" | "epub" | "pdf" | "web";

export interface ExportJob {
  format: Format;
  wordStyle: WordStyle;
  details: BookDetails;
  /** The notes to export, in order: a book's chapters, or one note. */
  notes: { path: string; text: string }[];
  /** A book (title page, contents) or a single note. */
  isBook: boolean;
  bookId: string;
}

/** Runs the export. Returns what happened, in words, for the sheet to show. */
export async function runExport(store: NoteStore, job: ExportJob): Promise<string> {
  const chapters = job.notes.map((n) => noteToChapter(n.path, n.text));
  const title = job.details.title || chapters[0]?.title || "Untitled";
  const images = await loadImages(store, picturesIn(chapters), job.format === "word");

  switch (job.format) {
    case "word": {
      const name = fileName(title, "docx");
      download(new Blob([docx({ details: job.details, chapters, images, style: job.wordStyle, titlePage: job.isBook })], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), name);
      return `“${name}” is in your downloads.`;
    }
    case "epub": {
      const name = fileName(title, "epub");
      download(new Blob([epub({ details: job.details, chapters, images, id: job.bookId, lang: document.documentElement.lang || "en" })], { type: "application/epub+zip" }), name);
      return `“${name}” is in your downloads.`;
    }
    case "pdf":
      printBook(job.details, chapters, images, job.isBook);
      return "Your browser's print window is open: choose “Save as PDF” as the printer.";
    case "web":
      await copyForWeb(chapters, images);
      return "Copied. Paste it into Medium, Substack or WordPress; pictures come along where the site allows it.";
  }
}

/** The pictures, as bytes with their size. For Word, formats it can't show are turned into PNG. */
async function loadImages(store: NoteStore, paths: string[], wordOnly: boolean): Promise<Map<string, ExportImage>> {
  const out = new Map<string, ExportImage>();
  for (const path of paths) {
    try {
      let blob = await store.readFile(path);
      const ext = path.split(".").pop()!.toLowerCase();
      let type = blob.type || IMAGE_TYPES[ext] || "image/png";
      const bitmap = await createImageBitmap(blob);
      const { width, height } = bitmap;
      if (wordOnly && !["image/png", "image/jpeg", "image/gif"].includes(type)) {
        const canvas = new OffscreenCanvas(width, height);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        blob = await canvas.convertToBlob({ type: "image/png" });
        type = "image/png";
      }
      bitmap.close();
      out.set(path, { data: new Uint8Array(await blob.arrayBuffer()), type, width, height });
    } catch {
      // A picture that can't be read is left out; "[Picture: …]" stands in its place.
    }
  }
  return out;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * PDF: the book laid out for paper (A4, a title page, a contents page, each chapter on a new
 * page, page numbers), then the browser's own print window, where "Save as PDF" makes the file.
 */
function printBook(details: BookDetails, chapters: Chapter[], images: Map<string, ExportImage>, isBook: boolean): void {
  const urls: string[] = [];
  const src = (path: string) => {
    const img = images.get(path);
    if (!img) return null;
    const url = URL.createObjectURL(new Blob([img.data], { type: img.type }));
    urls.push(url);
    return url;
  };
  const title = details.title || chapters[0]?.title || "Untitled";
  const front = isBook
    ? `<section class="pb-title"><h1>${esc(title)}</h1>${details.subtitle ? `<p class="pb-subtitle">${esc(details.subtitle)}</p>` : ""}${details.author ? `<p class="pb-author">${esc(details.author)}</p>` : ""}</section>` +
      (chapters.length > 1 ? `<section class="pb-contents"><h2>Contents</h2><ol>${chapters.map((c, i) => `<li>${esc(c.title || `Chapter ${i + 1}`)}</li>`).join("")}</ol></section>` : "")
    : "";
  const body = chapters.map((c, i) => `<section class="pb-chapter">${chapterHtml(c, { src }, `Chapter ${i + 1}`)}</section>`).join("");

  const box = document.createElement("div");
  box.className = `print-book${isBook ? " is-book" : ""}`;
  box.innerHTML = front + body;
  document.body.append(box);
  document.documentElement.classList.add("is-printing");
  const previous = document.title;
  // The browser suggests the page's title as the PDF's file name.
  document.title = title;
  const done = () => {
    box.remove();
    document.documentElement.classList.remove("is-printing");
    document.title = previous;
    urls.forEach((u) => URL.revokeObjectURL(u));
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  // Let the pictures load before the print window takes its snapshot.
  void Promise.all([...box.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined))).then(() => window.print());
}

/** Copies the writing as formatted text, for pasting into a web editor. Pictures go as data. */
async function copyForWeb(chapters: Chapter[], images: Map<string, ExportImage>): Promise<void> {
  const src = (path: string) => {
    const img = images.get(path);
    if (!img) return null;
    let bin = "";
    for (let i = 0; i < img.data.length; i += 0x8000) bin += String.fromCharCode(...img.data.subarray(i, i + 0x8000));
    return `data:${img.type};base64,${btoa(bin)}`;
  };
  const html = chapters.map((c, i) => chapterHtml(c, { src }, `Chapter ${i + 1}`)).join("\n");
  const box = document.createElement("div");
  box.innerHTML = html.replace(/<img[^>]*>/g, "");
  const plain = box.innerText || box.textContent || "";
  await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) })]);
}
