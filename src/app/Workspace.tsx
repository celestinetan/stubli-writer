import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, type EditorHandle, type GapTarget, type SaveState } from "../editor/Editor";
import type { NoteStore } from "../store/store";
import { isTrashPath, restorePathFor, trashPathFor } from "./trash";
import { OfflineStore, type SyncStatus } from "../store/offline-store";
import { FolderStore } from "../store/folder-store";
import { driveSession } from "../store/drive-session";
import { onUpdateReady, updateNow } from "./offline-copy";
import type { Appearance } from "../appearance";
import { AppearancePopover } from "./AppearancePopover";
import { GapPanel } from "./GapPanel";
import { ImportSheet } from "./ImportSheet";
import { HelpSheet } from "./HelpSheet";
import { WELCOME_PATH, markWelcomed, wasWelcomed, welcomeNote } from "./welcome";
import { Switcher } from "./Switcher";
import { BookBoard, type BookTab } from "./BookBoard";
import { Sidebar, type SideAction } from "./Sidebar";
import { dirOf, fileOf, folderMoves, freePath, isWithin, join, rewriteLinks, safeName, withTitle } from "./moves";
import { TrashSheet } from "./TrashSheet";
import { bookPath, books as readBooks, isBookNote, bookTemplate, chapterTemplate, moveItem, newChapterPath, withChapters, type Book, type ChapterRef } from "./books";
import { CharacterPeek } from "./CharacterPeek";
import {
  cardFields,
  cardsOutsideBooks,
  characterPath,
  characters,
  characterTemplate,
  isCharacterNote,
  withHeaderLine,
  writeCard,
  type CardFields,
  type Character,
} from "./characters";
import type { CastEntry } from "../editor/mentions";
import { readPlaces, writePlaces } from "./map-layout";
import { parseNote } from "../notes/note";
import {
  DAILY_FOLDER,
  dailyPath,
  dailyTemplate,
  describeNote,
  loadLibrary,
  newNotePath,
  newNoteTemplate,
  fold,
  isoDate,
  sortNotes,
  type LibraryNote,
} from "./library";

interface Props {
  store: NoteStore;
  appearance: Appearance;
  onAppearance: (a: Appearance) => void;
  /** Leave this storage and go back to the start screen. */
  onLeave: () => void;
}

interface Open {
  path: string;
  text: string;
  startWithTitle: boolean;
  focusEnd: boolean;
  /** Changes to remount the editor when the same note is opened fresh. */
  version: number;
}

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Not saved yet",
  error: "Couldn't save",
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

