/**
 * Gaps: the places a writer marked as "to come".
 *
 *   TK                          a quick gap
 *   @tk[the year this law passed]   a gap with a request
 *
 * Not gaps: "TK" inside a word (ATKINS, TKO), inside code, inside link addresses or web addresses,
 * or in an HTML comment. Requests stay on one line and need some text between the brackets.
 */

export type GapKind = "tk" | "request";

export interface Gap {
  kind: GapKind;
  /** The request text for `@tk[…]`; empty for a bare TK. */
  request: string;
  /** Offsets into the text that was searched. */
  start: number;
  end: number;
  /** 1-based line number. */
  line: number;
}

export function findGaps(markdown: string): Gap[] {
  const masked = maskIgnored(markdown);
  const gaps: Gap[] = [];

  // The text between the brackets must contain something other than spaces, and can't hold "]".
  const request = /@tk\[([^\]\n]*[^\]\s][^\]\n]*)\]/gi;
  let searchable = masked;
  for (const m of masked.matchAll(request)) {
    const start = m.index;
    const end = start + m[0].length;
    gaps.push({ kind: "request", request: m[1].trim(), start, end, line: lineAt(markdown, start) });
    searchable = searchable.slice(0, start) + " ".repeat(end - start) + searchable.slice(end);
  }

  // Only Latin letters and digits count as "inside a word", so TK works between Chinese or
  // Japanese characters, which are written without spaces.
  const bare = /(?<![\p{Script=Latin}\p{N}_@])TK(?![\p{Script=Latin}\p{N}_])/gu;
  for (const m of searchable.matchAll(bare)) {
    gaps.push({ kind: "tk", request: "", start: m.index, end: m.index + 2, line: lineAt(markdown, m.index) });
  }

  return gaps.sort((a, b) => a.start - b.start);
}

/** Replaces the parts of the text where gaps don't count with spaces, keeping every offset. */
function maskIgnored(text: string): string {
  let out = text;
  const blank = (start: number, end: number) => {
    out = out.slice(0, start) + out.slice(start, end).replace(/[^\n]/g, " ") + out.slice(end);
  };

  // Fenced code blocks: ``` or ~~~ (three or more), closed by the same kind, or to the end.
  const fence = /^([ \t]{0,3})(`{3,}|~{3,})[^\n]*\n?/gm;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(out))) {
    const marker = m[2];
    const closeRe = new RegExp(`^[ \\t]{0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`, "gm");
    closeRe.lastIndex = m.index + m[0].length;
    const close = closeRe.exec(out);
    const end = close ? close.index + close[0].length : out.length;
    blank(m.index, end);
    fence.lastIndex = end;
  }

  const patterns = [
    /(`+)[^\n]*?\1/g, // inline code spans
    /<!--[\s\S]*?-->/g, // HTML comments
    /\]\([^)\n]*\)/g, // link and image addresses: [text](address)
    /^\s{0,3}\[[^\]\n]+\]:[^\n]*/gm, // reference link definitions
    /<[a-z][a-z0-9+.-]*:[^>\s]*>/gi, // autolinks <https://…>
    /\b(?:https?|mailto):[^\s<>()]+/gi, // bare web addresses
  ];
  for (const re of patterns) {
    for (const hit of out.matchAll(re)) blank(hit.index, hit.index + hit[0].length);
  }
  return out;
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
