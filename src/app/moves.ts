/**
 * Moving and renaming notes and folders, as plain file moves. A note's pictures and links point
 * to other files relative to where the note is, so they're rewritten to keep pointing at the same
 * files from the new place. Nothing else in the note changes.
 */
import { relativeFrom, resolveRelative } from "../store/store";
import { parseNote } from "../notes/note";

/** The note's text with its relative picture and link addresses fixed for its new place. */
export function rewriteLinks(text: string, from: string, to: string): string {
  if (dirOf(from) === dirOf(to)) return text;
  const note = parseNote(text);
  const fix = (src: string) => {
    const target = resolveRelative(from, src);
    if (target === null) return src;
    const hash = src.match(/#.*$/)?.[0] ?? "";
    return relativeFrom(to, target) + hash;
  };
  const body = note.body
    // ![alt](src "title") and [text](src): addresses in angle brackets or without spaces.
    .replace(/(!?\[[^\]]*\]\()(<[^>]+>|[^)\s]+)/g, (all, start: string, src: string) => {
      const inner = src.startsWith("<") ? src.slice(1, -1) : src;
      const fixed = fix(inner);
      return fixed === inner ? all : `${start}${src.startsWith("<") ? `<${decodeURI(fixed)}>` : fixed}`;
    })
    // <img src="…"> in HTML kept as written.
    .replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (all, a: string, src: string, b: string) => {
      const fixed = fix(src);
      return fixed === src ? all : a + fixed + b;
    });
  return note.bom + (note.header ?? "") + body;
}

/** "Essays/Draft.md" → "Essays"; "Draft.md" → "". */
export function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function fileOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function join(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

/** A name for a file or folder: no slashes or characters other systems refuse. */
export function safeName(text: string): string {
  return text
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 100)
    .trim();
}

/** A free path: this one, or with " 2", " 3"… before ".md". */
export function freePath(path: string, taken: (p: string) => boolean): string {
  if (!taken(path)) return path;
  const base = path.replace(/\.md$/i, "");
  for (let i = 2; ; i++) if (!taken(`${base} ${i}.md`)) return `${base} ${i}.md`;
}

/**
 * Where each note goes when a folder moves or is renamed: everything under `folder` moves under
 * `to`, keeping its place inside.
 */
export function folderMoves(paths: string[], folder: string, to: string): [string, string][] {
  return paths.filter((p) => p.startsWith(`${folder}/`)).map((p) => [p, `${to}/${p.slice(folder.length + 1)}`]);
}

/** Is `folder` the same as, or inside, `other`? (A folder can't move into itself.) */
export function isWithin(folder: string, other: string): boolean {
  return folder === other || folder.startsWith(`${other}/`);
}

/** The note's text with its title (the first # line) changed, or one added at the top. */
export function withTitle(text: string, title: string): string {
  const note = parseNote(text);
  const eol = note.eol;
  const lines = note.body.split(/\r?\n/);
  const at = lines.findIndex((l) => /^#\s/.test(l));
  if (at >= 0) lines[at] = `# ${title}`;
  else {
    const first = lines.findIndex((l) => l.trim() !== "");
    lines.splice(first < 0 ? 0 : first, 0, `# ${title}`, "");
  }
  return note.bom + (note.header ?? "") + lines.join(eol);
}
