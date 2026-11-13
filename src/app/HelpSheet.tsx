import { useEffect, useRef } from "react";
import type { NoteStore } from "../store/store";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Where the notes live now, in words, e.g. "in “Notes” on this computer". */
  where: string;
  kind: NoteStore["kind"];
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

/**
 * ? Help: how gaps, formatting and storage work, and every shortcut. Plain words, one page.
 * A panel at the side that leaves the note usable, so you can try things as you read
 * (full screen on a phone).
 */
export function HelpSheet({ open, onClose, where, kind }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

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
          <section>
            <h3>Gaps</h3>
            <p>
              When something isn't ready yet, type <span className="gap">TK</span> and keep writing. To say what's missing, type{" "}
              <code>@tk[the year the line opened]</code>. Every gap in every note is listed under Gaps at the top, and{" "}
              <kbd>{mod}J</kbd> jumps to the next one in a note.
            </p>
          </section>

          <section>
            <h3>Formatting</h3>
            <ul>
              <li>Select some words for the bar: bold, italic, link, code, two heading sizes, and quote. Press quote again for a large pull quote.</li>
              <li>An empty line shows a + (in the margin, or at the end of the line on narrow screens) for a picture, code, a break, a drop cap, and (right under the title) a subtitle.</li>
              <li>Click a picture to choose its size or write a caption.</li>
              <li>Aa at the top sets the text size, font, page colour and accent.</li>
            </ul>
          </section>

          <section>
            <h3>Books, chapters and characters</h3>
            <ul>
              <li>
                A book holds chapters and characters. Notes that aren't in a book are one-offs: articles, essays, ideas. Books,
                folders and the Trash are in the sidebar (the ☰ button at the top left shows or hides it).
              </li>
              <li>Chapters show as cards in order. Drag one, or use its arrows, to move it.</li>
              <li>
                Arrange the sidebar like the Finder: right-click a note, folder or book (or use its … button) for New folder,
                Rename, Move to, Add to a book and Move to Trash, or drag notes and folders where they belong. Undo appears at the
                bottom after each change.
              </li>
              <li>
                In a chapter, type <code>@</code> once to name a character: choose them from the list, or add someone new. After that
                the app knows them: every <span className="mention-sample">Ana</span> in the book is underlined, and clicking one
                shows who she is.
              </li>
              <li>
                On the Characters tab, choose Edit to say who someone is. <em>Map</em> shows everyone as cards you can put anywhere:
                drag from the dot on one card to another to connect them, then say what each is to the other (“mother” one way,
                “the daughter who asks too many questions” the other), or nothing. Each side's words sit next to that person. Click
                a line to change them or remove it.
              </li>
            </ul>
          </section>

          <section>
            <h3>Shortcuts</h3>
            <table className="help-keys">
              <tbody>
                <Row keys={`${mod}K`}>Find or start a note</Row>
                <Row keys={`${mod}J`}>Next gap</Row>
                <Row keys="@">Name a character, once, in a book's chapter</Row>
                <Row keys={`${mod}B · ${mod}I · ${mod}E`}>Bold · italic · code</Row>
                <Row keys="?">This help (when you're not typing in a note)</Row>
                <Row keys="# · ## · ###">A title, a heading, a small heading (type at the start of a line, then a space)</Row>
                <Row keys="####">A subtitle, on the line right under the title</Row>
                <Row keys=">">A quote</Row>
                <Row keys="- · 1.">A list</Row>
                <Row keys="```">Code, then Enter</Row>
                <Row keys="---">A break</Row>
              </tbody>
            </table>
          </section>

          <section>
            <h3>Export</h3>
            <ul>
              <li>
                Right-click a book in the sidebar and choose <em>Export the book…</em>, or use <em>Export…</em> at the bottom of a
                note.
              </li>
              <li>
                <em>Word</em> in manuscript format is what editors, agents and competitions usually ask for: 12 pt Times,
                double-spaced, with a title page and your name on every page. <em>Clean</em> is for reading.
              </li>
              <li>
                <em>EPUB</em> is for ebook stores. <em>PDF</em> opens your browser's print window: choose “Save as PDF”.{" "}
                <em>Copy for the web</em> is for pasting into Medium, Substack or WordPress.
              </li>
              <li>Open gaps are listed before you export; any left show as [TK] in the file. Everything is made on your device.</li>
            </ul>
          </section>

          <section>
            <h3>Your notes</h3>
            <ul>
              <li>Notes live {where}. To change that, choose the name at the top of the sidebar. Each one is a plain Markdown file you can open in any other app.</li>
              <li>Notes save by themselves a moment after you stop typing. The top bar says when.</li>
              <li>
                At the bottom of a note: <em>Rename file</em> names the file after the note's title, and <em>Move to Trash</em>{" "}
                {kind === "folder"
                  ? "puts it in a Trash folder inside your notes folder."
                  : kind === "drive"
                    ? "puts it in a Trash folder inside your Stubli Writer folder in Google Drive."
                    : "puts it in the Trash."}{" "}
                Right after, Undo puts it back; later, open Trash in the sidebar to put it back or delete it for good.
              </li>
              <li>
                If a note was also changed somewhere else (another device, or another app on the same folder), both versions are kept:
                the other one appears next to it as a “conflicted copy”.
              </li>
              <li>
                A few formats are saved as small markers other apps show as text: a pull quote starts with <code>[!pull]</code>, a
                picture's size is <code>{"{.wide}"}</code> or <code>{"{.inset}"}</code>, and a drop cap is <code>dropcap: true</code> at the
                top of the file.
              </li>
            </ul>
          </section>

          <p className="help-foot">
            <a href="./privacy.html">Privacy and terms</a> · Something not working? Write to{" "}
            <a href="mailto:hello@celestinetan.com">hello@celestinetan.com</a>.
          </p>
        </div>
      </div>
    </dialog>
  );
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
