import { useEffect, useState } from "react";
import { applyMode, loadMode, saveMode, type Mode } from "./mode";

const MODES: { id: Mode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "paper", label: "Paper" },
];

export function App() {
  const [mode, setMode] = useState<Mode>(loadMode);

  useEffect(() => {
    applyMode(mode);
    saveMode(mode);
  }, [mode]);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">Stubli Writer</span>
        <div className="mode-switch" role="group" aria-label="Reading mode">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <main className="page">
        <h1>The tram to Belém</h1>
        <div className="meta">Tuesday, 11 November · Lisbon trip</div>
        <p>
          The 15 left Praça da Figueira at <span className="gap">TK</span>, full of school children and one man
          carrying a cello case like a passenger of its own. Nobody looked up when the doors jammed.
        </p>
        <div className="note" role="note">
          This is the empty frame of Stubli Writer. Writing comes next: the editor arrives in a later step, and
          nothing you type here is saved yet.
        </div>
      </main>
    </div>
  );
}
