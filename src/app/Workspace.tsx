import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, type EditorHandle, type SaveState } from "../editor/Editor";
import type { NoteStore } from "../store/store";
import { OfflineStore, type SyncStatus } from "../store/offline-store";
import { FolderStore } from "../store/folder-store";
import { driveSession } from "../store/drive-session";
import { onUpdateReady, updateNow } from "./offline-copy";
import type { Appearance } from "../appearance";
import { AppearanceSheet } from "./AppearanceSheet";
import { GapPanel } from "./GapPanel";
import { ImportSheet } from "./ImportSheet";
import { Switcher } from "./Switcher";
import {
  dailyPath,
  dailyTemplate,
  describeNote,
  loadLibrary,
  newNotePath,
  newNoteTemplate,
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
  const [panel, setPanel] = useState<"switcher" | "gaps" | "import" | "appearance" | null>(null);
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({ state: "saved" });
  const [typing, setTyping] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signInProblem, setSignInProblem] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);
  const editor = useRef<EditorHandle>(null);
  // A sheet's late "closed" signal must only close that sheet, never one opened since.
  const closePanel = (which: "switcher" | "gaps" | "import" | "appearance") => () => setPanel((p) => (p === which ? null : p));
  const pendingGap = useRef<number | null>(null);
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

  // Load the notes, then open today's note.
  useEffect(() => {
    void reload().then((list) => list && openToday(list));
  }, [reload, openToday]);

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

  const showGap = useCallback(
    (path: string, index: number) => {
      setPanel(null);
      if (open?.path === path) {
        editor.current?.showGap(index);
      } else {
        pendingGap.current = index;
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

  // Keyboard: ⌘K find or start a note, ⌘J next gap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

  // While typing, the top bar fades; moving the pointer brings it back.
  useEffect(() => {
    const onType = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey && (e.target as HTMLElement)?.closest?.(".writing")) setTyping(true);
    };
    const onMove = () => setTyping(false);
    window.addEventListener("keydown", onType);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("keydown", onType);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const gapCount = (notes ?? []).reduce((n, x) => n + x.gaps.length, 0);
  // With Drive, "Saved" means it reached Drive; until then it's safe on this device.
  const statusLabel =
    save.state !== "saved" || !sync || sync.waiting === 0
      ? SAVE_LABEL[save.state]
      : sync.offline || sync.signInNeeded
        ? "Saved on this device"
        : "Uploading…";
  const isToday = open?.path === dailyPath(new Date());

  return (
    <div className={`shell${typing ? " is-typing" : ""}`}>
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
        </nav>
        <div className="topbar-right">
          <span className={`save-state${save.state === "error" ? " error" : ""}`} role="status" title={save.message}>
            {statusLabel}
          </span>
          <button type="button" className={`chip-button gaps-button${gapCount ? " has-gaps" : ""}`} onClick={() => setPanel("gaps")}>
            {gapCount === 1 ? "1 gap" : `${gapCount} gaps`}
          </button>
          <button
            type="button"
            className="chip-button"
            aria-label="Appearance: font, page and accent"
            title="Appearance"
            aria-haspopup="dialog"
            onClick={() => setPanel("appearance")}
          >
            Aa
          </button>
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
          />
        ) : (
          <p className="loading" aria-live="polite">
            Opening your notes…
          </p>
        )}
      </main>

      <footer className="footer">
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
      </footer>

      <Switcher
        open={panel === "switcher"}
        notes={notes ?? []}
        onClose={closePanel("switcher")}
        onOpen={openPath}
        onToday={() => notes && openToday(notes)}
        onNew={newNote}
        onImport={() => setPanel("import")}
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
      <AppearanceSheet
        open={panel === "appearance"}
        value={appearance}
        onChange={onAppearance}
        onClose={closePanel("appearance")}
      />
      <GapPanel open={panel === "gaps"} notes={notes ?? []} onClose={closePanel("gaps")} onShow={showGap} />
    </div>
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
