import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor as TiptapEditor } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import { Placeholder } from "@tiptap/extensions";
import { MarkdownConverter, joinBody, splitBody } from "./markdown";
import { parseNote, serializeNote } from "../notes/note";
import type { NoteStore } from "../store/store";

export type SaveState = "saved" | "saving" | "unsaved" | "error";

interface Props {
  store: NoteStore;
  path: string;
  /** The note's text as last read from storage. */
  initialText: string;
  onSaveState?: (state: SaveState, message?: string) => void;
}

const SAVE_DELAY_MS = 700;

/**
 * The writing surface. Opening a note never rewrites it: the note is only saved after the
 * writer changes something, a moment after they stop typing.
 */
export function Editor({ store, path, initialText, onSaveState }: Props) {
  const converter = useMemo(() => new MarkdownConverter(), []);
  const note = useMemo(() => parseNote(initialText), [initialText]);
  const parts = useMemo(() => splitBody(note.body), [note]);
  const timer = useRef<number | undefined>(undefined);
  const saving = useRef<Promise<void>>(Promise.resolve());

  const editor = useEditor({
    extensions: [
      ...converter.extensions,
      Placeholder.configure({
        placeholder: ({ node, pos }) => (pos === 0 && node.type.name === "heading" ? "Title" : "Start writing…"),
        showOnlyCurrent: true,
      }),
    ],
    content: converter.toDoc(parts.markdown),
    immediatelyRender: true,
    // Our security policy blocks inline <style>; the few rules Tiptap needs are in editor.css.
    injectCSS: false,
    editorProps: {
      attributes: { class: "writing", "aria-label": "Your note", spellcheck: "true" },
      // Only Medium's formatting survives a paste: no code, strikethrough or underline.
      transformPastedHTML: (html) =>
        html
          .replace(/<\/?(?:s|del|strike|u|code|kbd|mark|font|span)\b[^>]*>/gi, "")
          .replace(/<pre\b[^>]*>/gi, "<p>")
          .replace(/<\/pre>/gi, "</p>"),
    },
    onUpdate: ({ editor, transaction }) => {
      if (!transaction.docChanged) return;
      onSaveState?.("unsaved");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => save(editor), SAVE_DELAY_MS);
    },
  });

  function save(ed: TiptapEditor) {
    const markdown = converter.toMarkdown(ed.getJSON());
    const text = serializeNote({ ...note, body: joinBody({ ...parts, trail: parts.trail || note.eol, markdown }, note.eol) });
    onSaveState?.("saving");
    saving.current = saving.current
      .then(() => store.write(path, text))
      .then(() => onSaveState?.("saved"))
      .catch((e: unknown) => {
        onSaveState?.("error", e instanceof Error ? e.message : String(e));
      });
  }

  // Save straight away when leaving the page or the note.
  useEffect(() => {
    const flush = () => {
      if (timer.current !== undefined && editor) {
        window.clearTimeout(timer.current);
        timer.current = undefined;
        save(editor);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, path]);

  if (!editor) return null;
  return (
    <>
      <SelectionBar editor={editor} />
      <InsertMenu editor={editor} />
      <EditorContent editor={editor} />
    </>
  );
}

// --- The floating bar on a selection --------------------------------------------------------------

function SelectionBar({ editor }: { editor: TiptapEditor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      quote: e.isActive("blockquote"),
    }),
  });
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");

  const startLink = () => {
    setHref(editor.getAttributes("link").href ?? "");
    setLinking(true);
  };
  const applyLink = () => {
    const url = href.trim();
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: /^[a-z]+:/i.test(url) ? url : `https://${url}` }).run();
    setLinking(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      className="bar"
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: e, from, to }) => from !== to && !e.isActive("rawBlock") && !e.isActive("image")}
    >
      {linking ? (
        <form
          className="bar-link"
          onSubmit={(ev) => {
            ev.preventDefault();
            applyLink();
          }}
        >
          <label className="visually-hidden" htmlFor="link-address">
            Link address
          </label>
          <input
            id="link-address"
            autoFocus
            value={href}
            placeholder="Paste or type a link"
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setLinking(false)}
          />
          <button type="submit">{href.trim() ? "Add link" : "Remove link"}</button>
        </form>
      ) : (
        <>
          <BarButton label="Bold" shortcut="⌘B" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <b>B</b>
          </BarButton>
          <BarButton label="Italic" shortcut="⌘I" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <i>i</i>
          </BarButton>
          <BarButton label={state.link ? "Edit link" : "Add link"} shortcut="⌘K" active={state.link} onClick={startLink}>
            <LinkIcon />
          </BarButton>
          <span className="bar-gap" aria-hidden="true" />
          <BarButton label="Heading" active={state.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <span className="bar-t-big">T</span>
          </BarButton>
          <BarButton label="Small heading" active={state.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <span className="bar-t-small">T</span>
          </BarButton>
          <BarButton label="Quote" active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <span className="bar-quote">“</span>
          </BarButton>
        </>
      )}
    </BubbleMenu>
  );
}

function BarButton(props: { label: string; shortcut?: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="bar-button"
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.shortcut ? `${props.label} (${props.shortcut})` : props.label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

// --- The + on an empty line ------------------------------------------------------------------------
// Images join this menu once they can be shown from the notes folder (milestone 3); images
// already in a note are kept and saved as written.

/** The writing column plus room for the + in the margin. */
const WIDE_ENOUGH_FOR_PLUS = 900;

function InsertMenu({ editor }: { editor: TiptapEditor }) {
  const [open, setOpen] = useState(false);

  return (
    <FloatingMenu
      editor={editor}
      className="insert"
      options={{ placement: "left", offset: 12 }}
      // Only where the margin has room for it; on narrow screens, typing --- makes a divider.
      shouldShow={({ editor: e, state }) => {
        const { $from, empty } = state.selection;
        return (
          empty &&
          e.isEditable &&
          e.isFocused &&
          $from.parent.type.name === "paragraph" &&
          $from.parent.content.size === 0 &&
          window.innerWidth >= WIDE_ENOUGH_FOR_PLUS
        );
      }}
    >
      <button
        type="button"
        className="insert-toggle"
        aria-label={open ? "Close the add menu" : "Add a divider"}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">{open ? "×" : "+"}</span>
      </button>
      {open && (
        <div className="insert-choices">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().setHorizontalRule().run();
              setOpen(false);
            }}
          >
            Divider
          </button>
        </div>
      )}
    </FloatingMenu>
  );
}
