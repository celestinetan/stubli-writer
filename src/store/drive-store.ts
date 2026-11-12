/**
 * Notes in Google Drive, in a "Stubli Writer" folder, with the same paths as on disk:
 * "Daily/2026-11-11.md", "images/tram.jpg".
 *
 * Edits on two devices: Drive counts versions of each file. If a note changed elsewhere since
 * this device last read it, the newer save (this one) wins and the other version is kept next
 * to it as "Name (conflicted copy 2026-11-11 15.42).md", so nothing is ever lost.
 *
 * "Last read on this device" is kept on the device (not only in memory), because the Google
 * sign-in isn't kept between visits: on a new visit, notes open from the device copy and are
 * often edited before signing in. Without remembering which version that copy was, every such
 * edit would look like a conflict.
 */
import { DRIVE_FOLDER_NAME } from "../config";
import { DriveApi, FOLDER_MIME, type DriveFile } from "./drive-api";
import { checkFilePath, checkPath, IMAGE_TYPES, noteName, type NoteRef, type NoteStore } from "./store";
import type { KeyValue } from "./offline-store";

export class DriveStore implements NoteStore {
  readonly kind = "drive" as const;
  readonly label = "Google Drive";

  private rootId: string | null = null;
  private files = new Map<string, DriveFile>();
  private folders = new Map<string, string>();
  /** The version of each file (by Drive id) as this device last read or wrote it. */
  private seen = new Map<string, string>();
  private seenLoaded: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** Called when a conflicted copy was made, with its path. */
  onConflict?: (path: string, copyPath: string) => void;

  constructor(
    private api: DriveApi,
    private now: () => Date = () => new Date(),
    /** Where "last read on this device" is kept between visits. Without it, memory only. */
    private seenStore?: KeyValue<string>,
  ) {}

  list(): Promise<NoteRef[]> {
    return this.serial(async () => {
      await this.refresh();
      return [...this.files]
        .filter(([path]) => /\.md$/i.test(path))
        .map(([path, f]) => ({ path, name: noteName(path), modified: Date.parse(f.modifiedTime ?? "") || 0 }))
        .sort((a, b) => b.modified - a.modified);
    });
  }

  read(path: string): Promise<string> {
    checkPath(path);
    return this.serial(async () => {
      const f = await this.find(path);
      if (!f) throw new Error(`There's no note called "${noteName(path)}".`);
      const [text, meta] = await Promise.all([this.api.text(f.id), this.api.meta(f.id)]);
      if (meta.version) await this.markSeen(f.id, meta.version);
      return text;
    });
  }

  write(path: string, text: string): Promise<void> {
    checkPath(path);
    return this.serial(() => this.put(path, text, "text/markdown", true));
  }

  exists(path: string): Promise<boolean> {
    checkPath(path);
    return this.serial(async () => (await this.find(path)) !== null);
  }

  /** Moves the note to Drive's trash. */
  remove(path: string): Promise<void> {
    checkPath(path);
    return this.serial(async () => {
      const f = await this.find(path);
      if (!f) return;
      await this.api.trash(f.id);
      this.files.delete(path);
    });
  }

  readFile(path: string): Promise<Blob> {
    checkFilePath(path);
    return this.serial(async () => {
      const f = await this.find(path);
      if (!f) throw new Error(`There's no file called "${path}".`);
      return this.api.blob(f.id);
    });
  }

  writeFile(path: string, data: Blob): Promise<void> {
    checkFilePath(path);
    const ext = path.split(".").pop()!.toLowerCase();
    return this.serial(() => this.put(path, data, IMAGE_TYPES[ext], false));
  }

  // --- inside ------------------------------------------------------------------------------------

  /** One Drive operation at a time, so the folder index never races itself. */
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async put(path: string, content: string | Blob, mimeType: string, guardConflicts: boolean): Promise<void> {
    let existing = await this.find(path);
    if (existing && guardConflicts) {
      await this.loadSeen();
      const meta = await this.api.meta(existing.id);
      const known = this.seen.get(existing.id);
      if (meta.version && known !== meta.version) {
        // Changed on another device since we last saw it (or never seen here): keep that version.
        const theirs = await this.api.text(existing.id);
        if (theirs !== content) await this.keepConflictedCopy(path, theirs);
      }
    }
    if (existing) {
      const saved = await this.api.updateContent(existing.id, content, mimeType);
      existing = { ...existing, ...saved };
    } else {
      const parts = path.split("/");
      const parent = await this.ensureFolder(parts.slice(0, -1));
      existing = await this.api.createFile(parts[parts.length - 1], parent, content, mimeType);
    }
    this.files.set(path, existing);
    if (existing.version) await this.markSeen(existing.id, existing.version);
  }

