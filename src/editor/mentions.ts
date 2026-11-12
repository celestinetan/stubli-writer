/**
 * Characters in a book's chapters: every "James" (and "@James") is underlined lightly in James's
 * tint, and typing @ opens a list of the book's characters to choose from or add to. Choosing one
 * writes just the name. Only drawn: the text is never changed by the underline.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { mentionPattern } from "../app/characters";

export interface CastEntry {
  /** As written after the @: a name or one of their other names. */
  name: string;
  path: string;
  tint: number;
  /** Underlined only where written @Name. */
  atOnly?: boolean;
}

/** "@Ja" just before the cursor: where the @ is, and what's typed after it. */
export interface MentionQuery {
  from: number;
  to: number;
  query: string;
}

interface State {
  cast: CastEntry[] | null;
  decos: DecorationSet;
  query: MentionQuery | null;
  /** Escape closes the list until the @ is typed again. */
  dismissedAt: number | null;
}

export const mentionsKey = new PluginKey<State>("mentions");

function decorate(doc: PMNode, cast: CastEntry[] | null): DecorationSet {
  if (!cast) return DecorationSet.empty;
  const patterns = [mentionPattern(cast.filter((e) => !e.atOnly).map((e) => e.name)), mentionPattern(cast.filter((e) => e.atOnly).map((e) => e.name), true)].filter(
    (p): p is RegExp => p !== null,
  );
  if (patterns.length === 0) return DecorationSet.empty;
  const byName = new Map(cast.map((e) => [e.name.replace(/\s+/g, " "), e]));
  const decos: Decoration[] = [];
  doc.descendants((block, pos) => {
    if (!block.isTextblock) return true;
    if (block.type.spec.code) return false;
    block.forEach((child, offset) => {
      if (!child.isText || child.marks.some((m) => m.type.spec.code)) return;
      for (const m of patterns.flatMap((p) => [...child.text!.matchAll(p)])) {
        const e = byName.get(m[0].replace(/^@/, "").replace(/\s+/g, " "));
        if (!e) continue;
        const from = pos + 1 + offset + m.index;
        decos.push(Decoration.inline(from, from + m[0].length, { class: "character-name", "data-tint": String(e.tint), "data-character": e.path }));
      }
    });
    return false;
  });
  return DecorationSet.create(doc, decos);
}

/** An @ at the start of a word, then up to a few words of a name, right before the cursor. */
function findQuery(state: EditorState, cast: CastEntry[]): MentionQuery | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $pos = selection.$from;
  if (!$pos.parent.isTextblock || $pos.parent.type.spec.code || $pos.marks().some((m) => m.type.spec.code)) return null;
  const before = $pos.parent.textBetween(Math.max(0, $pos.parentOffset - 40), $pos.parentOffset, undefined, "￼");
  const m = /(?:^|[\s([{“"‘'—–-])@([^\s@[\]￼][^@[\]￼]{0,30})?$/u.exec(before);
  if (!m) return null;
  const query = m[1] ?? "";
  // A space ends the name, unless it's still the start of a longer name ("@Mrs Lo").
  if (/\s/.test(query) && !cast.some((c) => c.name.toLowerCase().startsWith(query.toLowerCase()))) return null;
  if (/^tk$/i.test(query) && before.endsWith("[")) return null;
  return { from: $pos.pos - query.length - 1, to: $pos.pos, query };
}

export function setCast(tr: Transaction, cast: CastEntry[] | null): Transaction {
  return tr.setMeta(mentionsKey, { cast });
}

export function dismissMention(tr: Transaction, at: number): Transaction {
  return tr.setMeta(mentionsKey, { dismissedAt: at });
}

export const Mentions = Extension.create<{ onKey: (key: string) => boolean }>({
  name: "mentions",

  addOptions() {
    return { onKey: () => false };
  },

  addProseMirrorPlugins() {
    const onKey = (key: string) => this.options.onKey(key);
    return [
      new Plugin<State>({
        key: mentionsKey,
        state: {
          init: () => ({ cast: null, decos: DecorationSet.empty, query: null, dismissedAt: null }),
          apply: (tr, old, _oldState, newState) => {
            const meta = tr.getMeta(mentionsKey) as { cast?: CastEntry[] | null; dismissedAt?: number } | undefined;
            const cast = meta && "cast" in meta ? (meta.cast ?? null) : old.cast;
            const decos = meta && "cast" in meta ? decorate(tr.doc, cast) : tr.docChanged ? decorate(tr.doc, cast) : old.decos;
            let dismissedAt = meta?.dismissedAt ?? old.dismissedAt;
            const query = cast ? findQuery(newState, cast) : null;
            if (!query || (dismissedAt !== null && query.from !== dismissedAt)) dismissedAt = meta?.dismissedAt ?? null;
            return { cast, decos, query: query && query.from === dismissedAt ? null : query, dismissedAt };
          },
        },
        props: {
          decorations: (state) => mentionsKey.getState(state)?.decos,
          handleKeyDown: (view, event) => {
            if (!mentionsKey.getState(view.state)?.query) return false;
            if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return false;
            if (!onKey(event.key)) return false;
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});
