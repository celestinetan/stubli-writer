import { describe, expect, it } from "vitest";
import { parseMode } from "../../src/mode";
import { CSP } from "../../vite.config";

describe("reading mode", () => {
  it("keeps Paper", () => expect(parseMode("paper")).toBe("paper"));
  it("falls back to Light for anything else, including an old saved Dark", () => {
    expect(parseMode(null)).toBe("light");
    expect(parseMode("dark")).toBe("light");
    expect(parseMode("")).toBe("light");
  });
});

describe("content security policy", () => {
  it("only allows the site's own files", () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).toContain("connect-src 'self'");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).not.toContain("unsafe-inline");
    expect(CSP).not.toContain("unsafe-eval");
    expect(CSP).not.toMatch(/https?:/);
  });
});
