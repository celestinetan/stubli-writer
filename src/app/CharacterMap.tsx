import { useEffect, useMemo, useRef, useState } from "react";
import type { Character } from "./characters";
import { CARD_H, CARD_W, familyLayout, familyLines, type Line, type Point } from "./family-layout";

interface Props {
  cast: Character[];
  /** Places the writer chose by dragging (the rest are laid out as a family tree). */
  saved: Record<string, Point>;
  onSave: (places: Record<string, Point>) => void;
  /** A card was chosen (not dragged): show that character. */
  onChoose: (path: string) => void;
}

const PAD = 32;

/**
 * The book's characters as a family tree: parents above children, partners side by side,
 * brothers and sisters on a row, other connections as soft dashed lines. Drag a card to move it
 * (or use the arrow keys); the places are saved with the book.
 */
export function CharacterMap({ cast, saved, onSave, onChoose }: Props) {
  const auto = useMemo(() => familyLayout(cast, saved), [cast, saved]);
  const [places, setPlaces] = useState(auto);
  const [chosen, setChosen] = useState<string | null>(null);
  const drag = useRef<{ path: string; dx: number; dy: number; moved: boolean; startX: number; startY: number } | null>(null);
  useEffect(() => setPlaces(auto), [auto]);

  const lines = useMemo(() => familyLines(cast), [cast]);
  const near = new Set(chosen ? [chosen, ...lines.filter((l) => l.from === chosen || l.to === chosen).flatMap((l) => [l.from, l.to])] : []);

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

  const savePlaces = (next: Record<string, Point>) => {
    // Only what was moved is kept; the tree places everyone else.
    const moved: Record<string, Point> = { ...saved };
    for (const c of cast) if (next[c.path] && (next[c.path].x !== auto[c.path]?.x || next[c.path].y !== auto[c.path]?.y)) moved[c.path] = next[c.path];
    onSave(moved);
  };

  function onPointerDown(e: React.PointerEvent, path: string) {
    if (e.button !== 0) return;
    const p = places[path];
    drag.current = { path, dx: e.clientX - p.x, dy: e.clientY - p.y, moved: false, startX: e.clientX, startY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
    d.moved = true;
    setPlaces((ps) => ({ ...ps, [d.path]: { x: Math.round(e.clientX - d.dx), y: Math.round(e.clientY - d.dy) } }));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) savePlaces(places);
    else {
      setChosen((c) => (c === d.path ? null : d.path));
      onChoose(d.path);
    }
  }
  function onKey(e: React.KeyboardEvent, path: string) {
    const step = e.shiftKey ? 48 : 12;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!move) return;
    e.preventDefault();
    const next = { ...places, [path]: { x: places[path].x + move[0], y: places[path].y + move[1] } };
    setPlaces(next);
    savePlaces(next);
  }

  // Each line's path and label; labels are nudged down until none overlap another.
  const drawn = lines.map((line) => {
    const { d, label } = shape(line, at(line.from), at(line.to));
    const text = line.words.length > 28 ? `${line.words.slice(0, 27)}…` : line.words;
    const faded = !!chosen && !(line.from === chosen || line.to === chosen);
    return { line, d, label: { ...label }, text, faded };
  });
  const placed: { x: number; y: number; w: number }[] = [];
  for (const item of drawn) {
    if (!item.text) continue;
    const w = item.text.length * 6.4 + 8;
    for (let tries = 0; tries < 8 && placed.some((p) => Math.abs(p.x - item.label.x) < (p.w + w) / 2 && Math.abs(p.y - item.label.y) < 15); tries++) item.label.y += 15;
    placed.push({ x: item.label.x, y: item.label.y, w });
  }

  if (cast.length === 0) return <p className="sheet-empty">No characters yet. Add one on the Cards view, or type @ and a name in a chapter.</p>;

  return (
    <div className="map">
      <p className="sheet-hint map-hint">
        Drag a card to move it (or use the arrow keys). Choose one to see who they're connected to.{" "}
        {Object.keys(saved).length > 0 && (
          <button type="button" className="link" onClick={() => onSave({})}>
            Tidy up
          </button>
        )}
      </p>
      <div className="map-canvas">
        <div className="map-inner" ref={(el) => {
            if (el) el.style.cssText = `width:${width}px;height:${height}px`;
          }}>
          <svg className="map-lines" width={width} height={height} aria-hidden="true">
            {drawn.map(({ line, d, faded }) => (
              <g key={`${line.from}|${line.to}`} className={`map-line is-${line.kind}${faded ? " is-faded" : ""}`}>
                <path d={d} fill="none" />
              </g>
            ))}
            {drawn.map(({ line, text, label, faded }) =>
              text ? (
                <text key={`t${line.from}|${line.to}`} className={`map-label${faded ? " is-faded" : ""}`} x={label.x} y={label.y} textAnchor="middle">
                  {text}
                </text>
              ) : null,
            )}
          </svg>
          {cast.map((c) => {
            const p = at(c.path);
            return (
              <button
                key={c.path}
                type="button"
                className={`map-card${chosen === c.path ? " is-chosen" : ""}${chosen && !near.has(c.path) ? " is-faded" : ""}`}
                data-tint={c.tint}
                aria-pressed={chosen === c.path}
                aria-label={`${c.name}${c.role ? `, ${c.role}` : ""}. ${c.connections.map((x) => `${x.name}${x.label ? `: ${x.label}` : ""}`).join("; ")}`}
                ref={(el) => {
                  if (el) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
                }}
                onPointerDown={(e) => onPointerDown(e, c.path)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={(e) => onKey(e, c.path)}
                onClick={(e) => e.detail === 0 && (setChosen((x) => (x === c.path ? null : c.path)), onChoose(c.path))}
              >
                <span className="map-name">
                  <span className="card-dot" aria-hidden="true" />
                  {c.name}
                </span>
                {c.role && <span className="map-role">{c.role}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The line's path, and where its words go. */
function shape(line: Line, a: Point, b: Point): { d: string; label: Point } {
  if (line.kind === "parent") {
    // Down from the parent, across, and down to the child: a family tree's elbow.
    const x1 = a.x + CARD_W / 2;
    const y1 = a.y + CARD_H;
    const x2 = b.x + CARD_W / 2;
    const y2 = b.y;
    const mid = y1 + (y2 - y1) / 2;
    return { d: `M${x1},${y1} V${mid} H${x2} V${y2}`, label: { x: x2, y: mid + (y2 - mid) / 2 + 4 } };
  }
  if (line.kind === "partner" && Math.abs(a.y - b.y) < CARD_H) {
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    return { d: `M${l.x + CARD_W},${l.y + CARD_H / 2} H${r.x}`, label: { x: (l.x + CARD_W + r.x) / 2, y: l.y + CARD_H / 2 - 8 } };
  }
  if (line.kind === "sibling" && Math.abs(a.y - b.y) < CARD_H) {
    // A bracket under the two (the lines from parents come from above).
    const bottom = Math.max(a.y, b.y) + CARD_H + 16;
    return {
      d: `M${a.x + CARD_W / 2},${a.y + CARD_H} V${bottom} H${b.x + CARD_W / 2} V${b.y + CARD_H}`,
      label: { x: (a.x + b.x + CARD_W) / 2, y: bottom + 14 },
    };
  }
  const x1 = a.x + CARD_W / 2;
  const y1 = a.y + CARD_H / 2;
  const x2 = b.x + CARD_W / 2;
  const y2 = b.y + CARD_H / 2;
  return { d: `M${x1},${y1} L${x2},${y2}`, label: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
}
