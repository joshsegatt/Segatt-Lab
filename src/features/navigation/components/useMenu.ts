"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared behavior of the top-bar menus: opens on the current item, closes on
 * an outside click or Esc (focus back on the trigger), arrows move between items.
 */
export function useMenu(count: number, current: number) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("[aria-haspopup]")?.focus();
      }
    };
    items.current[current]?.focus();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
    // Focus goes to the current item once, when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const move = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    items.current[(i + step + count) % count]?.focus();
  };

  /** Ref callback for item i. */
  const itemRef = (i: number) => (el: HTMLButtonElement | null) => {
    items.current[i] = el;
  };

  return { open, setOpen, root, itemRef, move };
}
