import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  /** Opens a second list in the same menu (Move to…). */
  submenu?: MenuItem[];
  onChoose?: () => void;
  danger?: boolean;
  /** Indent, for folders inside folders in Move to…. */
  depth?: number;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/**
 * A right-click menu, as on a Mac: at the pointer, kept inside the window, arrows to move,
 * Enter to choose, Escape or a click elsewhere to close. "Move to…" opens a second list.
 */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [stack, setStack] = useState<{ title: string; items: MenuItem[] }[]>([]);
  const current = stack.length ? stack[stack.length - 1].items : items;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - el.offsetHeight - 8))}px`;
    el.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
  }, [x, y, stack]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const onScroll = (e: Event) => !box.current?.contains(e.target as Node) && onClose();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  function onKey(e: React.KeyboardEvent) {
    const all = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])") ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") all[(i + 1) % all.length]?.focus();
    else if (e.key === "ArrowUp") all[(i - 1 + all.length) % all.length]?.focus();
    else if (e.key === "Escape") {
      if (stack.length) setStack((s) => s.slice(0, -1));
      else onClose();
    } else if (e.key === "ArrowLeft" && stack.length) setStack((s) => s.slice(0, -1));
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function choose(item: MenuItem) {
    if (item.disabled) return;
    if (item.submenu) setStack((s) => [...s, { title: item.label.replace(/…$/, ""), items: item.submenu! }]);
    else {
      onClose();
      item.onChoose?.();
    }
  }

  return (
    <div ref={box} className="context-menu" role="menu" aria-label={stack.length ? stack[stack.length - 1].title : "Actions"} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}>
      {stack.length > 0 && (
        <button type="button" role="menuitem" className="menu-item menu-back" onClick={() => setStack((s) => s.slice(0, -1))}>
          <span aria-hidden="true">‹</span> {stack[stack.length - 1].title}
        </button>
      )}
      {current.map((item, i) =>
        item.label === "-" ? (
          <hr key={`sep${i}`} className="menu-sep" />
        ) : (
          <button
            key={`${item.label}${i}`}
            type="button"
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            className={`menu-item${item.danger ? " is-danger" : ""}${item.disabled ? " is-disabled" : ""}`}
            data-depth={item.depth || undefined}
            onClick={() => choose(item)}
          >
            {item.label}
            {item.submenu && (
              <span className="menu-more" aria-hidden="true">
                ›
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
