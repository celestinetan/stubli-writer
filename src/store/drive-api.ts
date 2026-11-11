/**
 * The small part of the Google Drive API that Stubli Writer uses, over plain fetch.
 * Only https://www.googleapis.com is contacted.
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
  /** Goes up every time the file changes, on any device. */
  version?: string;
}

export const FOLDER_MIME = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FIELDS = "id,name,mimeType,parents,modifiedTime,version";

/** The sign-in has run out (about an hour) or was withdrawn. */
export class SignInNeeded extends Error {
  override name = "SignInNeeded";
}
/** No connection. Changes stay on this device until it's back. */
export class Offline extends Error {
  override name = "Offline";
}
/** Drive answered with a problem. The message is written for people. */
export class DriveProblem extends Error {
  override name = "DriveProblem";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class DriveApi {
  constructor(
    private getToken: () => string | null,
    private fetchFn: Fetch = (i, init) => fetch(i, init),
  ) {}

  /** Every file and folder this app can see (with drive.file: only the ones it created). */
  async listAll(): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let page: string | undefined;
    do {
      const q = new URLSearchParams({
        q: "trashed = false",
        fields: `nextPageToken,files(${FIELDS})`,
        pageSize: "1000",
        spaces: "drive",
      });
      if (page) q.set("pageToken", page);
      const res = await this.json<{ files: DriveFile[]; nextPageToken?: string }>(`${API}/files?${q}`);
      out.push(...res.files);
      page = res.nextPageToken;
    } while (page);
    return out;
  }

  async meta(id: string): Promise<DriveFile> {
    return this.json<DriveFile>(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`);
  }

  async text(id: string): Promise<string> {
    const res = await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    // Decode ourselves so a byte-order mark is kept, as with folders.
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
  }

  async blob(id: string): Promise<Blob> {
    return (await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).blob();
  }

  async createFolder(name: string, parent?: string): Promise<DriveFile> {
    return this.json<DriveFile>(`${API}/files?fields=${FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) }),
    });
  }

  async createFile(name: string, parent: string, content: Blob | string, mimeType: string): Promise<DriveFile> {
    const boundary = `stubli${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name, parents: [parent], mimeType });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ]);
    return this.json<DriveFile>(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  async updateContent(id: string, content: Blob | string, mimeType: string): Promise<DriveFile> {
    return this.json<DriveFile>(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`, {
      method: "PATCH",
      headers: { "Content-Type": mimeType },
      body: content,
    });
  }

  async rename(id: string, name: string): Promise<DriveFile> {
    return this.json<DriveFile>(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    return (await this.call(url, init)).json() as Promise<T>;
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    if (!token) throw new SignInNeeded("Sign in to Google to reach your notes.");
    let res: Response;
    try {
      res = await this.fetchFn(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    } catch {
      throw new Offline("No connection right now.");
    }
    if (res.ok) return res;
    if (res.status === 401) throw new SignInNeeded("Google asks you to sign in again.");
    if (res.status === 403 || res.status === 429) {
      const quota = /rate|quota|limit/i.test(await res.clone().text().catch(() => ""));
      throw new DriveProblem(
        quota ? "Google Drive asked us to slow down. Your changes are kept; they'll go up in a moment." : "Google Drive didn't allow this.",
        res.status,
      );
    }
    if (res.status === 404) throw new DriveProblem("That file isn't in your Drive any more.", 404);
    if (res.status >= 500) throw new DriveProblem("Google Drive is having trouble. Your changes are kept; they'll go up in a moment.", res.status);
    throw new DriveProblem(`Google Drive answered with an unexpected problem (${res.status}).`, res.status);
  }
}
