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

/** Folders that belong to other tools, never to notes. */
export const SKIPPED_FOLDERS = new Set(["node_modules", "_site", "dist"]);

export function noteName(path: string): string {
  return path.split("/").pop()!.replace(/\.md$/i, "");
}