  /** Reads "last read on this device" from the device, once per visit. */
  private loadSeen(): Promise<void> {
    this.seenLoaded ??= (async () => {
      if (!this.seenStore) return;
      try {
        for (const [id, version] of await this.seenStore.entries()) if (!this.seen.has(id)) this.seen.set(id, version);
      } catch {
        // If the device can't tell, conflicts are judged as before (and copies are only extra).
      }
    })();
    return this.seenLoaded;
  }

  private async markSeen(id: string, version: string): Promise<void> {
    this.seen.set(id, version);
    try {
      await this.seenStore?.set(id, version);
    } catch {
      // Not fatal: this visit still remembers it in memory.
    }
  }

  private async keepConflictedCopy(path: string, text: string): Promise<void> {
    const d = this.now();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
    const parts = path.split("/");
    const base = parts.pop()!.replace(/\.md$/i, "");
    let copy = [...parts, `${base} (conflicted copy ${stamp}).md`].join("/");
    for (let i = 2; this.files.has(copy); i++) copy = [...parts, `${base} (conflicted copy ${stamp} ${i}).md`].join("/");
    const parent = await this.ensureFolder(parts);
    const made = await this.api.createFile(copy.split("/").pop()!, parent, text, "text/markdown");
    this.files.set(copy, made);
    this.onConflict?.(path, copy);
  }

  private async find(path: string): Promise<DriveFile | null> {
    if (this.rootId === null) await this.refresh();
    return this.files.get(path) ?? null;
  }

  private async ensureFolder(parts: string[]): Promise<string> {
    if (this.rootId === null) await this.refresh();
    let parentId = this.rootId!;
    let sofar = "";
    for (const part of parts) {
      sofar = sofar ? `${sofar}/${part}` : part;
      let id = this.folders.get(sofar);
      if (!id) {
        id = (await this.api.createFolder(part, parentId)).id;
        this.folders.set(sofar, id);
      }
      parentId = id;
    }
    return parentId;
  }

  /** Reads every file the app can see and rebuilds the path index. */
  private async refresh(): Promise<void> {
    const all = await this.api.listAll();
    const ids = new Set(all.map((f) => f.id));
    // The notes folder: ours, named "Stubli Writer", not inside another of our folders.
    const roots = all
      .filter((f) => f.mimeType === FOLDER_MIME && f.name === DRIVE_FOLDER_NAME && !(f.parents ?? []).some((p) => ids.has(p)))
      .sort((a, b) => (a.modifiedTime ?? "").localeCompare(b.modifiedTime ?? ""));
    this.rootId = roots[0]?.id ?? (await this.api.createFolder(DRIVE_FOLDER_NAME)).id;

    const children = new Map<string, DriveFile[]>();
    for (const f of all) for (const p of f.parents ?? []) children.set(p, [...(children.get(p) ?? []), f]);

    this.files.clear();
    this.folders.clear();
    const renames: Promise<unknown>[] = [];
    const walk = (folderId: string, prefix: string, depth: number) => {
      if (depth > 8) return;
      const kids = (children.get(folderId) ?? []).sort((a, b) => (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""));
      for (const f of kids) {
        if (f.mimeType === FOLDER_MIME) {
          const path = prefix + f.name;
          if (!this.folders.has(path)) {
            this.folders.set(path, f.id);
            walk(f.id, `${path}/`, depth + 1);
          }
        } else {
          let path = prefix + f.name;
          if (this.files.has(path)) {
            // The same note was created on two devices at once: keep the newest under its name,
            // and give the other one a conflicted-copy name.
            const base = f.name.replace(/(\.[^.]+)$/, "");
            const ext = /(\.[^.]+)$/.exec(f.name)?.[1] ?? "";
            let n = 1;
            do path = `${prefix}${base} (conflicted copy${n > 1 ? ` ${n}` : ""})${ext}`;
            while (this.files.has(path) && ++n);
            renames.push(this.api.rename(f.id, path.split("/").pop()!));
          }
          this.files.set(path, f);
        }
      }
    };
    walk(this.rootId, "", 0);
    await Promise.all(renames);
  }
}