export function Workspace({ store, appearance, onAppearance, onLeave }: Props) {
  const [notes, setNotes] = useState<LibraryNote[] | null>(null);
  // The latest notes, for work that finishes later (Undo runs long after it was offered).
  const notesRef = useRef<LibraryNote[] | null>(null);
  notesRef.current = notes;
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const openRef = useRef<Open | null>(null);
  openRef.current = open;
  const [panel, setPanel] = useState<Panel | null>(null);
  /** The Book board: which tab, and which character to bring forward, when it opens. */
  const [boardStart, setBoardStart] = useState<{ tab: BookTab; character: string | null; book: string | null }>({ tab: "chapters", character: null, book: null });
  const [peek, setPeek] = useState<{ path: string; at: DOMRect } | null>(null);
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({ state: "saved" });
  const [typing, setTyping] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** After Move to Trash: what was moved, so Undo can put it back. */
  const [trashed, setTrashed] = useState<{ path: string; text: string; title: string; copy: string | null } | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  /** After a move or rename in the sidebar: what happened, and how to undo it. */
  const [undo, setUndo] = useState<{ message: string; run: () => Promise<void> } | null>(null);
  // Folders made in the sidebar that have no notes yet, remembered on this device.
  const foldersKey = `stubli-writer:empty-folders:${store.kind}:${store.label}`;
  const [emptyFolders, setEmptyFolders] = useState<string[]>(() => loadList(foldersKey));
  const keepFolders = (list: string[]) => {
    setEmptyFolders(list);
    saveList(foldersKey, list);
  };
  const [signInProblem, setSignInProblem] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);
  const editor = useRef<EditorHandle>(null);
  const closePeek = useCallback(() => setPeek(null), []);
  const aaButton = useRef<HTMLButtonElement>(null);
  const closeAppearance = useCallback(() => setPanel((p) => (p === "appearance" ? null : p)), []);
  const closeHelp = useCallback(() => setPanel((p) => (p === "help" ? null : p)), []);
  // The sidebar: beside the page on wide screens (open unless you closed it), a drawer otherwise.
  const narrow = useMediaQuery("(max-width: 1099px)");
  const [sidebarPref, setSidebarPref] = useState(() => loadSidebarPref());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarMode: "docked" | "drawer" | null = narrow ? (drawerOpen ? "drawer" : null) : sidebarPref ? "docked" : null;
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  function toggleSidebar() {
    if (narrow) setDrawerOpen((o) => !o);
    else
      setSidebarPref((o) => {
        saveSidebarPref(!o);
        return !o;
      });
  }
  // A sheet's late "closed" signal must only close that sheet, never one opened since.
  const closePanel = (which: Panel) => () => setPanel((p) => (p === which ? null : p));
  const openBook = (tab: BookTab = "chapters", character: string | null = null, book: string | null = null) => {
    setBoardStart({ tab, character, book });
    setPanel("book");
  };
  const pendingGap = useRef<GapTarget | null>(null);
  const version = useRef(0);

  const openNote = useCallback((path: string, text: string, startWithTitle = false, focusEnd = false) => {
    setOpen({ path, text, startWithTitle, focusEnd, version: ++version.current });
    setSave({ state: "saved" });
  }, []);

  const openToday = useCallback(
    (list: LibraryNote[]) => {
      const now = new Date();
      const path = dailyPath(now);
      const existing = list.find((n) => n.path === path);
      openNote(path, existing ? existing.text : dailyTemplate(now), false, true);
    },
    [openNote],
  );

  const reload = useCallback(async () => {
    setLoadProblem(null);
    try {
      const list = await loadLibrary(store);
      setNotes(list);
      return list;
    } catch (e) {
      setLoadProblem(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [store]);

  // Say so when another version of a note was kept as a conflicted copy (Drive: another
  // device; folder: another app or a sync service).
  useEffect(() => {
    const name = (p: string) => p.split("/").pop()!.replace(/\.md$/, "");
    const where = store.kind === "folder" ? "outside Stubli Writer" : "on another device";
    const onConflict = (path: string, copy: string) => {
      setNotice(`“${name(path)}” was also changed ${where}. Both versions are kept: the other one is now “${name(copy)}”.`);
      void reload();
    };
    if (store instanceof FolderStore) {
      store.onConflict = onConflict;
      return () => {
        store.onConflict = undefined;
      };
    }
    if (!(store instanceof OfflineStore)) return;
    const off = store.onStatus(setSync);
    const { drive } = driveSession();
    drive.onConflict = onConflict;
    return () => {
      off();
      drive.onConflict = undefined;
    };
  }, [store, reload]);

  async function signInAgain() {
    setSignInProblem(null);
    try {
      await driveSession().auth.signIn();
      await (store as OfflineStore).flush();
      await reload();
    } catch (e) {
      setSignInProblem(e instanceof Error ? e.message : String(e));
    }
  }

  // Load the notes, then open today's note. A brand-new notebook first gets a Welcome note.
  useEffect(() => {
    void (async () => {
      let list = await reload();
      const notebook = `${store.kind}:${store.label}`;
      if (list && list.length === 0 && store.kind !== "memory" && !wasWelcomed(notebook)) {
        try {
          await store.write(WELCOME_PATH, welcomeNote(new Date()));
          markWelcomed(notebook);
          list = await reload();
        } catch {
          // Not essential: the notebook just starts empty.
        }
      }
      if (!list) return;
      // A new notebook, or the samples (a first look), open on the Welcome note.
      const welcome = list.length === 1 || store.kind === "memory" ? list.find((n) => n.path === WELCOME_PATH) : undefined;
      if (welcome) openNote(welcome.path, welcome.text);
      else openToday(list);
    })();
  }, [reload, openToday, openNote, store]);

  /** Gives the note's file its title as a name, in the same folder. Never done without asking. */
  async function renameFile(note: LibraryNote, to: string) {
    setFileProblem(null);
    if (await store.exists(to)) {
      setFileProblem(`There's already a note named “${noteFileName(to)}” there, so this one keeps its name.`);
      return;
    }
    try {
      const text = await store.read(note.path);
      await store.write(to, text); // the new name first: the note is never only in neither
      await store.remove(note.path);
      const list = await reload();
      const n = list?.find((x) => x.path === to);
      if (n) openNote(n.path, n.text);
    } catch (e) {
      setFileProblem(`The file couldn't be renamed. ${e instanceof Error ? e.message : ""}`.trim());
      void reload();
    }
  }

  /** Moves the note into the Trash folder, keeping its place there, with Undo. */
  async function moveToTrash(note: LibraryNote) {
    setFileProblem(null);
    const taken = new Set((notes ?? []).map((n) => n.path));
    const to = trashPathFor(note.path, (p) => taken.has(p));
    try {
      const text = await store.read(note.path);
      await store.write(to, text); // the copy first: the note is never in neither place
      await store.remove(note.path);
      setUndo(null);
      setTrashed({ path: note.path, text, title: note.title, copy: to });
      const list = await reload();
      if (list) openToday(list.filter((n) => n.path !== note.path));
    } catch (e) {
      setFileProblem(`The note couldn't be moved to Trash. ${e instanceof Error ? e.message : ""}`.trim());
      void reload();
    }
  }

  async function undoTrash() {
    if (!trashed) return;
    const t = trashed;
    setTrashed(null);
    try {
      await store.write(t.path, t.text);
      if (t.copy) await store.remove(t.copy);
      const list = await reload();
      const n = list?.find((x) => x.path === t.path);
      if (n) openNote(n.path, n.text);
    } catch (e) {
      setFileProblem(`“${t.title}” couldn't be put back. ${e instanceof Error ? e.message : ""}`.trim());
    }
  }

  /** From the Trash, back where it was (or next to it, if that name is taken now). */
  async function restore(note: LibraryNote) {
    const taken = new Set((notes ?? []).map((n) => n.path));
    const to = restorePathFor(note.path, (p) => taken.has(p));
    try {
      await store.write(to, note.text);
      await store.remove(note.path);
      await reload();
    } catch (e) {
      setFileProblem(`“${note.title}” couldn't be restored. ${e instanceof Error ? e.message : ""}`.trim());
    }
  }

  /** From the Trash, for good (in Google Drive: to Drive's own trash). Asked first, in the Trash view. */
  async function deleteForGood(note: LibraryNote) {
    try {
      await store.remove(note.path);
      await reload();
    } catch (e) {
      setFileProblem(`“${note.title}” couldn't be deleted. ${e instanceof Error ? e.message : ""}`.trim());
    }
  }

  // After a save, the library learns the new text (titles, gaps and search stay current).
  const onSaved = useCallback((path: string, text: string) => {
    setNotes((list) => sortNotes([describeNote(path, text, Date.now()), ...(list ?? []).filter((n) => n.path !== path)]));
  }, []);

  const openPath = useCallback(
    (path: string) => {
      const n = notes?.find((x) => x.path === path);
      if (n) openNote(n.path, n.text);
    },
    [notes, openNote],
  );

  const newNote = useCallback(
    (title: string, folder = "") => {
      const now = new Date();
      const taken = new Set((notes ?? []).map((n) => n.path));
      const path = newNotePath(now, (p) => taken.has(p), folder);
      const text = newNoteTemplate(now) + (title ? `# ${title}\n\n` : "");
      openNote(path, text, title === "");
    },
    [notes, openNote],
  );

  // Books: chapters in order, kept as a list of links in the book note, and the book's characters.
  // Everything but the Trash.
  const live = useMemo(() => (notes ?? []).filter((n) => !isTrashPath(n.path)), [notes]);
  const trash = useMemo(() => (notes ?? []).filter((n) => isTrashPath(n.path)), [notes]);
  const byPath = useMemo(() => new Map(live.map((n) => [n.path, n])), [live]);
  const bookList = useMemo(() => readBooks(live), [live]);
  // The book the open note belongs to: the book note itself, or one of its chapters.
  const currentBook = useMemo(
    () => (open ? (bookList.find((b) => b.path === open.path) ?? bookList.find((b) => b.chapters.some((c) => c.path === open.path)) ?? null) : null),
    [bookList, open],
  );
  const cast = useMemo(() => characters(live, currentBook), [live, currentBook]);
  // For @ in the editor: only in a book (a one-off note has no cast).
  const castEntries = useMemo<CastEntry[] | null>(
    () => (currentBook ? cast.flatMap((c) => [c.name, ...c.aliases].map((name) => ({ name, path: c.path, tint: c.tint, atOnly: c.atOnly }))) : null),
    [cast, currentBook],
  );
  const outside = useMemo(() => cardsOutsideBooks(live, bookList), [live, bookList]);
  // Character cards aren't writing: they stay out of the notes list and search.
  const writing = useMemo(() => live.filter((n) => !isCharacterNote(n)), [live]);
  const fieldsOf = useCallback(
    (path: string): CardFields | null => {
      const n = notes?.find((x) => x.path === path);
      return n ? cardFields(n) : null;
    },
    [notes],
  );

  /** Saves a note's new text and shows it at once (in the open editor too). */
  async function writeNote(path: string, text: string, problem: string): Promise<boolean> {
    try {
      await store.write(path, text);
      onSaved(path, text);
      if (open?.path === path) openNote(path, text);
      return true;
    } catch (e) {
      setFileProblem(`${problem} ${e instanceof Error ? e.message : ""}`.trim());
      return false;
    }
  }

  /** Rewrites a book's chapter list (only that list), and shows it at once. */
  async function writeChapters(book: Book, chapters: ChapterRef[], extra: { path: string; text: string }[] = []) {
    const current = notes ?? [];
    const bookNote = current.find((n) => n.path === book.path);
    if (!bookNote) return;
    const titles = new Map([...current.map((n) => [n.path, n.title] as const), ...extra.map((x) => [x.path, describeNote(x.path, x.text, Date.now()).title] as const)]);
    const text = withChapters(bookNote.text, book.path, chapters, (p) => titles.get(p) ?? "");
    for (const x of extra) if (!(await writeNote(x.path, x.text, "The chapter couldn't be made."))) return;
    await writeNote(book.path, text, "The book couldn't be changed.");
  }

  async function newBook(title: string) {
    const path = bookPath(title);
    if (!path) return;
    if ((notes ?? []).some((n) => n.path === path)) {
      setFileProblem(`There's already a book called “${title}”.`);
      return;
    }
    await writeNote(path, bookTemplate(title, isoDate(new Date())), "The book couldn't be started.");
  }

  /** A new character card in a book (or nothing, if they're already there). */
  async function newCharacter(book: Book, name: string) {
    const path = characterPath(book, name);
    if (!path) return;
    const known = characters(notes ?? [], book).some((c) => fold(c.name) === fold(name) || c.aliases.some((a) => fold(a) === fold(name)));
    if (known || (notes ?? []).some((n) => n.path === path)) return;
    await writeNote(path, characterTemplate(name, isoDate(new Date())), "The character couldn't be added.");
  }

  async function saveCard(path: string, fields: CardFields) {
    const n = notes?.find((x) => x.path === path);
    if (n) await writeNote(path, writeCard(n.text, fields), "The card couldn't be saved.");
  }

  /** Written on one card, shown on both. A connection already there gets the new words. */
  async function connect(from: Character, to: Character, label: string) {
    const f = fieldsOf(from.path);
    if (!f) return;
    const names = new Set([to.name, ...to.aliases].map(fold));
    await saveCard(from.path, { ...f, connections: [...f.connections.filter((c) => !names.has(fold(c.name))), { name: to.name, label }] });
  }

  /** Removes the connection from whichever card it's written on (or both). */
  async function disconnect(a: Character, b: Character) {
    for (const [owner, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const f = fieldsOf(owner.path);
      if (!f) continue;
      const names = new Set([other.name, ...other.aliases].map(fold));
      const kept = f.connections.filter((c) => !names.has(fold(c.name)));
      if (kept.length !== f.connections.length) await saveCard(owner.path, { ...f, connections: kept });
    }
  }

  /** A card made before characters belonged to books moves into this book's folder. */
  async function moveIntoBook(book: Book, path: string) {
    const n = notes?.find((x) => x.path === path);
    const to = n && characterPath(book, n.title);
    if (!n || !to) return;
    if ((notes ?? []).some((x) => x.path === to)) {
      setFileProblem(`${book.title} already has a character called “${n.title}”.`);
      return;
    }
    try {
      await store.write(to, n.text);
      await store.remove(path);
      await reload();
    } catch (e) {
      setFileProblem(`The card couldn't be moved. ${e instanceof Error ? e.message : ""}`.trim());
    }
  }

  // --- Arranging notes and folders (the sidebar) -------------------------------------------

  /**
   * Moves notes from one path to another (a rename is a move), with their links fixed for the new
   * place and any book that lists them kept in order. `texts` replaces a note's text as it moves.
   */
  async function moveNotes(pairs: [string, string][], texts = new Map<string, string>()): Promise<boolean> {
    const current = notesRef.current ?? [];
    const books = readBooks(current.filter((n) => !isTrashPath(n.path)));
    const byP = new Map(current.map((n) => [n.path, n]));
    const map = new Map(pairs);
    if (open && map.has(open.path) && busySaving) {
      setFileProblem("Wait a moment: that note is still saving. Then try again.");
      return false;
    }
    try {
      for (const [from, to] of pairs) {
        const n = byP.get(from);
        if (!n) continue;
        await store.write(to, rewriteLinks(texts.get(from) ?? n.text, from, to));
        if (to !== from) await store.remove(from);
      }
      // Books that list a moved note, or that moved themselves, get their list rewritten.
      const titleAt = new Map(pairs.map(([from, to]) => [to, byP.get(from)?.title ?? ""]));
      for (const b of books) {
        if (!map.has(b.path) && !b.chapters.some((c) => map.has(c.path))) continue;
        const at = map.get(b.path) ?? b.path;
        const text = await store.read(at);
        const chapters = b.chapters.map((c) => ({ ...c, path: map.get(c.path) ?? c.path }));
        await store.write(at, withChapters(text, at, chapters, (p) => titleAt.get(p) || byP.get(p)?.title || ""));
      }
      const list = await reload();
      const now = openRef.current;
      if (now && map.has(now.path)) {
        const n = list?.find((x) => x.path === map.get(now.path));
        if (n) openNote(n.path, n.text);
      }
      return true;
    } catch (e) {
      setFileProblem(`That couldn't be moved. ${e instanceof Error ? e.message : ""}`.trim());
      await reload();
      return false;
    }
  }

  /** Moves, then offers Undo (which moves everything back, with the old text). */
  async function moveWithUndo(pairs: [string, string][], message: string, texts = new Map<string, string>(), folders?: string[]) {
    const byP = new Map((notes ?? []).map((n) => [n.path, n]));
    const before = new Map(pairs.map(([from, to]) => [to, byP.get(from)?.text ?? ""]));
    const foldersBefore = emptyFolders;
    if (!(await moveNotes(pairs, texts))) return;
    if (folders) keepFolders(folders);
    setTrashed(null);
    setUndo({
      message,
      run: async () => {
        await moveNotes(
          pairs.map(([from, to]) => [to, from]),
          before,
        );
        keepFolders(foldersBefore);
      },
    });
  }

  const allPaths = () => new Set((notes ?? []).map((n) => n.path));
  const folderExists = (folder: string) => emptyFolders.includes(folder) || (notes ?? []).some((n) => n.path.startsWith(`${folder}/`));

  async function sideAction(a: SideAction) {
    setFileProblem(null);
    const byP = new Map((notes ?? []).map((n) => [n.path, n]));
    const book = (path: string) => bookList.find((b) => b.path === path);
    switch (a.kind) {
      case "open":
        return openPath(a.path);
      case "book":
        return openBook(a.tab, null, a.path);
      case "newNote":
        return newNote("", a.folder);
      case "newBook":
        return newBook(a.title);
      case "createFolder": {
        const path = join(dirOf(a.path), safeName(fileOf(a.path)));
        if (!fileOf(path)) return;
        if (folderExists(path)) return setFileProblem(`There's already a folder called “${fileOf(path)}” there.`);
        return keepFolders([...emptyFolders, path]);
      }
      case "renameNote": {
        const n = byP.get(a.path);
        if (!n) return;
        const taken = allPaths();
        taken.delete(a.path);
        // A daily note keeps its dated file name; everything else is named after its title.
        const to = n.isDaily ? a.path : freePath(join(dirOf(a.path), `${safeName(a.title) || "Untitled"}.md`), (p) => taken.has(p));
        return moveWithUndo([[a.path, to]], `Renamed “${n.title}” to “${a.title}”.`, new Map([[a.path, withTitle(n.text, a.title)]]));
      }
      case "renameBook": {
        const n = byP.get(a.path);
        if (!n) return;
        return moveWithUndo([[a.path, a.path]], `Renamed the book to “${a.title}”.`, new Map([[a.path, withTitle(n.text, a.title)]]));
      }
      case "renameFolder":
      case "moveFolder": {
        const to = a.kind === "renameFolder" ? join(dirOf(a.folder), safeName(a.name)) : join(a.into, fileOf(a.folder));
        if (!fileOf(to) || to === a.folder) return;
        if (a.kind === "moveFolder" && isWithin(a.into, a.folder)) return;
        if (folderExists(to)) return setFileProblem(`There's already a folder called “${fileOf(to)}” there.`);
        const pairs = folderMoves([...allPaths()], a.folder, to);
        const folders = emptyFolders.map((f) => (isWithin(f, a.folder) ? to + f.slice(a.folder.length) : f));
        const message = a.kind === "renameFolder" ? `Renamed the folder to “${fileOf(to)}”.` : `Moved “${fileOf(a.folder)}” to ${a.into ? `“${fileOf(a.into)}”` : "the top"}.`;
        if (pairs.length === 0) return keepFolders(folders);
        return moveWithUndo(pairs, message, undefined, folders);
      }
      case "moveNote": {
        const n = byP.get(a.path);
        if (!n || dirOf(a.path) === a.folder) return;
        const taken = allPaths();
        const to = freePath(join(a.folder, fileOf(a.path)), (p) => taken.has(p));
        return moveWithUndo([[a.path, to]], `Moved “${n.title}” to ${a.folder ? `“${fileOf(a.folder)}”` : "Not in a folder"}.`, undefined, emptyFolders.filter((f) => f !== a.folder));
      }
      case "addToBook": {
        const b = book(a.book);
        if (b && !b.chapters.some((c) => c.path === a.path)) await writeChapters(b, [...b.chapters, { path: a.path, label: "" }]);
        return;
      }
      case "moveChapter": {
        const b = book(a.book);
        if (b && a.to >= 0 && a.to < b.chapters.length) await writeChapters(b, moveItem(b.chapters, a.from, a.to));
        return;
      }
      case "takeOut": {
        const b = book(a.book);
        if (b) await writeChapters(b, b.chapters.filter((_, i) => i !== a.index));
        return;
      }
      case "trashNote": {
        const n = byP.get(a.path);
        if (n) await moveToTrash(n);
        return;
      }
      case "trashFolder":
      case "trashBook": {
        const inside = a.kind === "trashFolder" ? a.folder : a.path.replace(/\.md$/i, "");
        const paths = [...allPaths()].filter((p) => p.startsWith(`${inside}/`) || p === (a.kind === "trashBook" ? a.path : ""));
        const taken = allPaths();
        const pairs = paths.map((p) => {
          const to = trashPathFor(p, (x) => taken.has(x));
          taken.add(to);
          return [p, to] as [string, string];
        });
        const name = a.kind === "trashFolder" ? `the folder “${fileOf(a.folder)}”` : `“${book(a.path)?.title ?? fileOf(a.path)}”`;
        const folders = emptyFolders.filter((f) => !isWithin(f, inside));
        if (pairs.length === 0) return keepFolders(folders);
        await moveWithUndo(pairs, `Moved ${name} to Trash.`, undefined, folders);
        if (open && paths.includes(open.path)) {
          const list = await reload();
          if (list) openToday(list);
        }
        return;
      }
    }
  }

  const showGap = useCallback(
    (path: string, target: GapTarget) => {
      setPanel(null);
      if (open?.path === path) {
        editor.current?.showGap(target);
      } else {
        pendingGap.current = target;
        openPath(path);
      }
    },
    [open, openPath],
  );

  // When the switcher or gap panel closes, the browser would put the cursor back where it was
  // before (often a note that's no longer open). Put it in the editor instead, so typing works.
  useEffect(() => {
    if (panel !== null) return;
    const id = requestAnimationFrame(() => editor.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [panel]);

  // Once a newly opened note is on screen, go to the gap that was asked for.
  useEffect(() => {
    if (pendingGap.current === null) return;
    const i = pendingGap.current;
    pendingGap.current = null;
    requestAnimationFrame(() => editor.current?.showGap(i));
  }, [open]);

  // Keyboard: ⌘K find or start a note, ⌘J next gap, ? help (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable='true'], dialog");
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault();
        setPanel("help");
        return;
      }
      // ⌘ on a Mac, Ctrl elsewhere; either works, so a Windows keyboard on a Mac works too.
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPanel((p) => (p === "switcher" ? null : "switcher"));
      } else if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (!editor.current?.nextGap()) setPanel("gaps");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // While typing on a computer, the top bar's buttons step back (CSS keeps them visible on touch
  // screens). Moving or pressing the pointer, or leaving the note, brings them back.
  useEffect(() => {
    const onType = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && (e.target as HTMLElement)?.closest?.(".writing")) setTyping(true);
    };
    const show = () => setTyping(false);
    const onFocus = (e: FocusEvent) => {
      if (!(e.target as HTMLElement)?.closest?.(".writing")) setTyping(false);
    };
    window.addEventListener("keydown", onType);
    window.addEventListener("pointermove", show);
    window.addEventListener("pointerdown", show);
    window.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("keydown", onType);
      window.removeEventListener("pointermove", show);
      window.removeEventListener("pointerdown", show);
      window.removeEventListener("focusin", onFocus);
    };
  }, []);

  const gapCount = live.reduce((n, x) => n + x.gaps.length, 0);
  const noteGaps = (notes ?? []).find((n) => n.path === open?.path)?.gaps.length ?? 0;
  // With Drive, "Saved" means it reached Drive; until then it's safe on this device.
  const statusLabel =
    store.kind === "memory" && save.state === "saved"
      ? "Not kept"
      : save.state !== "saved" || !sync || sync.waiting === 0
      ? SAVE_LABEL[save.state]
      : sync.offline
        ? "Offline · saved on this device"
        : sync.signInNeeded
          ? "Saved on this device"
        : "Uploading…";
  const isToday = open?.path === dailyPath(new Date());
  // Where the notes are, in words, for the menu.
  const placeName =
    store.kind === "folder" ? `Notes in “${store.label}” on this computer` : store.kind === "drive" ? "Notes in Google Drive" : "Sample notes (not kept)";
  // The open note, once it's saved (today's note isn't a file until you write in it).
  const openEntry = (notes ?? []).find((n) => n.path === open?.path);
  const busySaving = save.state === "unsaved" || save.state === "saving";
  // The book this note is, or is a chapter of.
  const inBook = openEntry ? (bookList.find((b) => b.path === openEntry.path) ?? bookList.find((b) => b.chapters.some((c) => c.path === openEntry.path))) : undefined;
  // Offered when the file's name and the note's title differ. Daily notes keep their dated names.
  const titledPath = openEntry && !openEntry.path.startsWith(`${DAILY_FOLDER}/`) ? pathForTitle(openEntry.path, openEntry.title) : null;

  return (
    <>
    {sidebarMode && (
      <Sidebar
        mode={sidebarMode}
        onClose={closeDrawer}
        placeName={placeName}
        onChangePlace={onLeave}
        // A chapter is listed under its book, not again under Folders.
        notes={writing.filter((n) => !isBookNote(n) && !bookList.some((b) => b.chapters.some((c) => c.path === n.path)))}
        books={bookList}
        byPath={byPath}
        currentPath={open?.path ?? null}
        isToday={isToday}
        hasTrash={trash.length > 0}
        emptyFolders={emptyFolders}
        onToday={() => notes && openToday(notes)}
        onSearch={() => setPanel("switcher")}
        onAction={(a) => void sideAction(a)}
        onTrash={() => setPanel("trash")}
        onImport={() => setPanel("import")}
        onHelp={() => setPanel("help")}
      />
    )}
    <div className={`shell${typing ? " is-typing" : ""}${panel === "help" ? " has-side-panel" : ""}${sidebarMode === "docked" ? " has-sidebar" : ""}`}>
      <header className="topbar">
        <nav className="topbar-left" aria-label="Notes">
          <button
            type="button"
            className="chip-button menu-button"
            aria-label={sidebarMode ? "Hide the sidebar" : "Show books, folders and Trash"}
            title={sidebarMode ? "Hide the sidebar" : "Books, folders and Trash"}
            aria-expanded={!!sidebarMode}
            onClick={toggleSidebar}
          >
            <MenuIcon />
          </button>
          <button type="button" className="chip-button" aria-current={isToday ? "page" : undefined} onClick={() => notes && openToday(notes)}>
            Today
          </button>
          <button type="button" className="chip-button" onClick={() => setPanel("switcher")} title={`Find or start a note (${mod}K)`}>
            <SearchIcon />
            <span className="label-wide">Notes</span>
            <kbd className="label-wide">{mod}K</kbd>
          </button>
        </nav>
        <div className="topbar-right">
          <span className={`save-state${save.state === "error" ? " error" : ""}`} role="status" title={save.message}>
            {statusLabel}
          </span>
          {/* No running count in the bar (Stubli: no counters). Tinted only when this note has gaps. */}
          <button
            type="button"
            className={`chip-button gaps-button${noteGaps ? " has-gaps" : ""}`}
            aria-label={`Gaps: ${noteGaps} in this note, ${gapCount} in all notes`}
            title={noteGaps ? `${noteGaps} in this note · ${gapCount} in all` : `${gapCount} in all notes`}
            onClick={() => setPanel("gaps")}
          >
            Gaps
          </button>
          <button type="button" className="chip-button wide-only" aria-label="Help" title="Help (?)" aria-haspopup="dialog" aria-expanded={panel === "help"} onClick={() => setPanel((p) => (p === "help" ? null : "help"))}>
            ?
          </button>
          <div className="popover-anchor">
            <button
              ref={aaButton}
              type="button"
              className="chip-button"
              aria-label="Appearance: text size, font, page and accent"
              title="Appearance"
              aria-haspopup="dialog"
              aria-expanded={panel === "appearance"}
              onClick={() => setPanel((p) => (p === "appearance" ? null : "appearance"))}
            >
              Aa
            </button>
            <AppearancePopover open={panel === "appearance"} value={appearance} onChange={onAppearance} onClose={closeAppearance} anchor={aaButton} />
          </div>
        </div>
      </header>

      {save.state === "error" && (
        <p className="problem" role="alert">
          Your last changes couldn't be saved. {save.message} They're still here; keep this page open and try again in a moment.
        </p>
      )}

      {sync?.signInNeeded && (
        <div className="note" role="note">
          <p>
            {sync.waiting > 0
              ? "Google asks you to sign in again before your latest changes can go to Drive. They're safe on this device until then."
              : "Sign in to Google to see changes from your other devices and keep saving to Drive. You can keep writing meanwhile."}
          </p>
          <button type="button" className="primary" onClick={() => void signInAgain()}>
            Continue with Google
          </button>
          {signInProblem && <p className="note-problem">{signInProblem}</p>}
        </div>
      )}
      {sync?.problem && !sync.signInNeeded && sync.waiting > 0 && (
        <p className="note" role="status">
          {sync.problem}
        </p>
      )}
      {updateReady && (
        <div className="note" role="status">
          <p>A new version of Stubli Writer is ready. Your notes are saved.</p>
          <button type="button" className="primary" onClick={updateNow} disabled={save.state === "unsaved" || save.state === "saving"}>
            Reload to update
          </button>
        </div>
      )}
      {notice && (
        <div className="note" role="status">
          <p>{notice}</p>
          <button type="button" className="link" onClick={() => setNotice(null)}>
            Hide this
          </button>
        </div>
      )}

      {fileProblem && (
        <div className="note" role="alert">
          <p>{fileProblem}</p>
          <button type="button" className="link" onClick={() => setFileProblem(null)}>
            Hide this
          </button>
        </div>
      )}

      {store.kind === "memory" && (
        <p className="note" role="note">
          Sample notes, kept in this page only: nothing is saved.{" "}
          <button type="button" className="link" onClick={onLeave}>
            Choose where to keep real notes
          </button>
        </p>
      )}

      <main className="page">
        {loadProblem ? (
          <div className="problem" role="alert">
            <p>Your notes folder couldn't be read. {loadProblem}</p>
            <p>
              <button type="button" className="link" onClick={() => void reload()}>
                Try again
              </button>{" "}
              or{" "}
              <button type="button" className="link" onClick={onLeave}>
                choose the folder again
              </button>
              .
            </p>
          </div>
        ) : open ? (
          <Editor
            key={`${open.path}#${open.version}`}
            store={store}
            path={open.path}
            initialText={open.text}
            startWithTitle={open.startWithTitle}
            focusEnd={open.focusEnd}
            handle={editor}
            onSaveState={(state, message) => setSave({ state, message })}
            onSaved={onSaved}
            cast={castEntries}
            onNewCharacter={(name) => currentBook && void newCharacter(currentBook, name)}
            onNameClick={(path, at) => setPeek({ path, at })}
          />
        ) : (
          <p className="loading" aria-live="polite">
            Opening your notes…
          </p>
        )}
      </main>

      <footer className="footer">
        {openEntry && (
          <p className="footer-line footer-note">
            <span>This note</span>
            {inBook && (
              <>
                <span aria-hidden="true">·</span>
                <button type="button" className="link" onClick={() => openBook()}>
                  {inBook.path === openEntry.path ? "Chapters and characters" : `In “${inBook.title}”`}
                </button>
              </>
            )}
            {titledPath && titledPath !== openEntry.path && (
              <>
                <span aria-hidden="true">·</span>
                <button type="button" className="link" disabled={busySaving} onClick={() => void renameFile(openEntry, titledPath)}>
                  Rename file to “{noteFileName(titledPath)}”
                </button>
              </>
            )}
            <span aria-hidden="true">·</span>
            <button type="button" className="link" disabled={busySaving} onClick={() => void moveToTrash(openEntry)}>
              Move to Trash
            </button>
          </p>
        )}
      </footer>

      <Switcher
        open={panel === "switcher"}
        notes={writing}
        onClose={closePanel("switcher")}
        onOpen={openPath}
        onToday={() => notes && openToday(notes)}
        onNew={newNote}
        onImport={() => setPanel("import")}
        onBooks={() => openBook()}
      />
      <ImportSheet
        open={panel === "import"}
        store={store}
        onClose={closePanel("import")}
        onImported={() => void reload()}
        onOpen={(path) => {
          void reload().then((list) => {
            const n = list?.find((x) => x.path === path);
            if (n) openNote(n.path, n.text);
          });
        }}
      />
      <HelpSheet
        open={panel === "help"}
        onClose={closeHelp}
        kind={store.kind}
        where={store.kind === "folder" ? `in “${store.label}” on this computer` : store.kind === "drive" ? "in the “Stubli Writer” folder in your Google Drive, with a copy on this device" : "only in this page, as samples (nothing is saved)"}
      />
      <BookBoard
        open={panel === "book"}
        books={bookList}
        notes={live}
        currentPath={boardStart.book ?? open?.path ?? null}
        startTab={boardStart.tab}
        focusCharacter={boardStart.character}
        outside={outside}
        fieldsOf={fieldsOf}
        onNewCharacter={(book, name) => void newCharacter(book, name)}
        onSaveCard={(path, f) => void saveCard(path, f)}
        onConnect={(a, b, label) => void connect(a, b, label)}
        onDisconnect={(a, b) => void disconnect(a, b)}
        onMoveIn={(book, path) => void moveIntoBook(book, path)}
        placesOf={(book, people) => {
          const header = parseNote(byPath.get(book.path)?.text ?? "").header ?? "";
          return readPlaces(/^character-map:\s*(.*)$/m.exec(header)?.[1] ?? "", people);
        }}
        onPlaces={(book, people, places) => {
          const n = byPath.get(book.path);
          if (!n) return;
          const note = parseNote(n.text);
          const line = writePlaces(places, people);
          const header = withHeaderLine(note.header, note.eol, "character-map", line || null);
          void writeNote(book.path, note.bom + (header ?? "") + note.body, "The map couldn't be saved.");
        }}
        onClose={closePanel("book")}
        onOpenNote={(path) => {
          setPanel(null);
          openPath(path);
        }}
        onNewBook={(title) => void newBook(title)}
        onReorder={(book, from, to) => void writeChapters(book, moveItem(book.chapters, from, to))}
        onNewChapter={(book, title) => {
          const taken = new Set((notes ?? []).map((n) => n.path));
          const path = newChapterPath(book, title, (p) => taken.has(p));
          if (path) void writeChapters(book, [...book.chapters, { path, label: title }], [{ path, text: chapterTemplate(title, isoDate(new Date())) }]);
        }}
        onAddNote={(book, path) => void writeChapters(book, [...book.chapters, { path, label: "" }])}
        onTakeOut={(book, index) => void writeChapters(book, book.chapters.filter((_, i) => i !== index))}
      />
      {peek && cast.find((c) => c.path === peek.path) && (
        <CharacterPeek
          character={cast.find((c) => c.path === peek.path)!}
          at={peek.at}
          onClose={closePeek}
          onOpenCard={() => {
            setPeek(null);
            openPath(peek.path);
          }}
          onShowBoard={() => {
            setPeek(null);
            openBook("characters", peek.path);
          }}
        />
      )}
      {/* Undo, as a bar at the bottom: seen even with the sidebar open over the page. */}
      {(trashed || undo) && (
        <div className="toast" role="status">
          <p>{undo ? undo.message : `Moved “${trashed!.title}” to Trash.`}</p>
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              if (undo) {
                const u = undo;
                setUndo(null);
                void u.run();
              } else void undoTrash();
            }}
          >
            Undo
          </button>
          <button type="button" className="toast-close" aria-label="Hide this" onClick={() => (undo ? setUndo(null) : setTrashed(null))}>
            ×
          </button>
        </div>
      )}
      <TrashSheet
        open={panel === "trash"}
        notes={trash}
        kind={store.kind}
        onClose={closePanel("trash")}
        onRestore={(n) => void restore(n)}
        onDelete={(n) => void deleteForGood(n)}
      />
      <GapPanel open={panel === "gaps"} notes={live} currentPath={open?.path ?? null} onClose={closePanel("gaps")} onShow={showGap} />
    </div>
    </>
  );
}

/** "Daily/x.md" → "x". */
function noteFileName(path: string): string {
  return path.split("/").pop()!.replace(/\.md$/i, "");
}

/** The path a note would have if its file were named after its title, in the same folder. */
function pathForTitle(path: string, title: string): string | null {
  const name = title
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 100)
    .trim();
  if (!name) return null;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  return `${dir}${name}.md`;
}

function loadList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Not remembered in a private window; the folder appears once a note is in it.
  }
}

type Panel = "switcher" | "gaps" | "import" | "appearance" | "help" | "book" | "trash";

const SIDEBAR_KEY = "stubli-writer:sidebar";

function loadSidebarPref(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "0";
  } catch {
    return true;
  }
}

function saveSidebarPref(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, open ? "1" : "0");
  } catch {
    // Not remembered in a private window.
  }
}

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
