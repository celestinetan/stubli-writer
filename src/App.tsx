import { useEffect, useMemo, useState } from "react";
import { applyMode, loadMode, saveMode, type Mode } from "./mode";
import { Editor, type SaveState } from "./editor/Editor";
import { MemoryStore } from "./store/memory-store";
import { SAMPLE_NOTE } from "./sample";

const MODES: { id: Mode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "paper", label: "Paper" },
];

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Not saved yet",
  error: "Couldn't save",
};

export function App() {
  const [mode, setMode] = useState<Mode>(loadMode);
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({ state: "saved" });
  // Until notes can live in a folder (milestone 3), the editor works on a sample note in memory.
  const store = useMemo(() => new MemoryStore({ "Sample.md": SAMPLE_NOTE }), []);

  useEffect(() => {
    applyMode(mode);
    saveMode(mode);
  }, [mode]);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">Stubli Writer</span>
        <span className={`save-state${save.state === "error" ? " error" : ""}`} role="status" title={save.message}>
          {SAVE_LABEL[save.state]}
        </span>
        <div className="mode-switch" role="group" aria-label="Reading mode">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <main className="page">
        <div className="note" role="note">
          A sample note to try the editor. It's kept in this page only: nothing is saved to your computer yet.
        </div>
        <Editor store={store} path="Sample.md" initialText={SAMPLE_NOTE} onSaveState={(state, message) => setSave({ state, message })} />
      </main>
    </div>
  );
}
