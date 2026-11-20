/**
 * Typing sounds: an optional, quiet keystroke in one of four characters, after the words
 * keyboard people use. Each stroke is made on the spot by the browser (a short burst of filtered
 * noise for the key hitting home, and a damped tone for the case), so nothing is downloaded,
 * no recording is used and nothing leaves the device. Off unless chosen.
 */

export type SoundId = "off" | "creamy" | "thocky" | "clacky" | "poppy";

export const SOUNDS: { id: SoundId; name: string; note: string }[] = [
  { id: "off", name: "Off", note: "Silent" },
  { id: "creamy", name: "Creamy", note: "Soft and smooth" },
  { id: "thocky", name: "Thocky", note: "Deep and muted" },
  { id: "clacky", name: "Clacky", note: "Bright and crisp" },
  { id: "poppy", name: "Poppy", note: "Round, like a bubble" },
];

export function parseSound(saved: string | null): SoundId {
  return SOUNDS.some((s) => s.id === saved) ? (saved as SoundId) : "off";
}

interface Voice {
  /** The tone of the case: where it settles (Hz), how far above that it starts, how long it rings. */
  body: number;
  drop: number;
  bodyDecay: number;
  bodyGain: number;
  /** The key hitting home: a band of noise. */
  noise: number;
  noiseQ: number;
  noiseDecay: number;
  noiseGain: number;
  /** Everything above this is rolled off. */
  ceiling: number;
}

export const VOICES: Record<Exclude<SoundId, "off">, Voice> = {
  creamy: { body: 520, drop: 0.25, bodyDecay: 0.08, bodyGain: 0.6, noise: 1400, noiseQ: 0.9, noiseDecay: 0.045, noiseGain: 0.4, ceiling: 3200 },
  thocky: { body: 190, drop: 0.6, bodyDecay: 0.13, bodyGain: 0.9, noise: 420, noiseQ: 1.2, noiseDecay: 0.06, noiseGain: 0.5, ceiling: 1400 },
  clacky: { body: 1900, drop: 0.1, bodyDecay: 0.045, bodyGain: 0.4, noise: 3600, noiseQ: 1.4, noiseDecay: 0.03, noiseGain: 0.8, ceiling: 9000 },
  poppy: { body: 880, drop: 0.9, bodyDecay: 0.08, bodyGain: 0.75, noise: 1800, noiseQ: 2, noiseDecay: 0.02, noiseGain: 0.2, ceiling: 4500 },
};

const LEVEL = 0.4;
const noiseFor = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseFor.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = b.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseFor.set(ctx, b);
  }
  return b;
}

/**
 * One keystroke, scheduled at `when`. `big` is the space bar, Enter or Backspace: lower and a
 * little fuller. No two strokes are quite alike, as on a real keyboard.
 */
export function renderKey(ctx: BaseAudioContext, sound: Exclude<SoundId, "off">, when: number, big = false, rand: () => number = Math.random): void {
  const v = VOICES[sound];
  const pitch = (big ? 0.8 : 1) * (0.94 + rand() * 0.12);
  const level = LEVEL * (big ? 1.15 : 1) * (0.88 + rand() * 0.24);

  const out = ctx.createBiquadFilter();
  out.type = "lowpass";
  out.frequency.value = v.ceiling;
  out.connect(ctx.destination);

  const tone = ctx.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(v.body * pitch * (1 + v.drop), when);
  tone.frequency.exponentialRampToValueAtTime(v.body * pitch, when + 0.02);
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.0001, when);
  toneGain.gain.exponentialRampToValueAtTime(v.bodyGain * level, when + 0.002);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.002 + v.bodyDecay);
  tone.connect(toneGain).connect(out);
  tone.start(when);
  tone.stop(when + v.bodyDecay + 0.02);

  const hit = ctx.createBufferSource();
  hit.buffer = noiseBuffer(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = v.noise * pitch;
  band.Q.value = v.noiseQ;
  const hitGain = ctx.createGain();
  hitGain.gain.setValueAtTime(0.0001, when);
  hitGain.gain.exponentialRampToValueAtTime(v.noiseGain * level, when + 0.001);
  hitGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.001 + v.noiseDecay);
  hit.connect(band).connect(hitGain).connect(out);
  hit.start(when, rand() * 0.4);
  hit.stop(when + v.noiseDecay + 0.02);
}

let live: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    live ??= new AudioContext({ latencyHint: "interactive" });
    if (live.state === "suspended") void live.resume();
    return live;
  } catch {
    return null; // No sound on this device: typing carries on in silence.
  }
}

export function playKey(sound: SoundId, big = false): void {
  if (sound === "off") return;
  const ctx = context();
  if (ctx) renderKey(ctx, sound, ctx.currentTime, big);
}

/** A few strokes, to hear a sound when choosing it. */
export function previewSound(sound: SoundId): void {
  if (sound === "off") return;
  const ctx = context();
  if (!ctx) return;
  [0, 0.13, 0.24, 0.42].forEach((at, i) => renderKey(ctx, sound, ctx.currentTime + 0.03 + at, i === 3));
}

const BIG = new Set([" ", "Enter", "Backspace", "Delete"]);

/**
 * Plays a stroke for each key typed in the writing. Keys held down sound once; shortcuts and
 * arrows are silent. On-screen keyboards (which don't always say which key) are heard through
 * the text they insert. Returns how to stop listening.
 */
export function listenForTyping(sound: SoundId, root: Document = document): () => void {
  if (sound === "off") return () => {};
  let lastDown = 0;
  const inWriting = (t: EventTarget | null) => t instanceof Element && t.closest(".writing") !== null;
  const onDown = (e: KeyboardEvent) => {
    if (!inWriting(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const typed = e.key.length === 1 || BIG.has(e.key);
    if (!typed) return;
    lastDown = performance.now();
    if (!e.repeat) playKey(sound, BIG.has(e.key));
  };
  const onInput = (e: Event) => {
    if (!inWriting(e.target) || performance.now() - lastDown < 80) return;
    const type = (e as InputEvent).inputType ?? "";
    if (type.startsWith("insert") || type.startsWith("delete")) playKey(sound, type !== "insertText" && type !== "insertCompositionText");
  };
  root.addEventListener("keydown", onDown, true);
  root.addEventListener("beforeinput", onInput, true);
  return () => {
    root.removeEventListener("keydown", onDown, true);
    root.removeEventListener("beforeinput", onInput, true);
  };
}
