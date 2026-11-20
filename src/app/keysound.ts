/**
 * Typing sounds: an optional keystroke as you write, from recordings of four real keyboards
 * (credits in docs/sounds.md; all released as CC0). Each keyboard is one small file of single
 * presses and releases, fetched from the app's own address only when that sound is chosen, then
 * kept for writing offline. Every key has its own stroke and its own place, left to right.
 * Nothing you type is recorded or sent anywhere. Off unless chosen.
 */
import { CLIPS } from "./keyclips";

export type SoundId = "off" | "creamy" | "thocky" | "clacky" | "poppy";

export const SOUNDS: { id: SoundId; name: string; note: string }[] = [
  { id: "off", name: "Off", note: "Silent" },
  { id: "creamy", name: "Creamy", note: "Cherry MX Red switches" },
  { id: "thocky", name: "Thocky", note: "Happy Hacking Keyboard, Topre switches" },
  { id: "clacky", name: "Clacky", note: "Gateron Black switches" },
  { id: "poppy", name: "Poppy", note: "Cherry MX Clear switches" },
];

export function parseSound(saved: string | null): SoundId {
  return SOUNDS.some((s) => s.id === saved) ? (saved as SoundId) : "off";
}

type Keyboard = Exclude<SoundId, "off">;

const BIG = new Set([" ", "Enter", "Backspace", "Delete"]);

/** A number from -1 to 1 that is always the same for the same key: each key has its own stroke. */
function keyColour(key: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

export interface Stroke {
  /** Which key, so the same key always sounds like itself. */
  key?: string;
  /** The space bar, Enter or Backspace: a little lower and fuller. */
  big?: boolean;
  /** The key coming back up, not going down. */
  up?: boolean;
}

/** Which recorded stroke a key gets: its own, or the one beside it if that was just played. */
export function clipFor(count: number, key: string, last: number): number {
  if (count === 0) return -1;
  const own = Math.floor(((keyColour(key) + 1) / 2) * count) % count;
  return own === last && count > 1 ? (own + 1) % count : own;
}

let live: AudioContext | null = null;
const loaded = new Map<Keyboard, Promise<AudioBuffer | null>>();
const lastPlayed = { down: -1, up: -1 };

function context(): AudioContext | null {
  try {
    live ??= new AudioContext({ latencyHint: "interactive" });
    if (live.state === "suspended") void live.resume();
    return live;
  } catch {
    return null; // No sound on this device: typing carries on in silence.
  }
}

/** The keyboard's recording, fetched once. Without a connection the first time, there's no sound. */
function recording(ctx: AudioContext, sound: Keyboard): Promise<AudioBuffer | null> {
  let p = loaded.get(sound);
  if (!p) {
    p = fetch(`./sounds/${sound}.wav`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing"))))
      .then((bytes) => ctx.decodeAudioData(bytes))
      .catch(() => {
        loaded.delete(sound); // try again next time
        return null;
      });
    loaded.set(sound, p);
  }
  return p;
}

function strike(ctx: AudioContext, buffer: AudioBuffer, sound: Keyboard, when: number, { key = "", big = false, up = false }: Stroke): void {
  const clips = up ? CLIPS[sound].up : CLIPS[sound].down;
  const which = clipFor(clips.length, key, up ? lastPlayed.up : lastPlayed.down);
  if (which < 0) return;
  if (up) lastPlayed.up = which;
  else lastPlayed.down = which;
  const [start, length] = clips[which];
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  // No two strokes quite alike: a hair's difference in pitch and loudness each time.
  src.playbackRate.value = (big ? 0.93 : 1) * (0.98 + Math.random() * 0.04);
  const gain = ctx.createGain();
  gain.gain.value = (big ? 1 : 0.9) * (0.85 + Math.random() * 0.3);
  const place = ctx.createStereoPanner();
  place.pan.value = big ? 0 : 0.25 * keyColour(key, 7);
  src.connect(gain).connect(place).connect(ctx.destination);
  src.start(when, start, length);
}

export function playKey(sound: SoundId, stroke: Stroke = {}, after = 0): void {
  if (sound === "off") return;
  const ctx = context();
  if (!ctx) return;
  const asked = ctx.currentTime;
  void recording(ctx, sound).then((buffer) => {
    // A stroke that had to wait for the recording to arrive is dropped, not played late.
    if (buffer && ctx.currentTime - asked < 0.15) strike(ctx, buffer, sound, ctx.currentTime + after, stroke);
  });
}

/** A few words typed, to hear a keyboard when choosing it: different keys, a space, an Enter. */
export function previewSound(sound: SoundId): void {
  if (sound === "off") return;
  const ctx = context();
  if (!ctx) return;
  void recording(ctx, sound).then((buffer) => {
    if (!buffer) return;
    let at = ctx.currentTime + 0.04;
    for (const key of ["KeyT", "KeyH", "KeyO", "KeyC", "KeyK", " ", "KeyY", "KeyE", "KeyS", "Enter"]) {
      const big = BIG.has(key);
      strike(ctx, buffer, sound, at, { key, big });
      strike(ctx, buffer, sound, at + 0.07 + Math.random() * 0.03, { key, big, up: true });
      at += (big ? 0.2 : 0.11) + Math.random() * 0.06;
    }
  });
}

/**
 * Plays a stroke for each key typed in the writing, and a lighter one as the key comes back up.
 * Keys held down sound once; shortcuts and arrows are silent. On-screen keyboards (which don't
 * always say which key) are heard through the text they insert. Returns how to stop listening.
 */
export function listenForTyping(sound: SoundId, root: Document = document): () => void {
  if (sound === "off") return () => {};
  // Fetch the keyboard now, so the first key typed already has its sound.
  const ctx = context();
  if (ctx) void recording(ctx, sound);
  let lastDown = 0;
  const held = new Set<string>();
  const inWriting = (t: EventTarget | null) => t instanceof Element && t.closest(".writing") !== null;
  const onDown = (e: KeyboardEvent) => {
    if (!inWriting(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length !== 1 && !BIG.has(e.key)) return;
    lastDown = performance.now();
    if (e.repeat) return;
    held.add(e.code);
    playKey(sound, { key: e.code, big: BIG.has(e.key) });
  };
  const onUp = (e: KeyboardEvent) => {
    if (held.delete(e.code)) playKey(sound, { key: e.code, big: BIG.has(e.key), up: true });
  };
  const onInput = (e: Event) => {
    if (!inWriting(e.target) || performance.now() - lastDown < 80) return;
    const type = (e as InputEvent).inputType ?? "";
    if (!type.startsWith("insert") && !type.startsWith("delete")) return;
    const key = (e as InputEvent).data ?? type;
    const big = key === " " || (type !== "insertText" && type !== "insertCompositionText");
    playKey(sound, { key, big });
    playKey(sound, { key, big, up: true }, 0.08 + Math.random() * 0.03);
  };
  root.addEventListener("keydown", onDown, true);
  root.addEventListener("keyup", onUp, true);
  root.addEventListener("beforeinput", onInput, true);
  return () => {
    root.removeEventListener("keydown", onDown, true);
    root.removeEventListener("keyup", onUp, true);
    root.removeEventListener("beforeinput", onInput, true);
  };
}
