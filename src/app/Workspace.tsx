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
import { CharactersBoard } from "./CharactersBoard";
import { CharacterPeek } from "./CharacterPeek";
import { characterPath, characters, characterTemplate } from "./characters";
import type { NameEntry } from "../editor/character-names";
import {
  DAILY_FOLDER,
  dailyPath,
  dailyTemplate,
  describeNote,
  loadLibrary,
  newNotePath,
  newNoteTemplate,
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
  const [panel, setPanel] = useState<"switcher" | "gaps" | "import" | "appearance" | "help" | "characters" | null>(null);
  const [boardFocus, setBoardFocus] = useState<string | null>(null);
  const [peek, setPeek] = useState<{ path: string; at: DOMRect } | null>(null);
  const [namesOn, setNamesOn] = useState(() => loadFlag(NAMES_KEY));
  /** After "Character" in the selection bar: the card that was made (or already there). */
  const [madeCard, setMadeCard] = useState<{ path: string; name: string; isNew: boolean } | null>(null);
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
  const toggleNamesRef = useRef<() => void>(() => undefined);
  const closePeek = useCallback(() => setPeek(null), []);
  const aaButton = useRef<HTMLButtonElement>(null);
  const closeAppearance = useCallback(() => setPanel((p) => (p === "appearance" ? null : p)), []);
  const closeHelp = useCallback(() => setPanel((p) => (p === "help" ? null : p)), []);
  // A sheet's late "closed" signal must only close that sheet, never one opened since.
  const closePanel = (which: "switcher" | "gaps" | "import" | "appearance" | "help" | "characters") => () => setPanel((p) => (p === which ? null : p));
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

  // Characters: every card, and the names to underline when that's on.
  const cast = useMemo(() => characters(notes ?? []), [notes]);
  const nameEntries = useMemo<NameEntry[]>(
    () => (namesOn ? cast.flatMap((c) => [c.name, ...c.aliases].map((name) => ({ name, path: c.path, tint: c.tint }))) : []),
    [cast, namesOn],
  );
  const toggleNames = useCallback(() => {
    setNamesOn((on) => {
      saveFlag(NAMES_KEY, !on);
      return !on;
    });
  }, []);

  toggleNamesRef.current = toggleNames;

  /** Makes a card for a name (or finds the one there), without leaving the note. */
  async function makeCharacter(name: string, thenOpen: boolean) {
    const path = characterPath(name);
    if (!path) return;
    const existing = cast.find((c) => c.name === name || c.aliases.includes(name)) ?? (notes ?? []).find((n) => n.path === path);
    const target = existing?.path ?? path;
    let list = notes ?? [];
    try {
      if (!existing) {
        await store.write(path, characterTemplate(name, isoDate(new Date())));
        list = (await reload()) ?? list;
      }
    } catch (e) {
      setFileProblem(`The card couldn't be made. ${e instanceof Error ? e.message : ""}`.trim());
      return;
    }
    if (thenOpen) {
      setPanel(null);
      const n = list.find((x) => x.path === target);
      if (n) openNote(n.path, n.text);
    } else setMadeCard({ path: target, name: existing ? ("name" in existing ? existing.name : existing.title) : name, isNew: !existing });
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
      if (cmd && e.shiftKey && !e.altKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        toggleNamesRef.current();
        return;
      }
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
      : sync.offline || sync.signInNeeded
        ? "Saved on this device"
        : "Uploading…";
  const isToday = open?.path === dailyPath(new Date());
  // The open note, once it's saved (today's note isn't a file until you write in it).
  const openEntry = (notes ?? []).find((n) => n.path === open?.path);
  const busySaving = save.state === "unsaved" || save.state === "saving";
  // Offered when the file's name and the note's title differ. Daily notes keep their dated names.
  const titledPath = openEntry && !openEntry.path.startsWith(`${DAILY_FOLDER}/`) ? pathForTitle(openEntry.path, openEntry.title) : null;

  return (
    <div className={`shell${typing ? " is-typing" : ""}${panel === "help" ? " has-side-panel" : ""}`}>
      <header className="topbar">
        <nav className="topbar-left" aria-label="Notes">
          <button type="button" className="chip-button" aria-current={isToday ? "page" : undefined} onClick={() => notes && openToday(notes)}>
            Today
          </button>
          <button type="button" className="chip-button" onClick={() => setPanel("switcher")} title={`Find or start a note (${mod}K)`}>
            <SearchIcon />
            <span className="label-wide">Notes</span>
            <kbd className="label-wide">{mod}K</kbd>
          </button>
          {cast.length > 0 && (
            <button
              type="button"
              className="chip-button wide-only"
              aria-label="Characters"
              title="Characters"
              aria-haspopup="dialog"
              onClick={() => {
                setBoardFocus(null);
                setPanel("characters");
              }}
            >
              <PersonIcon />
              <span className="label-wide">Characters</span>
            </button>
          )}
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
          <button type="button" className="chip-button" aria-label="Help" title="Help (?)" aria-haspopup="dialog" aria-expanded={panel === "help"} onClick={() => setPanel((p) => (p === "help" ? null : "help"))}>
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
      {madeCard && (
        <div className="note" role="status">
          <p>{madeCard.isNew ? `Made a card for ${madeCard.name}.` : `${madeCard.name} already has a card.`}</p>
          <span className="note-actions">
            <button
              type="button"
              className="link"
              onClick={() => {
                setMadeCard(null);
                openPath(madeCard.path);
              }}
            >
              Open card
            </button>
            <button type="button" className="link" onClick={() => setMadeCard(null)}>
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
            names={nameEntries}
            onMakeCharacter={(name) => void makeCharacter(name, false)}
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
        <p className="footer-line">
        <span>
          {store.kind === "folder"
            ? `Notes in “${store.label}”`
            : store.kind === "drive"
              ? `Notes in Google Drive${sync?.offline ? " · offline, saving on this device" : ""}`
              : "Sample notes"}
        </span>
        <button type="button" className="link" onClick={onLeave}>
          Change
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className="link" onClick={() => setPanel("import")}>
          Import notes
        </button>
        <span aria-hidden="true">·</span>
        <a className="link" href="./privacy.html">
          Privacy and terms
        </a>
        </p>
      </footer>

      <Switcher
        open={panel === "switcher"}
        notes={notes ?? []}
        onClose={closePanel("switcher")}
        onOpen={openPath}
        onToday={() => notes && openToday(notes)}
        onNew={newNote}
        onImport={() => setPanel("import")}
        onCharacters={() => {
          setBoardFocus(null);
          setPanel("characters");
        }}
        onNewCharacter={(name) => void makeCharacter(name, true)}
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
      <CharactersBoard
        open={panel === "characters"}
        cast={cast}
        focusPath={boardFocus}
        namesOn={namesOn}
        onToggleNames={toggleNames}
        onClose={closePanel("characters")}
        onOpenNote={(path) => {
          setPanel(null);
          openPath(path);
        }}
        onNew={(name) => void makeCharacter(name, true)}
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
            setBoardFocus(peek.path);
            setPanel("characters");
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

const NAMES_KEY = "stubli-writer:underline-names";

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function saveFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // Not remembered in a private window; it still works for this visit.
  }
}

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" />
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
