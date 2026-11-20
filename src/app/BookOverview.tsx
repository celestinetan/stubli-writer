import { useEffect, useState } from "react";
import { STATUSES, type Book, type ChapterCard, type Outline, type Status } from "./books";
import type { Character } from "./characters";

interface Props {
  book: Book;
  premise: string;
  cards: ChapterCard[];
  cast: Character[];
  onOpenNote: (path: string) => void;
  onPremise: (text: string) => void;
  onOutline: (path: string, outline: Outline) => void;
}

const numberFmt = new Intl.NumberFormat();
const STATUS_WORD: Record<Exclude<Status, "">, string> = { draft: "Draft", revised: "Revised", done: "Done" };

/**
 * The book at a glance, to read from top to bottom: what it's about, then each chapter with its
 * summary, when it happens, who tells it and how far along it is. Everything here is the writer's
 * own words, kept in each chapter's header, never in the writing itself.
 */
export function BookOverview({ book, premise, cards, cast, onOpenNote, onPremise, onOutline }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [about, setAbout] = useState(premise);
  useEffect(() => setAbout(premise), [premise, book.path]);
  useEffect(() => setEditing(null), [book.path]);

  const found = cards.filter((c) => c.note);
  const words = found.reduce((n, c) => n + c.words, 0);
  const gaps = found.reduce((n, c) => n + c.gaps, 0);
  const progress = STATUSES.map((s) => [s, found.filter((c) => c.outline.status === s).length] as const).filter(([, n]) => n > 0);
  const savePremise = () => about.trim() !== premise.trim() && onPremise(about);

  return (
    <div className="overview">
      <label className="overview-premise">
        <span>What the book is about</span>
        <textarea
          value={about}
          rows={2}
          placeholder="A sentence or two: who, what they want, what's in the way"
          onChange={(e) => setAbout(e.target.value)}
          onBlur={savePremise}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </label>

      {cards.length === 0 ? (
        <p className="sheet-hint">No chapters yet. Add the first one under Arrange.</p>
      ) : (
        <>
          <p className="overview-totals">
            {cards.length} {cards.length === 1 ? "chapter" : "chapters"} · {numberFmt.format(words)} {words === 1 ? "word" : "words"}
            {gaps > 0 && ` · ${gaps} TK`}
            {progress.length > 0 && ` · ${progress.map(([s, n]) => `${n} ${STATUS_WORD[s].toLowerCase()}`).join(", ")}`}
          </p>
          <ol className="outline">
            {cards.map((c, i) => {
              const key = `${c.ref.path}#${i}`;
              const o = c.outline;
              return (
                <li key={key} className="outline-row">
                  <span className="outline-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="outline-body">
                    <div className="outline-head">
                      {c.note ? (
                        <button type="button" className="card-name" onClick={() => onOpenNote(c.ref.path)}>
                          <span className="visually-hidden">Chapter {i + 1}: </span>
                          {c.title}
                        </button>
                      ) : (
                        <p className="card-name is-static is-missing">
                          {c.title} <span className="card-role">(not found)</span>
                        </p>
                      )}
                      {o.status && (
                        <span className="outline-status" data-status={o.status}>
                          <span className="status-dot" aria-hidden="true" />
                          {STATUS_WORD[o.status]}
                        </span>
                      )}
                    </div>
                    {editing === key && c.note ? (
                      <OutlineForm
                        title={c.title}
                        outline={o}
                        cast={cast}
                        onCancel={() => setEditing(null)}
                        onSave={(next) => {
                          onOutline(c.ref.path, next);
                          setEditing(null);
                        }}
                      />
                    ) : (
                      <>
                        {o.summary ? (
                          <p className="outline-summary">{o.summary}</p>
                        ) : (
                          <p className="outline-summary is-empty">{c.note ? (c.synopsis ? `No summary yet. It begins: ${c.synopsis}` : "No summary yet.") : "This note was moved or renamed."}</p>
                        )}
                        {c.note && (
                          <p className="card-role outline-meta">
                            {[o.when, o.toldBy && `Told by ${o.toldBy}`, `${numberFmt.format(c.words)} ${c.words === 1 ? "word" : "words"}`, c.gaps > 0 && `${c.gaps} TK`]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        {c.characters.length > 0 && (
                          <ul className="chapter-people" aria-label="Characters in this chapter">
                            {c.characters.map((p) => (
                              <li key={p.path} data-tint={p.tint}>
                                <span className="card-dot" aria-hidden="true" />
                                {p.name}
                              </li>
                            ))}
                          </ul>
                        )}
                        {c.note && (
                          <button type="button" className="link outline-edit" aria-label={`${o.summary ? "Edit" : "Add a summary for"} “${c.title}”`} onClick={() => setEditing(key)}>
                            {o.summary || o.when || o.toldBy || o.status ? "Edit" : "Add a summary"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function OutlineForm({ title, outline, cast, onSave, onCancel }: { title: string; outline: Outline; cast: Character[]; onSave: (o: Outline) => void; onCancel: () => void }) {
  const [summary, setSummary] = useState(outline.summary);
  const [when, setWhen] = useState(outline.when);
  const [toldBy, setToldBy] = useState(outline.toldBy);
  const [status, setStatus] = useState<Status>(outline.status);
  const save = () => onSave({ summary, when, toldBy, status });
  return (
    <form
      className="edit-card outline-form"
      aria-label={`About “${title}”`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          e.preventDefault();
          onCancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <label>
        <span>What happens</span>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="A sentence or two" autoFocus />
      </label>
      <div className="outline-fields">
        <label>
          <span>When</span>
          <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Spring 1998, the next morning…" autoComplete="off" />
        </label>
        <label>
          <span>Told by</span>
          <input value={toldBy} onChange={(e) => setToldBy(e.target.value)} placeholder="Whose eyes we see it through" autoComplete="off" list="outline-cast" />
        </label>
        <label>
          <span>How far along</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="">Not set</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_WORD[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <datalist id="outline-cast">
        {cast.map((c) => (
          <option key={c.path} value={c.name} />
        ))}
      </datalist>
      <span className="connect-actions">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </span>
    </form>
  );
}
