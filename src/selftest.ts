// Exposes the real storage code to the browser tests. Only built when SELFTEST=1.
import { FolderStore } from "./store/folder-store";
import { parseNote, serializeNote, writeFields } from "./notes/note";
import { findGaps } from "./notes/gaps";

declare global {
  interface Window {
    stubliSelftest: {
      /** A FolderStore on a fresh, empty folder in the browser's private storage. */
      freshFolder(): Promise<FolderStore>;
      /** The same, plus the raw folder, to put things there that aren't notes. */
      freshFolderWithHandle(): Promise<{ store: FolderStore; dir: FileSystemDirectoryHandle }>;
      parseNote: typeof parseNote;
      serializeNote: typeof serializeNote;
      writeFields: typeof writeFields;
      findGaps: typeof findGaps;
    };
  }
}

async function freshDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const name = `selftest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return root.getDirectoryHandle(name, { create: true });
}

window.stubliSelftest = {
  async freshFolder() {
    return new FolderStore(await freshDir());
  },
  async freshFolderWithHandle() {
    const dir = await freshDir();
    return { store: new FolderStore(dir), dir };
  },
  parseNote,
  serializeNote,
  writeFields,
  findGaps,
};
