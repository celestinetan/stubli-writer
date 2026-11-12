import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "./books";
import { BOOKS_FOLDER } from "./books";
import type { BookTab } from "./BookBoard";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { DAILY_FOLDER, type LibraryNote } from "./library";
import { dirOf, isWithin, join } from "./moves";

/** Everything the sidebar can ask for; the workspace does the work (and offers Undo). */
export type SideAction =
  | { kind: "open"; path: string }
  | { kind: "book"; path: string; tab: BookTab }
  | { kind: "newNote"; folder: string }
  | { kind: "createFolder"; path: string }
  | { kind: "newBook"; title: string }
  | { kind: "renameNote"; path: string; title: string }
  | { kind: "renameFolder"; folder: string; name: string }
  | { kind: "renameBook"; path: string; title: string }
  | { kind: "moveNote"; path: string; folder: string }
  | { kind: "moveFolder"; folder: string; into: string }
  | { kind: "addToBook"; book: string; path: string }
  | { kind: "moveChapter"; book: string; from: number; to: number }
  | { kind: "takeOut"; book: string; index: number }
  | { kind: "trashNote"; path: string }
  | { kind: "trashFolder"; folder: string }
  | { kind: "trashBook"; path: string }
  | { kind: "export"; path: string; book: boolean };

interface Props {
  /** Beside the page (wide screens) or over it (narrow screens). */
  mode: "docked" | "drawer";
  onClose: () => void;
  placeName: string;
  onChangePlace: () => void;
  /** Notes for the Folders list: not books, chapters, characters or the Trash. */
  notes: LibraryNote[];
  /** Folders made here that have no notes yet. */
  emptyFolders: string[];
  books: Book[];
  byPath: Map<string, LibraryNote>;
  currentPath: string | null;
  isToday: boolean;
  hasTrash: boolean;
  onToday: () => void;
  onSearch: () => void;
  onTrash: () => void;
  onImport: () => void;
  onHelp: () => void;
  onAction: (a: SideAction) => void;
}

interface Folder {
  key: string;
  name: string;
  notes: LibraryNote[];
  folders: Folder[];
}

/** What's being dragged. */
type Drag = { kind: "note"; path: string } | { kind: "folder"; folder: string } | { kind: "chapter"; book: string; index: number; path: string };

const OPEN_KEY = "stubli-writer:sidebar-groups";
const DRAG_TYPE = "application/x-stubli-writer";
const ROOT = "";

/**
 * The navigation pane: where the notes are kept, books (each with its chapters and characters),
 * folders of notes, and the Trash. Arranged like the Finder: right-click (or the … button) for
 * New, Rename, Move to and Move to Trash; drag notes and folders where they belong.
 */
