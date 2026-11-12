import { useEffect, useRef, type RefObject } from "react";
import type { NoteStore } from "../store/store";

interface Props {
  open: boolean;
  anchor: RefObject<HTMLButtonElement | null>;
  /** Where the notes are, in words. */
  where: string;
  kind: NoteStore["kind"];
  offline: boolean;
  onClose: () => void;
  onBooks: () => void;
  onImport: () => void;
  onHelp: () => void;
  /** Go to the screen for choosing a folder or Google Drive (with a way back). */
  onChange: () => void;
}

/**
 * The menu at the top left: where your notes are, and everything that isn't writing (books,
 * import, help, and changing where notes are kept).
 */
export function NotebookMenu({ open, anchor, where, kind, offline, onClose, onBooks, onImport, onHelp, onChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.show();
      d.querySelector<HTMLElement>("button")?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!dialog.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, onClose, anchor]);

  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <dialog ref={dialog} className="popover menu-popover" aria-label="Menu">
      <p className="menu-where">
        {where}
        {offline && <span className="menu-offline"> · offline, saving on this device</span>}
      </p>
      <ul className="menu-list">
        <li>
          <button type="button" onClick={go(onBooks)}>
            Books
            <span className="menu-meta">Chapters and characters</span>
          </button>
        </li>
        <li>
          <button type="button" onClick={go(onImport)}>
            Import notes
            <span className="menu-meta">From Bear, Obsidian or any Markdown files</span>
          </button>
        </li>
        <li>
          <button type="button" onClick={go(onHelp)}>
            Help
            <span className="menu-meta">How it works, and every shortcut</span>
          </button>
        </li>
        <li className="menu-gap">
          <button type="button" onClick={go(onChange)}>
            {kind === "memory" ? "Choose where to keep real notes" : "Change where notes are kept"}
            <span className="menu-meta">
              {kind === "folder" ? "Another folder, or Google Drive" : kind === "drive" ? "A folder on this computer, or another account" : "A folder on this computer, or Google Drive"}
            </span>
          </button>
        </li>
        <li>
          <a href="./privacy.html">Privacy and terms</a>
        </li>
      </ul>
    </dialog>
  );
}
