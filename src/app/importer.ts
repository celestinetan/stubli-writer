/**
 * Bringing in notes from other apps: Markdown files (Bear, Obsidian, iA Writer and others export
 * them) and the pictures next to them. Files are copied exactly as they are; formatting outside
 * Medium's set shows as protected blocks in the editor, so nothing is lost.
 *
 * Imports go into "Imported/<folder>/…", keeping the folder structure so links to pictures still
 * work. Nothing is ever overwritten: a name that's taken gets " (2)".
 */
import { checkFilePath, checkPath, IMAGE_TYPES, type NoteStore } from "../store/store";

export interface IncomingFile {
  /** Path inside what was chosen, e.g. "Bear export/Trip/Lisbon.md", or just "Lisbon.md". */
  path: string;
  file: Blob;
}

export interface ImportResult {
  notes: string[];
  pictures: string[];
  skipped: string[];
  /** Where it all went. */
  folder: string;
}

const NOTE_EXT = /\.(md|markdown|mdown|txt)$/i;
const MAX_NOTE_BYTES = 5 * 1024 * 1024;

/** The one folder everything was chosen inside (when a whole folder was picked), or "". */
function commonTop(files: IncomingFile[]): string {
  const tops = new Set(files.map((f) => (f.path.includes("/") ? f.path.split("/")[0] : "")));
  return tops.size === 1 ? [...tops][0] : "";
}

/** Where an import goes: "Imported/<chosen folder>", or "Imported/<date>" for loose files. */
export function importFolderName(files: IncomingFile[], now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `Imported/${cleanPart(commonTop(files)) || date}`;
}

export async function importFiles(store: NoteStore, files: IncomingFile[], now = new Date()): Promise<ImportResult> {
  const folder = importFolderName(files, now);
  // When a whole folder was chosen, its name is already in `folder`; don't repeat it inside.
  const stripTop = commonTop(files) !== "";
  const result: ImportResult = { notes: [], pictures: [], skipped: [], folder };
  const taken = new Set((await store.list()).map((r) => r.path.toLowerCase()));

  for (const { path, file } of files) {
    const parts = path.split("/").filter(Boolean);
    // Hidden things from other apps (.obsidian, .trash, .DS_Store) are never notes.
    if (parts.some((p) => p.startsWith("."))) continue;
    const inner = (stripTop ? parts.slice(1) : parts).map(cleanPart);
    const name = inner.pop() ?? "";
    const isNote = NOTE_EXT.test(name);
    const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
    const isPicture = ext in IMAGE_TYPES;

    if (!isNote && !isPicture) {
      result.skipped.push(path);
      continue;
    }
    if (isNote && file.size > MAX_NOTE_BYTES) {
      result.skipped.push(path);
      continue;
    }

    const base = isNote ? name.replace(NOTE_EXT, "") : name.replace(/\.[^.]+$/, "");
    const suffix = isNote ? ".md" : `.${ext}`;
    let target = [folder, ...inner, base + suffix].join("/");
    for (let i = 2; taken.has(target.toLowerCase()); i++) target = [folder, ...inner, `${base} (${i})${suffix}`].join("/");

    try {
      if (isNote) {
        checkPath(target);
        const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await file.arrayBuffer());
        await store.write(target, text);
        result.notes.push(target);
      } else {
        checkFilePath(target);
        await store.writeFile(target, file);
        result.pictures.push(target);
      }
      taken.add(target.toLowerCase());
    } catch {
      result.skipped.push(path);
    }
  }
  return result;
}

/** A folder or file name that's safe in any notes folder: no leading dots, no slashes or odd characters. */
function cleanPart(part: string): string {
  return part
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
}
