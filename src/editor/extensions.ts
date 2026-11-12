/**
 * The editor's building blocks.
 *
 * Offered to the writer: title, subtitle and two heading sizes, bold, italic, link, code in a
 * line, quote and pull quote, bulleted and numbered lists, code blocks, a three-dot break,
 * pictures with captions and sizes, and a drop cap. Gaps (TK and @tk[…]) are ordinary text that
 * the editor draws as chips (see gap-highlight.ts), so they can sit inside bold text or a link.
 *
 * Formats Markdown has no standard for are saved as small readable markers:
 *   pull quote   > [!pull]          (Obsidian's callout syntax; other apps show a quote)
 *   subtitle     #### after the title (as in Medium's own exports)
 *   image size   ![…](… "caption"){.wide} or {.inset}   (Pandoc's attribute syntax)
 *   drop cap     dropcap: true in the note's header
 *
 * Kept quietly but never offered (so notes from other apps lose nothing): strikethrough and
 * task checkboxes.
 *
 * Protected (shown as a quiet block and saved exactly as written): tables and HTML blocks.
 * HTML inside a line is kept the same way, inline.
 */
import { Extension, Node, type AnyExtension, type JSONContent, type MarkdownToken } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CodeBlock from "@tiptap/extension-code-block";
import Blockquote from "@tiptap/extension-blockquote";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { GapHighlight } from "./gap-highlight";

/** What kind of protected block, for its small label. */
export type RawKind = "table" | "code" | "html";

export function rawOf(token: MarkdownToken): string {
  return String(token.raw ?? token.text ?? "").replace(/\n+$/, "");
}

export const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      raw: { default: "" },
      kind: { default: "code" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-raw-block]",
        getAttrs: (el) => ({ raw: el.getAttribute("data-raw") ?? "", kind: el.getAttribute("data-kind") ?? "code" }),
      },
    ];
  },

  renderHTML({ node }) {
    const label = { table: "Table", code: "Code", html: "HTML" }[node.attrs.kind as RawKind] ?? "Formatting";
    return [
      "div",
      { "data-raw-block": "", "data-raw": node.attrs.raw, "data-kind": node.attrs.kind, class: "raw-block" },
      ["div", { class: "raw-label", contenteditable: "false" }, `${label} · kept as written`],
      ["pre", { class: "raw-source" }, node.attrs.raw],
    ];
  },

  renderMarkdown: (node: JSONContent) => node.attrs?.raw ?? "",
});

/**
 * Code blocks you can edit. The fence is kept exactly as written (``` or ~~~, any length, with
 * its info line), and indented code stays indented, so saving doesn't respell the file.
 */
export const WriterCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent!(),
      fence: { default: "```", rendered: false },
      info: { default: "", rendered: false },
      indented: { default: false, rendered: false },
      /** For indented code: a tab or four spaces, as the first line had it. */
      indent: { default: "    ", rendered: false },
    };
  },
  parseMarkdown: (token: MarkdownToken, helpers) => {
    const raw = String(token.raw ?? "");
    const indented = token.codeBlockStyle === "indented";
    const open = /^[ \t]{0,3}(`{3,}|~{3,})([^\n]*)/.exec(raw);
    const indent = /^\t/.test(raw) ? "\t" : "    ";
    return helpers.createNode(
      "codeBlock",
      { language: token.lang || null, fence: open?.[1] ?? "```", info: (open?.[2] ?? "").trim(), indented, indent },
      token.text ? [helpers.createTextNode(token.text)] : [],
    );
  },
  renderMarkdown: (node: JSONContent) => {
    const text = (node.content ?? []).map((c) => c.text ?? "").join("");
    const indent = node.attrs?.indent ?? "    ";
    if (node.attrs?.indented) return text.split("\n").map((l) => (l ? indent + l : l)).join("\n");
    const fence = node.attrs?.fence || "```";
    const info = node.attrs?.info || node.attrs?.language || "";
    return `${fence}${info}\n${text}\n${fence}`;
  },
});

