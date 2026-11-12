import { useEffect, useRef, useState } from "react";
import { importFiles, type ImportResult } from "./importer";
import type { NoteStore } from "../store/store";

interface Props {
  open: boolean;
  store: NoteStore;
  onClose: () => void;
  /** After an import, so the notes list can catch up. */
  onImported: (result: ImportResult) => void;
  onOpen: (path: string) => void;
}

/** Bring in Markdown notes (and their pictures) from Bear, Obsidian, iA Writer or anywhere. */
export function ImportSheet({ open, store, onClose, onImported, onOpen }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setResult(null);
      setProblem(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  // The folder picker needs a non-standard attribute that React doesn't know.
  useEffect(() => folder.current?.setAttribute("webkitdirectory", ""), []);

  async function run(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setProblem(null);
    try {
      const incoming = [...list].map((f) => ({ path: f.webkitRelativePath || f.name, file: f }));
      const r = await importFiles(store, incoming);
      setResult(r);
      onImported(r);
    } catch (e) {
      setProblem(`The import stopped part of the way. ${e instanceof Error ? e.message : ""} What was brought in so far is kept.`.trim());
    } finally {
      setBusy(false);
    }
  }

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <dialog ref={dialog} className="sheet import-sheet" aria-labelledby="import-title" // The browser announces a close a moment late; if the sheet is open again by then, ignore it.
      onClose={() => !dialog.current?.open && onClose()} onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="import-title">Import notes</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Close
          </button>
        </header>

        {!result ? (
          <div className="import-body">
            <p>
              Bring in Markdown notes from Bear, Obsidian, iA Writer or anywhere else, with the pictures next to them. They're
              copied as they are, into a new “Imported” folder. Nothing you already have is changed.
            </p>
            <p className="import-tip">From Bear: File → Export notes → Markdown. From Obsidian: choose your vault's folder.</p>
            <div className="start-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => files.current?.click()}>
                Choose notes
              </button>
              <button type="button" className="quiet" disabled={busy} onClick={() => folder.current?.click()}>
                Choose a folder
              </button>
            </div>
            {busy && (
              <p className="import-busy" aria-live="polite">
                Bringing your notes in…
              </p>
            )}
            {problem && (
              <p className="note-problem" role="alert">
                {problem}
              </p>
            )}
          </div>
        ) : (
          <div className="import-body" role="status">
            <p>
              {result.notes.length === 0 && result.pictures.length === 0
                ? "Nothing to bring in: there were no Markdown notes or pictures in what you chose."
                : `Brought in ${count(result.notes.length, "note", "notes")}${result.pictures.length ? ` and ${count(result.pictures.length, "picture", "pictures")}` : ""}, into “${result.folder}”.`}
            </p>
            {result.skipped.length > 0 && (
              <p className="import-tip">
                {count(result.skipped.length, "file was", "files were")} left out because {result.skipped.length === 1 ? "it isn't" : "they aren't"} a note or a
                picture: {result.skipped.slice(0, 3).join(", ")}
                {result.skipped.length > 3 ? ` and ${result.skipped.length - 3} more` : ""}.
              </p>
            )}
            <div className="start-actions">
              {result.notes[0] && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    onClose();
                    onOpen(result.notes[0]);
                  }}
                >
                  Open the first one
                </button>
              )}
              <button type="button" className="quiet" onClick={() => setResult(null)}>
                Import more
              </button>
            </div>
          </div>
        )}

        <input ref={files} type="file" multiple accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain" hidden onChange={(e) => void run(e.target.files).then(() => (e.target.value = ""))} />
        <input ref={folder} type="file" multiple hidden onChange={(e) => void run(e.target.files).then(() => (e.target.value = ""))} />
      </div>
    </dialog>
  );
}
