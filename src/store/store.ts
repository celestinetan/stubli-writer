/**
 * Where notes live. The editor talks only to this interface, so it works the same whether notes
 * are in a folder on this computer or (milestone 4) in Google Drive.
 *
 * Paths are relative, use "/" between folders, and end in ".md": "Daily/2026-11-11.md".
 */

export interface NoteRef {
  path: string;
  /** File name without ".md". */
  name: string;
  /** Last change, in milliseconds since 1970. */
  modified: number;
}

export interface NoteStore {
  readonly kind: "folder" | "drive" | "memory";
  /** A name to show people, such as the folder's name. */
  readonly label: string;
  list(): Promise<NoteRef[]>;
  read(path: string): Promise<string>;
  /** Creates folders on the way when needed. */
  write(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Images and other files kept with the notes (path checked by checkFilePath). */
  readFile(path: string): Promise<Blob>;
  writeFile(path: string, data: Blob): Promise<void>;
  /**
   * Removes a note. A folder or memory deletes the file (the app first keeps a copy in Trash);
   * Google Drive moves it to Drive's own trash, where it can be restored for 30 days.
   */
  remove(path: string): Promise<void>;
}

export class NotePathError extends Error {
  override name = "NotePathError";
}

/** Checks a note path is safe: relative, no "..", no hidden folders, ends in ".md". */
export function checkPath(path: string): string[] {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) {
    throw new NotePathError("A note needs a name.");
  }
  if (path.startsWith("/") || path.includes("\\")) {
    throw new NotePathError(`"${path}" isn't a note path inside your notes folder.`);
  }
  const parts = path.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === ".." || part.startsWith(".")) {
      throw new NotePathError(`"${path}" isn't a note path inside your notes folder.`);
    }
  }
  if (!/\.md$/i.test(path)) throw new NotePathError(`"${path}" isn't a Markdown note.`);
  return parts;
}

export const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

/** Like checkPath, for images kept with the notes. */
export function checkFilePath(path: string): string[] {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  if (!ext || !(ext in IMAGE_TYPES)) throw new NotePathError(`"${path}" isn't an image Stubli Writer can show.`);
  return checkPath(path.replace(/\.[a-z0-9]+$/i, ".md"));
}

/** Resolves an image address written in a note (relative to the note) to a path in the notes folder. */
export function resolveRelative(notePath: string, src: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/") || src.startsWith("#")) return null;
  const parts = notePath.split("/").slice(0, -1);
  for (const part of decodeURI(src.split(/[?#]/)[0]).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

/** The address to write in a note for a file at `filePath` in the notes folder. */
export function relativeFrom(notePath: string, filePath: string): string {
  const from = notePath.split("/").slice(0, -1);
  const to = filePath.split("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...Array(from.length - i).fill(".."), ...to.slice(i)].map(encodeURIComponent).join("/").replace(/%2E%2E/g, "..");
}

/** Where Move to Trash keeps notes, wherever they're stored. Listed only in the Trash. */
export const TRASH_FOLDER = "Trash";

/** Folders that belong to other tools, never to notes. */
export const SKIPPED_FOLDERS = new Set(["node_modules", "_site", "dist"]);

export function noteName(path: string): string {
  return path.split("/").pop()!.replace(/\.md$/i, "");
}
