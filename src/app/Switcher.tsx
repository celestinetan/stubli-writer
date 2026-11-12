import { useEffect, useMemo, useRef, useState } from "react";
import { search, type LibraryNote } from "./library";

type Item =
  | { kind: "new"; title: string }
  | { kind: "today" }
  | { kind: "import" }
  | { kind: "books" }
  | { kind: "note"; note: LibraryNote; snippet?: string };

interface Props {
  open: boolean;
  notes: LibraryNote[];
  onClose: () => void;
  onOpen: (path: string) => void;
  onToday: () => void;
  onNew: (title: string) => void;
  onImport: () => void;
  onBooks: () => void;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** ⌘K: find a note by its words, open a recent one, or start a new one. */
export function Switcher({ open, notes, onClose, onOpen, onToday, onNew, onImport, onBooks }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery("");
      setActive(0);
      d.showModal();
      input.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    if (!q) {
      const recent = notes.slice(0, 12).map((note) => ({ kind: "note" as const, note }));
      return [{ kind: "today" }, { kind: "new", title: "" }, ...recent, { kind: "books" }, { kind: "import" }];
    }
    const hits = search(notes, q).map((h) => ({ kind: "note" as const, note: h.note, snippet: h.snippet }));
    const extra: Item[] = /^(books?|chapters?|characters?)$/i.test(q) ? [{ kind: "books" }] : [];
    return [...hits, ...extra, { kind: "new", title: q }];
  }, [query, notes]);

  function choose(item: Item) {
    onClose();
    if (item.kind === "today") onToday();
    else if (item.kind === "import") onImport();
    else if (item.kind === "books") onBooks();
    else if (item.kind === "new") onNew(item.title);
    else onOpen(item.note.path);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[active]) choose(items[active]);
    }
  }

  const empty = notes.length === 0;

  return (
    <dialog
      ref={dialog}
      className="sheet switcher"
      aria-label="Find or start a note"
      // The browser announces a close a moment late; if the sheet is open again by then, ignore it.
      onClose={() => !dialog.current?.open && onClose()}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className="sheet-inner">
        <div className="switcher-search">
          <label htmlFor="switcher-input" className="visually-hidden">
            Find or start a note
          </label>
          <input
            id="switcher-input"
            ref={input}
            value={query}
            placeholder="Find or start a note"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls="switcher-list"
            aria-activedescendant={`switcher-item-${active}`}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
          <button type="button" className="sheet-close" onClick={onClose}>
            Close
          </button>
        </div>
        <ul id="switcher-list" role="listbox" className="switcher-list">
          {items.map((item, i) => (
            <li
              key={item.kind === "note" ? item.note.path : item.kind}
              id={`switcher-item-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : undefined}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(item)}
            >
              {item.kind === "today" && (
                <>
                  <span className="item-title">Today</span>
                  <span className="item-meta">Your daily note</span>
                </>
              )}
              {item.kind === "import" && (
                <>
                  <span className="item-title">Import notes</span>
                  <span className="item-meta">From Bear, Obsidian or any Markdown files</span>
                </>
              )}
              {item.kind === "books" && (
                <>
                  <span className="item-title">Books</span>
                  <span className="item-meta">Chapters and characters, book by book</span>
                </>
              )}
              {item.kind === "new" && (
                <>
                  <span className="item-title">{item.title ? `New note: “${item.title}”` : "New note"}</span>
                  <span className="item-meta">Start writing</span>
                </>
              )}
              {item.kind === "note" && (
                <>
                  <span className="item-title">
                    {item.note.title}
                    {item.note.gaps.length > 0 && <span className="item-gaps"> · {item.note.gaps.length} TK</span>}
                  </span>
                  <span className="item-meta">
                    {item.snippet ?? `${folderOf(item.note.path)}${dateFmt.format(item.note.modified)}`}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        {query.trim() !== "" && items.every((i) => i.kind !== "note") && <p className="sheet-empty">No notes with those words yet.</p>}
        {empty && !query && <p className="sheet-empty">No notes yet. Today's note is a good place to start.</p>}
        <p className="sheet-hint" aria-hidden="true">
          ↑ ↓ to move · Enter to open · Esc to close
        </p>
      </div>
    </dialog>
  );
}

function folderOf(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? `${parts.slice(0, -1).join(" / ")} · ` : "";
}
