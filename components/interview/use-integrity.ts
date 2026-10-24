"use client";

import { useCallback, useEffect, useRef } from "react";
import { logInterviewEvents } from "@/actions/interview";
import { fullscreenElement, onFullscreenChange } from "@/lib/interview/device";
import type { IntegrityType } from "@/lib/interview/shared";

type Queued = { type: IntegrityType; at: string; detail?: Record<string, string | number | boolean> };

/**
 * Integrity signals from the candidate's own page, while the interview is on.
 *
 * A website cannot see or block other apps or tabs. It can tell when its own
 * page stops being the one on screen: the tab or app is switched (also the
 * home button and, on most phones, the notification shade), the window loses
 * focus, or fullscreen is left. Each such time away is one "left_screen"
 * (sent at once, so the panel sees it live) and one "returned_screen" with
 * how long it lasted.
 *
 * Not counted, but recorded: the browser's own permission prompt in the
 * first 30 seconds after joining ("permission_prompt"; it takes focus but the
 * page stays visible), and reconnects after a network drop (logged by the
 * call). A focus loss under a second with the page still visible is ignored.
 *
 * Also: copy / paste / cut / right-click (blocked), and a second screen where
 * the browser can tell (Chromium's screen.isExtended). Sent every 3 seconds,
 * and at once when the page is hidden.
 */
export function useIntegrity(
  bookingId: string,
  active: boolean,
  opts: {
    strictFullscreen: boolean;
    onFullscreenExit?: () => void;
    /** Back on the interview screen after a counted absence (seconds away, how many times so far). */
    onReturn?: (seconds: number, times: number) => void;
    /** The server took them out of the room (the day's limit for leaving, or the panel). */
    onRemoved?: (reason: "left_screen" | "panel") => void;
  },
) {
  const queue = useRef<Queued[]>([]);
  const last = useRef<Partial<Record<IntegrityType, number>>>({});
  const extended = useRef<boolean | null>(null);
  const { strictFullscreen, onFullscreenExit, onReturn, onRemoved } = opts;

  const flush = useCallback(async () => {
    if (queue.current.length === 0) return;
    const batch = queue.current.splice(0, 50);
    const res = await logInterviewEvents(bookingId, batch).catch(() => null);
    // A network hiccup: keep them for the next flush (at most 200 waiting).
    if (!res || (!res.ok && res.message !== "Invalid events.")) queue.current = [...batch, ...queue.current].slice(0, 200);
    if (res?.ok && res.removed) onRemoved?.(res.removed);
  }, [bookingId, onRemoved]);

  /** `every`: no "same event within 1.5 seconds" merging (each absence counts). */
  const record = useCallback(
    (type: IntegrityType, detail?: Queued["detail"], every = false) => {
      const now = Date.now();
      if (!every && now - (last.current[type] ?? 0) < 1500) return;
      last.current[type] = now;
      queue.current.push({ type, at: new Date(now).toISOString(), ...(detail ? { detail } : {}) });
      if (queue.current.length >= 20) void flush();
    },
    [flush],
  );

  useEffect(() => {
    if (!active) return;
    const joinedAt = Date.now();
    let away: { since: number; cause: string; logged: boolean; prompt: boolean } | null = null;
    let times = 0;
    let pending = 0;

    const awayNow = () =>
      document.hidden ? "tab or app switched" : !document.hasFocus() ? "window lost focus" : strictFullscreen && !fullscreenElement() ? "left fullscreen" : null;

    const start = (state: NonNullable<typeof away>) => {
      if (state.logged) return;
      state.logged = true;
      if (state.prompt) return; // logged as permission_prompt on return
      record("left_screen", { cause: state.cause }, true);
      void flush();
    };

    const check = () => {
      const cause = awayNow();
      const now = Date.now();
      if (cause && !away) {
        // Visible but unfocused, early on: the browser's permission prompt.
        const prompt = !document.hidden && now - joinedAt < 30_000;
        away = { since: now, cause, logged: false, prompt };
        const state = away;
        // Hidden: log at once (a phone may pause the page). Only unfocused: wait a second (short focus blips are ignored).
        if (document.hidden) start(state);
        else pending = window.setTimeout(() => away === state && start(state), 1000);
      } else if (!cause && away) {
        window.clearTimeout(pending);
        const state = away;
        away = null;
        if (!state.logged) return; // under a second: ignored
        const seconds = Math.round((now - state.since) / 100) / 10;
        if (state.prompt) {
          record("permission_prompt", { seconds }, true);
        } else {
          times += 1;
          record("returned_screen", { seconds, cause: state.cause }, true);
          onReturn?.(seconds, times);
        }
        void flush();
      }
    };

    const onVisibility = () => check();
    const onFullscreen = () => {
      if (!fullscreenElement() && strictFullscreen) {
        record("fullscreen_exit");
        onFullscreenExit?.();
      }
      check();
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
    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    window.addEventListener("pagehide", check);
    const offFullscreen = onFullscreenChange(onFullscreen);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onMenu);
    const screenTarget = window.screen as Screen & Partial<EventTarget>;
    try {
      screenTarget.addEventListener?.("change", checkScreens);
    } catch {}
    checkScreens();
    // Events can be missed (a phone waking up): look again every second.
    const checkTimer = window.setInterval(check, 1000);
    const screensTimer = window.setInterval(checkScreens, 15_000);
    const flushTimer = window.setInterval(() => void flush(), 3000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("pagehide", check);
      offFullscreen();
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onMenu);
      try {
        screenTarget.removeEventListener?.("change", checkScreens);
      } catch {}
      window.clearTimeout(pending);
      window.clearInterval(checkTimer);
      window.clearInterval(screensTimer);
      window.clearInterval(flushTimer);
      void flush();
    };
  }, [active, record, flush, strictFullscreen, onFullscreenExit, onReturn]);

  return { record, flush };
}
