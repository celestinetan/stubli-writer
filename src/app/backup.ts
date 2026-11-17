/**
 * Backups: every note (and the pictures they show) in one .zip, to keep in Files, iCloud Drive or
 * anywhere. Restoring puts them back where they were, never over a note that's different: then
 * both are kept. A backup is also how notes move from one place to another (this device, a folder,
 * Google Drive): back up, choose the new place, restore.
 */
import { zip } from "../export/zip";
import { parseNote } from "../notes/note";
import { checkFilePath, checkPath, IMAGE_TYPES, resolveRelative, type NoteStore } from "../store/store";
import { isoDate, type LibraryNote } from "./library";
import { freePath } from "./moves";
import { isTrashPath } from "./trash";

const TOP = /^Stubli Writer backup[^/]*\//;

export function backupName(d: Date): string {
  return `Stubli Writer backup ${isoDate(d)}`;
}

/** The pictures a note shows, as paths in the notes folder. */
function picturesOf(note: LibraryNote): string[] {
  const body = parseNote(note.text).body;
  const out: string[] = [];
  for (const m of body.matchAll(/!\[[^\]]*\]\(<?([^)>\s]+)>?/g)) out.push(m[1]);
  for (const m of body.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) out.push(m[1]);
  return out.map((src) => resolveRelative(note.path, src)).filter((p): p is string => !!p);
}

/** Every note (not the Trash) and every picture, zipped inside a dated folder. */
export async function makeBackup(store: NoteStore, notes: LibraryNote[], now = new Date()): Promise<{ bytes: Uint8Array<ArrayBuffer>; name: string; notes: number; pictures: number }> {
  const top = backupName(now);
  const kept = notes.filter((n) => !isTrashPath(n.path));
  const files = new Set<string>(store.listFiles ? await store.listFiles() : kept.flatMap(picturesOf));
  const entries: { name: string; data: Uint8Array | string }[] = kept.map((n) => ({ name: `${top}/${n.path}`, data: n.text }));
  let pictures = 0;
  for (const path of files) {
    try {
      checkFilePath(path);
      entries.push({ name: `${top}/${path}`, data: new Uint8Array(await (await store.readFile(path)).arrayBuffer()) });
      pictures++;
    } catch {
      // A picture that can't be read is left out; its note still says where it was.
    }
  }
  return { bytes: zip(entries, now), name: `${top}.zip`, notes: kept.length, pictures };
}

export interface ZipFile {
  path: string;
  data: Uint8Array;
}

/** Reads a .zip: ours (stored) or one made elsewhere (compressed), skipping folders and Mac extras. */
export async function unzip(bytes: Uint8Array): Promise<ZipFile[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-archive record is near the end; find it, then walk the central directory.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("That isn't a .zip file.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out: ZipFile[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("This .zip file is damaged.");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const path = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith("/") || path.startsWith("__MACOSX/") || /(^|\/)\.DS_Store$/.test(path)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else continue;
    out.push({ path, data });
  }
  return out;
}

export interface RestoreResult {
  restored: number;
  keptBoth: number;
  same: number;
  pictures: number;
  skipped: string[];
}

/** Puts a backup's notes and pictures back. A note that's there and different is kept as well. */
export async function restoreBackup(store: NoteStore, files: ZipFile[], existing: LibraryNote[]): Promise<RestoreResult> {
  const r: RestoreResult = { restored: 0, keptBoth: 0, same: 0, pictures: 0, skipped: [] };
  const byPath = new Map(existing.map((n) => [n.path, n]));
  const taken = new Set(existing.map((n) => n.path));
  const dec = new TextDecoder("utf-8", { ignoreBOM: true });
  for (const f of files) {
    const path = f.path.replace(TOP, "");
    const ext = path.split(".").pop()!.toLowerCase();
    try {
      if (/\.(md|markdown)$/i.test(path)) {
        checkPath(path.replace(/\.markdown$/i, ".md"));
        const text = dec.decode(f.data);
        const now = byPath.get(path);
        if (now && now.text === text) r.same++;
        else if (now || taken.has(path)) {
          const copy = freePath(path.replace(/\.md$/i, " (restored).md"), (p) => taken.has(p));
          await store.write(copy, text);
          taken.add(copy);
          r.keptBoth++;
        } else {
          await store.write(path, text);
          taken.add(path);
          r.restored++;
        }
      } else if (ext in IMAGE_TYPES) {
        checkFilePath(path);
        await store.writeFile(path, new Blob([f.data.slice()], { type: IMAGE_TYPES[ext] }));
        r.pictures++;
      } else r.skipped.push(path);
    } catch {
      r.skipped.push(path);
    }
  }
  return r;
}

// --- When this notebook was last backed up (on this device) ------------------------------------

const KEY = "stubli-writer:last-backup:";
const SNOOZE = "stubli-writer:backup-later:";
const FIRST = "stubli-writer:first-use:";

export function lastBackup(notebook: string): number | null {
  return readTime(KEY + notebook);
}

export function markBackedUp(notebook: string): void {
  writeTime(KEY + notebook, Date.now());
}

export function backupLater(notebook: string): void {
  writeTime(SNOOZE + notebook, Date.now() + 7 * DAY);
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether to suggest a backup: notes kept only on this device, in use for a few days, and not
 * backed up for two weeks (or ever). Not again for a week after "Later".
 */
export function backupDue(notebook: string, hasNotes: boolean, now = Date.now()): boolean {
  if (!hasNotes) return false;
  let first = readTime(FIRST + notebook);
  if (first === null) {
    writeTime(FIRST + notebook, now);
    first = now;
  }
  const snoozed = readTime(SNOOZE + notebook);
  if (snoozed !== null && snoozed > now) return false;
  const last = lastBackup(notebook);
  return last === null ? now - first > 3 * DAY : now - last > 14 * DAY;
}

function readTime(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeTime(key: string, t: number): void {
  try {
    localStorage.setItem(key, String(t));
  } catch {
    // Not remembered in a private window.
  }
}
