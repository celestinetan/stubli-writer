import { useEffect, useRef, useState } from "react";
import { importFiles, type ImportResult } from "./importer";
import type { NoteStore } from "../store/store";
import { restoreBackup, unzip } from "./backup";
import type { LibraryNote } from "./library";

interface Props {
  open: boolean;
  store: NoteStore;
  onClose: () => void;
  /** After an import, so the notes list can catch up. */
  onImported: (result: ImportResult) => void;
  onOpen: (path: string) => void;
  /** The notes there now, so a restore never writes over one that's different. */
  existing: LibraryNote[];
}

/** Bring in Markdown notes (and their pictures) from Bear, Obsidian, iA Writer or anywhere. */
export function ImportSheet({ open, store, onClose, onImported, onOpen, existing }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const backup = useRef<HTMLInputElement>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setResult(null);
      setProblem(null);
      setRestored(null);
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

  /** A Stubli Writer backup (.zip): every note back where it was; a changed one is kept as well. */
  async function restore(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setBusy(true);
    setProblem(null);
    setRestored(null);
    try {
      const r = await restoreBackup(store, await unzip(new Uint8Array(await file.arrayBuffer())), existing);
      onImported({ notes: [], pictures: [], skipped: r.skipped, folder: "" });
      const parts = [
        r.restored ? `${count(r.restored, "note", "notes")} put back` : "",
        r.keptBoth ? `${count(r.keptBoth, "note", "notes")} kept as well, as “(restored)” copies, because yours had changed` : "",
        r.same ? `${count(r.same, "note was", "notes were")} already here` : "",
        r.pictures ? count(r.pictures, "picture", "pictures") : "",
      ].filter(Boolean);
      setRestored(parts.length ? `Restored: ${parts.join(", ")}.` : "There were no notes in that file.");
    } catch (e) {
      setProblem(`That backup couldn't be restored. ${e instanceof Error ? e.message : ""} Nothing you have was changed.`.trim());
    } finally {
      setBusy(false);
    }
  }

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
            <div className="restore-box">
              <p>
                <strong>Restore a backup.</strong> Puts every note from a Stubli Writer backup (.zip) back where it was. A note you've
                changed since is kept as well. This is also how notes move to a new place: back up, choose the new place, restore.
              </p>
              <button type="button" className="quiet" disabled={busy} onClick={() => backup.current?.click()}>
                Restore a backup
              </button>
              {restored && (
                <p className="import-result" role="status">
                  {restored}
                </p>
              )}
            </div>
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
        <input ref={backup} type="file" accept=".zip,application/zip" hidden aria-label="Backup file" onChange={(e) => void restore(e.target.files).then(() => (e.target.value = ""))} />
      </div>
    </dialog>
  );
}
