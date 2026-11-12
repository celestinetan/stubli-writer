import { useEffect, useState } from "react";
import { connectionLabel, type Character, type CardFields, type Kind } from "./characters";
import { CharacterMap } from "./CharacterMap";
import type { Point } from "./family-layout";
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
  /** The map's saved places, and saving them. */
  places: Record<string, Point>;
  onPlaces: (places: Record<string, Point>) => void;
}

/**
 * A book's characters as cards: who they are, who they're connected to, and the chapters they're
 * in. Everything is changed with buttons and fields; the cards are saved as plain notes.
 */
export function CastView({ cast, fieldsOf, focusPath, outside, onOpenNote, onNew, onSave, onConnect, onDisconnect, onMoveIn, places, onPlaces }: Props) {
  // The map needs room; on a phone, the cards are the way in.
  const wide = useWide();
  const [view, setView] = useState<"cards" | "map">(() => (loadView() === "map" ? "map" : "cards"));
  const showMap = wide && view === "map";
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
      <div className="cast-top">
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
      {wide && cast.length > 0 && (
        <div className="view-switch" role="group" aria-label="Show characters as">
          {(["cards", "map"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                saveView(v);
              }}
            >
              {v === "cards" ? "Cards" : "Family tree"}
            </button>
          ))}
        </div>
      )}
      </div>

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

      {showMap ? (
        <CharacterMap cast={cast} saved={places} onSave={onPlaces} onChoose={() => undefined} />
      ) : cast.length === 0 ? (
        <p className="sheet-empty">
          No characters yet. Add one here, or type @ and a name in any chapter, once. After that the app knows them: every mention
          is underlined, and their card says who they are and who they're connected to.
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
              "Choose a name to see who they're connected to. In a chapter, type @ once to name someone; after that, every mention of them is underlined."
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
                    <p className="card-mentions is-empty">Not in a chapter yet.</p>
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

const KINDS: { kind: Kind; label: (name: string) => string }[] = [
  { kind: "parent", label: () => "Parent" },
  { kind: "child", label: () => "Child" },
  { kind: "partner", label: () => "Partner" },
  { kind: "sibling", label: () => "Brother or sister" },
  { kind: "other", label: () => "Something else" },
];

function ConnectForm({ from, others, onConnect, onCancel }: { from: Character; others: Character[]; onConnect: (to: Character, label: string) => void; onCancel: () => void }) {
  const [to, setTo] = useState(others[0]?.path ?? "");
  const [kind, setKind] = useState<Kind>("other");
  const [words, setWords] = useState("");
  const other = others.find((o) => o.path === to);
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
        if (other) onConnect(other, connectionLabel(kind, words));
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
      <fieldset className="kind-choice">
        <legend>
          {other?.name ?? "They"} is {from.name}'s
        </legend>
        <div className="kind-row">
          {KINDS.map((k) => (
            <label key={k.kind} className={`kind-chip${kind === k.kind ? " is-on" : ""}`}>
              <input type="radio" name={`kind-${from.path}`} value={k.kind} checked={kind === k.kind} onChange={() => setKind(k.kind)} />
              {k.label(from.name)}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span>{kind === "other" ? "How? (optional)" : "In a few words (optional)"}</span>
        <input
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder={kind === "other" ? "friend, old rival, landlady…" : kind === "parent" ? "mother, never met…" : "met on the cruise…"}
          autoComplete="off"
        />
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

const VIEW_KEY = "stubli-writer:cast-view";

function loadView(): string | null {
  try {
    return localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
}

function saveView(v: string): void {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // Not remembered in a private window.
  }
}

function useWide(): boolean {
  const query = "(min-width: 720px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

function EditCard({ character: c, fields, onSave, onCancel }: { character: Character; fields: CardFields | null; onSave: (f: CardFields) => void; onCancel: () => void }) {
  const [role, setRole] = useState(fields?.role ?? c.role);
  const [aliases, setAliases] = useState((fields?.aliases ?? c.aliases).join(", "));
  const [summary, setSummary] = useState(fields?.summary ?? c.summary);
  const [everywhere, setEverywhere] = useState(!(fields?.atOnly ?? c.atOnly));
  return (
    <li data-card={c.path} data-tint={c.tint} className="character-card is-editing">
      <form
        className="edit-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name: fields?.name ?? c.name,
            atOnly: !everywhere,
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
        <label className="check">
          <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} />
          <span>
            Every “{c.name}” in this book is them
            <span className="check-note">Turn off if “{c.name}” is also an ordinary word; then only @{c.name} counts.</span>
          </span>
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
