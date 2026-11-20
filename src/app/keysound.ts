/**
 * Typing sounds: an optional keystroke in one of four characters, after the words keyboard
 * people use. Each stroke is made on the spot by the browser, in the parts a real one has: the
 * switch ticking, the key landing, the case ringing on several notes, the key coming back up, and
 * a trace of the room. Every key has its own voice and its own place, left to right. Nothing is
 * downloaded, no recording is used and nothing leaves the device. Off unless chosen.
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

/** One way the case rings: where (Hz), for how long (seconds to fade to about a third) and how strongly. */
type Mode = [freq: number, ring: number, gain: number];

interface Voice {
  /** The case and plate: several notes that ring together, never in tune with each other. */
  modes: Mode[];
  /** The key bottoming out: a low thump that falls in pitch. */
  thump: { freq: number; drop: number; decay: number; gain: number };
  /** The switch itself: a tiny bright tick. */
  click: { above: number; decay: number; gain: number };
  /** Everything above this is rolled off. */
  ceiling: number;
  /** The key coming back up: how loud beside the downstroke, and how much higher. */
  release: { gain: number; pitch: number };
  /** How much of the desk and case is heard after the stroke. */
  room: number;
  /** Evens out how loud the four are. */
  trim: number;
}

export const VOICES: Record<Exclude<SoundId, "off">, Voice> = {
  creamy: {
    modes: [
      [430, 0.022, 0.7],
      [770, 0.02, 0.6],
      [1240, 0.014, 0.4],
      [2050, 0.008, 0.18],
    ],
    thump: { freq: 210, drop: 0.5, decay: 0.05, gain: 0.16 },
    click: { above: 2400, decay: 0.006, gain: 0.1 },
    ceiling: 4200,
    release: { gain: 0.55, pitch: 1.22 },
    room: 0.16,
    trim: 7,
  },
  thocky: {
    modes: [
      [175, 0.035, 1],
      [305, 0.028, 0.65],
      [530, 0.018, 0.32],
      [910, 0.01, 0.14],
    ],
    thump: { freq: 105, drop: 0.9, decay: 0.09, gain: 0.5 },
    click: { above: 1500, decay: 0.005, gain: 0.07 },
    ceiling: 1900,
    release: { gain: 0.8, pitch: 1.3 },
    room: 0.2,
    trim: 3.4,
  },
  clacky: {
    modes: [
      [1480, 0.016, 0.5],
      [2620, 0.014, 0.6],
      [3850, 0.01, 0.5],
      [5700, 0.006, 0.3],
    ],
    thump: { freq: 380, drop: 0.3, decay: 0.03, gain: 0.08 },
    click: { above: 4200, decay: 0.008, gain: 0.35 },
    ceiling: 11000,
    release: { gain: 0.55, pitch: 1.14 },
    room: 0.12,
    trim: 5,
  },
  poppy: {
    modes: [
      [690, 0.03, 0.8],
      [1160, 0.02, 0.5],
      [1880, 0.01, 0.2],
    ],
    thump: { freq: 480, drop: 1.3, decay: 0.045, gain: 0.45 },
    click: { above: 3000, decay: 0.005, gain: 0.08 },
    ceiling: 5000,
    release: { gain: 0.5, pitch: 1.32 },
    room: 0.14,
    trim: 3.2,
  },
};

const LEVEL = 0.5;

const BIG = new Set([" ", "Enter", "Backspace", "Delete"]);

interface Rig {
  noise: AudioBuffer;
  /** Strokes go in here: straight out, and through a small room. */
  dry: AudioNode;
  wet: ConvolverNode;
}
const rigs = new WeakMap<BaseAudioContext, Rig>();

function rig(ctx: BaseAudioContext): Rig {
  let r = rigs.get(ctx);
  if (r) return r;
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  // The room: a tenth of a second of fading hiss, darker on the right than the left by chance,
  // which is how a desk and a case answer a tap.
  const tail = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 0.14), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const t = tail.getChannelData(ch);
    let smooth = 0;
    for (let i = 0; i < t.length; i++) {
      smooth += 0.35 * (Math.random() * 2 - 1 - smooth);
      t[i] = smooth * Math.exp((-6 * i) / t.length);
    }
  }
  const out = ctx.createDynamicsCompressor();
  out.threshold.value = -14;
  out.ratio.value = 3;
  out.attack.value = 0.002;
  out.release.value = 0.08;
  out.connect(ctx.destination);
  const wet = ctx.createConvolver();
  wet.buffer = tail;
  wet.connect(out);
  r = { noise, dry: out, wet };
  rigs.set(ctx, r);
  return r;
}

