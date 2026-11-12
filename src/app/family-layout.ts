/**
 * Lays a book's characters out like a family tree: parents above their children, partners side
 * by side, brothers and sisters on the same row. People with no family here go on a row of their
 * own underneath. Places the writer chose by dragging are kept.
 */
import type { Character } from "./characters";

export interface Point {
  x: number;
  y: number;
}

export const CARD_W = 168;
export const CARD_H = 56;
const GAP_X = 36;
const GAP_Y = 96;

export interface Line {
  from: string;
  to: string;
  kind: "parent" | "partner" | "sibling" | "other";
  /** Words to show on the line (the rest of the connection's label). */
  words: string;
}

/** Each connection once: parent→child (from the parent), partners, siblings, and the rest. */
export function familyLines(cast: Character[]): Line[] {
  const seen = new Set<string>();
  const out: Line[] = [];
  // As written on a card first ("mother"), then what's only known from the other card.
  for (const fromOther of [false, true]) {
    for (const c of cast) {
      for (const x of c.connections) {
        if (!x.path || x.fromOther !== fromOther) continue;
        const key = [c.path, x.path].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        if (x.kind === "parent") out.push({ from: x.path, to: c.path, kind: "parent", words: x.label });
        else if (x.kind === "child") out.push({ from: c.path, to: x.path, kind: "parent", words: x.label });
        else out.push({ from: c.path, to: x.path, kind: x.kind, words: x.label });
      }
    }
  }
  return out;
}

/** Where each card goes. `saved` places win; everyone else is placed around them. */
export function familyLayout(cast: Character[], saved: Record<string, Point> = {}): Record<string, Point> {
  const lines = familyLines(cast);
  const paths = cast.map((c) => c.path);
  const gen = new Map<string, number>();
  const family = lines.filter((l) => l.kind !== "other");
  const touches = (p: string) => family.some((l) => l.from === p || l.to === p);

  // Generations: children one below their parents; partners and siblings on the same row.
  for (const start of paths) {
    if (gen.has(start) || !touches(start)) continue;
    gen.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const p = queue.shift()!;
      const g = gen.get(p)!;
      for (const l of family) {
        const other = l.from === p ? l.to : l.to === p ? l.from : null;
        if (!other || gen.has(other)) continue;
        gen.set(other, l.kind !== "parent" ? g : l.from === p ? g + 1 : g - 1);
        queue.push(other);
      }
    }
  }
  const min = Math.min(0, ...gen.values());
  for (const [p, g] of gen) gen.set(p, g - min);
  const rows = Math.max(-1, ...gen.values()) + 1;
  // Everyone else: a row of their own underneath.
  for (const p of paths) if (!gen.has(p)) gen.set(p, rows);

  // Order within each row: by where their parents are, partners next to each other.
  const byRow = new Map<number, string[]>();
  for (const p of paths) byRow.set(gen.get(p)!, [...(byRow.get(gen.get(p)!) ?? []), p]);
  const order = new Map<string, number>();
  for (const g of [...byRow.keys()].sort((a, b) => a - b)) {
    let row = byRow.get(g)!;
    const parentsAt = (p: string) => {
      const xs = family.filter((l) => l.kind === "parent" && l.to === p && order.has(l.from)).map((l) => order.get(l.from)!);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.POSITIVE_INFINITY;
    };
    row = [...row].sort((a, b) => parentsAt(a) - parentsAt(b) || paths.indexOf(a) - paths.indexOf(b));
    // Keep partners together.
    for (const l of family.filter((x) => x.kind === "partner")) {
      const i = row.indexOf(l.from);
      const j = row.indexOf(l.to);
      if (i < 0 || j < 0 || Math.abs(i - j) === 1) continue;
      row.splice(j, 1);
      row.splice(row.indexOf(l.from) + 1, 0, l.to);
    }
    byRow.set(g, row);
    row.forEach((p, i) => order.set(p, i));
  }

  const widest = Math.max(...[...byRow.values()].map((r) => r.length));
  const out: Record<string, Point> = {};
  for (const [g, row] of byRow) {
    const offset = ((widest - row.length) * (CARD_W + GAP_X)) / 2;
    row.forEach((p, i) => (out[p] = { x: Math.round(offset + i * (CARD_W + GAP_X)), y: g * (CARD_H + GAP_Y) }));
  }
  for (const p of paths) if (saved[p]) out[p] = saved[p];
  return out;
}

/** Saved places, as one header line in the book note: "Ana 12 40; Mrs Lopes 200 40". */
export function readPlaces(line: string, cast: Character[]): Record<string, Point> {
  const byName = new Map(cast.map((c) => [c.name, c.path]));
  const out: Record<string, Point> = {};
  for (const part of line.split(";")) {
    const m = /^\s*(.+?)\s+(-?\d+)\s+(-?\d+)\s*$/.exec(part);
    const path = m && byName.get(m[1]);
    if (m && path) out[path] = { x: Number(m[2]), y: Number(m[3]) };
  }
  return out;
}

export function writePlaces(places: Record<string, Point>, cast: Character[]): string {
  return cast
    .filter((c) => places[c.path])
    .map((c) => `${c.name.replace(/;/g, ",")} ${Math.round(places[c.path].x)} ${Math.round(places[c.path].y)}`)
    .join("; ");
}
