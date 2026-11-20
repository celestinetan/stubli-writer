import { useEffect, useMemo, useRef, useState } from "react";
import { BookOverview } from "./BookOverview";
import { chapterCards, isBookNote, readPremise, type Book, type Outline } from "./books";
import { characters, type CardFields, type Character } from "./characters";
import type { LibraryNote } from "./library";
import { CastView } from "./CastView";
import { LoreView } from "./LoreView";
import { ChecksView } from "./ChecksView";
import { ignoredChecks, runChecks } from "./checks";
import { isCardNote, lore, worlds } from "./lore";
import type { Point } from "./map-layout";

export type BookTab = "overview" | "chapters" | "characters" | "lore" | "checks";

interface Props {
  open: boolean;
  books: Book[];
  notes: LibraryNote[];
  /** The note being written: its book opens first. */
  currentPath: string | null;
  /** Which tab, and which character to bring forward, when the board opens (or is asked for again). */
  startTab: BookTab;
  startKey: number;
  /** Beside the text, so the chapter stays in view and usable; otherwise a wide sheet over it. */
  beside: boolean;
  /** Whether the screen has room to show it beside the text. */
  canBeside: boolean;
  onBeside: (beside: boolean) => void;
  /** During the tour: shown without taking over the screen, so the tour can point at it. */
  guided?: boolean;
  focusCharacter: string | null;
  /** Character cards made before they belonged to books. */
  outside: LibraryNote[];
  fieldsOf: (path: string) => CardFields | null;
  onNewCharacter: (book: Book, name: string) => void;
  onSaveCard: (path: string, fields: CardFields) => void;
  /** Both sides: what A is to B, and what B is to A (either may be empty). */
  onConnect: (a: Character, b: Character, aIs: string, bIs: string) => void;
  onDisconnect: (from: Character, to: Character) => void;
  onMoveIn: (book: Book, path: string) => void;
  /** The characters map's saved places for a book, and saving them. */
  placesOf: (book: Book, cast: Character[]) => Record<string, Point>;
  onPlaces: (book: Book, cast: Character[], places: Record<string, Point>) => void;
  onExport: (book: Book) => void;
  onClose: () => void;
  onOpenNote: (path: string) => void;
  onNewBook: (title: string) => void;
  onReorder: (book: Book, from: number, to: number) => void;
  onNewChapter: (book: Book, title: string) => void;
  onAddNote: (book: Book, path: string) => void;
  onTakeOut: (book: Book, index: number) => void;
  /** What the book is about, and what a chapter's header says about it. */
  onPremise: (book: Book, text: string) => void;
  /** Lore: a new card, saving one, sharing a card (lore or character) with the book's world, and naming that world. */
  onNewLore: (book: Book, name: string, kind: string) => void;
  onSaveLore: (path: string, fields: CardFields) => void;
  onShare: (book: Book, path: string, share: boolean) => void;
  onWorld: (book: Book, world: string) => void;
  /** Where the notes are kept, and keeping (or no longer keeping) a story bible file for an AI assistant. */
  place: { kind: string; label: string };
  onStoryBible: (book: Book, on: boolean) => void;
  /** Set a check aside for good ("Not a problem"). */
  onIgnoreCheck: (book: Book, key: string) => void;
  onOutline: (path: string, outline: Outline) => void;
}

const numberFmt = new Intl.NumberFormat();

/**
 * A book's chapters as cards, in order. Drag a card to move it, or use the arrows (keyboard and
 * touch). Only the book note's list changes; the chapters themselves are untouched.
 */
