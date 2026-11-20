import { isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NoteStore } from "../store/store";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Where the notes live now, in words, e.g. "in “Notes” on this computer". */
  where: string;
  kind: NoteStore["kind"];
  /** Start the walkthrough, or the one about books. */
  onTour: () => void;
  onBookTour: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

/**
 * ? Help: everything the app does, as short topics that open one at a time, with a search box.
 * A panel at the side that leaves the note usable, so you can try things as you read
 * (full screen on a phone).
 */
export function HelpSheet({ open, onClose, where, kind, onTour, onBookTour }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  // The first topic starts open; the rest open as they're chosen. A search opens whatever it finds.
  const [open_, setOpen] = useState<Set<string>>(() => new Set(["Your first five minutes"]));
  const all = useMemo(() => topics({ where, kind }).map((t) => ({ ...t, text: `${t.title} ${textOf(t.body)}`.toLowerCase() })), [where, kind]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const shown = searching ? all.filter((t) => words.every((w) => t.text.includes(w))) : all;
  const toggle = (title: string, isOpen: boolean) =>
    setOpen((now) => {
      if (now.has(title) === isOpen) return now;
      const next = new Set(now);
      if (isOpen) next.add(title);
      else next.delete(title);
      return next;
    });

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.show();
      d.querySelector<HTMLElement>(".sheet-close")?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  // Not modal, so Escape is ours to handle.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <dialog ref={dialog} className="side-panel help-panel" aria-labelledby="help-title">
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="help-title">Help</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="help-body">
          <p className="help-tour">
            First time?{" "}
            <button type="button" className="link" onClick={onTour}>
              Take the one-minute tour
            </button>
            . Writing a book?{" "}
            <button type="button" className="link" onClick={onBookTour}>
              Take the book tour
            </button>
            .
          </p>
          <label className="help-search">
            <span className="visually-hidden">Search help</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help" autoComplete="off" spellCheck={false} />
          </label>

          {shown.length === 0 && (
            <p className="help-none" role="status">
              Nothing in Help mentions “{query.trim()}”. Try another word, or write to <a href="mailto:hello@celestinetan.com">hello@celestinetan.com</a>.
            </p>
          )}

          {GROUPS.filter((g) => shown.some((t) => t.group === g)).map((g) => (
            <section key={g} className="help-group" aria-label={g}>
              <h3 className="help-group-title">{g}</h3>
              {shown
                .filter((t) => t.group === g)
                .map((t) => (
                  <details key={t.title} className="help-topic" open={searching || open_.has(t.title)} onToggle={(e) => !searching && toggle(t.title, (e.target as HTMLDetailsElement).open)}>
                    <summary>
                      <h4>{t.title}</h4>
                    </summary>
                    <div className="help-topic-body">{t.body}</div>
                  </details>
                ))}
            </section>
          ))}

          <p className="help-foot">
            <a href="./privacy.html">Privacy and terms</a> · Something not working? Write to{" "}
            <a href="mailto:hello@celestinetan.com">hello@celestinetan.com</a>.
          </p>
        </div>
      </div>
    </dialog>
  );
}

const GROUPS = ["Start here", "Writing", "Books", "Finishing", "Keeping your notes safe", "Reference", "If something's wrong"] as const;

interface Topic {
  group: (typeof GROUPS)[number];
  title: string;
  body: ReactNode;
}

