/**
 * The characters map: cards anywhere you put them, and lines between any two people, with your
 * own words on them. Nothing is decided for you: new cards start in a loose arrangement, out of
 * the way of the ones you've placed, and stay wherever you drag them.
 */
import type { Character } from "./characters";

export interface Point {
  x: number;
  y: number;
}

export const CARD_W = 168;
export const CARD_H = 56;
const GAP_X = 64;

export interface MapLine {
  a: string;
  b: string;
  /** What A is to B (written on B's card), and what B is to A (written on A's card). */
  aIs: string;
  bIs: string;
}

/** Each connection between two cards, once, with both sides' words. */
export function mapLines(cast: Character[]): MapLine[] {
  const seen = new Set<string>();
  const out: MapLine[] = [];
  for (const c of cast) {
    for (const x of c.connections) {
      if (!x.path) continue;
      const key = [c.path, x.path].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: c.path, b: x.path, aIs: x.theirLabel, bIs: x.label });
    }
  }
  return out;
}

/**
 * Where each card goes: where you put it, or else around a loose circle (so every line between
 * two people stays in view), out of the way of cards you've placed.
 */
export function mapPlaces(cast: Character[], saved: Record<string, Point> = {}): Record<string, Point> {
  const out: Record<string, Point> = {};
  const taken = cast.filter((c) => saved[c.path]).map((c) => saved[c.path]);
  const free = (p: Point) => [...taken, ...Object.values(out)].every((q) => Math.abs(q.x - p.x) >= CARD_W + 16 || Math.abs(q.y - p.y) >= CARD_H + 16);
  const n = cast.length;
  if (n <= 2) {
    cast.forEach((c, i) => (out[c.path] = saved[c.path] ?? { x: i * (CARD_W + GAP_X * 2), y: 0 }));
    return out;
  }
  // Wide enough that neighbours on the circle don't touch.
  const rx = Math.max(240, (n * (CARD_W + 24)) / (2 * Math.PI) * 1.15);
  const ry = Math.max(150, rx * 0.6);
  // Places around the circle, one per card; then the half-way places; then a wider ring.
  const candidates: Point[] = [];
  for (const ring of [1, 1.45, 1.9])
    for (const half of [0, 0.5])
      for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + ((i + half) * 2 * Math.PI) / n;
        candidates.push({ x: Math.round(rx * ring * Math.cos(angle)), y: Math.round(ry * ring * Math.sin(angle)) });
      }
  let next = 0;
  for (const c of cast) {
    if (saved[c.path]) {
      out[c.path] = saved[c.path];
      continue;
    }
    while (next < candidates.length && !free(candidates[next])) next++;
    out[c.path] = candidates[next] ?? { x: 0, y: Math.round(ry * 2.4) };
    next++;
  }
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