export function Sidebar(props: Props) {
  const { mode, onClose, notes, books, byPath, currentPath, onAction } = props;
  const aside = useRef<HTMLElement>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => loadGroups());
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  /** A row being renamed, or a new folder or book being named. */
  const [editing, setEditing] = useState<{ key: string; value: string; commit: (v: string) => void } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  // The group holding the open note is open.
  useEffect(() => {
    if (!currentPath) return;
    const book = books.find((b) => b.path === currentPath || b.chapters.some((c) => c.path === currentPath));
    const keys = book ? [`book:${book.path}`] : ancestors(dirOf(currentPath)).map((f) => `folder:${f}`);
    setOpenGroups((s) => (keys.every((k) => s.has(k)) ? s : new Set([...s, ...keys])));
  }, [currentPath, books]);

  useEffect(() => saveGroups(openGroups), [openGroups]);

  // As a drawer, focus starts inside (once, when it opens).
  useEffect(() => {
    if (mode === "drawer") aside.current?.querySelector<HTMLElement>("button")?.focus();
  }, [mode]);

  // As a drawer: Escape closes it (unless a menu or a name field is open).
  useEffect(() => {
    if (mode !== "drawer") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !menu && !editing && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, onClose, menu, editing]);

  const toggle = (key: string, open?: boolean) =>
    setOpenGroups((s) => {
      const next = new Set(s);
      if (open ?? !next.has(key)) next.add(key);
      else next.delete(key);
      return next;
    });

  const tree = useMemo(() => folderTree(notes, props.emptyFolders), [notes, props.emptyFolders]);
  const allFolders = useMemo(() => flatten(tree), [tree]);
  const closeMenu = useCallback(() => setMenu(null), []);

  // In a drawer, opening something also closes it.
  const open = (path: string) => {
    onAction({ kind: "open", path });
    if (mode === "drawer") onClose();
  };
  const go = (fn: () => void) => () => {
    fn();
    if (mode === "drawer") onClose();
  };

  /** Right-click, or the … button: the menu for that row. */
  const showMenu = (items: MenuItem[]) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fromButton = e.type === "click";
    setMenu({ x: fromButton ? r.left : e.clientX, y: fromButton ? r.bottom + 4 : e.clientY, items });
  };

  // Moving something into a folder opens it, so you see where it went.
  const moveTargets = (except: string | null, act: (folder: string) => void): MenuItem[] => {
    const to = (folder: string) => () => {
      act(folder);
      ancestors(folder).forEach((f) => toggle(`folder:${f}`, true));
    };
    return [
      { label: "Not in a folder", onChoose: to(ROOT), disabled: except === ROOT },
      ...allFolders.map((f) => ({ label: f.name, depth: f.depth, onChoose: to(f.key), disabled: except !== null && isWithin(f.key, except) })),
    ];
  };

  const startNewFolder = (parent: string) => {
    if (parent) toggle(`folder:${parent}`, true);
    setEditing({ key: `new-folder:${parent}`, value: "", commit: (name) => onAction({ kind: "createFolder", path: join(parent, name) }) });
  };

  const noteMenu = (n: LibraryNote): MenuItem[] => [
    { label: "Open", onChoose: () => open(n.path) },
    { label: "Rename", onChoose: () => setEditing({ key: `note:${n.path}`, value: n.title, commit: (v) => onAction({ kind: "renameNote", path: n.path, title: v }) }) },
    { label: "Move to…", submenu: moveTargets(dirOf(n.path), (folder) => onAction({ kind: "moveNote", path: n.path, folder })) },
    ...(books.length
      ? [{ label: "Add to a book…", submenu: books.map((b) => ({ label: b.title, onChoose: () => onAction({ kind: "addToBook", book: b.path, path: n.path }) })) }]
      : []),
    { label: "Export…", onChoose: go(() => onAction({ kind: "export", path: n.path, book: false })) },
    { label: "-" },
    { label: "Move to Trash", danger: true, onChoose: () => onAction({ kind: "trashNote", path: n.path }) },
  ];

  const folderMenu = (f: Folder): MenuItem[] => [
    { label: "New note here", onChoose: go(() => onAction({ kind: "newNote", folder: f.key })) },
    { label: "New folder inside", onChoose: () => startNewFolder(f.key) },
    { label: "Rename", onChoose: () => setEditing({ key: `folder:${f.key}`, value: f.name, commit: (v) => onAction({ kind: "renameFolder", folder: f.key, name: v }) }) },
    { label: "Move to…", submenu: moveTargets(f.key, (into) => onAction({ kind: "moveFolder", folder: f.key, into })) },
    { label: "-" },
    { label: "Move to Trash", danger: true, onChoose: () => onAction({ kind: "trashFolder", folder: f.key }) },
  ];

  const rootMenu: MenuItem[] = [
    { label: "New note", onChoose: go(() => onAction({ kind: "newNote", folder: ROOT })) },
    { label: "New folder", onChoose: () => startNewFolder(ROOT) },
  ];

  const bookMenu = (b: Book): MenuItem[] => [
    { label: "Arrange chapters", onChoose: go(() => onAction({ kind: "book", path: b.path, tab: "chapters" })) },
    { label: "Characters", onChoose: go(() => onAction({ kind: "book", path: b.path, tab: "characters" })) },
    { label: "Export the book…", onChoose: go(() => onAction({ kind: "export", path: b.path, book: true })) },
    { label: "Open the book note", onChoose: () => open(b.path) },
    { label: "Rename", onChoose: () => setEditing({ key: `book:${b.path}`, value: b.title, commit: (v) => onAction({ kind: "renameBook", path: b.path, title: v }) }) },
    { label: "-" },
    { label: "Move to Trash", danger: true, onChoose: () => onAction({ kind: "trashBook", path: b.path }) },
  ];

  const chapterMenu = (b: Book, i: number, n: LibraryNote | undefined): MenuItem[] => [
    ...(n ? [{ label: "Open", onChoose: () => open(n.path) }] : []),
    ...(n
      ? [{ label: "Rename", onChoose: () => setEditing({ key: `chapter:${b.path}#${i}`, value: n.title, commit: (v) => onAction({ kind: "renameNote", path: n.path, title: v }) }) }]
      : []),
    { label: "Move earlier", disabled: i === 0, onChoose: () => onAction({ kind: "moveChapter", book: b.path, from: i, to: i - 1 }) },
    { label: "Move later", disabled: i === b.chapters.length - 1, onChoose: () => onAction({ kind: "moveChapter", book: b.path, from: i, to: i + 1 }) },
    ...(n ? [{ label: "Export this chapter…", onChoose: go(() => onAction({ kind: "export", path: n.path, book: false })) }] : []),
    { label: "-" },
    { label: "Take out of the book", onChoose: () => onAction({ kind: "takeOut", book: b.path, index: i }) },
  ];

  // --- dragging -------------------------------------------------------------------------------

  const dragProps = (d: Drag) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDrag(d);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(d));
      e.dataTransfer.setData("text/plain", "path" in d ? d.path : d.folder);
    },
    onDragEnd: () => {
      setDrag(null);
      setDropKey(null);
    },
  });

  /** Where something may be dropped, and what happens. */
  const dropProps = (key: string, accepts: (d: Drag) => boolean, drop: (d: Drag) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag || !accepts(drag)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropKey(key);
    },
    onDragLeave: () => setDropKey((k) => (k === key ? null : k)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropKey(null);
      if (drag && accepts(drag)) drop(drag);
      setDrag(null);
    },
  });

  const intoFolder = (folder: string) =>
    dropProps(
      `folder:${folder}`,
      (d) => (d.kind === "note" ? dirOf(d.path) !== folder : d.kind === "folder" ? !isWithin(folder, d.folder) && dirOf(d.folder) !== folder : false),
      (d) => {
        if (d.kind === "note") onAction({ kind: "moveNote", path: d.path, folder });
        else if (d.kind === "folder") onAction({ kind: "moveFolder", folder: d.folder, into: folder });
        if (folder) toggle(`folder:${folder}`, true);
      },
    );

  const rowClass = (key: string, extra = "") => `side-row${dropKey === key ? " is-drop" : ""}${extra}`;

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
              const isOpen = openGroups.has(key);
              return (
                <li key={b.path}>
                  <div
                    className={rowClass(key)}
                    onContextMenu={showMenu(bookMenu(b))}
                    {...dropProps(
                      key,
                      (d) => d.kind === "note" && !b.chapters.some((c) => c.path === d.path),
                      (d) => d.kind === "note" && (onAction({ kind: "addToBook", book: b.path, path: d.path }), toggle(key, true)),
                    )}
                  >
                    {editing?.key === key ? (
                      <RenameField editing={editing} onDone={() => setEditing(null)} />
                    ) : (
                      <button type="button" className="side-item side-group" aria-expanded={isOpen} onClick={() => toggle(key)}>
                        <Chevron open={isOpen} />
                        {b.title}
                      </button>
                    )}
                    <MoreButton label={`More for “${b.title}”`} onClick={showMenu(bookMenu(b))} />
                  </div>
                  {isOpen && (
                    <ul className="side-list side-nested">
                      {b.chapters.map((c, i) => {
                        const note = byPath.get(c.path);
                        const ckey = `chapter:${b.path}#${i}`;
                        return (
                          <li key={ckey}>
                            <div
                              className={rowClass(ckey)}
                              onContextMenu={showMenu(chapterMenu(b, i, note))}
                              {...dragProps({ kind: "chapter", book: b.path, index: i, path: c.path })}
                              {...dropProps(
                                ckey,
                                (d) => d.kind === "chapter" && d.book === b.path && d.index !== i,
                                (d) => d.kind === "chapter" && onAction({ kind: "moveChapter", book: b.path, from: d.index, to: i }),
                              )}
                            >
                              {editing?.key === ckey ? (
                                <RenameField editing={editing} onDone={() => setEditing(null)} />
                              ) : (
                                <button
                                  type="button"
                                  className="side-item"
                                  aria-current={currentPath === c.path ? "page" : undefined}
                                  disabled={!note}
                                  onClick={() => open(c.path)}
                                >
                                  {note?.title ?? c.label}
                                </button>
                              )}
                              <MoreButton label={`More for “${note?.title ?? c.label}”`} onClick={showMenu(chapterMenu(b, i, note))} />
                            </div>
                          </li>
                        );
                      })}
                      <li>
                        <button type="button" className="side-item side-quiet" onClick={go(() => onAction({ kind: "book", path: b.path, tab: "chapters" }))}>
                          {b.chapters.length ? "Arrange chapters" : "Add chapters"}
                        </button>
                      </li>
                      <li>
                        <button type="button" className="side-item side-quiet" onClick={go(() => onAction({ kind: "book", path: b.path, tab: "characters" }))}>
                          Characters
                        </button>
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
            <li>
              {editing?.key === "new-book" ? (
                <RenameField editing={editing} onDone={() => setEditing(null)} placeholder="The book's title" />
              ) : (
                <button
                  type="button"
                  className="side-item side-quiet"
                  onClick={() => setEditing({ key: "new-book", value: "", commit: (title) => onAction({ kind: "newBook", title }) })}
                >
                  <span aria-hidden="true">+</span> New book
                </button>
              )}
            </li>
          </ul>

          <h2 className="side-heading side-heading-row">
            Folders
            <button type="button" className="side-add" aria-label="New folder" title="New folder" onClick={() => startNewFolder(ROOT)}>
              +
            </button>
          </h2>
          <ul className="side-list">
            {tree.folders.map((f) => (
              renderFolder(f)
            ))}
            {editing?.key === `new-folder:${ROOT}` && (
              <li>
                <RenameField editing={editing} onDone={() => setEditing(null)} placeholder="Folder name" />
              </li>
            )}
            <li>
              <div className={rowClass(`folder:${ROOT}`)} onContextMenu={showMenu(rootMenu)} {...intoFolder(ROOT)}>
                <button type="button" className="side-item side-group" aria-expanded={openGroups.has("folder:")} onClick={() => toggle("folder:")}>
                  <Chevron open={openGroups.has("folder:")} />
                  Not in a folder
                </button>
                <MoreButton label="More for notes not in a folder" onClick={showMenu(rootMenu)} />
              </div>
              {openGroups.has("folder:") && (
                <ul className="side-list side-nested">
                  {tree.notes.map((n) => renderNote(n))}
                  {tree.notes.length === 0 && <li className="side-empty">None</li>}
                </ul>
              )}
            </li>
          </ul>

          <ul className="side-list side-trash">
            <li>
              <button
                type="button"
                className={`side-item${dropKey === "trash" ? " is-drop" : ""}`}
                onClick={go(props.onTrash)}
                {...dropProps(
                  "trash",
                  (d) => d.kind !== "chapter",
                  (d) => (d.kind === "note" ? onAction({ kind: "trashNote", path: d.path }) : d.kind === "folder" && onAction({ kind: "trashFolder", folder: d.folder })),
                )}
              >
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
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </>
  );

  // Plain functions, not components: the rows must stay the same elements while dragging.
  function renderNote(note: LibraryNote) {
    const key = `note:${note.path}`;
    return (
      <li key={key}>
        <div className={rowClass(key)} onContextMenu={showMenu(noteMenu(note))} {...dragProps({ kind: "note", path: note.path })}>
          {editing?.key === key ? (
            <RenameField editing={editing} onDone={() => setEditing(null)} />
          ) : (
            <button type="button" className="side-item" aria-current={currentPath === note.path ? "page" : undefined} onClick={() => open(note.path)}>
              {note.title}
            </button>
          )}
          <MoreButton label={`More for “${note.title}”`} onClick={showMenu(noteMenu(note))} />
        </div>
      </li>
    );
  }

  function renderFolder(folder: Folder): React.ReactNode {
    const key = `folder:${folder.key}`;
    const isOpen = openGroups.has(key);
    return (
      <li key={key}>
        <div className={rowClass(key)} onContextMenu={showMenu(folderMenu(folder))} {...dragProps({ kind: "folder", folder: folder.key })} {...intoFolder(folder.key)}>
          {editing?.key === key ? (
            <RenameField editing={editing} onDone={() => setEditing(null)} />
          ) : (
            <button type="button" className="side-item side-group" aria-expanded={isOpen} onClick={() => toggle(key)}>
              <Chevron open={isOpen} />
              {folder.name}
            </button>
          )}
          <MoreButton label={`More for the folder “${folder.name}”`} onClick={showMenu(folderMenu(folder))} />
        </div>
        {(isOpen || editing?.key === `new-folder:${folder.key}`) && (
          <ul className="side-list side-nested">
            {folder.folders.map((f) => renderFolder(f))}
            {editing?.key === `new-folder:${folder.key}` && (
              <li>
                <RenameField editing={editing} onDone={() => setEditing(null)} placeholder="Folder name" />
              </li>
            )}
            {isOpen && folder.notes.map((n) => renderNote(n))}
            {isOpen && folder.notes.length === 0 && folder.folders.length === 0 && <li className="side-empty">Empty. Drag notes here.</li>}
          </ul>
        )}
      </li>
    );
  }
}

/** Typing a name in place, as in the Finder: Enter keeps it, Escape (or leaving it empty) doesn't. */
function RenameField({ editing, onDone, placeholder }: { editing: { value: string; commit: (v: string) => void }; onDone: () => void; placeholder?: string }) {
  const [value, setValue] = useState(editing.value);
  const done = useRef(false);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    if (keep && value.trim() && value.trim() !== editing.value) editing.commit(value.trim());
    onDone();
  };
  return (
    <form
      className="side-new"
      onSubmit={(e) => {
        e.preventDefault();
        finish(true);
      }}
    >
      <label className="visually-hidden" htmlFor="side-rename">
        {placeholder ?? "New name"}
      </label>
      <input
        id="side-rename"
        autoFocus
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), e.preventDefault(), finish(false))}
        onBlur={() => finish(true)}
      />
    </form>
  );
}

