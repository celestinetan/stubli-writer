/**
 * Notes kept inside Stubli Writer on this device (an iPhone, or any browser), with no folder and
 * no account. They're stored in the browser's own database for this site (IndexedDB), which works
 * offline and in Safari on iPhone, where web apps can't open folders.
 *
 * The catch, said plainly in the app: the notes live inside the app, not in the Files app. Removing
 * the app from the Home Screen or clearing the browser's website data removes them too; so the app
 * asks the browser to keep them (persistent storage) and offers one-tap backups.
 */
import { checkFilePath, checkPath, noteName, type NoteRef, type NoteStore } from "./store";

interface Saved {
  text: string;
  modified: number;
}

/** The two places a device notebook keeps things. */
export interface DeviceDb {
  get<T>(store: "notes" | "files", key: string): Promise<T | undefined>;
  set(store: "notes" | "files", key: string, value: unknown): Promise<void>;
  delete(store: "notes" | "files", key: string): Promise<void>;
  entries<T>(store: "notes" | "files"): Promise<[string, T][]>;
}

export class DeviceStore implements NoteStore {
  readonly kind = "device" as const;
  readonly label = "This device";

  constructor(private db: DeviceDb = indexedDeviceDb()) {}

  async list(): Promise<NoteRef[]> {
    const all = await this.db.entries<Saved>("notes");
    return all.map(([path, n]) => ({ path, name: noteName(path), modified: n.modified })).sort((a, b) => b.modified - a.modified);
  }

  async read(path: string): Promise<string> {
    checkPath(path);
    const n = await this.db.get<Saved>("notes", path);
    if (!n) throw new Error(`There's no note called "${noteName(path)}".`);
    return n.text;
  }

  async write(path: string, text: string): Promise<void> {
    checkPath(path);
    await this.db.set("notes", path, { text, modified: Date.now() } satisfies Saved);
  }

  async exists(path: string): Promise<boolean> {
    checkPath(path);
    return (await this.db.get("notes", path)) !== undefined;
  }

  async remove(path: string): Promise<void> {
    checkPath(path);
    await this.db.delete("notes", path);
  }

  async readFile(path: string): Promise<Blob> {
    checkFilePath(path);
    const b = await this.db.get<Blob>("files", path);
    if (!b) throw new Error(`There's no file called "${path}".`);
    return b;
  }

  async writeFile(path: string, data: Blob): Promise<void> {
    checkFilePath(path);
    await this.db.set("files", path, data);
  }

  /** Every picture kept with the notes (for backups). */
  async listFiles(): Promise<string[]> {
    return (await this.db.entries<Blob>("files")).map(([p]) => p);
  }
}

/** The browser's database for this site: "stubli-writer-device", with notes and files. */
export function indexedDeviceDb(): DeviceDb {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("stubli-writer-device", 1);
      req.onupgradeneeded = () => {
        for (const name of ["notes", "files"]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const run = async <R>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> => {
    const d = await open();
    return new Promise<R>((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("This device couldn't save that."));
      tx.onabort = () => reject(tx.error ?? new Error("This device has no room left for notes."));
    });
  };
  return {
    get: <T>(store: "notes" | "files", key: string) => run(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
    set: (store, key, value) => run(store, "readwrite", (s) => s.put(value, key)).then(() => undefined),
    delete: (store, key) => run(store, "readwrite", (s) => s.delete(key)).then(() => undefined),
    entries: async <T>(store: "notes" | "files") => {
      const d = await open();
      return new Promise<[string, T][]>((resolve, reject) => {
        const tx = d.transaction(store, "readonly");
        const keys = tx.objectStore(store).getAllKeys();
        const values = tx.objectStore(store).getAll();
        tx.oncomplete = () => resolve((keys.result as string[]).map((k, i) => [k, values.result[i] as T]));
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}

/** A device database in memory, for tests. */
export function memoryDeviceDb(): DeviceDb {
  const m = { notes: new Map<string, unknown>(), files: new Map<string, unknown>() };
  return {
    get: async <T>(s: "notes" | "files", k: string) => m[s].get(k) as T | undefined,
    set: async (s, k, v) => void m[s].set(k, v),
    delete: async (s, k) => void m[s].delete(k),
    entries: async <T>(s: "notes" | "files") => [...m[s]] as [string, T][],
  };
}