/** A number from -1 to 1 that is always the same for the same key: each key has its own voice. */
function keyColour(key: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

export interface Stroke {
  /** Which key, so the same key always sounds like itself. */
  key?: string;
  /** The space bar, Enter or Backspace: lower, longer, with a little rattle. */
  big?: boolean;
  /** The key coming back up, not going down. */
  up?: boolean;
  rand?: () => number;
}

/**
 * One stroke, scheduled at `when`: the tick of the switch, the thump of the key landing, and the
 * case ringing on several notes at once, placed left or right like the key on a keyboard, with a
 * trace of room after it. No two strokes are quite alike.
 */
export function renderKey(ctx: BaseAudioContext, sound: Exclude<SoundId, "off">, when: number, { key = "", big = false, up = false, rand = Math.random }: Stroke = {}): void {
  const v = VOICES[sound];
  const { noise, dry, wet } = rig(ctx);
  const pitch = (big ? 0.74 : 1) * (1 + 0.07 * keyColour(key)) * (0.985 + rand() * 0.03) * (up ? v.release.pitch : 1);
  const level = LEVEL * v.trim * (big ? 1.15 : 1) * (0.8 + rand() * 0.4) * (up ? v.release.gain : 1);
  const ring = big ? 1.35 : 1;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = v.ceiling;
  const place = ctx.createStereoPanner();
  place.pan.value = big ? 0 : 0.3 * keyColour(key, 7);
  tone.connect(place);
  place.connect(dry);
  const send = ctx.createGain();
  send.gain.value = v.room;
  place.connect(send).connect(wet);

  // What sets everything ringing: a few thousandths of a second of noise.
  const strike = (at: number, length: number, gain: number): GainNode => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.0008 + length);
    src.connect(g);
    src.start(at, rand() * 0.4);
    src.stop(at + length + 0.02);
    return g;
  };

  // The case: each note rings on its own, a little differently for every key.
  const hit = strike(when, 0.004, 1);
  v.modes.forEach(([freq, seconds, gain], i) => {
    const f = freq * pitch * (1 + 0.04 * keyColour(key, i + 1));
    const mode = ctx.createBiquadFilter();
    mode.type = "bandpass";
    mode.frequency.value = f;
    // How sharp the filter is decides how long it rings.
    mode.Q.value = Math.PI * f * seconds * ring;
    const g = ctx.createGain();
    // A longer ring lets less of the strike through, so it's made up here.
    g.gain.value = gain * level * Math.sqrt(seconds) * 300;
    hit.connect(mode).connect(g).connect(tone);
  });

  // The switch: a bright tick, which is most of what the upstroke is.
  const tick = ctx.createBiquadFilter();
  tick.type = "highpass";
  tick.frequency.value = v.click.above;
  strike(when, v.click.decay, v.click.gain * level * (up ? 1.6 : 1))
    .connect(tick)
    .connect(tone);

  if (up) return;

  // The key landing.
  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(v.thump.freq * pitch * (1 + v.thump.drop), when);
  thump.frequency.exponentialRampToValueAtTime(v.thump.freq * pitch, when + 0.025);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.0001, when);
  thumpGain.gain.exponentialRampToValueAtTime(v.thump.gain * level, when + 0.002);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.002 + v.thump.decay * ring);
  thump.connect(thumpGain).connect(tone);
  thump.start(when);
  thump.stop(when + v.thump.decay * ring + 0.03);

  // A long key's wire rattles a moment after it lands.
  if (big) {
    const rattle = ctx.createBiquadFilter();
    rattle.type = "bandpass";
    rattle.frequency.value = Math.min(v.ceiling, v.modes[v.modes.length - 1][0] * 1.3);
    rattle.Q.value = 3;
    strike(when + 0.014 + rand() * 0.008, 0.012, 0.5 * level)
      .connect(rattle)
      .connect(tone);
  }
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

export function playKey(sound: SoundId, stroke: Stroke = {}, after = 0): void {
  if (sound === "off") return;
  const ctx = context();
  if (ctx) renderKey(ctx, sound, ctx.currentTime + after, stroke);
}

/** A few words typed, to hear a sound when choosing it: different keys, a space, an Enter. */
export function previewSound(sound: SoundId): void {
  if (sound === "off") return;
  const ctx = context();
  if (!ctx) return;
  let at = ctx.currentTime + 0.04;
  for (const key of ["t", "h", "o", "c", "k", " ", "y", "e", "s", "Enter"]) {
    const big = BIG.has(key);
    renderKey(ctx, sound, at, { key, big });
    renderKey(ctx, sound, at + 0.07 + Math.random() * 0.03, { key, big, up: true });
    at += (big ? 0.2 : 0.11) + Math.random() * 0.06;
  }
}

/**
 * Plays a stroke for each key typed in the writing, and a lighter one as the key comes back up.
 * Keys held down sound once; shortcuts and arrows are silent. On-screen keyboards (which don't
 * always say which key) are heard through the text they insert. Returns how to stop listening.
 */
export function listenForTyping(sound: SoundId, root: Document = document): () => void {
  if (sound === "off") return () => {};
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
