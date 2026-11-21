import { useEffect, useMemo, useRef, useState } from "react";
import { importFiles, type ImportResult } from "./importer";
import { chaptersOf, makeBook, ManuscriptError, readManuscript, sameSplit, splitChoices, type Draft, type MadeBook, type Split } from "./manuscript";
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
  /** Opens a book that was just made from a manuscript. */
  onOpenBook: (path: string) => void;
  /** The notes there now, so a restore never writes over one that's different. */
  existing: LibraryNote[];
}

const numberFmt = new Intl.NumberFormat();
const count = (n: number, one: string, many: string) => `${numberFmt.format(n)} ${n === 1 ? one : many}`;
const listed = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/**
 * Bring in writing from elsewhere: a whole manuscript (Word or Markdown) as a book with chapters,
 * Markdown notes and their pictures from Bear, Obsidian or iA Writer, or a Stubli Writer backup.
 */
export function ImportSheet({ open, store, onClose, onImported, onOpen, onOpenBook, existing }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const backup = useRef<HTMLInputElement>(null);
  const manuscript = useRef<HTMLInputElement>(null);
  // A manuscript is shown as chapters first; the book is made only when the writer says so.
  const [draft, setDraft] = useState<{ file: string; draft: Draft } | null>(null);
  const [split, setSplit] = useState<Split>({ by: "none" });
  const [bookTitle, setBookTitle] = useState("");
  const [made, setMade] = useState<MadeBook | null>(null);
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
      setDraft(null);
      setMade(null);
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

  const choices = useMemo(() => (draft ? splitChoices(draft.draft) : []), [draft]);
  const cut = useMemo(() => (draft ? chaptersOf(draft.draft, split) : { chapters: [], empty: [] }), [draft, split]);
  const words = cut.chapters.reduce((n, c) => n + c.words, 0);

  async function read(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const d = await readManuscript(file.name, new Uint8Array(await file.arrayBuffer()));
      setDraft({ file: file.name, draft: d });
      setSplit(splitChoices(d)[0].split);
      setBookTitle(d.title);
    } catch (e) {
      setProblem(e instanceof ManuscriptError ? e.message : "That file couldn't be read. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  async function make() {
    if (!draft || cut.chapters.length === 0) return;
    setBusy(true);
    setProblem(null);
    try {
      const m = await makeBook(store, draft.draft, cut.chapters, bookTitle);
      onImported({ notes: m.chapters, pictures: [], skipped: [], folder: "" });
      setMade(m);
      setDraft(null);
    } catch (e) {
      onImported({ notes: [], pictures: [], skipped: [], folder: "" });
      setProblem(`The book couldn't be finished. ${e instanceof Error ? e.message : ""} The chapters made so far are kept, under Books.`.replace(/\s+/g, " ").trim());
    } finally {
      setBusy(false);
    }
  }

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

        {draft ? (
          <form
            className="import-body manuscript"
            onSubmit={(e) => {
              e.preventDefault();
              void make();
            }}
          >
            <p role="status">
              “{draft.file}”: {count(cut.chapters.length, "chapter", "chapters")}, {count(words, "word", "words")}.
            </p>
            <div className="manuscript-fields">
              <label>
                <span>Book title</span>
                <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} autoComplete="off" maxLength={100} />
              </label>
              {choices.length > 1 && (
                <label>
                  <span>Start a new chapter at</span>
                  <select value={choices.findIndex((c) => sameSplit(c.split, split))} onChange={(e) => setSplit(choices[Number(e.target.value)].split)}>
                    {choices.map((c, i) => (
                      <option key={c.label} value={i}>
                        {c.label} ({count(c.chapters, "chapter", "chapters")})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <ol className="manuscript-chapters" aria-label="Chapters found">
              {cut.chapters.map((c, i) => (
                <li key={i}>
                  <span className="manuscript-name">{c.title}</span>
                  <span className="manuscript-words">{count(c.words, "word", "words")}</span>
                </li>
              ))}
            </ol>
            {choices.length === 1 && (
              <p className="import-tip">
                No chapter headings were found, so this comes in as one chapter. To split it, give each chapter title the “Heading 1” style in
                your writing app, or start it with a line like “Chapter 1”, then choose the file again.
              </p>
            )}
            {(draft.draft.leftOut.length > 0 || cut.empty.length > 0) && (
              <p className="import-tip">
                {draft.draft.leftOut.length > 0 && <>Left out: {listed(draft.draft.leftOut)}. </>}
                {cut.empty.length > 0 && (
                  <>
                    {count(cut.empty.length, "heading has", "headings have")} nothing under {cut.empty.length === 1 ? "it" : "them"} and {cut.empty.length === 1 ? "is" : "are"} left out:{" "}
                    {cut.empty.slice(0, 3).map((t) => `“${t}”`).join(", ")}
                    {cut.empty.length > 3 ? ` and ${cut.empty.length - 3} more` : ""}.
                  </>
                )}
              </p>
            )}
            <p className="import-tip">The file is read on this device; it isn't uploaded. Your file and the notes you already have stay as they are.</p>
            <div className="start-actions">
              <button type="submit" className="primary" disabled={busy || cut.chapters.length === 0}>
                Make the book
              </button>
              <button type="button" className="quiet" disabled={busy} onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
            {busy && (
              <p className="import-busy" aria-live="polite">
                Making the book…
              </p>
            )}
            {problem && (
              <p className="note-problem" role="alert">
                {problem}
              </p>
            )}
          </form>
        ) : made ? (
          <div className="import-body" role="status">
            <p>
              Made “{made.title}” with {count(made.chapters.length, "chapter", "chapters")}
              {made.pictures ? ` and ${count(made.pictures, "picture", "pictures")}` : ""}. It's under Books.
            </p>
            {made.picturesLeftOut > 0 && (
              <p className="import-tip">
                {count(made.picturesLeftOut, "picture was", "pictures were")} left out, in a format Stubli Writer can't show (it shows JPEG, PNG, GIF, WebP and AVIF).
              </p>
            )}
            <p className="import-tip">Next: under Checks, the book lists names that have no character card yet.</p>
            <div className="start-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  onClose();
                  onOpenBook(made.book);
                }}
              >
                Open the book
              </button>
              <button type="button" className="quiet" onClick={() => setMade(null)}>
                Import more
              </button>
            </div>
          </div>
        ) : !result ? (
          <div className="import-body">
            <div className="import-box">
              <p>
                <strong>A manuscript.</strong> A book you wrote in Word, Google Docs, Pages or Scrivener becomes a book here, with a chapter for
                each chapter heading. You see the chapters before anything is made.
              </p>
              <button type="button" className="quiet" disabled={busy} onClick={() => manuscript.current?.click()}>
                Choose a manuscript
              </button>
              <p className="import-tip">A Word (.docx) or Markdown file. From Google Docs: File → Download → Microsoft Word.</p>
            </div>
            <div className="import-box">
              <p>
                <strong>Notes.</strong> Markdown notes from Bear, Obsidian, iA Writer or anywhere else, with the pictures next to them. They're
                copied as they are, into a new “Imported” folder. Nothing you already have is changed.
              </p>
              <div className="start-actions">
                <button type="button" className="quiet" disabled={busy} onClick={() => files.current?.click()}>
                  Choose notes
                </button>
                <button type="button" className="quiet" disabled={busy} onClick={() => folder.current?.click()}>
                  Choose a folder
                </button>
              </div>
              <p className="import-tip">From Bear: File → Export notes → Markdown. From Obsidian: choose your vault's folder.</p>
            </div>
            <div className="import-box">
              <p>
                <strong>A backup.</strong> Puts every note from a Stubli Writer backup (.zip) back where it was. A note you've
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
            {busy && (
              <p className="import-busy" aria-live="polite">
                Bringing your writing in…
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
        <input ref={manuscript} type="file" accept=".docx,.md,.markdown,.mdown,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain" hidden aria-label="Manuscript file" onChange={(e) => void read(e.target.files).then(() => (e.target.value = ""))} />
        <input ref={backup} type="file" accept=".zip,application/zip" hidden aria-label="Backup file" onChange={(e) => void restore(e.target.files).then(() => (e.target.value = ""))} />
      </div>
    </dialog>
  );
}
