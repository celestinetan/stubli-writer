import { useState } from "react";
import type { Book } from "./books";
import type { CardFields } from "./characters";
import { LORE_KINDS, type LoreEntry } from "./lore";

interface Props {
  book: Book;
  entries: LoreEntry[];
  /** Worlds other books are set in, to choose from. */
  worlds: string[];
  focusPath: string | null;
  fieldsOf: (path: string) => CardFields | null;
  onOpenNote: (path: string) => void;
  onNew: (name: string, kind: string) => void;
  onSave: (path: string, fields: CardFields) => void;
  /** Share a card with every book in this book's world, or bring it back into this book only. */
  onShare: (path: string, share: boolean) => void;
  onWorld: (world: string) => void;
}

/**
 * A book's lore: what must stay true, a card for each place, rule, object, group or piece of
 * history. Everything is changed with buttons and fields; the cards are saved as plain notes.
 */
export function LoreView({ book, entries, worlds, focusPath, fieldsOf, onOpenNote, onNew, onSave, onShare, onWorld }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>(LORE_KINDS[0]);
  const [editing, setEditing] = useState<string | null>(null);
  const [settingWorld, setSettingWorld] = useState(false);
  const [world, setWorld] = useState(book.world);

  return (
    <>
      <div className="board-tools cast-new">
        <form
          className="new-character new-lore"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onNew(name.trim(), kind);
            setName("");
          }}
        >
          <label htmlFor="new-lore-name">New lore</label>
          <input id="new-lore-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Its name" />
          <label className="visually-hidden" htmlFor="new-lore-kind">
            Kind
          </label>
          <select id="new-lore-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {LORE_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={!name.trim()}>
            Add
          </button>
        </form>
      </div>

      <p className="sheet-hint">
        What must stay true in this story: places, rules, objects, groups, history. Once something has a card, its name is underlined in the
        chapters; choose it there to see the card.
      </p>

      {settingWorld ? (
        <form
          className="new-character world-form"
          onSubmit={(e) => {
            e.preventDefault();
            onWorld(world.trim());
            setSettingWorld(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), e.preventDefault(), setSettingWorld(false))}
        >
          <label htmlFor="book-world">This book's world</label>
          <input id="book-world" value={world} onChange={(e) => setWorld(e.target.value)} autoComplete="off" list="known-worlds" placeholder="A name for it" autoFocus />
          <datalist id="known-worlds">
            {worlds.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
          <button type="submit" className="primary">
            Save
          </button>
          <button type="button" className="quiet" onClick={() => setSettingWorld(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <p className="sheet-hint world-line">
          {book.world ? (
            <>
              Set in <strong>{book.world}</strong>. Lore and characters you share are in every book set there.
            </>
          ) : (
            "Writing more than one book in the same world? Give the world a name, and the books can share lore and characters."
          )}{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setWorld(book.world);
              setSettingWorld(true);
            }}
          >
            {book.world ? "Change the world" : "Name this book's world"}
          </button>
        </p>
      )}

      {entries.length === 0 ? (
        <div className="sheet-empty">
          <p>No lore yet. Start with the thing you'd least like to get wrong: a place, a rule of the world, a date that everything hangs on.</p>
        </div>
      ) : (
        <ul className="card-grid lore-grid">
          {entries.map((x) =>
            editing === x.path ? (
              <EditLore
                key={x.path}
                entry={x}
                fields={fieldsOf(x.path)}
                onCancel={() => setEditing(null)}
                onSave={(f) => {
                  onSave(x.path, f);
                  setEditing(null);
                }}
              />
            ) : (
              <li key={x.path} data-card={x.path} className={`character-card lore-card${focusPath === x.path ? " is-chosen" : ""}`}>
                <p className="card-name is-static">{x.name}</p>
                {(x.kind || x.aliases.length > 0 || x.shared) && (
                  <p className="card-role">{[x.kind, x.aliases.length > 0 && `also ${x.aliases.join(", ")}`, x.shared && `shared across ${book.world}`].filter(Boolean).join(" · ")}</p>
                )}
                <p className={`card-summary${x.summary ? "" : " is-empty"}`}>{x.summary || "Nothing written yet."}</p>
                {x.mentions.length > 0 ? (
                  <details className="card-mentions">
                    <summary>
                      In {x.mentions.length} {x.mentions.length === 1 ? "chapter" : "chapters"}
                    </summary>
                    <ul>
                      {x.mentions.map((m) => (
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
                  <button type="button" className="link card-open" aria-label={`Edit ${x.name}`} onClick={() => setEditing(x.path)}>
                    Edit
                  </button>
                  <button type="button" className="link card-open" onClick={() => onOpenNote(x.path)}>
                    Open as a note
                  </button>
                  {book.world && (
                    <button type="button" className="link card-open" onClick={() => onShare(x.path, !x.shared)}>
                      {x.shared ? "Keep in this book only" : `Share across ${book.world}`}
                    </button>
                  )}
                </p>
              </li>
            ),
          )}
        </ul>
      )}
    </>
  );
}

function EditLore({ entry: x, fields, onSave, onCancel }: { entry: LoreEntry; fields: CardFields | null; onSave: (f: CardFields) => void; onCancel: () => void }) {
  const [kind, setKind] = useState(fields?.role ?? x.kind);
  const [aliases, setAliases] = useState((fields?.aliases ?? x.aliases).join(", "));
  const [summary, setSummary] = useState(fields?.summary ?? x.summary);
  return (
    <li data-card={x.path} className="character-card lore-card is-editing">
      <form
        className="edit-card"
        aria-label={`About ${x.name}`}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name: fields?.name ?? x.name, role: kind, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), summary, connections: [] });
        }}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), e.preventDefault(), onCancel())}
      >
        <p className="card-name is-static">{x.name}</p>
        <label>
          <span>What's true about it</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="What the story must not contradict" autoFocus />
        </label>
        <label>
          <span>Kind</span>
          <input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Place, rule, object…" autoComplete="off" list="lore-kinds" />
        </label>
        <datalist id="lore-kinds">
          {LORE_KINDS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <label>
          <span>Also called</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Other names, separated by commas" autoComplete="off" />
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
