"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * The room's popups (reactions, the host menu, a person's "⋯" menu, the device picker):
 * one open at a time, in a layer above everything, next to the button that opened it.
 * They close on a press outside, on Esc, when an option is chosen and when another opens.
 */
type Ctx = { open: string | null; keys: boolean; set: (id: string | null, keys?: boolean) => void };
const PopupContext = createContext<Ctx>({ open: null, keys: false, set: () => {} });

export function PopupProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: string | null; keys: boolean }>({ open: null, keys: false });
  const set = useCallback((open: string | null, keys = false) => setState({ open, keys }), []);
  return <PopupContext.Provider value={{ ...state, set }}>{children}</PopupContext.Provider>;
}

/** One popup: whether it is open, and the props for the button that opens it. */
export function usePopup(id: string) {
  const { open, set } = useContext(PopupContext);
  const ref = useRef<HTMLButtonElement>(null);
  const isOpen = open === id;
  const close = useCallback(() => set(null), [set]);
  // Opened with Enter or Space (a click with no pointer), the first option takes the focus.
  const toggle = useCallback((e?: { detail?: number }) => set(isOpen ? null : id, e?.detail === 0), [set, isOpen, id]);
  return { id, open: isOpen, ref, close, toggle, trigger: { ref, "aria-expanded": isOpen, "aria-haspopup": true as const, "data-popup-trigger": id } };
}

const EDGE = 8;
const GAP = 6;
const ITEMS = '[role^="menuitem"], button:not([disabled]), input, [tabindex="0"]';

export function Popup({
  popup,
  label,
  role = "menu",
  align = "end",
  className,
  children,
}: {
  popup: ReturnType<typeof usePopup>;
  label: string;
  role?: "menu" | "group" | "dialog";
  align?: "start" | "center" | "end";
  className?: string;
  children: React.ReactNode;
}) {
  const { open, ref: anchor, close, id } = popup;
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number; maxH: number; maxW: number } | null>(null);
  const { open: current, keys, set } = useContext(PopupContext);

  // Kept next to its button every frame, so it follows the tile when the layout changes;
  // when the button is gone (the tile left), it closes.
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      const button = anchor.current;
      const menu = box.current;
      if (!button || !button.isConnected) {
        close();
        return;
      }
      const r = button.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (menu) {
        const maxW = vw - EDGE * 2;
        const w = Math.min(menu.scrollWidth, maxW);
        const h = menu.scrollHeight;
        const below = vh - r.bottom - GAP - EDGE;
        const above = r.top - GAP - EDGE;
        const down = h <= below || below >= above;
        const maxH = Math.max(80, down ? below : above);
        const top = down ? r.bottom + GAP : Math.max(EDGE, r.top - GAP - Math.min(h, maxH));
        let left = align === "start" ? r.left : align === "center" ? r.left + r.width / 2 - w / 2 : r.right - w;
        // Flip to the other side when it would run off the screen, then keep it inside.
        if (align === "end" && left < EDGE) left = r.left;
        if (align === "start" && left + w > vw - EDGE) left = r.right - w;
        left = Math.min(Math.max(EDGE, left), vw - EDGE - w);
        setAt((was) => (was && was.top === top && was.left === left && was.maxH === maxH && was.maxW === maxW ? was : { top, left, maxH, maxW }));
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [open, anchor, close, align]);

  // A press outside closes it. A press on the video (not on another popup's button) does nothing else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || box.current?.contains(target) || anchor.current?.contains(target)) return;
      if (target.closest?.("[data-popup-trigger]")) return;
      close();
      if (target.closest?.("[data-popup-calm]")) {
        const swallow = (c: MouseEvent) => {
          c.stopPropagation();
          c.preventDefault();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 600);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        anchor.current?.focus();
        return;
      }
      const menu = box.current;
      if (!menu) return;
      const items = [...menu.querySelectorAll<HTMLElement>(ITEMS)];
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const inside = menu.contains(document.activeElement);
      // Keys typed elsewhere (the chat box, say) stay there.
      if (!inside && document.activeElement !== anchor.current) return;
      const go = (i: number) => {
        e.preventDefault();
        items[(i + items.length) % items.length].focus();
      };
      if (e.key === "ArrowDown" || (e.key === "ArrowRight" && role === "group")) go(at + 1);
      else if (e.key === "ArrowUp" || (e.key === "ArrowLeft" && role === "group")) go(at - 1);
      else if (e.key === "Home" && inside) go(0);
      else if (e.key === "End" && inside) go(items.length - 1);
      else if (e.key === "Tab") go(e.shiftKey ? (inside ? at - 1 : items.length - 1) : at + 1);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor, close, role]);

  // Opened from the keyboard: the first option takes the focus once the popup is in place.
  const placed = at !== null;
  useEffect(() => {
    const menu = box.current;
    if (open && keys && placed && menu && !menu.contains(document.activeElement)) menu.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [open, keys, placed]);

  // Gone with its tile: nothing is left open for a button that no longer exists.
  useEffect(
    () => () => {
      window.setTimeout(() => {
        if (current === id && !document.querySelector(`[data-popup-trigger="${CSS.escape(id)}"]`)) set(null);
      }, 0);
    },
    [current, id, set],
  );

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={box}
      role={role}
      aria-label={label}
      data-popup={id}
      onClick={(e) => {
        // An option was chosen: close, and the focus goes back to the button.
        if ((e.target as Element).closest?.('[role^="menuitem"]:not([aria-haspopup]), [data-popup-close]')) {
          close();
          anchor.current?.focus({ preventScroll: true });
        }
      }}
      className={cn("fixed z-90 overflow-y-auto overscroll-contain border border-line bg-surface text-ink shadow-xl", !at && "invisible", className)}
      style={at ? { top: at.top, left: at.left, maxHeight: at.maxH, maxWidth: at.maxW } : { top: 0, left: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}
