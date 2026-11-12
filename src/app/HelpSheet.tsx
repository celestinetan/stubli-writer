import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Where the notes live now, in words, e.g. "in “Notes” on this computer". */
  where: string;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

/** ? Help: how gaps, formatting and storage work, and every shortcut. Plain words, one page. */
export function HelpSheet({ open, onClose, where }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="sheet help-sheet"
      aria-labelledby="help-title"
      // The browser announces a close a moment late; if the sheet is open again by then, ignore it.
      onClose={() => !dialog.current?.open && onClose()}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
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
              <code>@tk[the year the line opened]</code>. Every gap in every note is listed under the gaps button at the top, and{" "}
              <kbd>{mod}J</kbd> jumps to the next one in a note.
            </p>
          </section>

          <section>
            <h3>Formatting</h3>
            <ul>
              <li>Select some words for the bar: bold, italic, link, code, two heading sizes, and quote. Press quote again for a large pull quote.</li>
              <li>On a wide screen, an empty line shows a + for a picture, code, a break, a drop cap, and (right under the title) a subtitle.</li>
              <li>Click a picture to choose its size or write a caption.</li>
            </ul>
          </section>

          <section>
            <h3>Shortcuts</h3>
            <table className="help-keys">
              <tbody>
                <Row keys={`${mod}K`}>Find or start a note</Row>
                <Row keys={`${mod}J`}>Next gap</Row>
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
            <h3>Your notes</h3>
            <ul>
              <li>Notes live {where}. Each one is a plain Markdown file you can open in any other app.</li>
              <li>Notes save by themselves a moment after you stop typing. The top bar says when.</li>
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
