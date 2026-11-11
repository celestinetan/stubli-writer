/**
 * Turning a note's text into editor content and back.
 *
 * The header and the blank lines around the text are kept aside and put back exactly, and the
 * file's line endings are restored, so the editor only ever touches the writing itself.
 */
import { getSchema, type AnyExtension, type JSONContent, type MarkdownToken } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { MarkdownManager } from "@tiptap/markdown";
import type { Note } from "../notes/note";
import { editorExtensions, rawOf } from "./extensions";

export interface EditorBody {
  /** Blank lines before the text. */
  lead: string;
  /** The text the editor works on. */
  markdown: string;
  /** Blank lines after the text (usually one newline). */
  trail: string;
}

export function splitBody(body: string): EditorBody {
  const lead = /^(?:[ \t]*\r?\n)*/.exec(body)![0];
  const rest = body.slice(lead.length);
  const trail = /(?:\r?\n[ \t]*)*$/.exec(rest)![0];
  const markdown = rest.slice(0, rest.length - trail.length);
  return { lead, markdown: markdown.replace(/\r\n/g, "\n"), trail };
}

export function joinBody(parts: EditorBody, eol: Note["eol"]): string {
  const text = eol === "\r\n" ? parts.markdown.replace(/\r?\n/g, "\r\n") : parts.markdown;
  return parts.lead + text + parts.trail;
}

const GAP_REQUEST = /@tk\[[^\]\n]*[^\]\s][^\]\n]*\]/gi;
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;

/**
 * Tiptap's Markdown converter, with three parts replaced:
 * - gentler escaping: a character only gets a backslash or an entity when, left alone, it would
 *   change the formatting, so "Tom & Jerry", "a < b", snake_case and @tk[requests] stay as typed;
 * - HTML is kept exactly as written instead of being turned into text.
 *
 * These replace internal methods of @tiptap/markdown 3.32.0 (the version is locked in
 * package.json). The editor round-trip tests fail if an update changes them.
 */
function writerMarkdownManager(extensions: AnyExtension[]): MarkdownManager {
  const manager = new MarkdownManager({ extensions });
  const internals = manager as unknown as {
    codeTypes: Set<string>;
    escapeMarkdownSyntax(text: string): string;
    encodeTextForMarkdown(text: string, node: JSONContent, parentNode?: JSONContent): string;
    parseHTMLToken(token: MarkdownToken): JSONContent | null;
  };
  for (const name of ["escapeMarkdownSyntax", "encodeTextForMarkdown", "parseHTMLToken"] as const) {
    if (typeof internals[name] !== "function") throw new Error(`@tiptap/markdown changed: ${name} is missing.`);
  }
  internals.escapeMarkdownSyntax = escapeMarkdownSyntax;
  internals.encodeTextForMarkdown = (text, node, parentNode) => {
    const inCode =
      (parentNode?.type != null && internals.codeTypes.has(parentNode.type)) ||
      (node.marks ?? []).some((m) => internals.codeTypes.has(typeof m === "string" ? m : m.type));
    if (inCode) return text;
    return escapeMarkdownSyntax(
      text
        // Only what could be read as HTML or an entity.
        .replace(/&(?=#?\w+;)/g, "&amp;")
        .replace(/<(?=[A-Za-z/!?])/g, "&lt;"),
    );
  };
  internals.parseHTMLToken = (token) => {
    const raw = String(token.raw ?? token.text ?? "");
    if (!raw.trim()) return null;
    return token.block
      ? { type: "rawBlock", attrs: { raw: rawOf(token), kind: "html" } }
      : { type: "rawInline", attrs: { raw } };
  };
  return manager;
}

function escapeMarkdownSyntax(text: string): string {
  const linkish = /\][([:]/.test(text);
  let out = "";
  let last = 0;
  for (const m of text.matchAll(GAP_REQUEST)) {
    out += escapePlain(text.slice(last, m.index), linkish) + m[0];
    last = m.index + m[0].length;
  }
  return out + escapePlain(text.slice(last), linkish);
}

function escapePlain(text: string, linkish: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = text[i - 1] ?? " ";
    const next = text[i + 1] ?? " ";
    const word = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
    if (c === "\\" && ASCII_PUNCT.test(next)) out += "\\\\";
    else if (c === "`") out += "\\`";
    // A star between spaces (5 * 3) can't start emphasis.
    else if (c === "*" && !(/\s/.test(prev) && /\s/.test(next))) out += "\\*";
    else if (c === "_" && !(word(prev) && word(next))) out += "\\_";
    else if (c === "~" && (prev === "~" || next === "~")) out += "\\~";
    else if ((c === "[" || c === "]") && linkish) out += "\\" + c;
    else out += c;
  }
  return out;
}

export class MarkdownConverter {
  readonly extensions: AnyExtension[];
  private manager: MarkdownManager;
  private schema;

  constructor(extensions: AnyExtension[] = editorExtensions()) {
    this.extensions = extensions;
    this.manager = writerMarkdownManager(extensions);
    this.schema = getSchema(extensions);
  }

  /** Markdown → editor content, checked against the editor's schema. */
  toDoc(markdown: string): JSONContent {
    return PMNode.fromJSON(this.schema, this.manager.parse(markdown)).toJSON();
  }

  /** Editor content → Markdown. */
  toMarkdown(doc: JSONContent): string {
    return this.manager.serialize(doc);
  }

  roundTrip(markdown: string): string {
    return this.toMarkdown(this.toDoc(markdown));
  }
}
