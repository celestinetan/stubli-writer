/**
 * A pretend Google Drive for tests: answers the requests DriveApi makes, keeping files in
 * memory, counting versions like Drive does. It can go offline or expire the sign-in.
 */
import type { Fetch } from "../../src/store/drive-api";

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime: string;
  version: number;
  content: Uint8Array;
  trashed: boolean;
}

export class FakeDrive {
  files = new Map<string, FakeFile>();
  offline = false;
  expired = false;
  requests: string[] = [];
  private next = 1;
  private clock = Date.parse("2026-11-11T10:00:00Z");

  /** Another device (or app) changes a file. */
  editElsewhere(id: string, text: string) {
    const f = this.files.get(id)!;
    f.content = new TextEncoder().encode(text);
    this.touch(f);
  }

  byName(name: string): FakeFile | undefined {
    return [...this.files.values()].find((f) => f.name === name && !f.trashed);
  }

  textOf(name: string): string {
    return new TextDecoder().decode(this.byName(name)!.content);
  }

  /** A file made by this app on another device, directly in a folder. */
  addFile(name: string, parent: string, text: string, mimeType = "text/markdown"): FakeFile {
    const f = this.make(name, mimeType, [parent], new TextEncoder().encode(text));
    return f;
  }

  fetch: Fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    this.requests.push(`${method} ${url.pathname}${url.search}`);
    if (this.offline) throw new TypeError("Failed to fetch");
    if (this.expired) return new Response("{}", { status: 401 });
    const headers = new Headers(init.headers);
    if (!String(headers.get("authorization")).startsWith("Bearer ")) return new Response("{}", { status: 401 });

    const m = /\/files(?:\/([^/?]+))?$/.exec(url.pathname)!;
    const id = m[1] ? decodeURIComponent(m[1]) : undefined;
    const upload = url.pathname.startsWith("/upload/");

    if (!id && method === "GET") {
      const files = [...this.files.values()].filter((f) => !f.trashed).map((f) => this.meta(f));
      return json({ files });
    }
    if (!id && method === "POST" && !upload) {
      const body = JSON.parse(String(init.body));
      return json(this.meta(this.make(body.name, body.mimeType, body.parents ?? ["my-drive-root"], new Uint8Array())));
    }
    if (!id && method === "POST" && upload) {
      // Parse multipart/related on raw bytes, so pictures arrive intact.
      const raw = new Uint8Array(await new Response(init.body as BodyInit).arrayBuffer());
      const boundary = /boundary=(\S+)/.exec(headers.get("content-type") ?? "")![1];
      const enc = new TextEncoder();
      const sep = enc.encode(`--${boundary}`);
      const blank = enc.encode("\r\n\r\n");
      const p1 = indexOf(raw, sep, 0);
      const p2 = indexOf(raw, sep, p1 + sep.length);
      const end = indexOf(raw, enc.encode(`\r\n--${boundary}--`), p2);
      const metaStart = indexOf(raw, blank, p1) + blank.length;
      const meta = JSON.parse(new TextDecoder().decode(raw.slice(metaStart, p2)).trim());
      const contentStart = indexOf(raw, blank, p2) + blank.length;
      return json(this.meta(this.make(meta.name, meta.mimeType, meta.parents, raw.slice(contentStart, end))));
    }

    const f = id ? this.files.get(id) : undefined;
    if (!f || f.trashed) return new Response("{}", { status: 404 });
    if (method === "GET" && url.searchParams.get("alt") === "media") return new Response(f.content.slice());
    if (method === "GET") return json(this.meta(f));
    if (method === "PATCH" && upload) {
      f.content = new Uint8Array(await new Response(init.body as BodyInit).arrayBuffer());
      this.touch(f);
      return json(this.meta(f));
    }
    if (method === "PATCH") {
      const body = JSON.parse(String(init.body));
      if (body.name) f.name = body.name;
      this.touch(f);
      return json(this.meta(f));
    }
    return new Response("{}", { status: 400 });
  };

  private make(name: string, mimeType: string, parents: string[], content: Uint8Array): FakeFile {
    const f: FakeFile = { id: `id${this.next++}`, name, mimeType, parents, modifiedTime: "", version: 0, content, trashed: false };
    this.files.set(f.id, f);
    this.touch(f);
    return f;
  }

  private touch(f: FakeFile) {
    f.version++;
    this.clock += 1000;
    f.modifiedTime = new Date(this.clock).toISOString();
  }

  private meta(f: FakeFile) {
    return { id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, modifiedTime: f.modifiedTime, version: String(f.version) };
  }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function indexOf(hay: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
