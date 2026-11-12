import { useEffect, useRef, useState } from "react";
import type { NoteStore } from "../store/store";
import type { LibraryNote } from "./library";
import { folderBefore } from "./trash";

interface Props {
  open: boolean;
  notes: LibraryNote[];
  kind: NoteStore["kind"];
  onClose: () => void;
  onRestore: (note: LibraryNote) => void;
  onDelete: (note: LibraryNote) => void;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** Notes moved to Trash: put one back where it was, or delete it for good (asked first). */
export function TrashSheet({ open, notes, kind, onClose, onRestore, onDelete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setAsking(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const sorted = [...notes].sort((a, b) => b.modified - a.modified);

  return (
    <dialog
      ref={dialog}
      className="sheet gap-panel trash-sheet"
      aria-labelledby="trash-title"
      // The browser announces a close a moment late; if the sheet is open again by then, ignore it.
      onClose={() => !dialog.current?.open && onClose()}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="trash-title">Trash</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Close
          </button>
        </header>
        {sorted.length === 0 ? (
          <p className="sheet-empty">The Trash is empty. Notes you move to Trash wait here until you put them back or delete them.</p>
        ) : (
          <>
            <p className="sheet-hint">
              {kind === "folder"
                ? "Kept in the Trash folder inside your notes folder."
                : kind === "drive"
                  ? "Kept in a Trash folder in your Stubli Writer folder in Google Drive."
                  : "Sample notes: nothing here is kept."}
            </p>
            <ul className="trash-list">
              {sorted.map((n) => (
                <li key={n.path} className="trash-item">
                  <p className="trash-title">{n.title}</p>
                  <p className="trash-meta">
                    {folderBefore(n.path) ? `From ${folderBefore(n.path)}` : "From your notes"}
                    {n.modified ? ` · ${dateFmt.format(n.modified)}` : ""}
                  </p>
                  {asking === n.path ? (
                    <div className="trash-ask" role="alert">
                      <p>
                        Delete “{n.title}” for good?{" "}
                        {kind === "drive" ? "It goes to your Google Drive trash, where Google keeps it for 30 days." : "This can't be undone."}
                      </p>
                      <span className="connect-actions">
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setAsking(null);
                            onDelete(n);
                          }}
                        >
                          Delete for good
                        </button>
                        <button type="button" className="quiet" onClick={() => setAsking(null)} autoFocus>
                          Keep it
                        </button>
                      </span>
                    </div>
                  ) : (
                    <span className="note-actions">
                      <button type="button" className="link" onClick={() => onRestore(n)}>
                        Put back
                      </button>
                      <button type="button" className="link" onClick={() => setAsking(n.path)}>
                        Delete for good…
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </dialog>
  );
}