const PULL = /^\[!pull\][ \t]*(?:\n|$)/i;

/** Quotes, and pull quotes: a quote that starts with [!pull]. */
export const WriterBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      variant: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-variant"),
        renderHTML: (attrs) => (attrs.variant ? { "data-variant": attrs.variant, class: "pull-quote" } : {}),
      },
    };
  },
  parseMarkdown: (token: MarkdownToken, helpers) => {
    const tokens = (token.tokens ?? []) as MarkdownToken[];
    let variant: string | null = null;
    const first = tokens[0];
    if (first?.type === "paragraph" && PULL.test(String(first.text ?? ""))) {
      variant = "pull";
      first.text = String(first.text).replace(PULL, "");
      first.raw = String(first.raw).replace(PULL, "");
      const inline = (first.tokens ?? []) as MarkdownToken[];
      if (inline[0]?.type === "text") {
        inline[0].text = String(inline[0].text).replace(PULL, "");
        inline[0].raw = String(inline[0].raw).replace(PULL, "");
        if (inline[0].text === "") inline.shift();
      }
      // "[!pull]" on its own line, then the quote: marked may split them into two paragraphs.
      if (first.text === "" && (first.tokens ?? []).length === 0) tokens.shift();
    }
    const parse = helpers.parseBlockChildren ?? helpers.parseChildren;
    return helpers.createNode("blockquote", variant ? { variant } : undefined, parse(tokens));
  },
  renderMarkdown(node: JSONContent, h, ctx) {
    const base = (Blockquote.config.renderMarkdown as (n: JSONContent, h: unknown, c: unknown) => string).call(this, node, h, ctx);
    return node.attrs?.variant === "pull" ? `> [!pull]\n${base}` : base;
  },
});

/** Tables become protected blocks. */
const RawTable = Extension.create({
  name: "rawTable",
  markdownTokenName: "table",
  parseMarkdown: (token: MarkdownToken) => ({ type: "rawBlock", attrs: { raw: rawOf(token), kind: "table" } }),
});

export const RawInline = Node.create({
  name: "rawInline",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return { raw: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "span[data-raw-inline]", getAttrs: (el) => ({ raw: el.getAttribute("data-raw") ?? "" }) }];
  },

  renderHTML({ node }) {
    return ["span", { "data-raw-inline": "", "data-raw": node.attrs.raw, class: "raw-inline" }, node.attrs.raw];
  },

  renderText({ node }) {
    return node.attrs.raw;
  },

  renderMarkdown: (node: JSONContent) => node.attrs?.raw ?? "",
});

/** Finds an image's file for display: a blob: address, or null when it can't be shown. */
export type ImageResolver = (src: string) => Promise<string | null>;

/**
 * Images: the file is read from the notes folder and shown from memory. Images from other
 * websites aren't loaded (that would tell those sites when the note is opened); a quiet
 * placeholder shows instead. The address in the note is never changed.
 */
export type ImageSize = "inset" | "wide" | null;

