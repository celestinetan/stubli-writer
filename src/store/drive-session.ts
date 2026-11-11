/** Everything Google Drive mode needs, wired together. */
import { DriveApi } from "./drive-api";
import { DriveStore } from "./drive-store";
import { GoogleAuth } from "./google-auth";
import { idbStore, OfflineStore } from "./offline-store";

export interface DriveSession {
  auth: GoogleAuth;
  drive: DriveStore;
  store: OfflineStore;
}

let session: DriveSession | null = null;

/** One per page: the notes kept on this device and the queue of saves waiting for Drive. */
export function driveSession(): DriveSession {
  if (!session) {
    const auth = new GoogleAuth();
    const drive = new DriveStore(new DriveApi(auth.getToken));
    const store = new OfflineStore(drive, idbStore("notes"), idbStore("pending"));
    window.addEventListener("online", () => void store.flush());
    session = { auth, drive, store };
  }
  return session;
}
