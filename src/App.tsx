import { useEffect, useMemo, useState } from "react";
import { applyAppearance, loadAppearance, saveAppearance, type Appearance } from "./appearance";
import { MemoryStore } from "./store/memory-store";
import { reopenFolder, type FolderStore } from "./store/folder-store";
import type { NoteStore } from "./store/store";
import { driveSession } from "./store/drive-session";
import { keepDataOnDevice } from "./app/offline-copy";
import { loadChoice, saveChoice } from "./app/storage-choice";
import { SAMPLE_NOTES } from "./app/samples";
import { Start } from "./app/Start";
import { Workspace } from "./app/Workspace";

type Screen =
  | { kind: "checking" }
  | { kind: "start"; reopen?: { name: string; ask: () => Promise<FolderStore | null> } }
  | { kind: "notes"; store: NoteStore };

export function App() {
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance);
  const [screen, setScreen] = useState<Screen>({ kind: "checking" });
  const sample = useMemo(() => new MemoryStore(SAMPLE_NOTES), []);

  useEffect(() => {
    applyAppearance(appearance);
    saveAppearance(appearance);
  }, [appearance]);

  // Reopen what was used last time on this device.
  useEffect(() => {
    const choice = loadChoice();
    if (choice === "sample") setScreen({ kind: "notes", store: sample });
    // Drive opens straight away with the notes kept on this device; signing in again is one click.
    else if (choice === "drive") setScreen({ kind: "notes", store: driveSession().store });
    else if (choice === "folder") {
      reopenFolder()
        .then((r) => {
          if (!r) setScreen({ kind: "start" });
          else if ("store" in r) setScreen({ kind: "notes", store: r.store });
          else setScreen({ kind: "start", reopen: { name: r.name, ask: r.ask } });
        })
        .catch(() => setScreen({ kind: "start" }));
    } else setScreen({ kind: "start" });
  }, [sample]);

  if (screen.kind === "checking") return null;

  if (screen.kind === "start") {
    return (
      <Start
        reopen={screen.reopen}
        onFolder={(store) => {
          saveChoice("folder");
          setScreen({ kind: "notes", store });
        }}
        onDrive={async () => {
          const { auth, store } = driveSession();
          await auth.signIn();
          // Drive notes are also kept on this device; ask the browser not to clear them.
          void keepDataOnDevice();
          saveChoice("drive");
          setScreen({ kind: "notes", store });
        }}
        onSample={() => {
          saveChoice("sample");
          setScreen({ kind: "notes", store: sample });
        }}
      />
    );
  }

  return (
    <Workspace
      key={screen.store.label}
      store={screen.store}
      appearance={appearance}
      onAppearance={setAppearance}
      onLeave={() => {
        if (screen.store.kind === "drive") driveSession().auth.signOut();
        saveChoice(null);
        setScreen({ kind: "start" });
      }}
    />
  );
}
