"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { BRAND } from "./fusionx-palette";
import {
  FUSIONX_SCENE_MESSAGE,
  FUSIONX_SCENE_SOURCE_URL,
  buildFusionXSceneDocument,
} from "./fusionx-scene-document";

/**
 * Decorative 3D backdrop for the home hero: ThreeUI's "Living Green" scene,
 * recoloured to the FusionX logo (see fusionx-palette.ts).
 *
 * It is a background only. The heading, copy and CTAs stay real HTML in the
 * page, layered above this; the frame is hidden from assistive tech and taken
 * out of the tab order.
 *
 *  - The static poster is what renders on the server, before the scene has
 *    loaded, under prefers-reduced-motion, and if WebGL or the scene fails.
 *  - The scene runs in a sandboxed iframe (scripts only, no same-origin
 *    access) and mounts after hydration, so it never blocks first paint.
 *  - Rendering is paused whenever the hero is scrolled out of view or the tab
 *    is hidden.
 *  - It also drives the pointer float: it writes --px / --py on its parent
 *    section for the `.hero-float` layers and relays the pointer to the scene.
 */

const POSTER_URL = "/hero/fusionx-hero-poster.webp";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

// One fetch + build per page load, shared across remounts.
let sceneDocument: Promise<string> | null = null;
function loadSceneDocument() {
  sceneDocument ??= fetch(FUSIONX_SCENE_SOURCE_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`FusionX hero: scene source returned ${res.status}`);
      return res.text();
    })
    .then((authored) => buildFusionXSceneDocument(authored, window.location.origin))
    .catch((err) => {
      sceneDocument = null;
      throw err;
    });
  return sceneDocument;
}

export function FusionXHero({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  // Treated as reduced on the server so the scene only ever mounts client-side.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
  const showScene = !reducedMotion && state !== "failed" && srcDoc !== null;

  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    loadSceneDocument().then(
      (doc) => !cancelled && setSrcDoc(doc),
      (err) => {
        console.warn(err);
        if (!cancelled) setState("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (!showScene) return;
    const host = hostRef.current;
    if (!host) return;

    let inView = true;
    const post = () =>
      frameRef.current?.contentWindow?.postMessage(
        { type: FUSIONX_SCENE_MESSAGE, paused: !inView || document.hidden },
        "*",
      );

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== FUSIONX_SCENE_MESSAGE) return;
      if (event.data.state === "ready") {
        setState("ready");
        post();
      } else if (event.data.state === "failed") {
        setState("failed");
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
      post();
    });
    observer.observe(host);
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", post);
    return () => {
      observer.disconnect();
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", post);
    };
  }, [showScene]);

  // Pointer float. The hero section (this component's parent) owns the
  // pointer: its eased position is written to --px / --py there (-1…1), which
  // is what every `.hero-float` layer rides on — the same scheme, easing and
  // rounding as the authored page — and the raw position is relayed to the
  // scene so the moss, pollen trail and camera react exactly as they would to
  // a direct pointer.
  useEffect(() => {
    if (reducedMotion) return;
    const section = hostRef.current?.parentElement;
    if (!section) return;

    const pointer = { x: 0, y: 0 };
    const smooth = { x: 0, y: 0 };
    let raf = 0;
    let lastX = 0;
    let lastY = 0;

    const tick = () => {
      smooth.x += (pointer.x - smooth.x) * 0.055;
      smooth.y += (pointer.y - smooth.y) * 0.055;
      const nx = Math.round(smooth.x * 1000) / 1000;
      const ny = Math.round(smooth.y * 1000) / 1000;
      if (nx !== lastX || ny !== lastY) {
        lastX = nx;
        lastY = ny;
        section.style.setProperty("--px", String(nx));
        section.style.setProperty("--py", String(ny));
      }
      const settled = Math.abs(pointer.x - smooth.x) < 0.0005 && Math.abs(pointer.y - smooth.y) < 0.0005;
      raf = settled ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const relay = (message: object) =>
      frameRef.current?.contentWindow?.postMessage({ type: FUSIONX_SCENE_MESSAGE, ...message }, "*");

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = section.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      pointer.x = (x / r.width) * 2 - 1;
      pointer.y = (y / r.height) * 2 - 1;
      relay({ pointer: { x, y } });
      wake();
    };
    const onLeave = () => {
      pointer.x = pointer.y = 0;
      relay({ leave: true });
      wake();
    };

    section.addEventListener("pointermove", onMove, { passive: true });
    section.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      section.style.removeProperty("--px");
      section.style.removeProperty("--py");
    };
  }, [reducedMotion]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      data-state={showScene ? state : "poster"}
      className={cn("absolute inset-0 overflow-hidden bg-cover bg-center", className)}
      style={{ backgroundColor: BRAND.navy, backgroundImage: `url(${POSTER_URL})` }}
    >
      {showScene && (
        <iframe
          ref={frameRef}
          title="FusionX hero scene"
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          tabIndex={-1}
          loading="eager"
          // The host section owns the pointer and relays it (see the float effect
          // above), so the frame itself never intercepts input or scrolling.
          className={cn(
            "absolute inset-0 block h-full w-full border-0 pointer-events-none transition-opacity duration-700",
            state === "ready" ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
