/**
 * Bringing in a whole manuscript written elsewhere: a Word file (.docx, which Google Docs, Pages
 * and Scrivener can all save) or one long Markdown or text file. It becomes a book, with a
 * chapter for each chapter heading.
 *
 * The file is read here, in the browser; nothing is uploaded. Reading is in three steps, so the
 * writer can see and change the result before anything is made:
 *   1. readManuscript: the file as a list of pieces (headings, paragraphs, lists, pictures)
 *   2. chaptersOf: the pieces cut into chapters, at a heading level or at lines like "Chapter 1"
 *   3. makeBook: the book note, its chapters and its pictures, written to the notes
 *
 * Left out, and said so on screen: comments, tracked deletions, footnotes, a table of contents.
 */
import { IMAGE_TYPES, relativeFrom, type NoteStore } from "../store/store";
import { unzip, type ZipFile } from "./backup";
import { bookPath, bookTemplate, chapterTemplate, countWords, newChapterPath, withChapters, type Book } from "./books";
import { isoDate } from "./library";

export interface Piece {
  /** 1 to 6 for a heading, 0 for anything else. */
  heading: number;
  /** The words alone, for headings, counting and finding "Chapter 1". */
  text: string;
  /** As Markdown (not used for headings, which are written from `text`). */
  md: string;
  /** A list item: it sits directly under the one before. */
  list?: boolean;
  /** The book's own title or subtitle, which isn't part of any chapter. */
  role?: "title" | "subtitle";
}

export interface Picture {
  ext: string;
  data: Uint8Array;
}

export interface Draft {
  /** The book's title: from the file, or else its name. */
  title: string;
  pieces: Piece[];
  /** Pictures, written in the Markdown as (picture://0), (picture://1)… until the book is made. */
  pictures: Picture[];
  /** What was in the file and isn't brought in, in plain words. */
  leftOut: string[];
}

export type Split = { by: "heading"; level: number } | { by: "named" } | { by: "none" };

export interface SplitChoice {
  split: Split;
  label: string;
  chapters: number;
}

export interface DraftChapter {
  title: string;
  markdown: string;
  words: number;
}

export class ManuscriptError extends Error {
  override name = "ManuscriptError";
}

const MAX_BYTES = 60 * 1024 * 1024;

