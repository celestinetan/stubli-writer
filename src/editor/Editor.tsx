import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { EditorContent, useEditor, useEditorState, type Editor as TiptapEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import { Placeholder } from "@tiptap/extensions";
import { MarkdownConverter, joinBody, splitBody } from "./markdown";
import { editorExtensions } from "./extensions";
import { gapsInDoc } from "./gap-highlight";
import { parseNote, readFields, serializeNote, writeFields } from "../notes/note";
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
  const startDropcap = useMemo(() => readFields(note).dropcap === true, [note]);
  const [dropcap, setDropcap] = useState(startDropcap);
  const dropcapNow = useRef(dropcap);
  dropcapNow.current = dropcap;

  const editor = useEditor({
    extensions: [
      ...converter.extensions,
      Placeholder.configure({
        placeholder: ({ node, pos }) =>
          node.type.name === "heading" && pos === 0 ? "Title" : node.type.name === "heading" && node.attrs.level === 4 ? "Subtitle" : "Start writing…",
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
      // Only the editor's own formatting survives a paste: no strikethrough, underline or colours.
      transformPastedHTML: (html) => html.replace(/<\/?(?:s|del|strike|u|kbd|mark|font|span)\b[^>]*>/gi, ""),
    },
    onUpdate: ({ editor, transaction }) => {
      if (transaction.docChanged) changed(editor);
    },
  });

  /** Something changed: save a moment after the writer stops. */
  function changed(ed: TiptapEditor) {
    onSaveState?.("unsaved");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      save(ed);
    }, SAVE_DELAY_MS);
  }

  function toggleDropcap() {
    setDropcap((d) => !d);
    if (editor) changed(editor);
  }

  function save(ed: TiptapEditor) {
    // Blank lines at the very end mean nothing; the file's own ending is kept in parts.trail.
    const markdown = converter.toMarkdown(ed.getJSON()).replace(/\s+$/, "");
    // The drop cap lives in the header; only touch the header if it changed.
    const withHeader = dropcapNow.current === startDropcap ? note : writeFields(note, { dropcap: dropcapNow.current || undefined });
    const text = serializeNote({ ...withHeader, body: joinBody({ ...parts, trail: parts.trail || note.eol, markdown }, note.eol) });
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
    <div className={dropcap ? "has-dropcap" : undefined}>
      <SelectionBar editor={editor} />
      <ImageBar editor={editor} />
      <InsertMenu editor={editor} store={store} notePath={path} dropcap={dropcap} onDropcap={toggleDropcap} />
      <EditorContent editor={editor} />
    </div>
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
      code: e.isActive("code"),
      quote: e.isActive("blockquote") && !e.isActive("blockquote", { variant: "pull" }),
      pull: e.isActive("blockquote", { variant: "pull" }),
    }),
  });

  /** Quote, then pull quote, then back to plain text. */
  const cycleQuote = () => {
    if (state.pull) editor.chain().focus().updateAttributes("blockquote", { variant: null }).toggleBlockquote().run();
    else if (state.quote) editor.chain().focus().updateAttributes("blockquote", { variant: "pull" }).run();
    else editor.chain().focus().toggleBlockquote().run();
  };
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
      shouldShow={({ editor: e, from, to }) => from !== to && !e.isActive("rawBlock") && !e.isActive("image") && !e.isActive("codeBlock")}
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
          <BarButton label="Code" shortcut="⌘E" active={state.code} onClick={() => editor.chain().focus().toggleCode().run()}>
            <span className="bar-code">{"</>"}</span>
          </BarButton>
          <span className="bar-gap" aria-hidden="true" />
          <BarButton label="Heading" active={state.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <span className="bar-t-big">T</span>
          </BarButton>
          <BarButton label="Small heading" active={state.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <span className="bar-t-small">T</span>
          </BarButton>
          <BarButton
            label={state.pull ? "Pull quote (press again for plain text)" : state.quote ? "Quote (press again for a pull quote)" : "Quote"}
            active={state.quote || state.pull}
            onClick={cycleQuote}
          >
            <span className={state.pull ? "bar-quote is-pull" : "bar-quote"}>“</span>
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

// --- A selected picture: its caption and size ------------------------------------------------------

function ImageBar({ editor }: { editor: TiptapEditor }) {
  const attrs = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.isActive("image") ? (e.getAttributes("image") as { title?: string | null; size?: string | null }) : null),
  });
  const [caption, setCaption] = useState("");
  useEffect(() => setCaption(attrs?.title ?? ""), [attrs?.title]);

  const setSize = (size: "inset" | "wide" | null) => editor.chain().focus().updateAttributes("image", { size }).run();
  const saveCaption = () => editor.chain().updateAttributes("image", { title: caption.trim() || null }).run();

  return (
    <BubbleMenu editor={editor} className="bar image-bar" options={{ placement: "top", offset: 8 }} shouldShow={({ editor: e }) => e.isActive("image")}>
      <BarButton label="Narrower than the text" active={attrs?.size === "inset"} onClick={() => setSize("inset")}>
        <SizeIcon width={8} />
      </BarButton>
      <BarButton label="The width of the text" active={!attrs?.size} onClick={() => setSize(null)}>
        <SizeIcon width={12} />
      </BarButton>
      <BarButton label="Wider than the text" active={attrs?.size === "wide"} onClick={() => setSize("wide")}>
        <SizeIcon width={18} />
      </BarButton>
      <span className="bar-gap" aria-hidden="true" />
      <form
        className="bar-link"
        onSubmit={(e) => {
          e.preventDefault();
          saveCaption();
          editor.commands.focus();
        }}
      >
        <label className="visually-hidden" htmlFor="image-caption">
          Caption
        </label>
        <input
          id="image-caption"
          value={caption}
          placeholder="Write a caption"
          onChange={(e) => setCaption(e.target.value)}
          onBlur={saveCaption}
          onKeyDown={(e) => e.key === "Escape" && editor.commands.focus()}
        />
      </form>
    </BubbleMenu>
  );
}

