/**
 * The editor's building blocks.
 *
 * Offered to the writer (Medium's set, design decision 3): title and two heading sizes, bold,
 * italic, link, quote, bulleted and numbered lists, divider, image. Gaps (TK and @tk[…]) are
 * ordinary text that the editor draws as chips (see gap-highlight.ts), so they can sit inside
 * bold text or a link like any other word.
 *
 * Kept quietly but never offered (so notes from other apps lose nothing): inline code,
 * strikethrough and task checkboxes.
 *
 * Protected (shown as a quiet block and saved exactly as written): tables, code blocks and
 * HTML blocks. HTML inside a line is kept the same way, inline.
 */
import { Extension, Node, type AnyExtension, type JSONContent, type MarkdownToken } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
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

  markdownTokenName: "code",
  parseMarkdown: (token: MarkdownToken) => ({ type: "rawBlock", attrs: { raw: rawOf(token), kind: "code" } }),
  renderMarkdown: (node: JSONContent) => node.attrs?.raw ?? "",
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

export function editorExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false, // code blocks are protected blocks instead
      underline: false, // not part of Markdown
      link: false, // replaced by WriterLink
      trailingNode: false,
    }),
    WriterLink.configure({ openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] }),
    Image.configure({ inline: false, allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    RawBlock,
    RawTable,
    RawInline,
    GapHighlight,
  ];
}
