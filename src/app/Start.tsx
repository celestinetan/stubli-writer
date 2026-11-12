import { useEffect, useState } from "react";
import { onUpdateReady, updateNow } from "./offline-copy";
import { canUseFolders, chooseFolder, type FolderStore } from "../store/folder-store";

interface Props {
  /** Set when a folder was chosen before but the browser needs a click to open it again. */
  reopen?: { name: string; ask: () => Promise<FolderStore | null> };
  onFolder: (store: FolderStore) => void;
  /** Signs in to Google; resolves once Drive can be used. */
  onDrive: () => Promise<void>;
  onSample: () => void;
  /** When opened from a notebook: the words for the way back, and the way back. */
  backTo?: string;
  onBack?: () => void;
}

/** "Where should your notes live?" — shown on first open, and when a folder needs a click. */
export function Start({ reopen, onFolder, onDrive, onSample, backTo, onBack }: Props) {
  const [problem, setProblem] = useState<string | null>(null);
  const folders = canUseFolders();

  // Nothing here can be lost, so a newly published version is taken at once (inside a note, it
  // waits for "Reload to update" instead).
  useEffect(() => onUpdateReady(updateNow), []);

  async function pick() {
    setProblem(null);
    const started = performance.now();
    try {
      onFolder(await chooseFolder());
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      const said = e instanceof Error ? `${name ? `${name}: ` : ""}${e.message}` : String(e);
      // Chrome answers "AbortError" both when you close the folder window and when it never
      // opened it. Nobody closes it within half a second, so a quick answer means it never opened.
      const neverOpened = performance.now() - started < 500;
      console.warn("Choose a folder:", said);
      if (neverOpened) {
        setProblem(
          "Chrome didn't open the folder window. This usually means file editing is turned off for this site: click the icon at the left of the address bar, choose Site settings, and set “File editing” to Ask. Then try again.",
        );
      } else if (name === "AbortError") {
        // Either the window was closed, or Chrome refused the chosen folder. Chrome reports both
        // the same way, so say what happened and the two usual reasons, gently.
        setProblem(
          "No folder was opened. If you chose one, Chrome may have refused it: pick a folder inside Documents rather than Documents, Desktop or Downloads itself, and when Chrome asks whether this site may edit files, choose Allow.",
        );
      } else {
        setProblem("That folder couldn't be opened. Try a new, empty folder inside Documents.");
      }
    }
  }

  async function drive() {
    setProblem(null);
    try {
      await onDrive();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }

  async function again() {
    setProblem(null);
    const store = await reopen!.ask().catch(() => null);
    if (store) onFolder(store);
    else setProblem("The browser didn't open the folder. You can try again, or choose it once more.");
  }

  return (
    <main className="start">
      {onBack && (
        <button type="button" className="start-back link" onClick={onBack}>
          <span aria-hidden="true">←</span> {backTo}
        </button>
      )}
      <h1 className="start-title">
        <span className="wordmark">Stubli Writer</span>
      </h1>

      {reopen ? (
        <section className="start-card" aria-labelledby="welcome-back">
          <h2 id="welcome-back">Welcome back</h2>
          <p>Your browser asks for one click before it opens “{reopen.name}” again.</p>
          <div className="start-actions">
            <button type="button" className="primary" onClick={again}>
              Open my notes
            </button>
            <button type="button" className="quiet" onClick={pick}>
              Choose a different folder
            </button>
          </div>
        </section>
      ) : (
        <>
          <h2 className="start-question">{onBack ? "Where should your notes be kept?" : "Where should your notes live?"}</h2>
          <div className="start-options">
            <section className="start-card" aria-labelledby="opt-folder">
              <h3 id="opt-folder">A folder on this computer</h3>
              <p>Plain Markdown files that you own, next to your other documents. Your backups and other writing apps can see them too.</p>
              {folders ? (
                <button type="button" className="primary" onClick={pick}>
                  Choose a folder
                </button>
              ) : (
                <p className="start-note">Folders work in Chrome, Edge or Arc on a computer. This browser can't open them.</p>
              )}
            </section>
            <section className="start-card" aria-labelledby="opt-drive">
              <h3 id="opt-drive">Google Drive</h3>
              <p>
                For writing in any browser, including on your phone. Notes go in a “Stubli Writer” folder in your Drive, and
                stay on this device too, so you can write without a connection.
              </p>
              <button type="button" className="primary" onClick={drive}>
                Continue with Google
              </button>
              <p className="start-note">Stubli Writer can only see the files it makes, never the rest of your Drive.</p>
            </section>
          </div>
        </>
      )}

      {problem && (
        <p className="start-problem" role="alert">
          {problem}
        </p>
      )}

      <p className="start-sample">
        Just looking?{" "}
        <button type="button" className="link" onClick={onSample}>
          Try it with sample notes
        </button>
        . Nothing is saved.
      </p>
      <p className="start-privacy">
        Your notes never reach us. Stubli Writer has no account and stores nothing on a server.{" "}
        <a href="./privacy.html">Privacy and terms</a>
      </p>
    </main>
  );
}