function SizeIcon({ width }: { width: number }) {
  const x = 12 - width / 2;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <rect x={x} y="7" width={width} height="10" rx="1.5" />
      <path d="M3 4h18M3 20h18" opacity="0.5" />
    </svg>
  );
}

// --- The + on an empty line ------------------------------------------------------------------------

/** The writing column plus room for the + in the margin. */
const WIDE_ENOUGH_FOR_PLUS = 900;

function InsertMenu(props: { editor: TiptapEditor; store: NoteStore; notePath: string; dropcap: boolean; onDropcap: () => void }) {
  const { editor, store, notePath, dropcap, onDropcap } = props;
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  // The subtitle goes on the line straight after the title.
  const underTitle = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { $from } = e.state.selection;
      const first = e.state.doc.firstChild;
      return $from.depth === 1 && $from.index(0) === 1 && first?.type.name === "heading" && first.attrs.level === 1;
    },
  });

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

  const choose = (run: () => void) => () => {
    run();
    setOpen(false);
  };

  return (
    <FloatingMenu
      editor={editor}
      className="insert"
      options={{ placement: "left", offset: 12 }}
      // Only where the margin has room for it. On narrow screens the shortcuts still work:
      // --- for a break, ``` for code, #### right under the title for a subtitle.
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
        aria-label={open ? "Close the add menu" : "Add a picture, code, a break and more"}
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
          {underTitle && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={choose(() => editor.chain().focus().setHeading({ level: 4 }).run())}>
              Subtitle
            </button>
          )}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={choose(() => editor.chain().focus().setCodeBlock().run())}>
            Code
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={choose(() => editor.chain().focus().setHorizontalRule().run())}>
            Break
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={choose(onDropcap)} aria-pressed={dropcap}>
            {dropcap ? "Remove drop cap" : "Drop cap"}
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
