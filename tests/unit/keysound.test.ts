import { describe, expect, it } from "vitest";
import { SOUNDS, VOICES, parseSound } from "../../src/app/keysound";

describe("typing sounds", () => {
  it("is off unless a known sound was chosen", () => {
    expect(parseSound(null)).toBe("off");
    expect(parseSound("")).toBe("off");
    expect(parseSound("loud")).toBe("off");
    expect(parseSound("thocky")).toBe("thocky");
  });

  it("offers Off first, then the four characters, each with a voice", () => {
    expect(SOUNDS.map((s) => s.id)).toEqual(["off", "creamy", "thocky", "clacky", "poppy"]);
    expect(Object.keys(VOICES).sort()).toEqual(["clacky", "creamy", "poppy", "thocky"]);
  });

  it("keeps each character where its name says: thocky lowest, clacky highest", () => {
    const pitch = (id: keyof typeof VOICES) => VOICES[id].body;
    expect(pitch("thocky")).toBeLessThan(pitch("creamy"));
    expect(pitch("creamy")).toBeLessThan(pitch("poppy"));
    expect(pitch("poppy")).toBeLessThan(pitch("clacky"));
  });
});
