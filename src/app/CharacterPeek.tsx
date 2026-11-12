import { useEffect, useLayoutEffect, useRef } from "react";
import type { Character } from "./characters";

interface Props {
  character: Character;
  /** Where the clicked name is on screen. */
  at: DOMRect;
  onClose: () => void;
  onOpenCard: () => void;
  onShowBoard: () => void;
}

/** A small card for a name clicked in the writing: who they are and who they're connected to. */
export function CharacterPeek({ character: c, at, onClose, onOpenCard, onShowBoard }: Props) {
  const box = useRef<HTMLDivElement>(null);

  // Under the name, or above it when there's no room; never off the side of the window.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(16, Math.min(at.left, window.innerWidth - w - 16));
    const below = at.bottom + 8;
    const top = below + h > window.innerHeight - 16 ? Math.max(16, at.top - h - 8) : below;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const onScroll = () => onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [onClose]);

  return (
    <div ref={box} className="character-peek" role="dialog" aria-label={c.name} data-tint={c.tint}>
      <p className="card-name is-static">
        <span className="card-dot" aria-hidden="true" />
        {c.name}
      </p>
      {c.role && <p className="card-role">{c.role}</p>}
      <p className={`card-summary${c.summary ? "" : " is-empty"}`}>{c.summary || "No summary yet."}</p>
      {c.connections.length > 0 && (
        <ul className="card-links" aria-label={`${c.name}'s connections`}>
          {c.connections.map((x) => (
            <li key={x.path ?? x.name}>
              <span className="chip is-plain">
                {x.name}
                {x.label && <span className="chip-label"> · {x.label}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="peek-actions">
        <button type="button" className="link card-open" onClick={onOpenCard}>
          Open card
        </button>
        <button type="button" className="link card-open" onClick={onShowBoard}>
          See everyone
        </button>
      </p>
    </div>
  );
}