export function BookBoard(props: Props) {
  const { open, books, notes, currentPath, startTab, startKey, beside, guided = false, focusCharacter, onClose, onOpenNote, onNewBook, onReorder, onNewChapter, onAddNote, onTakeOut } = props;
  const [tab, setTab] = useState<BookTab>(startTab);
  const dialog = useRef<HTMLDialogElement>(null);
  const [bookPath, setBookPath] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  /** Said aloud after a move, for people who can't see the cards. */
  const [announce, setAnnounce] = useState("");

  const mode = beside ? "beside" : guided ? "guided" : "modal";
  const shownAs = useRef(mode);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!open) {
      if (d.open) d.close();
      return;
    }
    if (d.open && shownAs.current === mode) return;
    if (d.open) d.close(); // moving between beside the text and wide
    else {
      setTitle("");
      setChapterTitle("");
      setAnnounce("");
    }
    shownAs.current = mode;
    if (mode === "modal") d.showModal();
    else d.show();
  }, [open, mode]);

  // Each time it's asked for: the book being written in (or that has this chapter), and the tab.
  useEffect(() => {
    if (!open) return;
    const here = books.find((b) => b.path === currentPath) ?? books.find((b) => b.chapters.some((c) => c.path === currentPath));
    setBookPath((here ?? books.find((b) => b.path === bookPath) ?? books[0])?.path ?? null);
    setTab(startTab);
    // Chosen when the board is asked for, not again while it's open.
  }, [open, startKey]);

  // Beside the text, it follows the writing: opening a chapter of another book shows that book.
  useEffect(() => {
    if (!open || !beside) return;
    const here = books.find((b) => b.path === currentPath) ?? books.find((b) => b.chapters.some((c) => c.path === currentPath));
    if (here) setBookPath(here.path);
  }, [currentPath]);

  // A book that has just been started is the one to show.
  const known = useRef(new Set(books.map((b) => b.path)));
  useEffect(() => {
    const fresh = books.find((b) => !known.current.has(b.path));
    known.current = new Set(books.map((b) => b.path));
    if (fresh) setBookPath(fresh.path);
  }, [books]);

  const book = books.find((b) => b.path === bookPath) ?? books[0] ?? null;
  const cast = useMemo(() => characters(notes, book), [notes, book]);
  const cards = useMemo(() => (book ? chapterCards(book, notes, cast) : []), [book, notes, cast]);
  const entries = useMemo(() => lore(notes, book), [notes, book]);
  const findings = useMemo(
    () => (book ? runChecks(book, notes, cast, entries, ignoredChecks(notes.find((n) => n.path === book.path)?.text ?? "")) : []),
    [book, notes, cast, entries],
  );
  const knownWorlds = useMemo(() => worlds(notes, books), [notes, books]);
  const premise = useMemo(() => readPremise(notes.find((n) => n.path === book?.path)?.text ?? ""), [notes, book]);
  const addable = useMemo(
    () => notes.filter((n) => book && !book.chapters.some((c) => c.path === n.path) && n.path !== book.path && !isBookNote(n) && !isCardNote(n) && !n.isDaily),
    [notes, book],
  );

  function move(from: number, to: number) {
    if (!book || to < 0 || to >= book.chapters.length || from === to) return;
    onReorder(book, from, to);
    setAnnounce(`${cards[from].title} is now chapter ${to + 1}.`);
  }

  return (
    <dialog
      ref={dialog}
      className={`${beside ? "side-panel book-panel" : guided ? "sheet is-guided" : "sheet"} characters-board chapters-board`}
      aria-labelledby="book-title"
      // The browser announces a close a moment late; if the sheet is open again by then, ignore it.
      onClose={() => !dialog.current?.open && onClose()}
      onClick={(e) => !beside && e.target === dialog.current && onClose()}
      // Beside the text it isn't modal, so Escape (pressed in the panel) is ours to handle.
      onKeyDown={(e) => beside && e.key === "Escape" && !e.defaultPrevented && onClose()}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="book-title">{book ? book.title : "Books"}</h2>
          {book && book.chapters.length > 0 && !beside && (
            <button type="button" className="quiet export-book" onClick={() => props.onExport(book)}>
              Export…
            </button>
          )}
          {props.canBeside && (
            <button type="button" className="quiet" title={beside ? "Show this wide, over the text" : "Show this beside the text"} onClick={() => props.onBeside(!beside)}>
              {beside ? "Show wide" : "Show beside the text"}
            </button>
          )}
          <button type="button" className="sheet-close" onClick={onClose}>
            Close
          </button>
        </header>

        {books.length > 1 && (
          <div className="book-tabs" role="group" aria-label="Books">
            {books.map((b) => (
              <button key={b.path} type="button" className="chip" aria-pressed={b.path === book?.path} onClick={() => setBookPath(b.path)}>
                {b.title}
              </button>
            ))}
          </div>
        )}

        {book && (
          <div className="book-switch" role="tablist" aria-label="In this book">
            <button type="button" role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>
              Overview
            </button>
            <button type="button" role="tab" aria-selected={tab === "chapters"} onClick={() => setTab("chapters")}>
              Arrange
            </button>
            <button type="button" role="tab" aria-selected={tab === "characters"} onClick={() => setTab("characters")}>
              Characters
            </button>
            <button type="button" role="tab" aria-selected={tab === "lore"} onClick={() => setTab("lore")}>
              Lore
            </button>
            <button type="button" role="tab" aria-selected={tab === "checks"} onClick={() => setTab("checks")}>
              Checks
              {findings.length > 0 && (
                <span className="tab-count">
                  <span className="visually-hidden">, </span>
                  {findings.length}
                  <span className="visually-hidden"> to check</span>
                </span>
              )}
            </button>
          </div>
        )}

        {book && tab === "characters" ? (
          <CastView
            key={`${book.path}#${startKey}`}
            narrow={beside}
            onWiden={() => props.onBeside(false)}
            world={book.world}
            onShare={(path, share) => props.onShare(book, path, share)}
            cast={cast}
            fieldsOf={props.fieldsOf}
            focusPath={focusCharacter}
            outside={props.outside}
            onOpenNote={onOpenNote}
            onNew={(name) => props.onNewCharacter(book, name)}
            onSave={props.onSaveCard}
            onConnect={props.onConnect}
            onDisconnect={props.onDisconnect}
            onMoveIn={(path) => props.onMoveIn(book, path)}
            places={props.placesOf(book, cast)}
            onPlaces={(places) => props.onPlaces(book, cast, places)}
          />
        ) : book && tab === "lore" ? (
          <LoreView
            key={`${book.path}#${startKey}`}
            book={book}
            entries={entries}
            worlds={knownWorlds}
            focusPath={focusCharacter}
            fieldsOf={props.fieldsOf}
            onOpenNote={onOpenNote}
            onNew={(name, kind) => props.onNewLore(book, name, kind)}
            onSave={props.onSaveLore}
            onShare={(path, share) => props.onShare(book, path, share)}
            onWorld={(world) => props.onWorld(book, world)}
          />
        ) : book && tab === "checks" ? (
          <ChecksView
            book={book}
            notes={notes}
            cast={cast}
            lore={entries}
            findings={findings}
            currentPath={currentPath}
            onOpenNote={onOpenNote}
            onIgnore={(key) => props.onIgnoreCheck(book, key)}
            place={props.place}
            onStoryBible={(on) => props.onStoryBible(book, on)}
            onNewCharacter={(name) => {
              props.onNewCharacter(book, name);
              setTab("characters");
            }}
            onNewLore={(name) => {
              props.onNewLore(book, name, "");
              setTab("lore");
            }}
          />
        ) : book && tab === "overview" ? (
          <BookOverview
            book={book}
            premise={premise}
            cards={cards}
            cast={cast}
            onOpenNote={onOpenNote}
            onPremise={(text) => props.onPremise(book, text)}
            onOutline={props.onOutline}
          />
        ) : !book ? (
          <div className="sheet-empty">
            <p>
              A book keeps its chapters in order, as cards you can move around, and its characters, with who they are and how
              they're connected. Notes that aren't in a book are one-offs: articles, essays, ideas.
            </p>
          </div>
        ) : (
          <>
            <p className="sheet-hint">
              {cards.length === 0 ? "No chapters yet. Add the first one below." : "Drag a card to move it, or use the arrows. Choose a title to open the chapter."}{" "}
              <button type="button" className="link" onClick={() => onOpenNote(book.path)}>
                Open the book note
              </button>
            </p>
            <p className="visually-hidden" aria-live="polite">
              {announce}
            </p>
            <ol className="card-grid chapter-grid">
              {cards.map((c, i) => (
                <li
                  key={`${c.ref.path}#${i}`}
                  className={`character-card chapter-card${dragFrom === i ? " is-dragging" : ""}${dropAt === i && dragFrom !== i ? " is-drop" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.title);
                  }}
                  onDragOver={(e) => {
                    if (dragFrom === null) return;
                    e.preventDefault();
                    setDropAt(i);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom !== null) move(dragFrom, i);
                    setDragFrom(null);
                    setDropAt(null);
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDropAt(null);
                  }}
                >
                  <div className="chapter-top">
                    <span className="chapter-number" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="chapter-moves">
                      <button type="button" className="move-button" aria-label={`Move “${c.title}” earlier`} title="Move earlier" disabled={i === 0} onClick={() => move(i, i - 1)}>
                        <Arrow back />
                      </button>
                      <button
                        type="button"
                        className="move-button"
                        aria-label={`Move “${c.title}” later`}
                        title="Move later"
                        disabled={i === cards.length - 1}
                        onClick={() => move(i, i + 1)}
                      >
                        <Arrow />
                      </button>
                    </span>
                  </div>
                  {c.note ? (
                    <button type="button" className="card-name" onClick={() => onOpenNote(c.ref.path)}>
                      <span className="visually-hidden">Chapter {i + 1}: </span>
                      {c.title}
                    </button>
                  ) : (
                    <p className="card-name is-static is-missing">
                      {c.title} <span className="card-role">(not found)</span>
                    </p>
                  )}
                  <p className={`card-summary${c.synopsis ? "" : " is-empty"}`}>{c.synopsis || (c.note ? "Nothing written yet." : "This note was moved or renamed.")}</p>
                  {c.note && (
                    <p className="card-role">
                      {numberFmt.format(c.words)} {c.words === 1 ? "word" : "words"}
                      {c.gaps > 0 && ` · ${c.gaps} TK`}
                    </p>
                  )}
                  {c.characters.length > 0 && (
                    <ul className="chapter-people" aria-label="Characters in this chapter">
                      {c.characters.map((p) => (
                        <li key={p.path} data-tint={p.tint}>
                          <span className="card-dot" aria-hidden="true" />
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" className="link card-open" onClick={() => onTakeOut(book, i)}>
                    Take out of the book
                  </button>
                </li>
              ))}
            </ol>

            <div className="board-tools chapter-tools">
              <form
                className="new-character"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (chapterTitle.trim()) {
                    onNewChapter(book, chapterTitle.trim());
                    setChapterTitle("");
                  }
                }}
              >
                <label htmlFor="new-chapter-title">New chapter</label>
                <input id="new-chapter-title" value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} autoComplete="off" placeholder="A title" />
                <button type="submit" className="primary" disabled={!chapterTitle.trim()}>
                  Add
                </button>
              </form>
              {addable.length > 0 && (
                <label className="add-note">
                  <span>Or add a note you have</span>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) onAddNote(book, e.target.value);
                    }}
                  >
                    <option value="">Choose a note…</option>
                    {addable.map((n) => (
                      <option key={n.path} value={n.path}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </>
        )}

        <form
          className="new-character new-book"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) onNewBook(title.trim());
          }}
        >
          <label htmlFor="new-book-title">New book</label>
          <input id="new-book-title" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" placeholder="Its title" />
          <button type="submit" className={books.length === 0 ? "primary" : "quiet"} disabled={!title.trim()}>
            Start a book
          </button>
        </form>
      </div>
    </dialog>
  );
}

function Arrow({ back }: { back?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {back ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}
