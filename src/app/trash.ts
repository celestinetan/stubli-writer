/**
 * Trash: a "Trash" folder next to your notes, in a folder, in Google Drive or in the samples.
 * A note keeps its place inside it ("Trash/Essays/Draft.md"), so it can go back where it was.
 * Deleting from the Trash is for good (in Google Drive, it goes to Drive's own trash).
 */
import { TRASH_FOLDER } from "../store/store";

export function isTrashPath(path: string): boolean {
  return path.startsWith(`${TRASH_FOLDER}/`);
}

/** Where a note goes in the Trash: the same place inside it, with a number if that's taken. */
export function trashPathFor(path: string, exists: (p: string) => boolean): string {
  return free(`${TRASH_FOLDER}/${path}`, exists, (base, i) => `${base} ${i}`);
}

/** Where a note goes back to: where it was, or next to it if that name is taken now. */
export function restorePathFor(trashPath: string, exists: (p: string) => boolean): string {
  return free(trashPath.slice(TRASH_FOLDER.length + 1), exists, (base, i) => (i === 2 ? `${base} (restored)` : `${base} (restored ${i})`));
}

/** "Trash/Essays/Draft.md" → "Essays", or "" when it was at the top. */
export function folderBefore(trashPath: string): string {
  const parts = trashPath.slice(TRASH_FOLDER.length + 1).split("/");
  return parts.slice(0, -1).join(" / ");
}

function free(path: string, exists: (p: string) => boolean, name: (base: string, i: number) => string): string {
  if (!exists(path)) return path;
  const base = path.replace(/\.md$/i, "");
  for (let i = 2; ; i++) {
    const p = `${name(base, i)}.md`;
    if (!exists(p)) return p;
  }
}
