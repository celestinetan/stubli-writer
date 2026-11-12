import { useEffect, useMemo, useRef } from "react";
import { allGaps, type LibraryNote } from "./library";

interface Props {
  open: boolean;
  notes: LibraryNote[];
  /** The note being written; its gaps come first. */
  currentPath: string | null;
  onClose: () => void;
  onShow: (path: string, index: number) => void;
}

/** Every open gap across all notes. Choosing one opens the note at that gap. */
export function GapPanel({ open, notes, currentPath, onClose, onShow }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const gaps = useMemo(() => allGaps(notes), [notes]);
  const byNote = useMemo(() => {
    const groups = new Map<string, typeof gaps>();
    for (const g of gaps) groups.set(g.note.path, [...(groups.get(g.note.path) ?? []), g]);
    const list = [...groups.values()];
    // This note first, then the rest as before (newest first).
    return list.sort((a, b) => Number(b[0].note.path === currentPath) - Number(a[0].note.path === currentPath));
  }, [gaps, currentPath]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="sheet gap-panel"
      aria-labelledby="gap-panel-title"
      // The browser announces a close a moment late; if the sheet is open again by then, ignore it.
      onClose={() => !dialog.current?.open && onClose()}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="gap-panel-title">{gaps.length === 0 ? "No open gaps" : gaps.length === 1 ? "1 open gap" : `${gaps.length} open gaps`}</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Close
          </button>
        </header>
        {gaps.length === 0 ? (
          <p className="sheet-empty">
            When something isn't ready yet, type TK and keep writing. Every gap shows up here, so you can come back to it.
          </p>
        ) : (
          <>
            <p className="sheet-hint">
              Choose one to go to it.<span className="label-wide"> In a note, ⌘J moves to the next gap.</span>
            </p>
            {byNote.map((group) => (
              <section key={group[0].note.path} className="gap-group">
                <h3>
                  {group[0].note.title}
                  {group[0].note.path === currentPath && <span className="gap-group-here"> · this note</span>}
                </h3>
                <ul>
                  {group.map(({ note, gap, index, context }) => (
                    <li key={index}>
                      <button type="button" onClick={() => onShow(note.path, index)}>
                        {gap.request ? <span className="gap-request-text">{gap.request}</span> : null}
                        <span className="gap-context">{renderContext(context)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </dialog>
  );
}

function renderContext(context: string) {
  const [before, after] = context.split("▢");
  return (
    <>
      {before}
      <span className="gap" aria-label="gap">
        TK
      </span>
      {after}
    </>
  );
}
