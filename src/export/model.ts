/**
 * What gets exported: a book (or one note) as plain chapters of blocks, with everything that only
 * matters while writing taken out. @ before a character's name goes; gaps stay visible as
 * "[TK]" or "[TK: the year]" so none slips through unnoticed; Stubli's small markers (pull quote,
 * picture size) become formatting.
 */
import type { JSONContent } from "@tiptap/core";
import { MarkdownConverter, splitBody } from "../editor/markdown";
import { parseNote } from "../notes/note";
import { resolveRelative } from "../store/store";

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

export type Block =
  | { t: "heading"; level: 2 | 3; spans: Span[] }
  | { t: "para"; spans: Span[] }
  | { t: "quote"; pull: boolean; blocks: Block[] }
  | { t: "list"; ordered: boolean; start: number; items: Block[][] }
  | { t: "break" }
  | { t: "image"; path: string | null; alt: string; caption: string; size: string | null }
  | { t: "code"; text: string }
  | { t: "table"; rows: string[][] };

export interface Chapter {
  title: string;
  subtitle: string;
  blocks: Block[];
}

export interface BookDetails {
  title: string;
  subtitle: string;
  author: string;
}

export interface ExportImage {
  data: Uint8Array<ArrayBuffer>;
  type: string;
  width: number;
  height: number;
}

let converter: MarkdownConverter | null = null;

/** One note as a chapter: its title, its subtitle (if any), and its writing. */
export function noteToChapter(path: string, text: string): Chapter {
  converter ??= new MarkdownConverter();
  const doc = converter.toDoc(splitBody(parseNote(text).body).markdown);
  const nodes = doc.content ?? [];
  let title = "";
  let subtitle = "";
  let i = 0;
  if (nodes[0]?.type === "heading" && nodes[0].attrs?.level === 1) {
    title = plainText(nodes[0]);
    i = 1;
    if (nodes[1]?.type === "heading" && nodes[1].attrs?.level === 4) {
      subtitle = plainText(nodes[1]);
      i = 2;
    }
  }
  return { title, subtitle, blocks: blocksOf(nodes.slice(i), path) };
}

function blocksOf(nodes: JSONContent[], notePath: string): Block[] {
  const out: Block[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case "heading": {
        const level = (n.attrs?.level ?? 2) as number;
        out.push({ t: "heading", level: level <= 2 ? 2 : 3, spans: spansOf(n.content) });
        break;
      }
      case "paragraph": {
        const kids = n.content ?? [];
        // A picture on its own line is a block of its own.
        if (kids.length === 1 && kids[0].type === "image") {
          out.push(imageBlock(kids[0], notePath));
          break;
        }
        const spans = spansOf(kids);
        if (spans.some((s) => s.text.trim())) out.push({ t: "para", spans });
        for (const k of kids) if (k.type === "image") out.push(imageBlock(k, notePath));
        break;
      }
      case "image":
        out.push(imageBlock(n, notePath));
        break;
      case "blockquote":
        out.push({ t: "quote", pull: n.attrs?.variant === "pull", blocks: blocksOf(n.content ?? [], notePath) });
        break;
      case "bulletList":
      case "orderedList":
      case "taskList":
        out.push({
          t: "list",
          ordered: n.type === "orderedList",
          start: (n.attrs?.start as number) ?? 1,
          items: (n.content ?? []).map((item) => blocksOf(item.content ?? [], notePath)),
        });
        break;
      case "horizontalRule":
        out.push({ t: "break" });
        break;
      case "codeBlock":
        out.push({ t: "code", text: plainText(n) });
        break;
      case "rawBlock": {
        const raw = String(n.attrs?.raw ?? "");
        if (n.attrs?.kind === "table") out.push({ t: "table", rows: tableRows(raw) });
        else {
          const text = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          if (text) out.push({ t: "para", spans: [{ text: clean(text) }] });
        }
        break;
      }
      default:
        if (n.content) out.push(...blocksOf(n.content, notePath));
    }
  }
  return out;
}

function imageBlock(n: JSONContent, notePath: string): Block {
  const src = String(n.attrs?.src ?? "");
  return { t: "image", path: resolveRelative(notePath, src), alt: String(n.attrs?.alt ?? ""), caption: String(n.attrs?.title ?? ""), size: (n.attrs?.size as string) ?? null };
}

function spansOf(nodes: JSONContent[] | undefined): Span[] {
  const out: Span[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "text") {
      const marks = n.marks ?? [];
      const has = (t: string) => marks.some((m) => m.type === t);
      const link = marks.find((m) => m.type === "link");
      const code = has("code");
      // A soft line break in Markdown is a space.
      const span: Span = { text: code ? (n.text ?? "") : clean((n.text ?? "").replace(/\n/g, " ")) };
      if (has("bold")) span.bold = true;
      if (has("italic")) span.italic = true;
      if (code) span.code = true;
      if (link?.attrs?.href) span.href = String(link.attrs.href);
      out.push(span);
    } else if (n.type === "hardBreak") out.push({ text: "\n" });
    else if (n.type === "rawInline") out.push({ text: String(n.attrs?.raw ?? "").replace(/<[^>]*>/g, "") });
    else if (n.content) out.push(...spansOf(n.content));
  }
  return out;
}

/** Writing-time marks out: @ before names; gaps made plain to see. */
export function clean(text: string): string {
  return text
    .replace(/@tk\[([^\]\n]*)\]/gi, (_, req: string) => `[TK: ${req.trim()}]`)
    .replace(/(?<![\p{L}\p{N}_@.[])TK(?![\p{L}\p{N}_:\]])/gu, "[TK]")
    .replace(/(?<![\p{L}\p{N}_@.])@(?=\p{L})/gu, "");
}

function plainText(n: JSONContent): string {
  if (n.type === "text") return n.text ?? "";
  return (n.content ?? []).map(plainText).join("");
}

function tableRows(raw: string): string[][] {
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\s*\|?\s*:?-{2,}/.test(l))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => clean(c.trim())),
    );
}

/** Every picture the chapters use (paths in the notes folder). */
export function picturesIn(chapters: Chapter[]): string[] {
  const out = new Set<string>();
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.t === "image" && b.path) out.add(b.path);
      else if (b.t === "quote") walk(b.blocks);
      else if (b.t === "list") b.items.forEach(walk);
    }
  };
  chapters.forEach((c) => walk(c.blocks));
  return [...out];
}

/** Words in the chapters, for the manuscript's title page ("about 80,000 words"). */
export function wordCount(chapters: Chapter[]): number {
  let n = 0;
  const count = (s: string) => (n += (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length);
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.t === "para" || b.t === "heading") b.spans.forEach((s) => count(s.text));
      else if (b.t === "quote") walk(b.blocks);
      else if (b.t === "list") b.items.forEach(walk);
    }
  };
  chapters.forEach((c) => (count(c.title), walk(c.blocks)));
  return n;
}

/** Text safe inside XML and HTML. */
export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A file name from a title: "The Surrendering.docx". */
export function fileName(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
  return `${base}.${ext}`;
}
