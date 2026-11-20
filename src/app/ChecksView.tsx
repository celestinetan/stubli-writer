import { useMemo, useState } from "react";
import { countWords, type Book } from "./books";
import type { Character } from "./characters";
import { consistencyPrompt, type Finding } from "./checks";
import type { LibraryNote } from "./library";
import type { LoreEntry } from "./lore";

interface Props {
  book: Book;
  notes: LibraryNote[];
  cast: Character[];
  lore: LoreEntry[];
  findings: Finding[];
  /** The chapter being written, when it's one of this book's. */
  currentPath: string | null;
  onOpenNote: (path: string) => void;
  onIgnore: (key: string) => void;
  onNewCharacter: (name: string) => void;
  onNewLore: (name: string) => void;
}

const numberFmt = new Intl.NumberFormat();

/**
 * Reminders of what may not agree with the book's cards, each one a question the writer answers.
 * And, for contradictions only a reader would catch, a question to paste into any AI assistant.
 */
export function ChecksView({ book, notes, cast, lore, findings, currentPath, onOpenNote, onIgnore, onNewCharacter, onNewLore }: Props) {
  const [copied, setCopied] = useState("");
  const chapter = book.chapters.some((c) => c.path === currentPath) ? notes.find((n) => n.path === currentPath) : undefined;
  const hasFacts = cast.some((c) => c.facts.length > 0) || lore.some((x) => x.facts.length > 0);
  const bookWords = useMemo(() => book.chapters.reduce((n, c) => n + countWords(notes.find((x) => x.path === c.path)?.text ?? ""), 0), [book, notes]);

  async function copy(only: string | null) {
    const text = consistencyPrompt(book, notes, cast, lore, only);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`Copied (${numberFmt.format(countWords(text))} words). Paste it into your assistant.`);
    } catch {
      setCopied("The browser didn't allow copying. Click in the page and try again.");
    }
  }

  return (
    <div className="checks">
      <p className="sheet-hint">
        Reminders of what may not agree with your cards: names spelled nearly like one on a card, fixed facts said differently, and names
        with no card yet. Each is a question; you decide.
      </p>

      {findings.length === 0 ? (
        <div className="sheet-empty">
          <p>
            Nothing to check. {hasFacts ? "Names match their cards, and no fixed fact is said differently." : "To check more, give a character or a piece of lore some fixed facts (Edit on its card), like “Eyes: green” or “Age: 34”."}
          </p>
        </div>
      ) : (
        <ul className="check-list" aria-label="To check">
          {findings.map((f) => (
            <li key={f.key} className="check-item">
              <p className="check-message">{f.message}</p>
              <p className="check-context">{f.context}</p>
              <p className="card-actions">
                <button type="button" className="link card-open" onClick={() => onOpenNote(f.path)}>
                  Open “{f.chapter}”
                </button>
                {f.kind === "no-card" && (
                  <>
                    <button type="button" className="link card-open" onClick={() => onNewCharacter(f.name!)}>
                      Add as a character
                    </button>
                    <button type="button" className="link card-open" onClick={() => onNewLore(f.name!)}>
                      Add as lore
                    </button>
                  </>
                )}
                <button type="button" className="link card-open" aria-label={`Not a problem: ${f.message}`} onClick={() => onIgnore(f.key)}>
                  Not a problem
                </button>
              </p>
            </li>
          ))}
        </ul>
      )}

      <section className="check-ai" aria-labelledby="check-ai-title">
        <h3 id="check-ai-title">Ask an AI to read for contradictions</h3>
        <p>
          Who knew what, the order of events, a promise the story breaks: only a reader catches those. This copies a ready-made question with
          what the book is about, your chapter summaries, characters and lore, then the writing. Paste it into any AI assistant. Nothing is
          sent from here.
        </p>
        <span className="connect-actions">
          {chapter && (
            <button type="button" className="primary" onClick={() => void copy(chapter.path)}>
              Copy for “{chapter.title}”
            </button>
          )}
          <button type="button" className={chapter ? "quiet" : "primary"} disabled={book.chapters.length === 0} onClick={() => void copy(null)}>
            Copy for the whole book
          </button>
        </span>
        <p className="check-note" role="status">
          {copied || (bookWords > 60000 ? `The whole book is ${numberFmt.format(bookWords)} words, which may be more than an assistant takes at once. One chapter at a time works better.` : "")}
        </p>
      </section>
    </div>
  );
}
