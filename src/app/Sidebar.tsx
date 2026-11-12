import { useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "./books";
import type { BookTab } from "./BookBoard";
import { DAILY_FOLDER, type LibraryNote } from "./library";
import { BOOKS_FOLDER } from "./books";

interface Props {
  /** Beside the page (wide screens) or over it (narrow screens). */
  mode: "docked" | "drawer";
  onClose: () => void;
  /** Where the notes are, in words; choosing it changes that. */
  placeName: string;
  onChangePlace: () => void;
  /** Notes that aren't books, chapters' books, characters or in the Trash. */
  notes: LibraryNote[];
  books: Book[];
  byPath: Map<string, LibraryNote>;
  currentPath: string | null;
  isToday: boolean;
  hasTrash: boolean;
  onToday: () => void;
  onSearch: () => void;
  onOpen: (path: string) => void;
  onBook: (book: Book, tab: BookTab) => void;
  onNewBook: (title: string) => void;
  onTrash: () => void;
  onImport: () => void;
  onHelp: () => void;
}

interface Folder {
  key: string;
  name: string;
  notes: LibraryNote[];
  folders: Folder[];
}

const OPEN_KEY = "stubli-writer:sidebar-groups";

/**
 * The navigation pane: where the notes are kept, books (each with its chapters and characters),
 * folders of notes, and the Trash. Everything that isn't writing lives here.
 */
export function Sidebar(props: Props) {
  const { mode, onClose, notes, books, byPath, currentPath } = props;
  const aside = useRef<HTMLElement>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => loadGroups());
  const [newBook, setNewBook] = useState<string | null>(null);

  // The group holding the open note is open.
  useEffect(() => {
    if (!currentPath) return;
    const book = books.find((b) => b.path === currentPath || b.chapters.some((c) => c.path === currentPath));
    const key = book ? `book:${book.path}` : `folder:${currentPath.split("/").slice(0, -1).join("/") || "/"}`;
    setOpenGroups((s) => (s.has(key) ? s : new Set([...s, key])));
  }, [currentPath, books]);

  useEffect(() => saveGroups(openGroups), [openGroups]);

  // As a drawer: Escape closes it, and focus starts inside.
  useEffect(() => {
    if (mode !== "drawer") return;
    aside.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  const toggle = (key: string) =>
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const tree = useMemo(() => folderTree(notes), [notes]);
  // In a drawer, choosing something also closes it.
  const go = (fn: () => void) => () => {
    fn();
    if (mode === "drawer") onClose();
  };

  return (
    <>
      {mode === "drawer" && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside ref={aside} className={`sidebar is-${mode}`} aria-label="Books, folders and Trash">
        <div className="sidebar-head">
          <button type="button" className="side-place" onClick={go(props.onChangePlace)} title="Change where notes are kept">
            <span className="side-place-name">{props.placeName}</span>
            <span className="side-place-change">Change</span>
          </button>
          {mode === "drawer" && (
            <button type="button" className="sheet-close" onClick={onClose}>
              Close
            </button>
          )}
        </div>

        <nav className="sidebar-body">
          <ul className="side-list">
            <li>
              <button type="button" className="side-item" aria-current={props.isToday ? "page" : undefined} onClick={go(props.onToday)}>
                Today
              </button>
            </li>
            <li>
              <button type="button" className="side-item" onClick={go(props.onSearch)}>
                Search
                <kbd className="side-key">{isMac ? "⌘K" : "Ctrl+K"}</kbd>
              </button>
            </li>
          </ul>

          <h2 className="side-heading">Books</h2>
          <ul className="side-list">
            {books.map((b) => {
              const key = `book:${b.path}`;
              const open = openGroups.has(key);
              return (
                <li key={b.path}>
                  <button type="button" className="side-item side-group" aria-expanded={open} onClick={() => toggle(key)}>
                    <Chevron open={open} />
                    {b.title}
                  </button>
                  {open && (
                    <ul className="side-list side-nested">
                      {b.chapters.map((c, i) => {
                        const note = byPath.get(c.path);
                        return (
                          <li key={`${c.path}#${i}`}>
                            <button
                              type="button"
                              className="side-item"
                              aria-current={currentPath === c.path ? "page" : undefined}
                              disabled={!note}
                              onClick={go(() => props.onOpen(c.path))}
                            >
                              {note?.title ?? c.label}
                            </button>
                          </li>
                        );
                      })}
                      <li>
                        <button type="button" className="side-item side-quiet" onClick={go(() => props.onBook(b, "chapters"))}>
                          {b.chapters.length ? "Arrange chapters" : "Add chapters"}
                        </button>
                      </li>
                      <li>
                        <button type="button" className="side-item side-quiet" onClick={go(() => props.onBook(b, "characters"))}>
                          Characters
                        </button>
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
            <li>
              {newBook === null ? (
                <button type="button" className="side-item side-quiet" onClick={() => setNewBook("")}>
                  <span aria-hidden="true">+</span> New book
                </button>
              ) : (
                <form
                  className="side-new"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newBook.trim()) props.onNewBook(newBook.trim());
                    setNewBook(null);
                  }}
                >
                  <label className="visually-hidden" htmlFor="side-new-book">
                    The new book's title
                  </label>
                  <input
                    id="side-new-book"
                    autoFocus
                    value={newBook}
                    placeholder="The book's title"
                    autoComplete="off"
                    onChange={(e) => setNewBook(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setNewBook(null))}
                    onBlur={() => !newBook.trim() && setNewBook(null)}
                  />
                </form>
              )}
            </li>
          </ul>

          <h2 className="side-heading">Folders</h2>
          <ul className="side-list">
            {tree.folders.map((f) => (
              <FolderItem key={f.key} folder={f} openGroups={openGroups} toggle={toggle} currentPath={currentPath} onOpen={(p) => go(() => props.onOpen(p))()} />
            ))}
            {tree.notes.length > 0 && (
              <FolderItem
                folder={{ key: "/", name: "Not in a folder", notes: tree.notes, folders: [] }}
                openGroups={openGroups}
                toggle={toggle}
                currentPath={currentPath}
                onOpen={(p) => go(() => props.onOpen(p))()}
              />
            )}
            {tree.folders.length === 0 && tree.notes.length === 0 && <li className="side-empty">No notes yet.</li>}
          </ul>

          <ul className="side-list side-trash">
            <li>
              <button type="button" className="side-item" onClick={go(props.onTrash)}>
                <TrashIcon />
                Trash
                {!props.hasTrash && <span className="side-meta">empty</span>}
              </button>
            </li>
          </ul>
        </nav>

        <div className="sidebar-foot">
          <button type="button" className="link" onClick={go(props.onImport)}>
            Import notes
          </button>
          <button type="button" className="link" onClick={go(props.onHelp)}>
            Help
          </button>
          <a className="link" href="./privacy.html">
            Privacy
          </a>
        </div>
      </aside>
    </>
  );
}

function FolderItem({
  folder,
  openGroups,
  toggle,
  currentPath,
  onOpen,
}: {
  folder: Folder;
  openGroups: Set<string>;
  toggle: (key: string) => void;
  currentPath: string | null;
  onOpen: (path: string) => void;
}) {
  const key = `folder:${folder.key}`;
  const open = openGroups.has(key);
  return (
    <li>
      <button type="button" className="side-item side-group" aria-expanded={open} onClick={() => toggle(key)}>
        <Chevron open={open} />
        {folder.name}
      </button>
      {open && (
        <ul className="side-list side-nested">
          {folder.folders.map((f) => (
            <FolderItem key={f.key} folder={f} openGroups={openGroups} toggle={toggle} currentPath={currentPath} onOpen={onOpen} />
          ))}
          {folder.notes.map((n) => (
            <li key={n.path}>
              <button type="button" className="side-item" aria-current={currentPath === n.path ? "page" : undefined} onClick={() => onOpen(n.path)}>
                {n.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Folders of notes, as on disk, without the Books folder (books are listed above). */
function folderTree(notes: LibraryNote[]): Folder {
  const root: Folder = { key: "/", name: "", notes: [], folders: [] };
  for (const n of notes) {
    const parts = n.path.split("/").slice(0, -1);
    if (parts[0] === BOOKS_FOLDER) continue;
    let at = root;
    parts.forEach((name, i) => {
      const key = parts.slice(0, i + 1).join("/");
      let next = at.folders.find((f) => f.key === key);
      if (!next) at.folders.push((next = { key, name, notes: [], folders: [] }));
      at = next;
    });
    at.notes.push(n);
  }
  const sort = (f: Folder) => {
    // Daily first, then by name; notes newest first (as they're listed everywhere else).
    f.folders.sort((a, b) => Number(b.name === DAILY_FOLDER) - Number(a.name === DAILY_FOLDER) || a.name.localeCompare(b.name));
    f.notes.sort((a, b) => b.modified - a.modified || a.title.localeCompare(b.title));
    f.folders.forEach(sort);
  };
  sort(root);
  return root;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function loadGroups(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveGroups(groups: Set<string>): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...groups]));
  } catch {
    // Not remembered in a private window.
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`side-chevron${open ? " is-open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="side-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
