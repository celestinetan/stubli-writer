import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface TourStep {
  /** What to point at (a CSS selector). If it isn't on screen, the step sits in the middle. */
  target: string | null;
  title: string;
  body: string;
  /** For the book tour: the part of the book to show while this step is up, or "close" to put it away. */
  book?: "overview" | "chapters" | "characters" | "lore" | "checks" | "close";
}

interface Props {
  steps: TourStep[];
  onDone: () => void;
  /** Before a step shows: e.g. open the sidebar so its parts can be pointed at. */
  onStep?: (index: number) => void;
}

/**
 * A short walkthrough: one pop-up at a time, next to the part of the app it's about, which is
 * lit while the rest dims. Back, Next and "Skip the tour"; arrow keys and Escape work too.
 */
export function Tour({ steps, onDone, onStep }: Props) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Find the step's target (after anything the step needs has opened), and follow it on scroll.
  useEffect(() => {
    onStep?.(i);
    let frame = 0;
    const find = () => {
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      const r = el?.getBoundingClientRect();
      const visible = r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(el!).visibility !== "hidden";
      setRect(visible ? r : null);
    };
    frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // Further down the page (the foot of a note): bring it into view first.
        const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
        const r = el?.getBoundingClientRect();
        if (el && r && r.height > 0 && (r.top < 0 || r.bottom > window.innerHeight)) {
          el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        }
        find();
      }),
    );
    // Once more when what the step opened (a panel, a tab) has settled.
    const settle = window.setTimeout(find, 350);
    window.addEventListener("resize", find);
    window.addEventListener("scroll", find, true);
    return () => {
      window.clearTimeout(settle);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", find);
      window.removeEventListener("scroll", find, true);
    };
    // Only when the step changes.
  }, [i]);

  // The light around the target, and the pop-up beside it (below, or above if there's no room).
  useLayoutEffect(() => {
    const c = card.current;
    const s = spot.current;
    if (!c || !s) return;
    if (!rect) {
      s.style.cssText = "display:none";
      c.style.left = `${Math.round((window.innerWidth - c.offsetWidth) / 2)}px`;
      c.style.top = `${Math.round((window.innerHeight - c.offsetHeight) / 2)}px`;
    } else {
      const pad = 6;
      s.style.cssText = `display:block;left:${rect.left - pad}px;top:${rect.top - pad}px;width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px`;
      const below = rect.bottom + 14;
      const fitsBelow = below + c.offsetHeight < window.innerHeight - 12;
      const top = fitsBelow ? below : Math.max(12, rect.top - c.offsetHeight - 14);
      // A tall target (the page, the sidebar): beside it instead, if there's room.
      const tall = rect.height > window.innerHeight * 0.5;
      const besideRight = rect.right + 16 + c.offsetWidth < window.innerWidth - 12;
      const left = tall && besideRight ? rect.right + 16 : Math.max(12, Math.min(rect.left, window.innerWidth - c.offsetWidth - 12));
      c.style.left = `${Math.round(left)}px`;
      c.style.top = `${Math.round(tall ? Math.max(12, Math.min(rect.top + 40, window.innerHeight - c.offsetHeight - 12)) : top)}px`;
    }
    c.querySelector<HTMLElement>(".tour-next")?.focus({ preventScroll: true });
  }, [rect, i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      else if (e.key === "ArrowRight") last ? onDone() : setI((n) => n + 1);
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [last, onDone]);

  return (
    <div className="tour" aria-live="polite">
      <div className={`tour-dim${rect ? "" : " is-plain"}`} onClick={onDone} aria-hidden="true" />
      <div ref={spot} className="tour-spot" aria-hidden="true" />
      <div ref={card} className="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-title">
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-dots" aria-label={`Step ${i + 1} of ${steps.length}`}>
          {steps.map((_, n) => (
            <span key={n} className={n === i ? "is-on" : undefined} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="link tour-skip" onClick={onDone}>
            {last ? "Close" : "Skip the tour"}
          </button>
          <span className="tour-moves">
            {i > 0 && (
              <button type="button" className="quiet" onClick={() => setI(i - 1)}>
                Back
              </button>
            )}
            <button type="button" className="primary tour-next" onClick={() => (last ? onDone() : setI(i + 1))}>
              {last ? "Start writing" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

/** The walkthrough: everything the app does, in the order a writer meets it. */
export const TOUR: TourStep[] = [
  {
    target: ".writing",
    title: "Your page",
    body: "Just write. Notes save by themselves a moment after you stop, as plain files you own.",
  },
  {
    target: ".sidebar-head, .save-state",
    title: "Where everything lives",
    body: "Stubli Writer is a web page: nothing to install, and no account with us. Your notes are files kept where you chose: a folder, your own Google Drive, or this device. For the same notes on every device, choose Google Drive on each.",
  },
  {
    target: ".gaps-button",
    title: "Gaps: TK",
    body: `Not sure of a word, a date, a name? Type TK and keep going, or @tk[what's missing]. Gaps lists every one, in every note, and ${mod}J jumps to the next.`,
  },
  {
    target: ".writing",
    title: "Formatting",
    body: "Select words for bold, italic, links, headings and quotes. On an empty line, the + adds a picture, code, a break or a drop cap.",
  },
  {
    target: ".topbar-left .chip-button:not(.menu-button), .side-list .side-item",
    title: "Today and your notes",
    body: `New note starts a piece; Today is a fresh note for the day. ${mod}K finds any note by its words, or starts a new one.`,
  },
  {
    target: ".sidebar",
    title: "Books, folders and Trash",
    body: "Everything you've written, arranged like the Finder: right-click (or …) to rename, move or add a folder, or drag things where they belong. Undo is always offered.",
  },
  {
    target: ".sidebar .side-heading",
    title: "Books",
    body: "A book keeps its chapters in order, with an overview of the story, its characters, its lore and checks that the writing agrees with them. Help has a second, short tour just for books.",
  },
  {
    target: ".footer-note",
    title: "Export",
    body: "Word in manuscript format for editors and agents, EPUB for ebook stores, a PDF or a paperback interior, or copied for Medium and Substack. Right-click a book for the whole book.",
  },
  {
    target: '[aria-label^="Appearance"]',
    title: "Make it yours",
    body: "Aa sets the text size, the font, the page colour (with a Night page for after dark) and the accent. The corner of the page counts your words.",
  },
  {
    target: '.topbar [aria-label="Help"], .sidebar-foot',
    title: "Help, any time",
    body: "Every shortcut and how everything works is in Help, which you can search. You can take this tour again there, and the one about books.",
  },
];

/** The book tour: the five parts of a book, shown on the book itself, then what they do while you write. */
export const BOOK_TOUR: TourStep[] = [
  {
    target: ".new-book",
    book: "overview",
    title: "A book",
    body: "Start one here by its title. A book keeps its chapters in order, and everything you know about the story. None of that is in the writing, or in an export.",
  },
  {
    target: ".overview",
    book: "overview",
    title: "Overview",
    body: "The whole story on one page: what the book is about, then each chapter with what happens, when, who tells it and how far along it is. You write these yourself.",
  },
  {
    target: ".chapter-grid, .chapter-tools",
    book: "chapters",
    title: "Arrange",
    body: "Chapters as cards, in order. Drag one, or use its arrows, to move it. Add a new chapter, or a note you've already written.",
  },
  {
    target: ".chapters-board .card-grid:not(.chapter-grid), .cast-new",
    book: "characters",
    title: "Characters",
    body: "A card for each person: who they are, their fixed facts, and what they are to each other. In a chapter, type @ once to name someone; after that every mention is underlined.",
  },
  {
    target: ".lore-grid, .new-lore",
    book: "lore",
    title: "Lore",
    body: "What must stay true: places, rules, objects, history. A card's name gets a dotted underline in the chapters. Books in the same world can share lore and characters.",
  },
  {
    target: ".checks",
    book: "checks",
    title: "Checks",
    body: "Reminders of what may not agree with your cards: a name spelled nearly like another, a fixed fact said differently, a name with no card. And a ready-made question for any AI assistant.",
  },
  {
    target: ".footer-note",
    book: "close",
    title: "While you write",
    body: "Choose an underlined name to see its card. The line under a chapter leads back to its book, and says when there's something to check. On a wide screen the book stays open beside your text.",
  },
];
