import { useEffect, useRef, useState } from "react";
import type { Character } from "./characters";

interface Props {
  open: boolean;
  cast: Character[];
  /** The card to bring forward when the board opens (from a name in the note). */
  focusPath: string | null;
  namesOn: boolean;
  onToggleNames: () => void;
  onClose: () => void;
  onOpenNote: (path: string) => void;
  onNew: (name: string) => void;
}

/**
 * Every character as a card: who they are, who they're connected to, and where they appear.
 * Choosing a card brings its connections forward and steps the rest back.
 */
export function CharactersBoard({ open, cast, focusPath, namesOn, onToggleNames, onClose, onOpenNote, onNew }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setChosen(focusPath);
      setName("");
      d.showModal();
      if (focusPath) requestAnimationFrame(() => show(focusPath));
    } else if (!open && d.open) d.close();
  }, [open, focusPath]);

  function show(path: string) {
    setChosen(path);
    const card = dialog.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(path)}"]`);
    card?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    card?.querySelector<HTMLElement>(".card-name")?.focus({ preventScroll: true });
  }

  const linked = new Set(chosen ? [chosen, ...(cast.find((c) => c.path === chosen)?.connections.map((x) => x.path) ?? [])] : []);

  return (
    <dialog
      ref={dialog}
      className="sheet characters-board"
      aria-labelledby="characters-title"
      // The browser announces a close a moment late; if the sheet is open again by then, ignore it.
      onClose={() => !dialog.current?.open && onClose()}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="characters-title">Characters</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="board-tools">
          <form
            className="new-character"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onNew(name.trim());
            }}
          >
            <label htmlFor="new-character-name">New character</label>
            <input id="new-character-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" spellCheck={false} placeholder="A name" />
            <button type="submit" className="primary" disabled={!name.trim()}>
              Add
            </button>
          </form>
          <label className="switch">
            <input type="checkbox" role="switch" checked={namesOn} onChange={onToggleNames} />
            <span>Underline names in notes</span>
          </label>
        </div>

        {cast.length === 0 ? (
          <p className="sheet-empty">
            No characters yet. Add one here, or select a name in your writing and choose Character. Each card is a note in the
            Characters folder: who they are, and who they're connected to.
          </p>
        ) : (
          <>
            <p className="sheet-hint">
              {chosen ? (
                <>
                  Showing {cast.find((c) => c.path === chosen)?.name}'s connections.{" "}
                  <button type="button" className="link" onClick={() => setChosen(null)}>
                    Show everyone
                  </button>
                </>
              ) : (
                "Choose a name to see who they're connected to."
              )}
            </p>
            <ul className="card-grid">
              {cast.map((c) => (
                <li
                  key={c.path}
                  data-card={c.path}
                  data-tint={c.tint}
                  className={`character-card${chosen === c.path ? " is-chosen" : ""}${chosen && !linked.has(c.path) ? " is-faded" : ""}`}
                >
                  <button type="button" className="card-name" aria-pressed={chosen === c.path} onClick={() => (chosen === c.path ? setChosen(null) : show(c.path))}>
                    <span className="card-dot" aria-hidden="true" />
                    {c.name}
                  </button>
                  {(c.role || c.aliases.length > 0) && (
                    <p className="card-role">
                      {c.role}
                      {c.role && c.aliases.length > 0 && " · "}
                      {c.aliases.length > 0 && `also ${c.aliases.join(", ")}`}
                    </p>
                  )}
                  <p className={`card-summary${c.summary ? "" : " is-empty"}`}>{c.summary || "No summary yet."}</p>

                  {c.connections.length > 0 && (
                    <ul className="card-links" aria-label={`${c.name}'s connections`}>
                      {c.connections.map((x) => (
                        <li key={`${x.path ?? x.name}`}>
                          {x.path ? (
                            <button type="button" className="chip" onClick={() => show(x.path!)}>
                              {x.name}
                              {x.label && <span className="chip-label"> · {x.label}</span>}
                            </button>
                          ) : (
                            <span className="chip is-plain" title="No card with this name yet">
                              {x.name}
                              {x.label && <span className="chip-label"> · {x.label}</span>}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {c.mentions.length > 0 ? (
                    <details className="card-mentions">
                      <summary>
                        In {c.mentions.length} {c.mentions.length === 1 ? "note" : "notes"}
                      </summary>
                      <ul>
                        {c.mentions.map((m) => (
                          <li key={m.note.path}>
                            <button type="button" onClick={() => onOpenNote(m.note.path)}>
                              <span className="mention-title">{m.note.title}</span>
                              <span className="mention-context">{m.context}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <p className="card-mentions is-empty">Not in any note yet.</p>
                  )}

                  <button type="button" className="link card-open" onClick={() => onOpenNote(c.path)}>
                    Open card
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </dialog>
  );
}
