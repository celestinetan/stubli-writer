import { checkPath, noteName, SKIPPED_FOLDERS, type NoteRef, type NoteStore } from "./store";

/**
 * Notes in a folder on this computer, through the browser's File System Access API
 * (Chrome, Edge, Arc, Brave on a computer). Works the same on the browser's private
 * storage (OPFS), which the tests use.
 *
 * Saving uses the browser's safe write: the new text goes to a temporary file that only
 * replaces the note once it's complete, so a crash mid-save can't leave half a note.
 */
export class FolderStore implements NoteStore {
  readonly kind = "folder" as const;

  constructor(private root: FileSystemDirectoryHandle) {}

  get label(): string {
    return this.root.name;
  }

  async list(): Promise<NoteRef[]> {
    const out: NoteRef[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number) => {
      if (depth > 8) return;
      for await (const [name, handle] of dir.entries()) {
        if (name.startsWith(".")) continue;
        if (handle.kind === "directory") {
          if (!SKIPPED_FOLDERS.has(name)) await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1);
        } else if (/\.md$/i.test(name)) {
          const file = await (handle as FileSystemFileHandle).getFile();
          out.push({ path: prefix + name, name: noteName(name), modified: file.lastModified });
        }
      }
    };
    await walk(this.root, "", 0);
    return out.sort((a, b) => b.modified - a.modified);
  }

  async read(path: string): Promise<string> {
    const file = await (await this.fileHandle(path, false)).getFile();
    // Not file.text(): that silently drops a byte-order mark, so saving would change the file.
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(await file.arrayBuffer());
  }

  async write(path: string, text: string): Promise<void> {
    const handle = await this.fileHandle(path, true);
    const writable = await handle.createWritable();
    try {
      await writable.write(text);
      await writable.close();
    } catch (e) {
      await writable.abort().catch(() => {});
      throw e;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.fileHandle(path, false);
      return true;
    } catch (e) {
      if (e instanceof DOMException && (e.name === "NotFoundError" || e.name === "TypeMismatchError")) return false;
      throw e;
    }
  }

  private async fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const parts = checkPath(path);
    let dir = this.root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
    return dir.getFileHandle(parts[parts.length - 1], { create });
  }
}

// --- choosing and remembering the folder ---------------------------------------------------------

type PermissionMode = { mode: "readwrite" };
interface PermissionHandle extends FileSystemDirectoryHandle {
  queryPermission(d: PermissionMode): Promise<PermissionState>;
  requestPermission(d: PermissionMode): Promise<PermissionState>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

/** True in browsers that can open a real folder (Chromium on a computer). */
export function canUseFolders(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** Asks the person to pick their notes folder. Must run from a click or key press. */
export async function chooseFolder(): Promise<FolderStore> {
  if (!window.showDirectoryPicker) throw new Error("This browser can't open folders. Try Chrome, Edge or Arc on a computer.");
  const handle = await window.showDirectoryPicker({ id: "stubli-writer-notes", mode: "readwrite", startIn: "documents" });
  await rememberFolder(handle);
  return new FolderStore(handle);
}

/**
 * The folder chosen last time, if the browser still allows it.
 * "ask" means the browser needs one click from the person before it lets us in again.
 */
export async function reopenFolder(): Promise<{ store: FolderStore } | { ask: () => Promise<FolderStore | null> } | null> {
  const handle = (await loadRemembered()) as PermissionHandle | null;
  if (!handle) return null;
  const mode: PermissionMode = { mode: "readwrite" };
  if ((await handle.queryPermission(mode)) === "granted") return { store: new FolderStore(handle) };
  return {
    ask: async () => ((await handle.requestPermission(mode)) === "granted" ? new FolderStore(handle) : null),
  };
}

// Folder handles can be kept in IndexedDB (not in localStorage).
const DB = "stubli-writer";
const STORE = "settings";
const KEY = "notes-folder";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // If the browser won't store it, the person just picks the folder again next time.
  }
}

async function loadRemembered(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
