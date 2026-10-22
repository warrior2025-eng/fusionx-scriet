"use client";

import { useCallback, useEffect, useRef } from "react";
import { logInterviewEvents } from "@/actions/interview";
import type { IntegrityType } from "@/lib/interview/shared";

type Queued = { type: IntegrityType; at: string; detail?: Record<string, string | number | boolean> };

/**
 * Integrity signals from the candidate's own page, while the interview is on:
 * tab and window focus, leaving fullscreen, copy / paste / cut / right-click
 * (also blocked), and a second screen where the browser can tell (Chromium's
 * screen.isExtended). Batched every 3 seconds; the same event within 1.5
 * seconds is counted once. Nothing about what is typed or shown is sent.
 *
 * Clicking inside the video call moves focus into its frame, which the
 * browser reports as the window losing focus: that is not counted.
 */
export function useIntegrity(bookingId: string, active: boolean, opts: { strictFullscreen: boolean; onFullscreenExit?: () => void }) {
  const queue = useRef<Queued[]>([]);
  const last = useRef<Partial<Record<IntegrityType, number>>>({});
  const extended = useRef<boolean | null>(null);
  const { strictFullscreen, onFullscreenExit } = opts;

  const flush = useCallback(async () => {
    if (queue.current.length === 0) return;
    const batch = queue.current.splice(0, 50);
    const res = await logInterviewEvents(bookingId, batch).catch(() => null);
    // A network hiccup: keep them for the next flush (at most 200 waiting).
    if (!res || (!res.ok && res.message !== "Invalid events.")) queue.current = [...batch, ...queue.current].slice(0, 200);
  }, [bookingId]);

  const record = useCallback((type: IntegrityType, detail?: Queued["detail"]) => {
    const now = Date.now();
    if (now - (last.current[type] ?? 0) < 1500) return;
    last.current[type] = now;
    queue.current.push({ type, at: new Date(now).toISOString(), ...(detail ? { detail } : {}) });
    if (queue.current.length >= 20) void flush();
  }, [flush]);

  useEffect(() => {
    if (!active) return;
    const onVisibility = () => {
      record(document.hidden ? "tab_hidden" : "tab_visible");
      if (document.hidden) void flush();
    };
    const onBlur = () => {
      // Focus moving into the video frame is not the candidate leaving the page.
      setTimeout(() => {
        const el = document.activeElement as HTMLElement | null;
        if (el?.tagName === "IFRAME" && el.closest("[data-interview-frame]")) return;
        if (!document.hidden) record("window_blur");
      }, 0);
    };
    const onFocus = () => record("window_focus");
    const onFullscreen = () => {
      if (!document.fullscreenElement && strictFullscreen) {
        record("fullscreen_exit");
        onFullscreenExit?.();
      }
    };
    const block = (type: "copy" | "paste" | "cut" | "contextmenu") => (e: Event) => {
      e.preventDefault();
      record(type);
    };
    const onCopy = block("copy");
    const onPaste = block("paste");
    const onCut = block("cut");
    const onMenu = block("contextmenu");
    const checkScreens = () => {
      const screenInfo = window.screen as Screen & { isExtended?: boolean };
      if (typeof screenInfo.isExtended !== "boolean") return;
      if (screenInfo.isExtended && extended.current !== true) record("extra_screen");
      extended.current = screenInfo.isExtended;
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onMenu);
    const screenTarget = window.screen as Screen & Partial<EventTarget>;
    try {
      screenTarget.addEventListener?.("change", checkScreens);
    } catch {}
    checkScreens();
    const screensTimer = window.setInterval(checkScreens, 15_000);
    const flushTimer = window.setInterval(() => void flush(), 3000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onMenu);
      try {
        screenTarget.removeEventListener?.("change", checkScreens);
      } catch {}
      window.clearInterval(screensTimer);
      window.clearInterval(flushTimer);
      void flush();
    };
  }, [active, record, flush, strictFullscreen, onFullscreenExit]);

  return { record, flush };
}
