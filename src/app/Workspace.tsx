import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, type EditorHandle, type SaveState } from "../editor/Editor";
import type { NoteStore } from "../store/store";
import type { Mode } from "../mode";
import { GapPanel } from "./GapPanel";
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
  mode: Mode;
  onMode: (m: Mode) => void;
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

export function Workspace({ store, mode, onMode, onLeave }: Props) {
  const [notes, setNotes] = useState<LibraryNote[] | null>(null);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [panel, setPanel] = useState<"switcher" | "gaps" | null>(null);
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({ state: "saved" });
  const [typing, setTyping] = useState(false);
  const editor = useRef<EditorHandle>(null);
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
            {SAVE_LABEL[save.state]}
          </span>
          <button type="button" className={`chip-button gaps-button${gapCount ? " has-gaps" : ""}`} onClick={() => setPanel("gaps")}>
            {gapCount === 1 ? "1 gap" : `${gapCount} gaps`}
          </button>
          <button
            type="button"
            className="chip-button"
            aria-label={`Reading mode: ${mode === "paper" ? "Paper" : "Light"}. Switch to ${mode === "paper" ? "Light" : "Paper"}`}
            onClick={() => onMode(mode === "paper" ? "light" : "paper")}
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
        <span>{store.kind === "folder" ? `Notes in “${store.label}”` : "Sample notes"}</span>
        <button type="button" className="link" onClick={onLeave}>
          Change
        </button>
      </footer>

      <Switcher
        open={panel === "switcher"}
        notes={notes ?? []}
        onClose={() => setPanel(null)}
        onOpen={openPath}
        onToday={() => notes && openToday(notes)}
        onNew={newNote}
      />
      <GapPanel open={panel === "gaps"} notes={notes ?? []} onClose={() => setPanel(null)} onShow={showGap} />
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
