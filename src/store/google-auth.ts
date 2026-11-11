/**
 * Sign in with Google, for Drive only (the drive.file permission: files this app creates).
 *
 * Uses Google Identity Services, loaded only when someone chooses Google Drive. Access lasts
 * about an hour and lives in this page's memory only: nothing long-lived is stored, and there
 * is no secret key in the app.
 */
import { DRIVE_SCOPE, GOOGLE_CLIENT_ID } from "../config";

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): TokenClient;
          hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";
let loading: Promise<void> | null = null;

/** Loads Google's sign-in script once. */
function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Google's sign-in couldn't be loaded. Check the connection and try again."));
    };
    document.head.append(s);
  });
  return loading;
}

export class GoogleAuth {
  private token: string | null = null;
  private expires = 0;

  /** The access token while it's still good (with a minute to spare), otherwise null. */
  getToken = (): string | null => (this.token && Date.now() < this.expires - 60_000 ? this.token : null);

  get signedIn(): boolean {
    return this.getToken() !== null;
  }

  /** Must run from a click: Google opens a small window to ask. */
  async signIn(): Promise<void> {
    await loadScript();
    const oauth2 = window.google!.accounts.oauth2;
    await new Promise<void>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) {
            reject(new Error(r.error === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in didn't work. Try again."));
          } else if (!oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
            reject(new Error("Stubli Writer needs the box ticked that lets it keep its own files in your Drive. Try again and leave it ticked."));
          } else {
            this.token = r.access_token;
            this.expires = Date.now() + Number(r.expires_in ?? 3600) * 1000;
            resolve();
          }
        },
        error_callback: (e) =>
          reject(
            new Error(
              e.type === "popup_closed" ? "The Google window was closed before signing in." : e.type === "popup_failed_to_open" ? "The browser blocked Google's sign-in window. Allow pop-ups for this site and try again." : "Google sign-in didn't work. Try again.",
            ),
          ),
      });
      client.requestAccessToken({ prompt: "" });
    });
  }

  signOut(): void {
    if (this.token) window.google?.accounts.oauth2.revoke(this.token);
    this.token = null;
    this.expires = 0;
  }
}