/** Lines that start a chapter in a manuscript with no heading styles. */
const NAMED =
  /^(?:(?:chapter|part|book|kapitel|chapitre|cap[ií]tulo)\s+[\p{L}\p{N}-]+(?:\s*[:.–—-]\s*\S.*|\s+[–—-]\s+\S.*)?\.?|prologue|epilogue|interlude|foreword|preface|introduction|afterword|acknowledge?ments|author[’']s note)$/iu;
const SCENE_BREAK = /^(?:(?:[*•·~#-]\s*){3,}|#|⁂|\*)$/;

export async function readManuscript(name: string, bytes: Uint8Array): Promise<Draft> {
  if (bytes.length > MAX_BYTES) throw new ManuscriptError("That file is larger than 60 MB. Try saving it without its pictures.");
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  const fallback = name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Imported book";
  let draft: Draft;
  if (ext === "docx") draft = await readDocx(bytes);
  else if (["md", "markdown", "mdown", "txt"].includes(ext)) draft = readMarkdown(new TextDecoder("utf-8", { ignoreBOM: false }).decode(bytes));
  else if (ext === "doc") throw new ManuscriptError("Older Word files (.doc) can't be read. Open it in Word or Google Docs and save it as .docx.");
  else throw new ManuscriptError("That isn't a Word (.docx), Markdown or text file. In Google Docs, choose File → Download → Microsoft Word.");
  findTitle(draft);
  draft.title ||= fallback;
  return draft;
}

/** When one heading stands above all the others, it's the book's title, not a chapter. */
function findTitle(draft: Draft): void {
  const titled = draft.pieces.find((p) => p.role === "title");
  if (titled) {
    draft.title = titled.text;
    return;
  }
  const heads = draft.pieces.filter((p) => p.heading > 0);
  if (heads.length < 3) return;
  const top = Math.min(...heads.map((p) => p.heading));
  if (heads.filter((p) => p.heading === top).length !== 1 || heads[0].heading !== top) return;
  heads[0].role = "title";
  draft.title = heads[0].text;
}

// --- Cutting into chapters -------------------------------------------------------------------------

const inBook = (draft: Draft) => draft.pieces.filter((p) => !p.role);
const isNamed = (p: Piece) => p.text.length <= 90 && !p.text.includes("\n") && !p.list && NAMED.test(p.text);

function startsChapter(p: Piece, split: Split): boolean {
  if (split.by === "heading") return p.heading > 0 && p.heading <= split.level;
  if (split.by === "named") return isNamed(p);
  return false;
}

/** The ways this file can be cut, most likely first. */
export function splitChoices(draft: Draft): SplitChoice[] {
  const pieces = inBook(draft);
  const out: SplitChoice[] = [];
  const levels = [...new Set(pieces.filter((p) => p.heading > 0).map((p) => p.heading))].sort((a, b) => a - b);
  for (const level of levels.slice(0, 3)) {
    const split: Split = { by: "heading", level };
    out.push({ split, label: `Each “Heading ${level}”`, chapters: chaptersOf(draft, split).chapters.length });
  }
  // Lines like "Chapter 1" are offered when they'd find chapters the headings don't.
  const named = pieces.filter(isNamed).length;
  if (named >= 2) out.push({ split: { by: "named" }, label: "Each line like “Chapter 1” or “Prologue”", chapters: chaptersOf(draft, { by: "named" }).chapters.length });
  out.push({ split: { by: "none" }, label: "Nowhere: one chapter", chapters: 1 });
  // The first that makes more than one chapter is the best guess; "named" wins when headings find nothing more.
  const best = out.find((c) => c.chapters > 1) ?? out[out.length - 1];
  return [best, ...out.filter((c) => c !== best)];
}

export function sameSplit(a: Split, b: Split): boolean {
  return a.by === b.by && (a.by !== "heading" || (b.by === "heading" && a.level === b.level));
}

export function chaptersOf(draft: Draft, split: Split): { chapters: DraftChapter[]; empty: string[] } {
  const pieces = inBook(draft);
  const levels = pieces.filter((p) => p.heading > 0 && !startsChapter(p, split)).map((p) => p.heading);
  // Headings inside a chapter become the app's two sizes: the largest left is "##", the rest "###".
  const largest = levels.length ? Math.min(...levels) : 0;

  const sections: { title: string | null; pieces: Piece[] }[] = [{ title: null, pieces: [] }];
  for (const p of pieces) {
    if (startsChapter(p, split)) sections.push({ title: p.text, pieces: [] });
    else sections[sections.length - 1].pieces.push(p);
  }

  const chapters: DraftChapter[] = [];
  const empty: string[] = [];
  for (const s of sections) {
    const words = s.pieces.reduce((n, p) => n + countWords(p.text), 0);
    const hasPicture = s.pieces.some((p) => p.md.includes("](picture://"));
    if (words === 0 && !hasPicture) {
      if (s.title) empty.push(s.title);
      continue;
    }
    let markdown = "";
    let last: Piece | null = null;
    for (const p of s.pieces) {
      const md = p.heading > 0 ? `${p.heading === largest ? "##" : "###"} ${escapeText(oneLine(p.text))}` : p.md;
      markdown += (last ? (last.list && p.list ? "\n" : "\n\n") : "") + md;
      last = p;
    }
    const title = s.title === null ? (split.by === "none" ? draft.title : "Before the first chapter") : chapterTitle(s.title) || `Chapter ${chapters.length + 1}`;
    chapters.push({ title, markdown, words });
  }
  return { chapters, empty };
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const chapterTitle = (text: string) => oneLine(text).replace(/\.$/, "").slice(0, 100).trim();

// --- Making the book -------------------------------------------------------------------------------

export interface MadeBook {
  book: string;
  title: string;
  chapters: string[];
  pictures: number;
  /** Pictures in a format the app can't show (such as EMF or TIFF). */
  picturesLeftOut: number;
}

/** Writes the pictures, the chapters and then the book. Nothing already there is changed. */
export async function makeBook(store: NoteStore, draft: Draft, chapters: DraftChapter[], title: string, now = new Date()): Promise<MadeBook> {
  const taken = new Set((await store.list()).map((r) => r.path.toLowerCase()));
  const files = new Set(((await store.listFiles?.()) ?? []).map((p) => p.toLowerCase()));
  const clean = oneLine(title) || draft.title;
  const first = bookPath(clean) ?? bookPath("Imported book")!;
  const stem = first.replace(/\.md$/i, "");
  const folderTaken = (s: string) => taken.has(`${s}.md`.toLowerCase()) || [...taken].some((p) => p.startsWith(`${s}/`.toLowerCase()));
  let path = first;
  for (let i = 2; folderTaken(path.replace(/\.md$/i, "")); i++) path = `${stem} ${i}.md`;
  const created = isoDate(now);
  const book: Book = { path, title: clean, chapters: [], world: "", bible: false };

  const made = new Set<string>();
  const refs = chapters.map((c, i) => {
    const p = newChapterPath(book, c.title, (x) => made.has(x.toLowerCase())) ?? newChapterPath(book, `Chapter ${i + 1}`, (x) => made.has(x.toLowerCase()))!;
    made.add(p.toLowerCase());
    return { path: p, label: c.title };
  });

  // Pictures are saved once each, where the app keeps its own, and only those a chapter shows.
  const saved = new Map<number, string | null>();
  const slug = path.replace(/\.md$/i, "").split("/").pop()!.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "book";
  let pictures = 0;
  let picturesLeftOut = 0;
  for (const [i, c] of chapters.entries()) {
    let md = c.markdown;
    for (const m of c.markdown.matchAll(/\]\(picture:\/\/(\d+)\)/g)) {
      const n = Number(m[1]);
      if (saved.has(n)) continue;
      const pic = draft.pictures[n];
      if (!pic || !(pic.ext in IMAGE_TYPES)) {
        saved.set(n, null);
        picturesLeftOut++;
        continue;
      }
      let file = `images/${slug}-${n + 1}.${pic.ext}`;
      for (let k = 2; files.has(file.toLowerCase()); k++) file = `images/${slug}-${n + 1}-${k}.${pic.ext}`;
      await store.writeFile(file, new Blob([pic.data.slice()], { type: IMAGE_TYPES[pic.ext] }));
      files.add(file.toLowerCase());
      saved.set(n, file);
      pictures++;
    }
    md = md.replace(/!\[([^\]]*)\]\(picture:\/\/(\d+)\)/g, (_, alt: string, n: string) => {
      const file = saved.get(Number(n));
      return file ? `![${alt}](${relativeFrom(refs[i].path, file).replace(/\(/g, "%28").replace(/\)/g, "%29")})` : "";
    });
    await store.write(refs[i].path, `${chapterTemplate(c.title, created)}${md.trim()}\n`);
  }

  const titles = new Map(refs.map((r) => [r.path, r.label]));
  await store.write(path, withChapters(bookTemplate(clean, created), path, refs, (p) => titles.get(p) ?? ""));
  return { book: path, title: clean, chapters: refs.map((r) => r.path), pictures, picturesLeftOut };
}

// --- Markdown and plain text -----------------------------------------------------------------------

export function readMarkdown(source: string): Draft {
  const draft: Draft = { title: "", pieces: [], pictures: [], leftOut: [] };
  let text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  // A header block at the top (from Obsidian, Bear and others) isn't writing.
  const header = /^---\n[\s\S]*?\n---\n/.exec(text);
  if (header) text = text.slice(header[0].length);

  // Google Docs puts its pictures at the end of the file, written out in full; each becomes a file.
  const named = new Map<string, number>();
  text = text.replace(/^\[([^\]\n]+)\]:\s*<?data:image\/([a-z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+?)>?[ \t]*$/gm, (_, ref: string, type: string, data: string) => {
    try {
      const raw = atob(data.replace(/\s+/g, ""));
      named.set(ref.toLowerCase(), draft.pictures.length);
      draft.pictures.push({ ext: type === "jpeg" ? "jpg" : type.replace(/\+.*$/, ""), data: Uint8Array.from(raw, (ch) => ch.charCodeAt(0)) });
    } catch {
      // A picture that can't be read is left out.
    }
    return "";
  });
  if (named.size) text = text.replace(/!\[([^\]\n]*)\]\[([^\]\n]+)\]/g, (all, alt: string, ref: string) => (named.has(ref.toLowerCase()) ? `![${alt}](picture://${named.get(ref.toLowerCase())})` : all));

  let chunk: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (chunk.length) {
      const md = chunk.join("\n");
      draft.pieces.push({ heading: 0, md, text: plain(md) });
    }
    chunk = [];
  };
  for (const line of text.split("\n")) {
    const mark = /^\s{0,3}(```+|~~~+)/.exec(line)?.[1];
    if (fence) {
      chunk.push(line);
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = null;
      continue;
    }
    if (mark) {
      fence = mark;
      chunk.push(line);
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h && plain(h[2])) {
      flush();
      draft.pieces.push({ heading: h[1].length, text: plain(h[2]), md: "" });
    } else if (line.trim() === "") flush();
    else chunk.push(line);
  }
  flush();
  return draft;
}

/** Markdown with its marks taken off, near enough for counting words and reading a heading. */
function plain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!<>~|])/g, "$1")
    .replace(/(\*{1,3}|_{1,3})(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/^\s{0,3}>\s?/gm, "")
    .trim();
}

// --- Word (.docx) ----------------------------------------------------------------------------------

interface El {
  name: string;
  attrs: Record<string, string>;
  kids: El[];
  /** For a "#text" element. */
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? all;
    const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });

/** A small reader for the tidy XML inside a Word file. It works the same in a browser and in tests. */
export function parseXml(xml: string): El {
  const root: El = { name: "#root", attrs: {}, kids: [], text: "" };
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\/([^\s>]+)\s*>|<([^\s>/]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (let m = token.exec(xml); m; m = token.exec(xml)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.kids.push({ name: "#text", attrs: {}, kids: [], text: m[1] });
    else if (m[2]) {
      if (stack.length > 1) stack.pop();
    } else if (m[3]) {
      const el: El = { name: m[3], attrs: {}, kids: [], text: "" };
      for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) el.attrs[a[1]] = decode(a[2] ?? a[3] ?? "");
      top.kids.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.kids.push({ name: "#text", attrs: {}, kids: [], text: decode(m[6]) });
  }
  return root;
}

const kid = (el: El | undefined, name: string) => el?.kids.find((k) => k.name === name);
const kids = (el: El | undefined, name: string) => el?.kids.filter((k) => k.name === name) ?? [];
const val = (el: El | undefined) => el?.attrs["w:val"];
/** An on/off setting such as <w:b/>: there, and not switched off. */
const on = (el: El | undefined): boolean | undefined => (el ? !["0", "false", "off"].includes(val(el) ?? "1") : undefined);
function find(el: El, name: string): El | undefined {
  for (const k of el.kids) {
    if (k.name === name) return k;
    const deep = find(k, name);
    if (deep) return deep;
  }
  return undefined;
}

interface Style {
  name: string;
  basedOn?: string;
  outline?: number;
  bold?: boolean;
  italic?: boolean;
}

interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
  /** A picture: its number in the draft, and the description it came with. */
  picture?: number;
  alt?: string;
}

async function readDocx(bytes: Uint8Array): Promise<Draft> {
  let files: ZipFile[];
  try {
    files = await unzip(bytes);
  } catch {
    throw new ManuscriptError("That file couldn't be opened as a Word document. Try saving it again as .docx.");
  }
  const byPath = new Map(files.map((f) => [f.path, f.data]));
  const xml = (path: string) => {
    const data = byPath.get(path);
    return data ? parseXml(new TextDecoder().decode(data)) : undefined;
  };
  const doc = xml("word/document.xml");
  const body = doc && find(doc, "w:body");
  if (!body) throw new ManuscriptError("That file couldn't be opened as a Word document. Try saving it again as .docx.");

  const styles = new Map<string, Style>();
  const styleDoc = xml("word/styles.xml");
  for (const s of styleDoc ? kids(find(styleDoc, "w:styles") ?? styleDoc, "w:style") : []) {
    const level = Number(val(kid(kid(s, "w:pPr"), "w:outlineLvl")));
    const rPr = kid(s, "w:rPr");
    styles.set(s.attrs["w:styleId"] ?? "", {
      name: (val(kid(s, "w:name")) ?? "").toLowerCase(),
      basedOn: val(kid(s, "w:basedOn")),
      outline: Number.isFinite(level) ? level : undefined,
      // Only a character style's own bold and italic count; a paragraph style's is how it looks, not emphasis.
      bold: s.attrs["w:type"] === "character" ? on(kid(rPr, "w:b")) : undefined,
      italic: s.attrs["w:type"] === "character" ? on(kid(rPr, "w:i")) : undefined,
    });
  }
  const outlineOf = (id: string | undefined): number | undefined => {
    for (let i = 0, s = styles.get(id ?? ""); s && i < 12; i++, s = styles.get(s.basedOn ?? "")) {
      if (s.outline !== undefined) return s.outline;
      const named = /^heading (\d)$/.exec(s.name);
      if (named) return Number(named[1]) - 1;
    }
    return undefined;
  };

  // Links and pictures are kept beside the text, by id.
  const targets = new Map<string, { target: string; external: boolean }>();
  const relDoc = xml("word/_rels/document.xml.rels");
  for (const r of relDoc ? kids(find(relDoc, "Relationships") ?? relDoc, "Relationship") : []) {
    targets.set(r.attrs.Id ?? "", { target: r.attrs.Target ?? "", external: r.attrs.TargetMode === "External" });
  }

  // Which lists are numbered: list id → (level → numbered).
  const numbered = new Map<string, Map<string, boolean>>();
  const numDoc = xml("word/numbering.xml");
  const numbering = numDoc && (find(numDoc, "w:numbering") ?? numDoc);
  if (numbering) {
    const abstracts = new Map<string, Map<string, boolean>>();
    for (const a of kids(numbering, "w:abstractNum")) {
      const levels = new Map<string, boolean>();
      for (const l of kids(a, "w:lvl")) levels.set(l.attrs["w:ilvl"] ?? "0", !["bullet", "none"].includes(val(kid(l, "w:numFmt")) ?? "bullet"));
      abstracts.set(a.attrs["w:abstractNumId"] ?? "", levels);
    }
    for (const n of kids(numbering, "w:num")) numbered.set(n.attrs["w:numId"] ?? "", abstracts.get(val(kid(n, "w:abstractNumId")) ?? "") ?? new Map());
  }

  const draft: Draft = { title: "", pieces: [], pictures: [], leftOut: [] };
  const seen = { deleted: false, notes: false, contents: false };
  const pictureIds = new Map<string, number>();

  function picture(drawing: El): Span | null {
    const id = find(drawing, "a:blip")?.attrs["r:embed"] ?? find(drawing, "v:imagedata")?.attrs["r:id"];
    const rel = id ? targets.get(id) : undefined;
    if (!rel || rel.external) return null;
    const path = rel.target.startsWith("/") ? rel.target.slice(1) : `word/${rel.target}`;
    const data = byPath.get(path);
    if (!data) return null;
    if (!pictureIds.has(path)) {
      pictureIds.set(path, draft.pictures.length);
      const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? "").toLowerCase();
      draft.pictures.push({ ext: ext === "jpeg" ? "jpg" : ext, data });
    }
    return { text: "", picture: pictureIds.get(path), alt: oneLine(find(drawing, "wp:docPr")?.attrs.descr ?? "") };
  }

  function spansIn(el: El, href: string | undefined, out: Span[]): Span[] {
    for (const k of el.kids) {
      switch (k.name) {
        case "w:r": {
          const rPr = kid(k, "w:rPr");
          const style = styles.get(val(kid(rPr, "w:rStyle")) ?? "");
          const bold = on(kid(rPr, "w:b")) ?? style?.bold ?? false;
          const italic = on(kid(rPr, "w:i")) ?? style?.italic ?? false;
          for (const t of k.kids) {
            let text: string | null = null;
            if (t.name === "w:t") text = t.kids.map((x) => x.text).join("");
            else if (t.name === "w:tab") text = " ";
            else if (t.name === "w:br") text = t.attrs["w:type"] ? "" : "\n";
            else if (t.name === "w:cr") text = "\n";
            else if (t.name === "w:noBreakHyphen") text = "‑";
            else if (t.name === "w:footnoteReference" || t.name === "w:endnoteReference") seen.notes = true;
            else if (t.name === "w:drawing" || t.name === "w:pict") {
              const p = picture(t);
              if (p) out.push(p);
            } else if (t.name === "mc:AlternateContent") {
              const p = picture(t);
              if (p) out.push(p);
            }
            if (text) out.push({ text, bold, italic, href });
          }
          break;
        }
        case "w:hyperlink": {
          const rel = targets.get(k.attrs["r:id"] ?? "");
          spansIn(k, rel?.external && /^(https?:|mailto:)/i.test(rel.target) ? rel.target : href, out);
          break;
        }
        case "w:del":
        case "w:moveFrom":
          seen.deleted = true;
          break;
        case "w:ins":
        case "w:moveTo":
        case "w:smartTag":
        case "w:fldSimple":
        case "w:customXml":
          spansIn(k, href, out);
          break;
        case "w:sdt":
          spansIn(kid(k, "w:sdtContent") ?? k, href, out);
          break;
      }
    }
    return out;
  }

  function paragraph(p: El, into: Piece[]): void {
    const pPr = kid(p, "w:pPr");
    const styleId = val(kid(pPr, "w:pStyle"));
    const name = styles.get(styleId ?? "")?.name ?? "";
    if (/^(toc|table of contents|verzeichnis) ?\d/.test(name) || name === "toc heading") {
      seen.contents = true;
      return;
    }
    const spans = spansIn(p, undefined, []);
    const text = spans.map((s) => s.text).join("").trim();
    const hasPicture = spans.some((s) => s.picture !== undefined);
    if (!text && !hasPicture) return;

    if (name === "title" || name === "subtitle") {
      // Only the first title is the book's; a later one is just a large line.
      const role = name as "title" | "subtitle";
      if (text && !into.some((x) => x.role === role) && into === draft.pieces) {
        into.push({ heading: 0, text: oneLine(text), md: "", role });
        return;
      }
    }
    if (!hasPicture && SCENE_BREAK.test(text)) {
      into.push({ heading: 0, text: "", md: "---" });
      return;
    }
    const direct = Number(val(kid(pPr, "w:outlineLvl")));
    const outline = Number.isFinite(direct) ? direct : outlineOf(styleId);
    if (text && !hasPicture && outline !== undefined && outline >= 0 && outline < 9) {
      into.push({ heading: Math.min(outline + 1, 6), text: oneLine(text), md: "" });
      return;
    }

    let md = spansToMarkdown(spans);
    const numPr = kid(pPr, "w:numPr");
    const numId = val(kid(numPr, "w:numId"));
    if (numId && numId !== "0") {
      const level = val(kid(numPr, "w:ilvl")) ?? "0";
      const indent = "    ".repeat(Math.min(Number(level) || 0, 4));
      md = `${indent}${numbered.get(numId)?.get(level) ? "1." : "-"} ${md.replace(/\n/g, `\n${indent}   `)}`;
      into.push({ heading: 0, text, md, list: true });
      return;
    }
    md = guardLineStart(md);
    if (/quote|zitat|citation/.test(name)) md = md.replace(/^/gm, "> ");
    into.push({ heading: 0, text, md });
  }

  function table(tbl: El, into: Piece[]): void {
    const rows = kids(tbl, "w:tr").map((tr) => kids(tr, "w:tc"));
    // A table of one box is a frame around ordinary writing.
    if (rows.length === 1 && rows[0].length === 1) return blocks(rows[0][0], into);
    const cell = (tc: El) => {
      const inner: Piece[] = [];
      blocks(tc, inner);
      return inner.map((x) => (x.heading ? escapeText(x.text) : x.md).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|")).join(" ");
    };
    const width = Math.max(1, ...rows.map((r) => r.length));
    const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
    const lines = rows.map((r) => line(r.map(cell)));
    if (!lines.length) return;
    lines.splice(1, 0, `|${" --- |".repeat(width)}`);
    const md = lines.join("\n");
    into.push({ heading: 0, text: plain(md.replace(/[|-]/g, " ")), md });
  }

  function blocks(el: El, into: Piece[]): void {
    for (const k of el.kids) {
      if (k.name === "w:p") paragraph(k, into);
      else if (k.name === "w:tbl") table(k, into);
      else if (k.name === "w:sdt") {
        if (find(k, "w:docPartGallery") && /table of contents/i.test(val(find(k, "w:docPartGallery")) ?? "")) seen.contents = true;
        else blocks(kid(k, "w:sdtContent") ?? k, into);
      }
    }
  }
  blocks(body, draft.pieces);

  const comments = xml("word/comments.xml");
  if (comments && find(comments, "w:comment")) draft.leftOut.push("comments");
  if (seen.deleted) draft.leftOut.push("text marked as deleted in tracked changes");
  if (seen.notes) draft.leftOut.push("footnotes");
  if (seen.contents) draft.leftOut.push("the table of contents");
  return draft;
}

/** Characters that would otherwise be read as Markdown. */
function escapeText(text: string): string {
  return text.replace(/([\\*_`[\]<])/g, "\\$1");
}

