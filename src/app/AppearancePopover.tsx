import { useEffect, useRef, type RefObject } from "react";
import { ACCENTS, DEFAULT_APPEARANCE, FONTS, PAGES, SIZES, type Appearance } from "../appearance";

interface Props {
  open: boolean;
  value: Appearance;
  onChange: (a: Appearance) => void;
  onClose: () => void;
  /** The Aa button: clicks on it toggle the panel, so they don't count as "outside". */
  anchor: RefObject<HTMLButtonElement | null>;
}

/**
 * Aa: text size, font, page colour and accent, in a small panel under the button. It doesn't
 * cover or dim the note, so every change shows on the page itself. Choices are chips with an ink
 * ring and a ✓ when chosen (Stubli DESIGN §2.2); the accent is kept for actions.
 */
export function AppearancePopover({ open, value, onChange, onClose, anchor }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.show();
      d.querySelector<HTMLInputElement>("input:checked")?.focus();
    } else if (!open && d.open) d.close(); // the workspace puts the cursor back in the note
  }, [open]);

  // Escape, or a click anywhere else, closes it (it isn't modal, so the browser doesn't).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!dialog.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, onClose, anchor]);

  const isDefault = (Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[]).every((k) => value[k] === DEFAULT_APPEARANCE[k]);

  return (
    <dialog ref={dialog} className="popover appearance-popover" aria-labelledby="appearance-title">
      <header className="popover-head">
        <h2 id="appearance-title">Appearance</h2>
        <button
          type="button"
          className="sheet-close"
          onClick={onClose}
        >
          Done
        </button>
      </header>

      <fieldset className="choices">
        <legend>Text size</legend>
        <div className="choice-row">
          {SIZES.map((s) => (
            <label key={s.id} className="choice choice-size">
              <input type="radio" name="size" value={s.id} checked={value.size === s.id} onChange={() => onChange({ ...value, size: s.id })} />
              <span className="choice-sample" data-sample-size={s.id} aria-hidden="true">
                Aa
              </span>
              <span className="choice-name">{s.name}</span>
              <Tick />
            </label>
          ))}
        </div>
      </fieldset>

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
            <label key={a.id} className="choice choice-accent" title={a.name}>
              <input type="radio" name="accent" value={a.id} checked={value.accent === a.id} onChange={() => onChange({ ...value, accent: a.id })} />
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
