import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, type EditorHandle, type GapTarget, type SaveState } from "../editor/Editor";
import { TRASH_FOLDER, type NoteStore } from "../store/store";
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
import { NotebookMenu } from "./NotebookMenu";
import { bookPath, books as readBooks, bookTemplate, chapterTemplate, moveItem, newChapterPath, withChapters, type Book, type ChapterRef } from "./books";
import { CharacterPeek } from "./CharacterPeek";
import {
  cardFields,
  cardsOutsideBooks,
  characterPath,
  characters,
  characterTemplate,
  isCharacterNote,
  writeCard,
  type CardFields,
  type Character,
} from "./characters";
import type { CastEntry } from "../editor/mentions";
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
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  /** The Book board: which tab, and which character to bring forward, when it opens. */
  const [boardStart, setBoardStart] = useState<{ tab: BookTab; character: string | null }>({ tab: "chapters", character: null });
  const [peek, setPeek] = useState<{ path: string; at: DOMRect } | null>(null);
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({ state: "saved" });
  const [typing, setTyping] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** After Move to Trash: what was moved, so Undo can put it back. */
  const [trashed, setTrashed] = useState<{ path: string; text: string; title: string; copy: string | null } | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [signInProblem, setSignInProblem] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);
  const editor = useRef<EditorHandle>(null);
  const closePeek = useCallback(() => setPeek(null), []);
  const aaButton = useRef<HTMLButtonElement>(null);
  const closeAppearance = useCallback(() => setPanel((p) => (p === "appearance" ? null : p)), []);
  const closeHelp = useCallback(() => setPanel((p) => (p === "help" ? null : p)), []);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setPanel((p) => (p === "menu" ? null : p)), []);
  // A sheet's late "closed" signal must only close that sheet, never one opened since.
  const closePanel = (which: Panel) => () => setPanel((p) => (p === which ? null : p));
  const openBook = (tab: BookTab = "chapters", character: string | null = null) => {
    setBoardStart({ tab, character });
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

  /** Moves the note out of the way, with Undo. A folder keeps it in its Trash folder; Drive in Drive's trash. */
  async function moveToTrash(note: LibraryNote) {
    setFileProblem(null);
    try {
      const text = await store.read(note.path);
      let copy: string | null = null;
      if (store.kind === "folder") {
        const base = noteFileName(note.path);
        copy = `${TRASH_FOLDER}/${base}.md`;
        for (let i = 2; await store.exists(copy); i++) copy = `${TRASH_FOLDER}/${base} ${i}.md`;
        await store.write(copy, text);
      }
      await store.remove(note.path);
      setTrashed({ path: note.path, text, title: note.title, copy });
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
    (title: string) => {
      const now = new Date();
      const taken = new Set((notes ?? []).map((n) => n.path));
      const path = newNotePath(now, (p) => taken.has(p));
      const text = newNoteTemplate(now) + (title ? `# ${title}\n\n` : "");
      openNote(path, text, title === "");
    },
    [notes, openNote],
  );

  // Books: chapters in order, kept as a list of links in the book note, and the book's characters.
  const bookList = useMemo(() => readBooks(notes ?? []), [notes]);
  // The book the open note belongs to: the book note itself, or one of its chapters.
  const currentBook = useMemo(
    () => (open ? (bookList.find((b) => b.path === open.path) ?? bookList.find((b) => b.chapters.some((c) => c.path === open.path)) ?? null) : null),
    [bookList, open],
  );
  const cast = useMemo(() => characters(notes ?? [], currentBook), [notes, currentBook]);
  // For @ in the editor: only in a book (a one-off note has no cast).
  const castEntries = useMemo<CastEntry[] | null>(
    () => (currentBook ? cast.flatMap((c) => [c.name, ...c.aliases].map((name) => ({ name, path: c.path, tint: c.tint }))) : null),
    [cast, currentBook],
  );
  const outside = useMemo(() => cardsOutsideBooks(notes ?? [], bookList), [notes, bookList]);
  // Character cards aren't writing: they stay out of the notes list and search.
  const writing = useMemo(() => (notes ?? []).filter((n) => !isCharacterNote(n)), [notes]);
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

  const gapCount = (notes ?? []).reduce((n, x) => n + x.gaps.length, 0);
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
  const placeShort = store.kind === "folder" ? store.label : store.kind === "drive" ? "Google Drive" : "Sample notes";
  // The open note, once it's saved (today's note isn't a file until you write in it).
  const openEntry = (notes ?? []).find((n) => n.path === open?.path);
  const busySaving = save.state === "unsaved" || save.state === "saving";
  // The book this note is, or is a chapter of.
  const inBook = openEntry ? (bookList.find((b) => b.path === openEntry.path) ?? bookList.find((b) => b.chapters.some((c) => c.path === openEntry.path))) : undefined;
  // Offered when the file's name and the note's title differ. Daily notes keep their dated names.
  const titledPath = openEntry && !openEntry.path.startsWith(`${DAILY_FOLDER}/`) ? pathForTitle(openEntry.path, openEntry.title) : null;

  return (
    <div className={`shell${typing ? " is-typing" : ""}${panel === "help" ? " has-side-panel" : ""}`}>
      <header className="topbar">
        <nav className="topbar-left" aria-label="Notes">
          <div className="popover-anchor">
            <button
              ref={menuButton}
              type="button"
              className="chip-button menu-button"
              aria-label={`Menu: ${placeName}`}
              title={placeName}
              aria-haspopup="dialog"
              aria-expanded={panel === "menu"}
              onClick={() => setPanel((p) => (p === "menu" ? null : "menu"))}
            >
              <MenuIcon />
              <span className="label-wide menu-place">{placeShort}</span>
            </button>
            <NotebookMenu
              open={panel === "menu"}
              anchor={menuButton}
              where={placeName}
              kind={store.kind}
              offline={!!sync?.offline}
              onClose={closeMenu}
              onBooks={() => openBook()}
              onImport={() => setPanel("import")}
              onHelp={() => setPanel("help")}
              onChange={onLeave}
            />
          </div>
          <button type="button" className="chip-button" aria-current={isToday ? "page" : undefined} onClick={() => notes && openToday(notes)}>
            Today
          </button>
          <button type="button" className="chip-button" onClick={() => setPanel("switcher")} title={`Find or start a note (${mod}K)`}>
            <SearchIcon />
            <span className="label-wide">Notes</span>
            <kbd className="label-wide">{mod}K</kbd>
          </button>
          <button type="button" className="chip-button wide-only" aria-haspopup="dialog" title="Books: chapters and characters" onClick={() => openBook()}>
            <CardsIcon />
            <span className="label-wide">Books</span>
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

      {trashed && (
        <div className="note" role="status">
          <p>
            Moved “{trashed.title}” to Trash
            {store.kind === "folder" ? ", the Trash folder in your notes folder" : store.kind === "drive" ? " in Google Drive" : ""}.
          </p>
          <span className="note-actions">
            <button type="button" className="link" onClick={() => void undoTrash()}>
              Undo
            </button>
            <button type="button" className="link" onClick={() => setTrashed(null)}>
              Hide this
            </button>
          </span>
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
        notes={notes ?? []}
        currentPath={open?.path ?? null}
        startTab={boardStart.tab}
        focusCharacter={boardStart.character}
        outside={outside}
        fieldsOf={fieldsOf}
        onNewCharacter={(book, name) => void newCharacter(book, name)}
        onSaveCard={(path, f) => void saveCard(path, f)}
        onConnect={(a, b, label) => void connect(a, b, label)}
        onDisconnect={(a, b) => void disconnect(a, b)}
        onMoveIn={(book, path) => void moveIntoBook(book, path)}
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
      <GapPanel open={panel === "gaps"} notes={notes ?? []} currentPath={open?.path ?? null} onClose={closePanel("gaps")} onShow={showGap} />
    </div>
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

type Panel = "switcher" | "gaps" | "import" | "appearance" | "help" | "book" | "menu";

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="7" height="14" rx="2" />
      <rect x="13.5" y="5" width="7" height="14" rx="2" />
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