function MoreButton({ label, onClick }: { label: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" className="side-more" aria-label={label} title="More" aria-haspopup="menu" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="19" cy="12" r="1.8" />
      </svg>
    </button>
  );
}

/** Folders of notes, as on disk, without the Books folder (books are listed above). */
function folderTree(notes: LibraryNote[], emptyFolders: string[]): Folder {
  const root: Folder = { key: ROOT, name: "", notes: [], folders: [] };
  const place = (parts: string[]) => {
    let at = root;
    parts.forEach((name, i) => {
      const key = parts.slice(0, i + 1).join("/");
      let next = at.folders.find((f) => f.key === key);
      if (!next) at.folders.push((next = { key, name, notes: [], folders: [] }));
      at = next;
    });
    return at;
  };
  for (const n of notes) {
    const parts = n.path.split("/").slice(0, -1);
    if (parts[0] === BOOKS_FOLDER) continue;
    place(parts).notes.push(n);
  }
  for (const f of emptyFolders) if (f && f.split("/")[0] !== BOOKS_FOLDER) place(f.split("/"));
  const sort = (f: Folder) => {
    // Daily first, then by name; notes newest first (as they're listed everywhere else).
    f.folders.sort((a, b) => Number(b.name === DAILY_FOLDER) - Number(a.name === DAILY_FOLDER) || a.name.localeCompare(b.name));
    f.notes.sort((a, b) => b.modified - a.modified || a.title.localeCompare(b.title));
    f.folders.forEach(sort);
  };
  sort(root);
  return root;
}

function flatten(f: Folder, depth = 0): { key: string; name: string; depth: number }[] {
  return f.folders.flatMap((x) => [{ key: x.key, name: x.name, depth }, ...flatten(x, depth + 1)]);
}

function ancestors(folder: string): string[] {
  if (!folder) return [ROOT];
  const parts = folder.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
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
