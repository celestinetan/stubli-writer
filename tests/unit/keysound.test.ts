import { describe, expect, it } from "vitest";
import { CLIPS } from "../../src/app/keyclips";
import { SOUNDS, clipFor, parseSound } from "../../src/app/keysound";

describe("typing sounds", () => {
  it("is off unless a known sound was chosen", () => {
    expect(parseSound(null)).toBe("off");
    expect(parseSound("")).toBe("off");
    expect(parseSound("loud")).toBe("off");
    expect(parseSound("thocky")).toBe("thocky");
  });

  it("offers Off first, then four keyboards, each with recorded strokes", () => {
    expect(SOUNDS.map((s) => s.id)).toEqual(["off", "creamy", "thocky", "clacky", "poppy"]);
    for (const id of ["creamy", "thocky", "clacky", "poppy"] as const) {
      expect(CLIPS[id].down.length).toBeGreaterThanOrEqual(12);
      for (const [start, length] of [...CLIPS[id].down, ...CLIPS[id].up]) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect(length).toBeGreaterThan(0.03);
        expect(length).toBeLessThan(0.3);
      }
    }
  });

  it("gives a key its own stroke every time, and never the same stroke twice running", () => {
    expect(clipFor(32, "KeyA", -1)).toBe(clipFor(32, "KeyA", -1));
    const a = clipFor(32, "KeyA", -1);
    expect(clipFor(32, "KeyA", a)).not.toBe(a);
    const used = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((k) => clipFor(32, `Key${k}`, -1)));
    expect(used.size).toBeGreaterThan(10);
    expect(clipFor(0, "KeyA", -1)).toBe(-1);
  });
});