/** A paragraph that happens to begin like a heading, list or quote stays a paragraph. */
function guardLineStart(md: string): string {
  return md.replace(/^(\d+)([.)])(?=\s)/, "$1\\$2").replace(/^([#>+=~-])/, "\\$1");
}

function spansToMarkdown(spans: Span[]): string {
  // Neighbours with the same look are one run, so "**bo****ld**" never happens.
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.picture === undefined && last.picture === undefined && !!last.bold === !!s.bold && !!last.italic === !!s.italic && last.href === s.href) last.text += s.text;
    else merged.push({ ...s });
  }
  let out = "";
  for (const s of merged) {
    if (s.picture !== undefined) {
      out += `${out && !out.endsWith("\n") ? "\n\n" : ""}![${escapeText(s.alt ?? "")}](picture://${s.picture})\n\n`;
      continue;
    }
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.text)!;
    if (!core) {
      out += s.text;
      continue;
    }
    const mark = s.bold && s.italic ? "***" : s.bold ? "**" : s.italic ? "*" : "";
    // Emphasis can't run across a line break in Markdown, so each line gets its own.
    let inner = core
      .split("\n")
      .map((line) => {
        const [, l, c, t] = /^(\s*)([\s\S]*?)(\s*)$/.exec(line)!;
        return c ? `${l}${mark}${escapeText(c)}${mark}${t}` : line;
      })
      .join("\n");
    if (s.href) inner = `[${inner.replace(/\n/g, " ")}](${s.href.replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
    out += lead + inner + trail;
  }
  // A line break inside a paragraph is a Markdown hard break.
  return out.trim().replace(/(?<!\n)[ \t]*\n(?!\n)/g, "  \n").replace(/\n{3,}/g, "\n\n");
}
