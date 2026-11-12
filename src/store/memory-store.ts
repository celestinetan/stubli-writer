import { checkFilePath, checkPath, noteName, type NoteRef, type NoteStore } from "./store";

/** Notes kept in memory only. Used by tests and the demo; nothing is saved anywhere. */
export class MemoryStore implements NoteStore {
  readonly kind = "memory" as const;
  readonly label = "Sample notes";
  private files = new Map<string, { text: string; modified: number }>();
  private blobs = new Map<string, Blob>();

  constructor(initial: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(initial)) {
      checkPath(path);
      this.files.set(path, { text, modified: Date.now() });
    }
  }

  async list(): Promise<NoteRef[]> {
    return [...this.files].map(([path, f]) => ({ path, name: noteName(path), modified: f.modified }));
  }

  async read(path: string): Promise<string> {
    checkPath(path);
    const f = this.files.get(path);
    if (!f) throw new Error(`There's no note called "${noteName(path)}".`);
    return f.text;
  }

  async write(path: string, text: string): Promise<void> {
    checkPath(path);
    this.files.set(path, { text, modified: Date.now() });
  }

  async exists(path: string): Promise<boolean> {
    checkPath(path);
    return this.files.has(path);
  }

  async remove(path: string): Promise<void> {
    checkPath(path);
    this.files.delete(path);
  }

  async readFile(path: string): Promise<Blob> {
    checkFilePath(path);
    const b = this.blobs.get(path);
    if (!b) throw new Error(`There's no file called "${path}".`);
    return b;
  }

  async writeFile(path: string, data: Blob): Promise<void> {
    checkFilePath(path);
    this.blobs.set(path, data);
  }
}
