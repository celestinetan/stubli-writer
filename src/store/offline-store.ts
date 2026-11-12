/**
 * Keeps Drive notes usable without a connection.
 *
 * Every note read is kept on this device. Every save is kept on this device first, then sent
 * to Drive; if that can't happen yet (no connection, sign-in ran out, Drive busy), it waits and
 * goes up later, even after the app was closed. Nothing typed is lost while waiting.
 */
import { DriveProblem, Offline, SignInNeeded } from "./drive-api";
import { checkPath, noteName, type NoteRef, type NoteStore } from "./store";

export interface KeyValue<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  entries(): Promise<[string, T][]>;
}

export interface SyncStatus {
  /** Notes saved on this device that haven't reached Drive yet. */
  waiting: number;
  offline: boolean;
  signInNeeded: boolean;
  /** A plain-words problem from Drive, if the last try failed for another reason. */
  problem: string | null;
}

interface Cached {
  text: string;
  modified: number;
}

const RETRY_MS = 30_000;
/** Marks a note waiting to be moved to Drive's trash (in the queue of things to send). */
const REMOVED = "\u0000stubli-writer:removed";

export class OfflineStore implements NoteStore {
  readonly kind;
  readonly label;
  private status: SyncStatus = { waiting: 0, offline: false, signInNeeded: false, problem: null };
  private listeners = new Set<(s: SyncStatus) => void>();
  private flushing: Promise<void> | null = null;
  private again: Promise<void> | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private inner: NoteStore,
    private notes: KeyValue<Cached>,
    private pending: KeyValue<string>,
  ) {
    this.kind = inner.kind;
    this.label = inner.label;
  }

  onStatus(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  /** Try to send what's waiting (after sign-in, when the connection is back, or on a timer). */
  flush(): Promise<void> {
    // If a try is already under way, run one more after it: things may have changed meanwhile
    // (a new save, the connection coming back).
    if (this.flushing) {
      this.again ??= this.flushing.then(() => {
        this.again = null;
        return this.flush();
      });
      return this.again;
    }
    this.flushing = this.doFlush().finally(() => (this.flushing = null));
    return this.flushing;
  }

  async list(): Promise<NoteRef[]> {
    const waiting = await this.pending.entries();
    try {
      const refs = await this.inner.list();
      this.update({ offline: false, signInNeeded: false });
      const known = new Set(refs.map((r) => r.path));
      const gone = new Set(waiting.filter(([, t]) => t === REMOVED).map(([p]) => p));
      const extra = waiting.filter(([p, t]) => !known.has(p) && t !== REMOVED).map(([path]) => ({ path, name: noteName(path), modified: Date.now() }));
      return [...extra, ...refs.filter((r) => !gone.has(r.path))];
    } catch (e) {
      if (!this.reachable(e)) throw e;
      // Without Drive: the notes kept on this device.
      const cached = await this.notes.entries();
      const paths = new Map(cached.map(([path, c]) => [path, c.modified]));
      for (const [path, t] of waiting) {
        if (t === REMOVED) paths.delete(path);
        else paths.set(path, Date.now());
      }
      return [...paths].map(([path, modified]) => ({ path, name: noteName(path), modified })).sort((a, b) => b.modified - a.modified);
    }
  }

  async read(path: string): Promise<string> {
    checkPath(path);
    const waiting = await this.pending.get(path);
    if (waiting === REMOVED) throw new Error(`There's no note called "${noteName(path)}".`);
    if (waiting !== undefined) return waiting;
    try {
      const text = await this.inner.read(path);
      await this.notes.set(path, { text, modified: Date.now() });
      return text;
    } catch (e) {
      if (!this.reachable(e)) throw e;
      const cached = await this.notes.get(path);
      if (cached) return cached.text;
      throw e;
    }
  }

  async write(path: string, text: string): Promise<void> {
    checkPath(path);
    // Safe on this device first; then on its way to Drive.
    await this.notes.set(path, { text, modified: Date.now() });
    await this.pending.set(path, text);
    this.update({ waiting: (await this.pending.entries()).length });
    void this.flush();
  }

  async remove(path: string): Promise<void> {
    checkPath(path);
    // Gone from this device at once; moved to Drive's trash when Drive can be reached.
    await this.notes.delete(path);
    await this.pending.set(path, REMOVED);
    this.update({ waiting: (await this.pending.entries()).length });
    void this.flush();
  }

  async exists(path: string): Promise<boolean> {
    const waiting = await this.pending.get(path);
    if (waiting === REMOVED) return false;
    if (waiting !== undefined || (await this.notes.get(path))) return true;
    try {
      return await this.inner.exists(path);
    } catch (e) {
      if (this.reachable(e)) return false;
      throw e;
    }
  }

  readFile(path: string): Promise<Blob> {
    return this.inner.readFile(path);
  }

  writeFile(path: string, data: Blob): Promise<void> {
    return this.inner.writeFile(path, data);
  }

  private async doFlush(): Promise<void> {
    clearTimeout(this.retry);
    for (const [path, text] of await this.pending.entries()) {
      try {
        if (text === REMOVED) await this.inner.remove(path);
        else await this.inner.write(path, text);
        // Only clear it if it wasn't changed again while uploading.
        if ((await this.pending.get(path)) === text) await this.pending.delete(path);
        this.update({ offline: false, signInNeeded: false, problem: null });
      } catch (e) {
        if (e instanceof Offline) this.update({ offline: true });
        else if (e instanceof SignInNeeded) this.update({ signInNeeded: true });
        else this.update({ problem: e instanceof Error ? e.message : String(e) });
        if (!(e instanceof SignInNeeded)) this.retry = setTimeout(() => void this.flush(), RETRY_MS);
        break;
      }
    }
    this.update({ waiting: (await this.pending.entries()).length });
  }

  /** Errors that mean "Drive can't be reached right now", as opposed to real problems. */
  private reachable(e: unknown): boolean {
    if (e instanceof Offline) {
      this.update({ offline: true });
      return true;
    }
    if (e instanceof SignInNeeded) {
      this.update({ signInNeeded: true });
      return true;
    }
    return e instanceof DriveProblem && e.status >= 500;
  }

  private update(change: Partial<SyncStatus>) {
    this.status = { ...this.status, ...change };
    for (const l of this.listeners) l(this.status);
  }
}

