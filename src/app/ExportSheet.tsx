import { useEffect, useMemo, useRef, useState } from "react";
import type { WordStyle } from "../export/docx";
import type { Format } from "../export/run";
import type { BookDetails } from "../export/model";
import type { GapTarget } from "../editor/Editor";
import { allGaps, type LibraryNote } from "./library";

export interface ExportTarget {
  /** A book (its chapters, in order) or one note. */
  kind: "book" | "note";
  title: string;
  /** The notes, in order. A chapter that's missing is null. */
  notes: (LibraryNote | null)[];
  details: BookDetails;
}

interface Props {
  open: boolean;
  target: ExportTarget | null;
  onClose: () => void;
  onExport: (format: Format, style: WordStyle, details: BookDetails) => Promise<string>;
  onShowGap: (path: string, target: GapTarget) => void;
}

const FORMATS: { id: Format; name: string; note: string; bookToo: boolean }[] = [
  { id: "word", name: "Word (.docx)", note: "For editors, agents, publishers and competitions. Opens in Word, Pages and Google Docs.", bookToo: true },
  { id: "epub", name: "EPUB", note: "An ebook for Apple Books, Kobo, Google Play and Amazon KDP.", bookToo: true },
  { id: "pdf", name: "PDF", note: "To share, print or read. Your browser's print window makes it: choose “Save as PDF”.", bookToo: true },
  { id: "web", name: "Copy for the web", note: "Copies it, formatted, to paste into Medium, Substack or WordPress.", bookToo: false },
];

const FORMAT_KEY = "stubli-writer:export-format";
const STYLE_KEY = "stubli-writer:export-word-style";

/**
 * Export: a book or a note as Word, EPUB or PDF, or copied for the web. Open gaps are listed first
 * (with a way to go to each), so a TK doesn't reach a reader by accident; the file is still made
 * if you choose.
 */
export function ExportSheet({ open, target, onClose, onExport, onShowGap }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<Format>(() => (load(FORMAT_KEY) as Format) || "word");
  const [style, setStyle] = useState<WordStyle>(() => (load(STYLE_KEY) as WordStyle) || "manuscript");
  const [details, setDetails] = useState<BookDetails>({ title: "", subtitle: "", author: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setDetails(target?.details ?? { title: "", subtitle: "", author: "" });
      setResult(null);
      setProblem(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, target]);

  const isBook = target?.kind === "book";
  const formats = FORMATS.filter((f) => !isBook || f.bookToo);
  const chosen = formats.some((f) => f.id === format) ? format : "word";
  const notes = (target?.notes ?? []).filter((n): n is LibraryNote => n !== null);
  const missing = (target?.notes ?? []).filter((n) => n === null).length;
  const gaps = useMemo(() => allGaps(notes), [notes]);

  async function go() {
    setBusy(true);
    setProblem(null);
    setResult(null);
    save(FORMAT_KEY, chosen);
    save(STYLE_KEY, style);
    try {
      setResult(await onExport(chosen, style, details));
    } catch (e) {
      setProblem(`That couldn't be made. ${e instanceof Error ? e.message : ""} Nothing was changed.`.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="sheet export-sheet"
      aria-labelledby="export-title"
      // The browser announces a close a moment late; if the sheet is open again by then, ignore it.
      onClose={() => !dialog.current?.open && onClose()}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="export-title">Export “{target?.title}”</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Close
          </button>
        </header>

        <fieldset className="choices export-formats">
          <legend>As</legend>
          <div className="format-list">
            {formats.map((f) => (
              <label key={f.id} className="choice format-choice">
                <input type="radio" name="export-format" value={f.id} checked={chosen === f.id} onChange={() => setFormat(f.id)} />
                <span className="choice-name">{f.name}</span>
                <span className="choice-note">{f.note}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {chosen === "word" && (
          <fieldset className="choices">
            <legend>Look</legend>
            <div className="kind-row">
              {(
                [
                  ["manuscript", "Manuscript format", "12 pt Times, double-spaced, title page with word count, your name on every page"],
                  ["clean", "Clean", "A readable document, as you'd send to a friend"],
                ] as const
              ).map(([id, name, note]) => (
                <label key={id} className={`kind-chip look-chip${style === id ? " is-on" : ""}`} title={note}>
                  <input type="radio" name="word-style" value={id} checked={style === id} onChange={() => setStyle(id)} />
                  {name}
                </label>
              ))}
            </div>
            <p className="choices-hint">{style === "manuscript" ? "12 pt Times, double-spaced, a title page with the word count, and your name and the title on every page." : "Georgia, single-spaced, a little space between paragraphs."}</p>
          </fieldset>
        )}

        {chosen !== "web" && (
          <fieldset className="choices export-details">
            <legend>{isBook ? "The book" : "Details"}</legend>
            <div className="detail-fields">
              <label>
                <span>Title</span>
                <input value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} autoComplete="off" />
              </label>
              {isBook && (
                <label>
                  <span>Subtitle (optional)</span>
                  <input value={details.subtitle} onChange={(e) => setDetails({ ...details, subtitle: e.target.value })} autoComplete="off" />
                </label>
              )}
              <label>
                <span>Author{chosen === "word" && style === "manuscript" ? "" : " (optional)"}</span>
                <input value={details.author} onChange={(e) => setDetails({ ...details, author: e.target.value })} autoComplete="name" placeholder="Your name, as it should appear" />
              </label>
            </div>
            {isBook && <p className="choices-hint">Kept with the book for next time.</p>}
          </fieldset>
        )}

        <section className="export-check" aria-label="Before you export">
          {gaps.length === 0 ? (
            <p className="check-ok">No open gaps.</p>
          ) : (
            <>
              <p className="check-warn">
                {gaps.length === 1 ? "1 gap is" : `${gaps.length} gaps are`} still open. They'll show as [TK] in the file unless you fill them first.
              </p>
              <ul className="check-gaps">
                {gaps.slice(0, 6).map(({ note, gap, index, context }) => (
                  <li key={`${note.path}#${index}`}>
                    <span className="check-where">{note.title}</span>
                    <span className="check-context">{context.replace("▢", gap.kind === "request" ? `[TK: ${gap.request}]` : "[TK]")}</span>
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        const request = gap.kind === "request" ? gap.request : null;
                        const nth = note.gaps.slice(0, index).filter((g) => (g.kind === "request" ? g.request : null) === request).length;
                        onShowGap(note.path, { request, nth });
                      }}
                    >
                      Show
                    </button>
                  </li>
                ))}
              </ul>
              {gaps.length > 6 && <p className="choices-hint">And {gaps.length - 6} more, in Gaps at the top.</p>}
            </>
          )}
          {missing > 0 && (
            <p className="check-warn">
              {missing === 1 ? "1 chapter is" : `${missing} chapters are`} missing (moved or renamed outside the book) and will be left out.
            </p>
          )}
        </section>

        {result && (
          <p className="export-result" role="status">
            {result}
          </p>
        )}
        {problem && (
          <p className="note-problem" role="alert">
            {problem}
          </p>
        )}

        <div className="start-actions export-actions">
          <button type="button" className="primary" disabled={busy || notes.length === 0 || (chosen === "word" && style === "manuscript" && !details.author.trim())} onClick={() => void go()}>
            {busy ? "Making it…" : chosen === "web" ? "Copy" : chosen === "pdf" ? "Open the print window" : gaps.length ? "Export anyway" : "Export"}
          </button>
          {chosen === "word" && style === "manuscript" && !details.author.trim() && <span className="choices-hint">A manuscript needs your name.</span>}
        </div>
      </div>
    </dialog>
  );
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered in a private window.
  }
}
