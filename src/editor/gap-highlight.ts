/**
 * Draws gaps as chips while you write. The text itself stays exactly "TK" or "@tk[…]", so it
 * saves as plain Markdown and keeps any bold, italic or link around it.
 *
 * Same rules as notes/gaps.ts: not inside a word, not in code, and a request needs some text.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export const gapHighlightKey = new PluginKey<DecorationSet>("gapHighlight");

const PATTERN = /@tk\[([^\]\n]*[^\]\s][^\]\n]*)\]|(?<![\p{Script=Latin}\p{N}_@])TK(?![\p{Script=Latin}\p{N}_])/giu;

export interface GapPosition {
  from: number;
  to: number;
  request: string | null;
}

/** Every gap in the document, with editor positions. */
export function gapsInDoc(doc: PMNode): GapPosition[] {
  const out: GapPosition[] = [];
  doc.descendants((block, pos) => {
    if (!block.isTextblock) return true;
    // Join the block's text, leaving out code so `TK` in code isn't a gap.
    let text = "";
    const offsets: number[] = [];
    block.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText && !child.marks.some((m) => m.type.spec.code)) {
        for (let i = 0; i < child.text!.length; i++) offsets.push(start + i);
        text += child.text;
      } else {
        // Atoms and code break a word, like a space would.
        offsets.push(-1);
        text += " ";
      }
    });
    for (const m of text.matchAll(PATTERN)) {
      // "TK" must be upper case; requests may be written @tk or @TK.
      if (!m[1] && m[0] !== "TK") continue;
      const from = offsets[m.index];
      const to = offsets[m.index + m[0].length - 1];
      if (from < 0 || to < 0) continue;
      out.push({ from, to: to + 1, request: m[1]?.trim() ?? null });
    }
    return false;
  });
  return out;
}

function decorate(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  for (const g of gapsInDoc(doc)) {
    if (g.request === null) {
      decos.push(Decoration.inline(g.from, g.to, { class: "gap", "data-gap": "" }));
    } else {
      // "@tk[" and "]" are drawn small; the request reads as the chip's text.
      decos.push(Decoration.inline(g.from, g.from + 4, { class: "gap gap-open", "data-gap": "" }));
      decos.push(Decoration.inline(g.from + 4, g.to - 1, { class: "gap gap-request", "data-gap": "" }));
      decos.push(Decoration.inline(g.to - 1, g.to, { class: "gap gap-close", "data-gap": "" }));
    }
  }
  return DecorationSet.create(doc, decos);
}

export const GapHighlight = Extension.create({
  name: "gapHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: gapHighlightKey,
        state: {
          init: (_, state) => decorate(state.doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old),
        },
        props: {
          decorations: (state) => gapHighlightKey.getState(state),
        },
      }),
    ];
  },
});
