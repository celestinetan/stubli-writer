import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Character } from "./characters";
import { CARD_H, CARD_W, mapLines, mapPlaces, type MapLine, type Point } from "./map-layout";

interface Props {
  cast: Character[];
  /** Places the writer chose by dragging. */
  saved: Record<string, Point>;
  onSave: (places: Record<string, Point>) => void;
  /** A new line between two people (words may be empty). */
  onConnect: (a: Character, b: Character) => void;
  /** New words on a line (empty is fine). */
  onWords: (line: MapLine, words: string) => void;
  onRemove: (line: MapLine) => void;
}

const PAD = 40;

/**
 * The book's characters as a map you make yourself: put cards anywhere, draw a line from the dot
 * on one card to another, and write whatever the line means, or nothing. Click a line to change
 * its words or take it away.
 */
export function CharacterMap({ cast, saved, onSave, onConnect, onWords, onRemove }: Props) {
  const auto = useMemo(() => mapPlaces(cast, saved), [cast, saved]);
  const [places, setPlaces] = useState(auto);
  useEffect(() => setPlaces(auto), [auto]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{ from: string; to: Point; over: string | null } | null>(null);
  /** A line whose words are being written. Kept by its two people, so it survives the save. */
  const [editing, setEditing] = useState<{ a: string; b: string } | null>(null);
  const inner = useRef<HTMLDivElement>(null);
  const drag = useRef<{ path: string; dx: number; dy: number; moved: boolean; startX: number; startY: number } | null>(null);
  const byPath = useMemo(() => new Map(cast.map((c) => [c.path, c])), [cast]);
  const lines = useMemo(() => mapLines(cast), [cast]);

  // The drawing's size, with room around it, and an offset so nothing sits at a negative place.
  const all = Object.values(places);
  const minX = Math.min(0, ...all.map((p) => p.x));
  const minY = Math.min(0, ...all.map((p) => p.y));
  const width = Math.max(...all.map((p) => p.x), 0) - minX + CARD_W + PAD * 2;
  const height = Math.max(...all.map((p) => p.y), 0) - minY + CARD_H + PAD * 2;
  const at = (path: string) => {
    const p = places[path] ?? { x: 0, y: 0 };
    return { x: p.x - minX + PAD, y: p.y - minY + PAD };
  };
  const centre = (path: string) => {
    const p = at(path);
    return { x: p.x + CARD_W / 2, y: p.y + CARD_H / 2 };
  };
  /** A point on the canvas, from a point on the screen. */
  const local = (clientX: number, clientY: number) => {
    const r = inner.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  useLayoutEffect(() => {
    if (inner.current) inner.current.style.cssText = `width:${width}px;height:${height}px`;
  }, [width, height]);

  const savePlaces = (next: Record<string, Point>) => {
    const keep: Record<string, Point> = {};
    for (const c of cast) if (next[c.path]) keep[c.path] = next[c.path];
    onSave(keep);
  };

  // --- moving cards ------------------------------------------------------------------------------

  function onCardDown(e: React.PointerEvent, path: string) {
    if (e.button !== 0) return;
    const p = places[path];
    drag.current = { path, dx: e.clientX - p.x, dy: e.clientY - p.y, moved: false, startX: e.clientX, startY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onCardMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
    d.moved = true;
    setPlaces((ps) => ({ ...ps, [d.path]: { x: Math.round(e.clientX - d.dx), y: Math.round(e.clientY - d.dy) } }));
  }
  function onCardUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) savePlaces(places);
    else setChosen((c) => (c === d.path ? null : d.path));
  }
  function onCardKey(e: React.KeyboardEvent, path: string) {
    const step = e.shiftKey ? 48 : 12;
    const move = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
    if (!move) return;
    e.preventDefault();
    const next = { ...places, [path]: { x: places[path].x + move[0], y: places[path].y + move[1] } };
    setPlaces(next);
    savePlaces(next);
  }

  // --- drawing a line from a card's dot to another card --------------------------------------------

  const cardAt = (clientX: number, clientY: number) =>
    (document.elementFromPoint(clientX, clientY)?.closest("[data-card-path]") as HTMLElement | null)?.dataset.cardPath ?? null;

  function onHandleDown(e: React.PointerEvent, path: string) {
    e.stopPropagation();
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrawing({ from: path, to: local(e.clientX, e.clientY), over: null });
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!drawing) return;
    const over = cardAt(e.clientX, e.clientY);
    setDrawing({ ...drawing, to: local(e.clientX, e.clientY), over: over !== drawing.from ? over : null });
  }
  function onHandleUp(e: React.PointerEvent) {
    if (!drawing) return;
    const to = cardAt(e.clientX, e.clientY);
    const from = drawing.from;
    setDrawing(null);
    if (!to || to === from) return;
    const a = byPath.get(from)!;
    const b = byPath.get(to)!;
    if (!lines.some((l) => (l.a === from && l.b === to) || (l.a === to && l.b === from))) onConnect(a, b);
    // Straight to its words.
    setEditing({ a: from, b: to });
  }

  // --- lines -----------------------------------------------------------------------------------

  /** A gentle curve between two cards, and the point halfway along it. */
  const curve = (a: Point, b: Point) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const bend = Math.min(36, len / 6);
    const cx = mx - ((b.y - a.y) / len) * bend;
    const cy = my + ((b.x - a.x) / len) * bend;
    return { d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`, mid: { x: (a.x + 2 * cx + b.x) / 4, y: (a.y + 2 * cy + b.y) / 4 } };
  };
  const lineOf = (e: { a: string; b: string }) => lines.find((l) => (l.a === e.a && l.b === e.b) || (l.a === e.b && l.b === e.a)) ?? null;
  const editingLine = editing && lineOf(editing);
  const linked = new Set(chosen ? [chosen, ...lines.filter((l) => l.a === chosen || l.b === chosen).flatMap((l) => [l.a, l.b])] : []);

  if (cast.length === 0) return <p className="sheet-empty">No characters yet. Add one above, or type @ and a name in a chapter.</p>;

  return (
    <div className="map">
      <p className="sheet-hint map-hint">
        Drag cards anywhere. To connect two people, drag from the dot on one card to another, then write what the line means (or
        nothing). Click a line to change it.{" "}
        {Object.keys(saved).length > 0 && (
          <button type="button" className="link" onClick={() => onSave({})}>
            Tidy up
          </button>
        )}
      </p>
      <div className="map-canvas">
        <div className={`map-inner${drawing ? " is-drawing" : ""}`} ref={inner}>
          <svg className="map-lines" width={width} height={height}>
            {lines.map((l) => {
              const { d } = curve(centre(l.a), centre(l.b));
              const faded = !!chosen && l.a !== chosen && l.b !== chosen;
              return (
                <g key={`${l.a}|${l.b}`} className={`map-line${faded ? " is-faded" : ""}${editingLine === l ? " is-editing" : ""}`}>
                  <path d={d} fill="none" />
                  <path
                    className="map-hit"
                    d={d}
                    fill="none"
                    role="button"
                    aria-label={`The line between ${byPath.get(l.a)?.name} and ${byPath.get(l.b)?.name}${l.words ? `: ${l.words}` : ""}`}
                    onClick={() => setEditing({ a: l.a, b: l.b })}
                  />
                </g>
              );
            })}
            {drawing && (
              <path
                className="map-drawing"
                d={`M${centre(drawing.from).x},${centre(drawing.from).y} L${drawing.over ? centre(drawing.over).x : drawing.to.x},${drawing.over ? centre(drawing.over).y : drawing.to.y}`}
                fill="none"
              />
            )}
          </svg>

          {cast.map((c) => {
            const p = at(c.path);
            return (
              <div
                key={c.path}
                className={`map-card${chosen === c.path ? " is-chosen" : ""}${chosen && !linked.has(c.path) ? " is-faded" : ""}${drawing?.over === c.path ? " is-target" : ""}`}
                data-card-path={c.path}
                data-tint={c.tint}
                ref={(el) => {
                  if (el) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
                }}
              >
                <button
                  type="button"
                  className="map-card-body"
                  aria-pressed={chosen === c.path}
                  aria-label={`${c.name}${c.role ? `, ${c.role}` : ""}. Drag to move, or use the arrow keys.`}
                  onPointerDown={(e) => onCardDown(e, c.path)}
                  onPointerMove={onCardMove}
                  onPointerUp={onCardUp}
                  onKeyDown={(e) => onCardKey(e, c.path)}
                  onClick={(e) => e.detail === 0 && setChosen((x) => (x === c.path ? null : c.path))}
                >
                  <span className="map-name">
                    <span className="card-dot" aria-hidden="true" />
                    {c.name}
                  </span>
                  {c.role && <span className="map-role">{c.role}</span>}
                </button>
                <span
                  className="map-handle"
                  title={`Drag to connect ${c.name} to someone`}
                  aria-hidden="true"
                  onPointerDown={(e) => onHandleDown(e, c.path)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                />
              </div>
            );
          })}

          {/* The words on each line, above the cards so they're never hidden. */}
          {lines.map((l) => {
            if (!l.words || editingLine === l) return null;
            const { mid } = curve(centre(l.a), centre(l.b));
            const faded = !!chosen && l.a !== chosen && l.b !== chosen;
            return (
              <button
                key={`w${l.a}|${l.b}`}
                type="button"
                className={`map-words${faded ? " is-faded" : ""}`}
                title="Change these words"
                ref={(el) => {
                  if (el) el.style.transform = `translate(${Math.round(mid.x)}px, ${Math.round(mid.y)}px) translate(-50%, -50%)`;
                }}
                onClick={() => setEditing({ a: l.a, b: l.b })}
              >
                {l.words.length > 32 ? `${l.words.slice(0, 31)}…` : l.words}
              </button>
            );
          })}

          {editingLine && (
            <LineEditor
              key={`${editingLine.a}|${editingLine.b}`}
              line={editingLine}
              names={[byPath.get(editingLine.a)?.name ?? "", byPath.get(editingLine.b)?.name ?? ""]}
              at={curve(centre(editingLine.a), centre(editingLine.b)).mid}
              onSave={(words) => {
                if (words !== editingLine.words) onWords(editingLine, words);
                setEditing(null);
              }}
              onRemove={() => {
                onRemove(editingLine);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Writing a line's words, right where the line is. */
function LineEditor({
  line,
  names,
  at,
  onSave,
  onRemove,
  onCancel,
}: {
  line: MapLine;
  names: [string, string];
  at: Point;
  onSave: (words: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [words, setWords] = useState(line.words);
  const box = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) el.style.transform = `translate(${Math.round(at.x - el.offsetWidth / 2)}px, ${Math.round(at.y - el.offsetHeight / 2)}px)`;
  }, [at]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onSave(words.trim());
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  });
  return (
    <form
      ref={box}
      className="line-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(words.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <label className="visually-hidden" htmlFor="line-words">
        What connects {names[0]} and {names[1]}
      </label>
      <input id="line-words" autoFocus value={words} onChange={(e) => setWords(e.target.value)} placeholder="What connects them? (optional)" autoComplete="off" />
      <button type="submit" className="line-done">
        Done
      </button>
      <button type="button" className="line-remove" onClick={onRemove}>
        Remove line
      </button>
    </form>
  );
}
