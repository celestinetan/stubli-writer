import { useEffect, useState } from "react";
import type { Character, CardFields } from "./characters";
import type { LibraryNote } from "./library";

interface Props {
  cast: Character[];
  /** What's written on each card, for editing. */
  fieldsOf: (path: string) => CardFields | null;
  /** The card to bring forward (from an @name in a chapter). */
  focusPath: string | null;
  /** Cards made before characters belonged to books. */
  outside: LibraryNote[];
  onOpenNote: (path: string) => void;
  onNew: (name: string) => void;
  onSave: (path: string, fields: CardFields) => void;
  onConnect: (from: Character, to: Character, label: string) => void;
  onDisconnect: (from: Character, to: Character) => void;
  onMoveIn: (path: string) => void;
}

/**
 * A book's characters as cards: who they are, who they're connected to, and the chapters they're
 * in. Everything is changed with buttons and fields; the cards are saved as plain notes.
 */
export function CastView({ cast, fieldsOf, focusPath, outside, onOpenNote, onNew, onSave, onConnect, onDisconnect, onMoveIn }: Props) {
  const [chosen, setChosen] = useState<string | null>(focusPath);
  const [editing, setEditing] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    setChosen(focusPath);
    if (focusPath) requestAnimationFrame(() => show(focusPath));
  }, [focusPath]);

  function show(path: string) {
    setChosen(path);
    const card = document.querySelector<HTMLElement>(`[data-card="${CSS.escape(path)}"]`);
    card?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  const linked = new Set(chosen ? [chosen, ...(cast.find((c) => c.path === chosen)?.connections.map((x) => x.path) ?? [])] : []);
  const byPath = new Map(cast.map((c) => [c.path, c]));

  return (
    <>
      <form
        className="new-character cast-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            onNew(name.trim());
            setName("");
          }
        }}
      >
        <label htmlFor="new-character-name">New character</label>
        <input id="new-character-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Their name" />
        <button type="submit" className="primary" disabled={!name.trim()}>
          Add
        </button>
      </form>

      {outside.length > 0 && (
        <div className="note outside-cards">
          <p>
            {outside.length === 1 ? "1 character card isn't" : `${outside.length} character cards aren't`} in a book yet:{" "}
            {outside.map((n) => n.title).join(", ")}.
          </p>
          <span className="note-actions">
            {outside.map((n) => (
              <button key={n.path} type="button" className="link" onClick={() => onMoveIn(n.path)}>
                Move {n.title} into this book
              </button>
            ))}
          </span>
        </div>
      )}

      {cast.length === 0 ? (
        <p className="sheet-empty">
          No characters yet. Add one here, or type @ and a name in any chapter. Each character gets a card for who they are and who
          they're connected to.
        </p>
      ) : (
        <>
          <p className="sheet-hint">
            {chosen && byPath.has(chosen) ? (
              <>
                Showing {byPath.get(chosen)!.name}'s connections.{" "}
                <button type="button" className="link" onClick={() => setChosen(null)}>
                  Show everyone
                </button>
              </>
            ) : (
              "Choose a name to see who they're connected to. In a chapter, type @ to bring a character in."
            )}
          </p>
          <ul className="card-grid">
            {cast.map((c) =>
              editing === c.path ? (
                <EditCard key={c.path} character={c} fields={fieldsOf(c.path)} onCancel={() => setEditing(null)} onSave={(f) => (onSave(c.path, f), setEditing(null))} />
              ) : (
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
                  <p className={`card-summary${c.summary ? "" : " is-empty"}`}>{c.summary || "Who are they? Choose Edit to say."}</p>

                  {c.connections.length > 0 && (
                    <ul className="card-links" aria-label={`${c.name}'s connections`}>
                      {c.connections.map((x) => (
                        <li key={x.path ?? x.name} className="link-chip">
                          {x.path && byPath.has(x.path) ? (
                            <button type="button" className="chip" onClick={() => show(x.path!)}>
                              {x.name}
                              {x.label && <span className="chip-label"> · {x.label}</span>}
                            </button>
                          ) : (
                            <span className="chip is-plain">
                              {x.name}
                              {x.label && <span className="chip-label"> · {x.label}</span>}
                            </span>
                          )}
                          {x.path && byPath.has(x.path) && (
                            <button
                              type="button"
                              className="chip-remove"
                              aria-label={`Disconnect ${c.name} and ${x.name}`}
                              title="Disconnect"
                              onClick={() => onDisconnect(c, byPath.get(x.path!)!)}
                            >
                              ×
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {connecting === c.path ? (
                    <ConnectForm
                      from={c}
                      others={cast.filter((o) => o.path !== c.path && !c.connections.some((x) => x.path === o.path))}
                      onCancel={() => setConnecting(null)}
                      onConnect={(to, label) => {
                        onConnect(c, to, label);
                        setConnecting(null);
                      }}
                    />
                  ) : (
                    cast.some((o) => o.path !== c.path && !c.connections.some((x) => x.path === o.path)) && (
                      <button type="button" className="connect-button" onClick={() => setConnecting(c.path)}>
                        <span aria-hidden="true">+</span> Connect {c.name} to someone
                      </button>
                    )
                  )}

                  {c.mentions.length > 0 ? (
                    <details className="card-mentions">
                      <summary>
                        In {c.mentions.length} {c.mentions.length === 1 ? "chapter" : "chapters"}
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
                    <p className="card-mentions is-empty">Not in a chapter yet. Type @{c.name} in one.</p>
                  )}

                  <p className="card-actions">
                    <button type="button" className="link card-open" onClick={() => setEditing(c.path)}>
                      Edit
                    </button>
                    <button type="button" className="link card-open" onClick={() => onOpenNote(c.path)}>
                      Open as a note
                    </button>
                  </p>
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </>
  );
}

function ConnectForm({ from, others, onConnect, onCancel }: { from: Character; others: Character[]; onConnect: (to: Character, label: string) => void; onCancel: () => void }) {
  const [to, setTo] = useState(others[0]?.path ?? "");
  const [label, setLabel] = useState("");
  if (others.length === 0)
    return (
      <p className="card-role">
        {from.name} is connected to everyone here.{" "}
        <button type="button" className="link" onClick={onCancel}>
          OK
        </button>
      </p>
    );
  return (
    <form
      className="connect-form"
      onSubmit={(e) => {
        e.preventDefault();
        const other = others.find((o) => o.path === to);
        if (other) onConnect(other, label);
      }}
    >
      <label>
        <span>Connect {from.name} to</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} autoFocus>
          {others.map((o) => (
            <option key={o.path} value={o.path}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>How? (optional)</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="partner, sister, old rival…" autoComplete="off" />
      </label>
      <span className="connect-actions">
        <button type="submit" className="primary">
          Connect
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </span>
    </form>
  );
}

function EditCard({ character: c, fields, onSave, onCancel }: { character: Character; fields: CardFields | null; onSave: (f: CardFields) => void; onCancel: () => void }) {
  const [role, setRole] = useState(fields?.role ?? c.role);
  const [aliases, setAliases] = useState((fields?.aliases ?? c.aliases).join(", "));
  const [summary, setSummary] = useState(fields?.summary ?? c.summary);
  return (
    <li data-card={c.path} data-tint={c.tint} className="character-card is-editing">
      <form
        className="edit-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name: fields?.name ?? c.name,
            role,
            aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
            summary,
            connections: fields?.connections ?? [],
          });
        }}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), e.preventDefault(), onCancel())}
      >
        <p className="card-name is-static">
          <span className="card-dot" aria-hidden="true" />
          {c.name}
        </p>
        <label>
          <span>Role in the story</span>
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Lead, narrator, the landlady…" autoComplete="off" autoFocus />
        </label>
        <label>
          <span>Also called</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Nicknames, separated by commas" autoComplete="off" />
        </label>
        <label>
          <span>Who they are</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="A line or two to remember them by" />
        </label>
        <span className="connect-actions">
          <button type="submit" className="primary">
            Save
          </button>
          <button type="button" className="quiet" onClick={onCancel}>
            Cancel
          </button>
        </span>
      </form>
    </li>
  );
}