/** The words in a piece of Help, for searching it. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement<{ children?: ReactNode; keys?: string }>(node)) return `${node.props.keys ?? ""} ${textOf(node.props.children)}`;
  return "";
}

function topics({ where, kind }: Pick<Props, "where" | "kind">): Topic[] {
  const trashPlace =
    kind === "folder"
      ? "a Trash folder inside your notes folder"
      : kind === "drive"
        ? "a Trash folder inside your Stubli Writer folder in Google Drive"
        : kind === "device"
          ? "the Trash inside Stubli Writer on this device"
          : "the Trash";
  return [
    {
      group: "Start here",
      title: "Your first five minutes",
      body: (
        <>
          <ol>
            <li>
              <strong>Write.</strong> Choose <em>New note</em> at the top of the sidebar (the ☰ button shows it), give it a title, press Enter and
              write. It saves by itself.
            </li>
            <li>
              <strong>Leave gaps.</strong> When a word, a date or a name isn't ready, type <span className="gap">TK</span> and keep going.
            </li>
            <li>
              <strong>Format when you need to.</strong> Select some words for bold, italic, a link, a heading or a quote.
            </li>
            <li>
              <strong>Start a book,</strong> if you're writing one: <em>New book</em> in the sidebar, then add chapters. Other notes are one-offs:
              articles, essays, ideas.
            </li>
            <li>
              <strong>Know where it's kept.</strong> Your notes are {where}. The name at the top of the sidebar changes that.
            </li>
          </ol>
          <p>Everything else can wait until you need it. This Help can be searched at the top.</p>
        </>
      ),
    },
    {
      group: "Start here",
      title: "How Stubli Writer works: where the app and your notes live",
      body: (
        <>
          <p>Two things are kept apart: the app, and your notes.</p>
          <ul>
            <li>
              <strong>The app is a web page.</strong> There's nothing to install and no account with us. Opening this address brings the app
              into your browser; after the first visit it opens without a connection too. It's free and open source, and its files are served
              from GitHub.
            </li>
            <li>
              <strong>Your notes are never on that server.</strong> They're plain files kept in the place you chose: a folder on your computer,
              your own Google Drive, or this device. Right now they are {where}.
            </li>
            <li>
              <strong>The same notes on every device:</strong> choose Google Drive on each device and sign in with the same Google account. A
              folder stays on one computer, and “On this device” stays on one device.
            </li>
            <li>
              <strong>To use it like an app:</strong> in Chrome or Edge choose <em>Install</em> in the address bar; in Safari on a Mac, File,
              then <em>Add to Dock</em>; on an iPhone or iPad, Share, then <em>Add to Home Screen</em>. It gets its own icon and window.
            </li>
            <li>
              <strong>Updates arrive by themselves.</strong> When there's a new version, a note above your writing offers to reload.
            </li>
            <li>
              <strong>There's no AI inside.</strong> Nothing you write is sent to one. If you want an assistant to read for contradictions,
              Checks prepares the request and you take it to your own assistant.
            </li>
            <li>
              <strong>If this website ever went away,</strong> your notes would still be where you kept them, readable in any app, and anyone
              could host the app again from its public code.
            </li>
          </ul>
        </>
      ),
    },
    {
      group: "Writing",
      title: "Write and format",
      body: (
        <ul>
          <li>The first line of a note is its title. Press Enter and write.</li>
          <li>Select some words for the bar: bold, italic, link, code, two heading sizes, and quote. Press quote again for a large pull quote.</li>
          <li>An empty line shows a + (in the margin, or at the end of the line on narrow screens) for a picture, code, a break, a drop cap, and (right under the title) a subtitle.</li>
          <li>Click a picture to choose its size or write a caption.</li>
          <li>Typing shortcuts work too: <code>##</code> and a space for a heading, <code>&gt;</code> for a quote, <code>-</code> for a list. They're all under Shortcuts.</li>
          <li>Notes save by themselves a moment after you stop typing. The top bar says when.</li>
        </ul>
      ),
    },
    {
      group: "Writing",
      title: "Gaps: TK",
      body: (
        <>
          <p>
            When something isn't ready yet, type <span className="gap">TK</span> and keep writing. To say what's missing, type{" "}
            <code>@tk[the year the line opened]</code>.
          </p>
          <ul>
            <li>Every gap in every note is listed under Gaps at the top. Choose one to go to it.</li>
            <li>
              <kbd>{mod}J</kbd> jumps to the next gap in a note.
            </li>
            <li>To fill a gap, select it and type over it.</li>
            <li>Open gaps are listed before you export, so none slips into a manuscript unnoticed.</li>
          </ul>
        </>
      ),
    },
    {
      group: "Writing",
      title: "Find, start and arrange notes",
      body: (
        <ul>
          <li>
            <em>New note</em> is at the top of the sidebar. <em>Today</em> opens a fresh note for the day, for whatever's on your mind.
          </li>
          <li>
            <kbd>{mod}K</kbd> (or Search) finds any note by its words, or starts a new one with the title you typed.
          </li>
          <li>The sidebar lists your books, your folders and the Trash. The ☰ button at the top left shows or hides it.</li>
          <li>
            Arrange it like the Finder: right-click a note, folder or book (or use its … button) for New folder, Rename, Move to, Add to a book
            and Move to Trash, or drag notes and folders where they belong.
          </li>
          <li>Undo appears at the bottom after each change.</li>
          <li>
            At the bottom of a note, <em>Rename file</em> names the file after the note's title.
          </li>
        </ul>
      ),
    },
    {
      group: "Writing",
      title: "How the page looks: size, font, Night, word count",
      body: (
        <ul>
          <li>Aa at the top sets the text size, the font, the page colour and the accent colour. Each change shows on the page as you choose.</li>
          <li>The Night page is for writing after dark. If your device is set to dark, you start on it.</li>
          <li>The corner of the page counts the words in the note, or in what you've selected. Aa can hide it.</li>
          <li>While you type, the buttons at the top fade so only your words are in view. Move the mouse to bring them back.</li>
          <li>These choices are kept on this device only.</li>
        </ul>
      ),
    },
    {
      group: "Books",
      title: "Start a book and add chapters",
      body: (
        <ul>
          <li>
            Choose <em>New book</em> in the sidebar and give it a title. A book holds its chapters in order, its characters and its lore.
          </li>
          <li>
            Open the book and choose <em>Arrange</em>. Add a new chapter there, or add a note you've already written.
          </li>
          <li>Chapters show as cards in order. Drag one, or use its arrows, to move it. On a phone, use the arrows.</li>
          <li>
            <em>Take out of the book</em> removes a chapter from the book without deleting it.
          </li>
          <li>A chapter is an ordinary note: open it from the sidebar, under its book, and write.</li>
        </ul>
      ),
    },
    {
      group: "Books",
      title: "Overview: the whole story on one page",
      body: (
        <ul>
          <li>A book opens on its Overview: what the book is about, then every chapter in order.</li>
          <li>
            For each chapter, choose <em>Add a summary</em> to say what happens, when it happens, who tells it, and how far along it is (draft,
            revised, done).
          </li>
          <li>Each chapter also shows its word count, its open gaps and the characters in it, and the book shows its totals.</li>
          <li>You write the summaries yourself. They're kept with the chapter, never in the writing, and never in an export.</li>
        </ul>
      ),
    },
    {
      group: "Books",
      title: "Characters, connections and the map",
      body: (
        <ul>
          <li>
            In a chapter, type <code>@</code> once to name a character: choose them from the list, or add someone new. After that the app knows
            them: every <span className="mention-sample">Ana</span> in the book is underlined, and clicking one shows who she is.
          </li>
          <li>
            On the Characters tab, choose <em>Edit</em> to say who someone is, their role, their other names, and any fixed facts.
          </li>
          <li>
            <em>Connect</em> two people and say what each is to the other (“mother” one way, “the daughter who asks too many questions” the
            other), or nothing.
          </li>
          <li>
            <em>Map</em> shows everyone as cards you can put anywhere. Drag from the dot on one card to another to connect them. Click a line to
            change its words or remove it.
          </li>
          <li>
            A name that's also an ordinary word (“Will”, “Hope”) can be set, under Edit, to count only where you write it with an @.
          </li>
        </ul>
      ),
    },
    {
      group: "Books",
      title: "Lore: what must stay true",
      body: (
        <ul>
          <li>Lore is a card for each place, rule, object, group or piece of history in your story.</li>
          <li>
            On the Lore tab, add one by name, then choose <em>Edit</em> to write what's true about it.
          </li>
          <li>Once something has a card, its name gets a dotted underline in the chapters. Choose it there to see the card without leaving the page.</li>
          <li>A card named “The Meridian” is also found where you write “the Meridian”.</li>
          <li>Like characters, lore isn't listed with your notes, found by search, or put in an export.</li>
        </ul>
      ),
    },
    {
      group: "Books",
      title: "Worlds: more than one book in the same world",
      body: (
        <ul>
          <li>
            On the Lore tab, choose <em>Name this book's world</em>. Give other books the same world name.
          </li>
          <li>
            Each lore card and each character then has <em>Share across</em> the world. A shared card is in every book set there.
          </li>
          <li>
            <em>Keep in this book only</em> brings a card back. Nothing is shared unless you choose it.
          </li>
        </ul>
      ),
    },
    {
      group: "Books",
      title: "Checks and fixed facts",
      body: (
        <>
          <p>Checks, in the book, are reminders of what may not agree with your cards. Each is a question; you decide.</p>
          <ul>
            <li>A name spelled nearly like one on a card: “Catherine” when the card says “Katherine”.</li>
            <li>
              A fixed fact said differently: the card says “Eyes: green” and a chapter says “her blue eyes”. Give a card facts under Edit, one on
              each line, like <code>Eyes: green</code> or <code>Age: 34</code>. Colours and numbers are compared; other facts are there for you to
              read.
            </li>
            <li>A name used several times that has no card yet.</li>
            <li>
              <em>Not a problem</em> sets a reminder aside for good.
            </li>
            <li>A chapter with something to check says so in the line under its text.</li>
            <li>
              For contradictions only a reader would catch, <em>Ask an AI to read for contradictions</em> copies a ready-made question, with your
              notes about the story and the writing, to paste into any AI assistant. Nothing is sent from Stubli Writer.
            </li>
            <li>
              If your notes are in Google Drive or a folder, and your assistant can read that place (Claude, ChatGPT and Gemini can each be
              connected to Google Drive), choose <em>Keep a story bible for this book</em>. The app then keeps one file up to date with what the
              book is about, your summaries, characters and lore. You send your assistant one sentence, and it reads the file and the chapter
              itself.
            </li>
          </ul>
        </>
      ),
    },
    {
      group: "Books",
      title: "The book beside your text",
      body: (
        <ul>
          <li>On a wide screen the book opens beside your text, so the overview, characters and lore stay in view while you write.</li>
          <li>Opening another chapter from there keeps the book open.</li>
          <li>
            <em>Show wide</em> gives the book the whole screen, and <em>Show beside the text</em> brings it back. The characters map opens wide by
            itself, because it needs the room.
          </li>
          <li>On a phone the book fills the screen. Close it to go back to the page.</li>
        </ul>
      ),
    },
    {
      group: "Finishing",
      title: "Export: Word, EPUB, PDF, paperback, the web",
      body: (
        <ul>
          <li>
            Right-click a book in the sidebar and choose <em>Export the book…</em>, or use <em>Export…</em> at the bottom of a note.
          </li>
          <li>
            <em>Word</em> in manuscript format is what editors, agents and competitions usually ask for: 12 pt Times, double-spaced, with a title
            page and your name on every page. <em>Clean</em> is for reading.
          </li>
          <li>
            <em>EPUB</em> is for ebook stores such as Apple Books, Kobo and Amazon KDP.
          </li>
          <li>
            <em>PDF</em> opens your browser's print window: choose “Save as PDF”. For a book, the PDF can be a <em>paperback interior</em> for
            Amazon KDP or another printer: pick the trim size, and in the print window set Margins to Default and turn off Headers and footers.
          </li>
          <li>
            <em>Copy for the web</em> is for pasting into Medium, Substack or WordPress.
          </li>
          <li>Open gaps are listed before you export; any left show as [TK] in the file.</li>
          <li>Summaries, characters, lore and checks are never in an export. Everything is made on your device.</li>
        </ul>
      ),
    },
    {
      group: "Keeping your notes safe",
      title: "Where your notes are kept",
      body: (
        <>
          <p>Notes live {where}. To change that, choose the name at the top of the sidebar. There are three places:</p>
          <ul>
            <li>
              <strong>A folder on this computer.</strong> Plain files next to your other documents, which your own backups cover. Works in Chrome,
              Edge and Arc on a computer.
            </li>
            <li>
              <strong>Google Drive.</strong> For writing on more than one device, including a phone. Notes also stay on each device, so you can
              write without a connection; they're sent when you're back online. Stubli Writer sees only the files it makes.
            </li>
            <li>
              <strong>On this device.</strong> Inside the app, with no account. Nothing leaves the device, so back up now and then.
            </li>
          </ul>
          <p>Each note is a plain Markdown file you can open in any other app.</p>
        </>
      ),
    },
    {
      group: "Keeping your notes safe",
      title: "Back up, restore, and move to a new place",
      body: (
        <ul>
          <li>
            <em>Back up</em> (at the bottom of the sidebar) saves every note and picture in one .zip. Keep it anywhere: Files, iCloud Drive, a USB
            stick.
          </li>
          <li>
            <em>Restore a backup</em> (in Import notes) puts every note back where it was. A note you've changed since is kept as well, as a
            “(restored)” copy.
          </li>
          <li>To move your notes to a new place or a new device: back up, choose the new place, restore.</li>
          <li>When notes are kept only on a device, the app reminds you to back up after a few days, then every two weeks.</li>
          <li>
            <em>Import notes</em> also brings in Markdown and text files you wrote elsewhere.
          </li>
        </ul>
      ),
    },
    {
      group: "Keeping your notes safe",
      title: "On an iPhone or iPad, offline, and as an app",
      body: (
        <ul>
          <li>An iPhone or iPad can't open folders from a web page. Use Google Drive, or “On this device”.</li>
          <li>
            Add Stubli Writer to your Home Screen (Share, then <em>Add to Home Screen</em>). It then opens like an app, and the device keeps its
            notes more reliably.
          </li>
          <li>
            On a computer, Chrome and Edge can install it too: look for <em>Install</em> in the address bar.
          </li>
          <li>Once opened, it works without a connection. With Google Drive, changes are sent when you're back online.</li>
        </ul>
      ),
    },
    {
      group: "Keeping your notes safe",
      title: "Trash, Undo, and two versions of one note",
      body: (
        <ul>
          <li>
            <em>Move to Trash</em> (at the bottom of a note, or by right-click) puts a note in {trashPlace}. Right after, Undo puts it back.
          </li>
          <li>Later, open Trash in the sidebar to put a note back where it was, or delete it for good. Deleting for good always asks first.</li>
          <li>
            If a note was also changed somewhere else (another device, or another app on the same folder), both versions are kept: the other one
            appears next to it as a “conflicted copy”. Keep what you want from each, then move one to Trash.
          </li>
        </ul>
      ),
    },
    {
      group: "Keeping your notes safe",
      title: "Privacy",
      body: (
        <ul>
          <li>Your notes never reach us. Stubli Writer has no account of its own and stores nothing on a server.</li>
          <li>With Google Drive, your notes go between your browser and your own Drive, and nowhere else.</li>
          <li>Exports, backups and checks are all made on your device.</li>
          <li>
            The full text is in <a href="./privacy.html">Privacy and terms</a>.
          </li>
        </ul>
      ),
    },
    {
      group: "Reference",
      title: "Shortcuts",
      body: (
        <table className="help-keys">
          <tbody>
            <Row keys={`${mod}K`}>Find or start a note</Row>
            <Row keys={`${mod}J`}>Next gap</Row>
            <Row keys="@">Name a character, once, in a book's chapter</Row>
            <Row keys={`${mod}B · ${mod}I · ${mod}E`}>Bold · italic · code</Row>
            <Row keys={`${mod}Z`}>Undo typing</Row>
            <Row keys="?">This help (when you're not typing in a note)</Row>
            <Row keys="Esc">Close a panel, a menu or the tour</Row>
            <Row keys="# · ## · ###">A title, a heading, a small heading (type at the start of a line, then a space)</Row>
            <Row keys="####">A subtitle, on the line right under the title</Row>
            <Row keys=">">A quote</Row>
            <Row keys="- · 1.">A list</Row>
            <Row keys="```">Code, then Enter</Row>
            <Row keys="---">A break</Row>
          </tbody>
        </table>
      ),
    },
    {
      group: "Reference",
      title: "How notes are saved as files",
      body: (
        <>
          <p>For anyone who opens the files in another app. Everything is plain Markdown.</p>
          <ul>
            <li>
              A book is a note in <code>Books</code> with a list of links to its chapters. Its characters are in <code>Books/Title/Characters</code>{" "}
              and its lore in <code>Books/Title/Lore</code>. What a world shares is in <code>Worlds/Name</code>.
            </li>
            <li>
              A chapter's summary is kept at the top of its file as <code>synopsis</code>, <code>when</code>, <code>told-by</code> and{" "}
              <code>status</code>. A book keeps <code>premise</code> and <code>world</code> the same way.
            </li>
            <li>
              A card's fixed facts are a list under a <code>## Facts</code> heading, and its connections under <code>## Connections</code>.
            </li>
            <li>
              A pull quote starts with <code>[!pull]</code>, a picture's size is <code>{"{.wide}"}</code> or <code>{"{.inset}"}</code>, and a drop
              cap is <code>dropcap: true</code> at the top of the file.
            </li>
            <li>
              A gap is the letters <code>TK</code>, or <code>@tk[what's missing]</code>.
            </li>
          </ul>
        </>
      ),
    },
    {
      group: "If something's wrong",
      title: "My folder won't open",
      body: (
        <ul>
          <li>Folders work in Chrome, Edge and Arc on a computer. Safari, Firefox, iPhones and iPads can't open them: use Google Drive or “On this device”.</li>
          <li>Choose a folder inside Documents, not Documents, Desktop or Downloads itself. Browsers refuse those.</li>
          <li>When the browser asks whether this site may edit files, choose Allow.</li>
          <li>Each time you come back, the browser asks for one click before it opens the folder again. That's the browser's rule, not a fault.</li>
        </ul>
      ),
    },
    {
      group: "If something's wrong",
      title: "I can't find a note, or my notes look gone",
      body: (
        <ul>
          <li>
            Search with <kbd>{mod}K</kbd>: it looks inside every note, not only at titles.
          </li>
          <li>Look in Trash, in the sidebar.</li>
          <li>Check the top of the sidebar: it says where the notes on screen are kept. If you've used more than one place, your notes may be in the other one.</li>
          <li>Notes kept “On this device” are in this browser on this device only. Another browser or device won't have them until you restore a backup there.</li>
          <li>A chapter is listed under its book, not under Folders. Characters and lore are inside the book.</li>
        </ul>
      ),
    },
    {
      group: "If something's wrong",
      title: "A word is underlined that isn't a name",
      body: (
        <ul>
          <li>A solid underline is a character; a dotted one is lore. Both come from a card with that name or one of its other names.</li>
          <li>
            If a character's name is also an ordinary word, open the Characters tab, choose Edit, and set it to count only where it's written
            with an @.
          </li>
          <li>For lore, change the card's name or its other names so they're less common, or move the card to Trash.</li>
        </ul>
      ),
    },
    {
      group: "If something's wrong",
      title: "A check is wrong",
      body: (
        <ul>
          <li>
            The checks compare words; they don't understand the story. Choose <em>Not a problem</em> and it won't be raised again.
          </li>
          <li>If two people really do have similar names, give the second one a card. Names on cards aren't questioned.</li>
          <li>A fact is only checked in a paragraph that names one card and no other, so some real slips won't be caught. For those, ask an AI from the Checks tab.</li>
        </ul>
      ),
    },
    {
      group: "If something's wrong",
      title: "Google Drive isn't keeping up",
      body: (
        <ul>
          <li>The top bar says “Saved on this device” while a change is waiting to reach Drive, and “Saved” once it has.</li>
          <li>Without a connection, keep writing: changes are sent when you're back online.</li>
          <li>If Google asks you to sign in again, do: your waiting changes are kept until then.</li>
          <li>Notes you make in Drive itself, outside the Stubli Writer folder, aren't seen. Stubli Writer can only see files it made.</li>
        </ul>
      ),
    },
  ];
}

function Row({ keys, children }: { keys: string; children: React.ReactNode }) {
  return (
    <tr>
      <th scope="row">
        <kbd>{keys}</kbd>
      </th>
      <td>{children}</td>
    </tr>
  );
}
