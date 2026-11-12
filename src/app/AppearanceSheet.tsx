import { useEffect, useRef } from "react";
import { ACCENTS, DEFAULT_APPEARANCE, FONTS, PAGES, type Appearance } from "../appearance";

interface Props {
  open: boolean;
  value: Appearance;
  onChange: (a: Appearance) => void;
  onClose: () => void;
}

/**
 * Aa: the writing font, the page colour and the accent. Changes show at once on the page behind.
 * Choices are chips with an ink ring and a ✓ when chosen (Stubli DESIGN §2.2); the accent is
 * kept for actions.
 */
export function AppearanceSheet({ open, value, onChange, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const isDefault =
    value.font === DEFAULT_APPEARANCE.font && value.page === DEFAULT_APPEARANCE.page && value.accent === DEFAULT_APPEARANCE.accent;

  return (
    <dialog
      ref={dialog}
      className="sheet appearance-sheet"
      aria-labelledby="appearance-title"
      // The browser announces a close a moment late; if the sheet is open again by then, ignore it.
      onClose={() => !dialog.current?.open && onClose()}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="appearance-title">Appearance</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Done
          </button>
        </header>

        <p className="appearance-preview" aria-hidden="true">
          The 15 left Praça da Figueira at <span className="gap">TK</span>, full of school children.
        </p>

        <fieldset className="choices">
          <legend>Font</legend>
          <div className="choice-row">
            {FONTS.map((f) => (
              <label key={f.id} className="choice choice-font">
                <input type="radio" name="font" value={f.id} checked={value.font === f.id} onChange={() => onChange({ ...value, font: f.id })} />
                <span className="choice-sample" data-sample-font={f.id} aria-hidden="true">
                  Ag
                </span>
                <span className="choice-name">{f.name}</span>
                <span className="choice-note">{f.note}</span>
                <Tick />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="choices">
          <legend>Page</legend>
          <div className="choice-row">
            {PAGES.map((p) => (
              <label key={p.id} className="choice choice-page">
                <input type="radio" name="page" value={p.id} checked={value.page === p.id} onChange={() => onChange({ ...value, page: p.id })} />
                <span className="choice-swatch" data-swatch-page={p.id} aria-hidden="true" />
                <span className="choice-name">{p.name}</span>
                <Tick />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="choices">
          <legend>Accent</legend>
          <div className="choice-row">
            {ACCENTS.map((a) => (
              <label key={a.id} className="choice choice-accent">
                <input
                  type="radio"
                  name="accent"
                  value={a.id}
                  checked={value.accent === a.id}
                  onChange={() => onChange({ ...value, accent: a.id })}
                />
                <span className="choice-dot" data-swatch-accent={a.id} aria-hidden="true" />
                <span className="choice-name">{a.name}</span>
                <Tick />
              </label>
            ))}
          </div>
          <p className="choices-hint">For buttons, gap chips and the cursor.</p>
        </fieldset>

        <p className="appearance-foot">
          Saved on this device.{" "}
          {!isDefault && (
            <button type="button" className="link" onClick={() => onChange({ ...DEFAULT_APPEARANCE })}>
              Go back to the default look
            </button>
          )}
        </p>
      </div>
    </dialog>
  );
}

function Tick() {
  return (
    <svg className="choice-tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
