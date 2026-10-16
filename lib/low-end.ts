import { useSyncExternalStore } from "react";
import { KEY } from "./low-end-script";

/**
 * Low-end mode: lighter visuals for weak devices. It is decided in two steps:
 *
 *  1. Before paint, by LOW_END_INIT_SCRIPT (lib/low-end-script.ts, inlined in app/layout.tsx): a
 *     device with 2 or fewer CPU threads, 2 GB or less memory, Save-Data on,
 *     or reduced motion preferred. `?lowend=1` forces it on (and `?lowend=0`
 *     off) for testing; the choice is kept for the browser session.
 *  2. After load, by probeFrameRate(): if the page averages under 24 fps for
 *     its first two seconds, the mode switches on for the rest of the session.
 *     (Not 40: phones in battery saver draw at 30 fps and are fine.)
 *
 * The mode is the `data-lowend` attribute on <html>. CSS reads it (scroll
 * reveals and entrance animations turn instant); components read it through
 * useLowEnd() (the home scene shows its poster, the particle field runs light).
 */

export function isLowEnd(): boolean {
  return document.documentElement.hasAttribute("data-lowend");
}

export function subscribeLowEnd(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-lowend"] });
  return () => observer.disconnect();
}

const LOW_FPS = 24;
let probe: Promise<void> | null = null;

/**
 * Measures the first ~2 s of frames once per session; under 24 fps on average
 * switches low-end mode on. Resolves when the measurement is done (at once if
 * it was already taken), so heavy work can wait for a clean reading.
 */
export function probeFrameRate(): Promise<void> {
  if (probe) return probe;
  try {
    if (isLowEnd() || sessionStorage.getItem(KEY) !== null) return (probe = Promise.resolve());
  } catch {
    return (probe = Promise.resolve());
  }
  return (probe = new Promise<void>((done) => measure(done)));
}

function measure(done: () => void) {
  const frames: number[] = [];
  let last = 0;
  const step = (t: number) => {
    if (document.hidden) return done(); // a background tab says nothing about the device
    if (last) frames.push(t - last);
    last = t;
    const elapsed = frames.reduce((a, b) => a + b, 0);
    if (elapsed < 2000) {
      requestAnimationFrame(step);
      return;
    }
    // The first frames include start-up work; the average is taken after them.
    const settled = frames.slice(Math.min(10, frames.length >> 2));
    const fps = (settled.length * 1000) / settled.reduce((a, b) => a + b, 0);
    try {
      sessionStorage.setItem(KEY, fps < LOW_FPS ? "1" : "0");
    } catch {}
    if (fps < LOW_FPS) document.documentElement.setAttribute("data-lowend", "");
    done();
  };
  requestAnimationFrame(step);
}

/** Low-end mode, for client components. `onServer` is what renders before the browser has said. */
export function useLowEnd(onServer = false): boolean {
  return useSyncExternalStore(subscribeLowEnd, isLowEnd, () => onServer);
}
