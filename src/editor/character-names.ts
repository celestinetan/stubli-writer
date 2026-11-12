/**
 * Underlines characters' names while you write, in each character's tint, when switched on.
 * Only drawn: the text is untouched, so nothing about the note changes.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { namePattern } from "../app/characters";

export interface NameEntry {
  /** As written: a name or one of its other names. */
  name: string;
  path: string;
  tint: number;
}

interface State {
  entries: NameEntry[];
  decos: DecorationSet;
}

export const characterNamesKey = new PluginKey<State>("characterNames");

function decorate(doc: PMNode, entries: NameEntry[]): DecorationSet {
  const pattern = namePattern(entries.map((e) => e.name));
  if (!pattern) return DecorationSet.empty;
  const byName = new Map(entries.map((e) => [e.name.replace(/\s+/g, " "), e]));
  const decos: Decoration[] = [];
  doc.descendants((block, pos) => {
    if (!block.isTextblock) return true;
    if (block.type.spec.code) return false;
    block.forEach((child, offset) => {
      if (!child.isText || child.marks.some((m) => m.type.spec.code)) return;
      for (const m of child.text!.matchAll(pattern)) {
        const e = byName.get(m[0].replace(/\s+/g, " "));
        if (!e) continue;
        const from = pos + 1 + offset + m.index;
        decos.push(Decoration.inline(from, from + m[0].length, { class: "character-name", "data-tint": String(e.tint), "data-character": e.path }));
      }
    });
    return false;
  });
  return DecorationSet.create(doc, decos);
}

/** Tells the editor which names to underline (an empty list switches them off). */
export function setNames(tr: Transaction, entries: NameEntry[]): Transaction {
  return tr.setMeta(characterNamesKey, entries);
}

export const CharacterNames = Extension.create({
  name: "characterNames",

  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: characterNamesKey,
        state: {
          init: () => ({ entries: [], decos: DecorationSet.empty }),
          apply: (tr, old) => {
            const entries = tr.getMeta(characterNamesKey) as NameEntry[] | undefined;
            if (entries) return { entries, decos: decorate(tr.doc, entries) };
            return tr.docChanged ? { entries: old.entries, decos: decorate(tr.doc, old.entries) } : old;
          },
        },
        props: {
          decorations: (state) => characterNamesKey.getState(state)?.decos,
        },
      }),
    ];
  },
});
