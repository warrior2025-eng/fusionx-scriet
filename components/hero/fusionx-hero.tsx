"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { FUSIONX_SCENE_PALETTES, type FusionXSceneTheme } from "./fusionx-palette";
import {
  FUSIONX_SCENE_MESSAGE,
  FUSIONX_SCENE_SOURCE_URL,
  buildFusionXSceneDocument,
} from "./fusionx-scene-document";

/**
 * The home page's 3D backdrop: ThreeUI's "Living Green" scene, recoloured to
 * the FusionX logo (see fusionx-palette.ts) — a night scene on navy in the
 * dark theme, the same world in daylight on pale blue in the light theme.
 * Mount it once, inside a fixed full-viewport layer: it is one WebGL context
 * and one render loop.
 *
 * It is a background only. All copy stays real HTML in the page, layered
 * above this; the frame is hidden from assistive tech, taken out of the tab
 * order, and never receives input itself.
 *
 *  - The static poster (`.scene-poster` in globals.css, one image per theme)
 *    is what renders on the server, before the scene has loaded, under
 *    prefers-reduced-motion, and if WebGL or the scene fails.
 *  - The scene runs in a sandboxed iframe (scripts only, no same-origin
 *    access) and mounts after hydration, so it never blocks first paint.
 *    Switching theme rebuilds it with the other palette.
 *  - Rendering pauses when the tab is hidden, while the page is being
 *    scrolled, and when nothing shows the scene.
 *    What "shows the scene" is declared by the page: elements marked
 *    `data-scene-window` are see-through to it; `data-scene-window="dark"`
 *    marks one that is only see-through in the dark theme (it is opaque in
 *    the light theme). With no windows declared, the component's own box is
 *    used.
 *  - It owns the pointer: the raw position is relayed to the scene (moss,
 *    pollen trail, camera), and the eased position is written as --px / --py
 *    (-1…1) on `floatTarget`, which the `.hero-float` layers ride on — the
 *    same scheme, easing and rounding as the authored page.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const currentTheme = (): FusionXSceneTheme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

// One fetch per page load; one built document per theme.
let authoredSource: Promise<string> | null = null;
const sceneDocuments = new Map<FusionXSceneTheme, string>();
async function loadSceneDocument(theme: FusionXSceneTheme) {
  const cached = sceneDocuments.get(theme);
  if (cached) return cached;
  authoredSource ??= fetch(FUSIONX_SCENE_SOURCE_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`FusionX hero: scene source returned ${res.status}`);
      return res.text();
    })
    .catch((err) => {
      authoredSource = null;
      throw err;
    });
  const doc = buildFusionXSceneDocument(await authoredSource, window.location.origin, FUSIONX_SCENE_PALETTES[theme]);
  sceneDocuments.set(theme, doc);
  return doc;
}

type SceneStatus = "loading" | "ready" | "failed";

export function FusionXHero({ className, floatTarget }: { className?: string; floatTarget?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Both are tagged with the theme they belong to, so a theme switch simply
  // makes them stale (back to "loading") until the new scene reports in.
  const [scene, setScene] = useState<{ theme: FusionXSceneTheme; doc: string } | null>(null);
  const [report, setReport] = useState<{ theme: FusionXSceneTheme; status: SceneStatus } | null>(null);

  // Treated as reduced on the server so the scene only ever mounts client-side.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, (): FusionXSceneTheme => "dark");

  const srcDoc = scene?.theme === theme ? scene.doc : null;
  const status: SceneStatus = report?.theme === theme ? report.status : "loading";
  const showScene = !reducedMotion && status !== "failed" && srcDoc !== null;

  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    loadSceneDocument(theme).then(
      (doc) => !cancelled && setScene({ theme, doc }),
      (err) => {
        console.warn(err);
        if (!cancelled) setReport({ theme, status: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reducedMotion, theme]);

  // Pause / resume, and the scene's ready / failed reports.
  useEffect(() => {
    if (!showScene) return;
    const host = hostRef.current;
    if (!host) return;

    const declared = Array.from(document.querySelectorAll<HTMLElement>("[data-scene-window]"));
    const windows = declared.length ? declared : [host];
    const inView = new Set<Element>(windows);

    const sceneShowing = () => {
      for (const el of inView) {
        if (!(theme === "light" && (el as HTMLElement).dataset.sceneWindow === "dark")) return true;
      }
      return false;
    };
    // Rendering also rests while the page is being scrolled: drawing a
    // full-screen WebGL frame under moving content is what made scrolling
    // stutter. It picks up again a moment after the scroll stops.
    let scrolling = false;
    let scrollTimer = 0;
    const post = () =>
      frameRef.current?.contentWindow?.postMessage(
        { type: FUSIONX_SCENE_MESSAGE, paused: document.hidden || scrolling || !sceneShowing() },
        "*",
      );
    const onScroll = () => {
      if (!scrolling) {
        scrolling = true;
        post();
      }
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrolling = false;
        post();
      }, 160);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== FUSIONX_SCENE_MESSAGE) return;
      if (event.data.state === "ready") {
        setReport({ theme, status: "ready" });
        post();
      } else if (event.data.state === "failed") {
        setReport({ theme, status: "failed" });
      }
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inView.add(entry.target);
        else inView.delete(entry.target);
      }
      post();
    });
    windows.forEach((el) => observer.observe(el));
    window.addEventListener("message", onMessage);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", post);
    return () => {
      window.clearTimeout(scrollTimer);
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", post);
    };
  }, [showScene, theme]);

  // Pointer: relay to the scene, and drive the float.
  useEffect(() => {
    if (reducedMotion) return;
    const host = hostRef.current;
    if (!host) return;
    const target = floatTarget ? document.querySelector<HTMLElement>(floatTarget) : null;

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
      if (target && (nx !== lastX || ny !== lastY)) {
        lastX = nx;
        lastY = ny;
        target.style.setProperty("--px", String(nx));
        target.style.setProperty("--py", String(ny));
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
      const r = host.getBoundingClientRect();
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

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      target?.style.removeProperty("--px");
      target?.style.removeProperty("--py");
    };
  }, [reducedMotion, floatTarget]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      data-state={showScene ? status : "poster"}
      className={cn("scene-poster absolute inset-0 overflow-hidden bg-cover bg-center", className)}
    >
      {showScene && (
        <iframe
          key={theme}
          ref={frameRef}
          title="FusionX hero scene"
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          tabIndex={-1}
          loading="eager"
          className={cn(
            "pointer-events-none absolute inset-0 block h-full w-full border-0 transition-opacity duration-700",
            status === "ready" ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