// --- Keeping things on this device (IndexedDB) ---------------------------------------------------

const DB = "stubli-writer-drive";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Version 2 added "versions": which Drive version each note on this device came from.
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      for (const name of ["notes", "pending", "versions"]) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbStore<T>(name: "notes" | "pending" | "versions"): KeyValue<T> {
  const db = openDb();
  const run = <R>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> =>
    db.then(
      (d) =>
        new Promise<R>((resolve, reject) => {
          const tx = d.transaction(name, mode);
          const req = fn(tx.objectStore(name));
          tx.oncomplete = () => resolve(req.result);
          tx.onerror = () => reject(tx.error);
        }),
    );
  return {
    get: (key) => run("readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
    set: (key, value) => run("readwrite", (s) => s.put(value, key)).then(() => undefined),
    delete: (key) => run("readwrite", (s) => s.delete(key)).then(() => undefined),
    entries: () =>
      db.then(
        (d) =>
          new Promise<[string, T][]>((resolve, reject) => {
            const tx = d.transaction(name, "readonly");
            const store = tx.objectStore(name);
            const keys = store.getAllKeys();
            const values = store.getAll();
            tx.oncomplete = () => resolve((keys.result as string[]).map((k, i) => [k, values.result[i] as T]));
            tx.onerror = () => reject(tx.error);
          }),
      ),
  };
}

/** For tests: kept in memory. */
export function memoryKeyValue<T>(): KeyValue<T> {
  const m = new Map<string, T>();
  return {
    get: async (k) => m.get(k),
    set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    entries: async () => [...m],
  };
}
