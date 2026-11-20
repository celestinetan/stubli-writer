import { useMemo, useState } from "react";
import { countWords, type Book } from "./books";
import type { Character } from "./characters";
import { consistencyPrompt, shortRequest, type Finding } from "./checks";
import type { LibraryNote } from "./library";
import { STORY_BIBLE, storyBiblePath, type LoreEntry } from "./lore";

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
  /** Where the notes are kept, and keeping (or no longer keeping) a story bible file there. */
  place: { kind: string; label: string };
  onStoryBible: (on: boolean) => void;
}

/** Where to go after copying a request. Opened in a new tab; nothing is sent to them from here. */
const ASSISTANTS = [
  { id: "none", name: "Nothing", url: "" },
  { id: "claude", name: "Claude", url: "https://claude.ai/new" },
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app" },
];
const ASSISTANT_KEY = "stubli-writer:assistant";

function savedAssistant(): string {
  try {
    const id = localStorage.getItem(ASSISTANT_KEY);
    return ASSISTANTS.some((a) => a.id === id) ? id! : "none";
  } catch {
    return "none";
  }
}

const numberFmt = new Intl.NumberFormat();

/**
 * Reminders of what may not agree with the book's cards, each one a question the writer answers.
 * And, for contradictions only a reader would catch, a question to paste into any AI assistant.
 */
export function ChecksView({ book, notes, cast, lore, findings, currentPath, onOpenNote, onIgnore, onNewCharacter, onNewLore, place, onStoryBible }: Props) {
  const [copied, setCopied] = useState("");
  const [assistant, setAssistant] = useState(savedAssistant);
  // A file only helps where an assistant can reach it: Google Drive, or a folder on the computer.
  const canKeepBible = place.kind === "drive" || place.kind === "folder";
  const chooseAssistant = (id: string) => {
    setAssistant(id);
    try {
      localStorage.setItem(ASSISTANT_KEY, id);
    } catch {
      // Not remembered in a private window.
    }
  };

  async function request(only: LibraryNote | null) {
    const text = shortRequest(book, storyBiblePath(book), only, place);
    const to = ASSISTANTS.find((a) => a.id === assistant)!;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(to.url ? `Copied. Paste it into ${to.name}, which is opening in a new tab.` : "Copied. Paste it into your assistant.");
      if (to.url) window.open(to.url, "_blank", "noopener");
    } catch {
      setCopied("The browser didn't allow copying. Click in the page and try again.");
    }
  }
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
        <p>Who knew what, the order of events, a promise the story breaks: only a reader catches those. An AI assistant can be that reader.</p>

        {canKeepBible && (
          <div className="check-way">
            <h4>If your assistant can read your {place.kind === "drive" ? "Google Drive" : "notes folder"}</h4>
            {book.bible ? (
              <>
                <p>
                  This book keeps a story bible, “{STORY_BIBLE}”, in its folder {place.kind === "drive" ? "in your Google Drive" : "on this computer"}: what
                  the book is about, your chapter summaries, characters and lore, kept up to date. Your assistant reads it, and the chapter,
                  itself. You only send one sentence.
                </p>
                <label className="check-open">
                  <span>After copying, open</span>
                  <select value={assistant} onChange={(e) => chooseAssistant(e.target.value)}>
                    {ASSISTANTS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="connect-actions">
                  {chapter && (
                    <button type="button" className="primary" onClick={() => void request(chapter)}>
                      Copy a request for “{chapter.title}”
                    </button>
                  )}
                  <button type="button" className={chapter ? "quiet" : "primary"} disabled={book.chapters.length === 0} onClick={() => void request(null)}>
                    Copy a request for the whole book
                  </button>
                </span>
                <p className="check-small">
                  {place.kind === "drive" ? "Your assistant needs Google Drive connected (in Claude, ChatGPT or Gemini, under its connectors or apps). " : ""}
                  <button type="button" className="link" onClick={() => onStoryBible(false)}>
                    Stop keeping a story bible
                  </button>{" "}
                  (this removes the file).
                </p>
              </>
            ) : (
              <>
                <p>
                  Stubli Writer can keep a story bible file in this book's folder {place.kind === "drive" ? "in your Google Drive" : "on this computer"}: what the
                  book is about, your chapter summaries, characters and lore, kept up to date. An assistant connected to{" "}
                  {place.kind === "drive" ? "your Drive" : "that folder"} then reads it, and your chapters, itself, so there's nothing long to paste.
                </p>
                <span className="connect-actions">
                  <button type="button" className="primary" onClick={() => onStoryBible(true)}>
                    Keep a story bible for this book
                  </button>
                </span>
              </>
            )}
          </div>
        )}

        <div className="check-way">
          <h4>{canKeepBible ? "Or paste everything" : "Paste it into any assistant"}</h4>
          <p>
            This copies a ready-made question with what the book is about, your chapter summaries, characters and lore, then the writing. Paste
            it into any AI assistant. Nothing is sent from here.
          </p>
          <span className="connect-actions">
            {chapter && (
              <button type="button" className={canKeepBible ? "quiet" : "primary"} onClick={() => void copy(chapter.path)}>
                Copy for “{chapter.title}”
              </button>
            )}
            <button type="button" className={chapter || canKeepBible ? "quiet" : "primary"} disabled={book.chapters.length === 0} onClick={() => void copy(null)}>
              Copy for the whole book
            </button>
          </span>
        </div>
        <p className="check-note" role="status">
          {copied || (bookWords > 60000 ? `The whole book is ${numberFmt.format(bookWords)} words, which may be more than an assistant takes at once. One chapter at a time works better.` : "")}
        </p>
      </section>
    </div>
  );
}
