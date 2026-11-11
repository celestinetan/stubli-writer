import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { EditorContent, useEditor, useEditorState, type Editor as TiptapEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import { Placeholder } from "@tiptap/extensions";
import { MarkdownConverter, joinBody, splitBody } from "./markdown";
import { editorExtensions } from "./extensions";
import { gapsInDoc } from "./gap-highlight";
import { parseNote, serializeNote } from "../notes/note";
import { IMAGE_TYPES, relativeFrom, resolveRelative, type NoteStore } from "../store/store";

export type SaveState = "saved" | "saving" | "unsaved" | "error";

/** What the app can ask the editor to do. */
export interface EditorHandle {
  /** Selects the gap with this number (0 = first in the note) and scrolls to it. */
  showGap(index: number): boolean;
  /** Selects the next gap after the cursor, starting again at the top. */
  nextGap(): boolean;
  focus(): void;
}

interface Props {
  store: NoteStore;
  path: string;
  /** The note's text as last read from storage. */
  initialText: string;
  /** A brand-new note starts on an empty title. */
  startWithTitle?: boolean;
  /** Put the cursor at the end straight away (not on phones, where it would pop up the keyboard). */
  focusEnd?: boolean;
  onSaveState?: (state: SaveState, message?: string) => void;
  /** After each successful save, with the text that was written. */
  onSaved?: (path: string, text: string) => void;
  handle?: Ref<EditorHandle>;
}

const SAVE_DELAY_MS = 700;

/**
 * The writing surface. Opening a note never rewrites it: the note is only saved after the
 * writer changes something, a moment after they stop typing.
 */
export function Editor({ store, path, initialText, startWithTitle, focusEnd, onSaveState, onSaved, handle }: Props) {
  const resolveImage = useMemo(() => imageResolver(store, path), [store, path]);
  const converter = useMemo(() => new MarkdownConverter(editorExtensions({ resolveImage })), [resolveImage]);
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
    content:
      startWithTitle && parts.markdown === ""
        ? { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] }
        : withEmptyLastLine(converter.toDoc(parts.markdown)),
    autofocus: startWithTitle ? "start" : focusEnd && window.innerWidth >= 600 ? "end" : false,
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
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        save(editor);
      }, SAVE_DELAY_MS);
    },
  });

  function save(ed: TiptapEditor) {
    // Blank lines at the very end mean nothing; the file's own ending is kept in parts.trail.
    const markdown = converter.toMarkdown(ed.getJSON()).replace(/\s+$/, "");
    const text = serializeNote({ ...note, body: joinBody({ ...parts, trail: parts.trail || note.eol, markdown }, note.eol) });
    onSaveState?.("saving");
    saving.current = saving.current
      .then(() => store.write(path, text))
      .then(() => {
        onSaveState?.("saved");
        onSaved?.(path, text);
      })
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

  useImperativeHandle(
    handle,
    () => ({
      showGap(index) {
        const g = editor && gapsInDoc(editor.state.doc)[index];
        if (!editor || !g) return false;
        editor.chain().focus().setTextSelection({ from: g.from, to: g.to }).scrollIntoView().run();
        return true;
      },
      nextGap() {
        if (!editor) return false;
        const gaps = gapsInDoc(editor.state.doc);
        if (gaps.length === 0) return false;
        const after = editor.state.selection.to;
        const g = gaps.find((x) => x.from >= after) ?? gaps[0];
        editor.chain().focus().setTextSelection({ from: g.from, to: g.to }).scrollIntoView().run();
        return true;
      },
      focus() {
        if (!editor) return;
        // Before the writer has moved the cursor, Today goes back to its empty line, not the title.
        const atStart = editor.state.selection.from <= 1 && editor.state.selection.empty;
        editor.commands.focus(atStart && focusEnd ? "end" : undefined);
      },
    }),
    [editor, focusEnd],
  );

  if (!editor) return null;
  return (
    <>
      <SelectionBar editor={editor} />
      <InsertMenu editor={editor} store={store} notePath={path} />
      <EditorContent editor={editor} />
    </>
  );
}

/**
 * Every note opens with an empty line at the end (after a title, a list or a table), so there's
 * always somewhere to click and keep writing. It's part of the starting content, not an edit, so
 * opening a note still never saves it, and blank lines at the end are dropped when saving.
 */
function withEmptyLastLine(doc: JSONContent): JSONContent {
  const content = doc.content ?? [];
  const last = content[content.length - 1];
  if (last && last.type === "paragraph" && !last.content?.length) return doc;
  return { ...doc, content: [...content, { type: "paragraph" }] };
}

/** Reads images from the notes folder for display; images from the web are not loaded. */
function imageResolver(store: NoteStore, notePath: string) {
  return async (src: string): Promise<string | null> => {
    const filePath = resolveRelative(notePath, src);
    if (!filePath) return null;
    const blob = await store.readFile(filePath);
    return URL.createObjectURL(blob);
  };
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
          <BarButton label={state.link ? "Edit link" : "Add link"} active={state.link} onClick={startLink}>
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

/** The writing column plus room for the + in the margin. */
const WIDE_ENOUGH_FOR_PLUS = 900;

function InsertMenu({ editor, store, notePath }: { editor: TiptapEditor; store: NoteStore; notePath: string }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function addImage(f: File) {
    const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? "").toLowerCase();
    if (!(ext in IMAGE_TYPES)) {
      setProblem("That file isn't a photo or picture Stubli Writer can show (JPEG, PNG, GIF, WebP or AVIF).");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const safe = f.name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
    const filePath = `images/${stamp}-${safe}.${ext}`;
    try {
      await store.writeFile(filePath, f);
      editor.chain().focus().setImage({ src: relativeFrom(notePath, filePath), alt: "" }).run();
      setOpen(false);
      setProblem(null);
    } catch (e) {
      setProblem(`The picture couldn't be saved to your notes folder. ${e instanceof Error ? e.message : ""}`.trim());
    }
  }

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
        aria-label={open ? "Close the add menu" : "Add an image or a divider"}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setOpen(!open);
          setProblem(null);
        }}
      >
        <span aria-hidden="true">{open ? "×" : "+"}</span>
      </button>
      {open && (
        <div className="insert-choices">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => file.current?.click()}>
            Image
          </button>
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
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void addImage(f);
            }}
          />
        </div>
      )}
      {problem && (
        <p className="insert-problem" role="alert">
          {problem}
        </p>
      )}
    </FloatingMenu>
  );
}