const NoteImage = Image.extend<{ resolve: ImageResolver | null; inline: boolean; allowBase64: boolean; HTMLAttributes: Record<string, unknown>; resize: false }>({
  addOptions() {
    return { ...this.parent!(), resolve: null };
  },

  addAttributes() {
    return {
      ...this.parent!(),
      /** null = the width of the text; "inset" = narrower; "wide" = wider than the text. */
      size: { default: null, rendered: false },
    };
  },

  renderMarkdown: (node: JSONContent) => {
    const { src = "", alt = "", title = "", size = null } = node.attrs ?? {};
    const caption = title ? ` "${String(title).replace(/"/g, '\\"')}"` : "";
    return `![${alt}](${src}${caption})${size ? `{.${size}}` : ""}`;
  },

  addNodeView() {
    const resolve = this.options.resolve;
    return ({ node }) => {
      const figure = document.createElement("figure");
      figure.className = `note-image${node.attrs.size ? ` is-${node.attrs.size}` : ""}`;
      const img = document.createElement("img");
      img.alt = node.attrs.alt ?? "";
      const note = document.createElement("div");
      note.className = "note-image-missing";
      const caption = document.createElement("figcaption");
      caption.className = "note-image-caption";
      caption.textContent = node.attrs.title ?? "";
      let url: string | null = null;

      const withCaption = (...els: HTMLElement[]) => figure.replaceChildren(...els, ...(node.attrs.title ? [caption] : []));
      const show = (message: string) => {
        note.textContent = message;
        withCaption(note);
      };
      if (!resolve) show(node.attrs.alt || "Image");
      else
        resolve(node.attrs.src ?? "")
          .then((u) => {
            if (u) {
              url = u;
              img.src = u;
              withCaption(img);
            } else if (/^https?:/i.test(node.attrs.src ?? "")) {
              show(`Image from the web, not loaded to keep your reading private${node.attrs.alt ? `: ${node.attrs.alt}` : ""}`);
            } else {
              show(`Image not found in your notes folder: ${node.attrs.src}`);
            }
          })
          .catch(() => show(`Image not found in your notes folder: ${node.attrs.src}`));

      return {
        dom: figure,
        destroy: () => {
          if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
        },
      };
    };
  },
});

/** Pictures with a size marker after them: ![…](… "caption"){.wide} or {.inset}. */
const SIZED_IMAGE = /^!\[((?:[^\]\\]|\\.)*)\]\(\s*([^)\s]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)\{\.(inset|wide)\}/;

const SizedImage = Extension.create({
  name: "sizedImage",
  markdownTokenName: "sizedImage",
  markdownTokenizer: {
    name: "sizedImage",
    level: "inline",
    start: (src: string) => {
      for (let i = src.indexOf("!["); i >= 0; i = src.indexOf("![", i + 2)) if (SIZED_IMAGE.test(src.slice(i))) return i;
      return -1;
    },
    tokenize(src: string) {
      const m = SIZED_IMAGE.exec(src);
      if (!m) return undefined;
      return { type: "sizedImage", raw: m[0], text: m[1], href: m[2], title: m[3]?.replace(/\\"/g, '"') ?? null, size: m[4] };
    },
  },
  parseMarkdown: (token: MarkdownToken, helpers) =>
    helpers.createNode("image", { src: token.href, alt: token.text, title: token.title ?? null, size: token.size }),
});

/** A link whose text is its own address is saved as the bare address. */
const WriterLink = Link.extend({
  renderMarkdown: (node: JSONContent, h, ctx) => {
    const href: string = node.attrs?.href ?? "";
    const title: string = node.attrs?.title ?? "";
    const text = h.renderChildren(node);
    // Tiptap writes marks around a placeholder and passes the link's real text in markText.
    const linkText = (ctx?.meta as { markText?: string } | undefined)?.markText;
    if (!title && linkText === href && /^https?:\/\/\S+$/.test(href)) return text;
    return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`;
  },
});

export function editorExtensions(options: { resolveImage?: ImageResolver } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      // 1 title, 2 and 3 headings, 4 the subtitle under the title.
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: false, // replaced by WriterCodeBlock
      blockquote: false, // replaced by WriterBlockquote
      underline: false, // not part of Markdown
      link: false, // replaced by WriterLink
      trailingNode: false,
    }),
    WriterLink.configure({ openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] }),
    NoteImage.configure({ inline: false, allowBase64: false, resolve: options.resolveImage ?? null }),
    SizedImage,
    WriterCodeBlock,
    WriterBlockquote,
    TaskList,
    TaskItem.configure({ nested: true }),
    RawBlock,
    RawTable,
    RawInline,
    GapHighlight,
  ];
}
