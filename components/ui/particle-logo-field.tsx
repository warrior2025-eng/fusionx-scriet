"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Full-page, fixed, behind-all-content particle field (Canvas 2D — no WebGL
 * dependency, keeps the bundle light). Scroll-driven, three-phase motion:
 *
 *   1. 0%        → formStart : ambient ("idle") — particles drift gently,
 *                                scattered across the viewport.
 *   2. formStart → formEnd   : converge — each particle eases from its
 *                                scattered position to a sampled point of
 *                                the FusionX logo (/public/logo-mark.png).
 *   3. formEnd   → holdEnd   : hold — the logo stays formed, readable.
 *   4. holdEnd   → 100%      : disperse — particles ease back out to a
 *                                calmer ambient field for the rest of the
 *                                page, so nothing sits frozen behind content
 *                                further down.
 *
 * The formed logo is the complete mark: the "X" in the ink colour (white on
 * the dark theme, navy on the light one) and the slash in the accent blue.
 *
 * Reads scroll position directly inside the animation loop (no scroll
 * listener / no React state churn) — cheap, and avoids re-render thrash.
 * Returns null entirely under prefers-reduced-motion, pauses while the tab
 * is hidden, and uses a coarser sampling grid on small screens.
 *
 * Not rendered on the home page: its hero runs its own 3D scene, and the two
 * animations are not stacked.
 */

type Phase = { formStart: number; formEnd: number; holdEnd: number };
const PHASE: Phase = { formStart: 0.05, formEnd: 0.28, holdEnd: 0.48 };

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** A sampled logo point, normalised to the glyph's own bounding box (0…1). */
type LogoPoint = { x: number; y: number; slash: boolean };
type LogoSample = {
  points: LogoPoint[];
  /** Glyph bounding box width / height. */
  aspect: number;
  /** Distance between neighbouring samples, as a fraction of the glyph width. */
  spacing: number;
};

interface Particle {
  ax: number;
  ay: number;
  tx: number;
  ty: number;
  seed: number;
  size: number;
  slash: boolean;
}

const SAMPLE_SIZE = 288;

/**
 * Samples the logo on an even grid. A pixel belongs to the mark when its
 * colour is far from the logo's own navy disc — so both the white "X" and the
 * blue slash are kept, and the disc and the black corners outside it are not.
 * The grid step is widened until the point count fits `maxPoints`, which thins
 * every stroke evenly instead of dropping runs of points.
 */
async function sampleLogo(maxPoints: number): Promise<LogoSample | null> {
  const img = new Image();
  img.src = "/logo-mark.png";
  try {
    await img.decode();
  } catch {
    return null;
  }

  const size = SAMPLE_SIZE;
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return null;
  octx.drawImage(img, 0, 0, size, size);
  const { data } = octx.getImageData(0, 0, size, size);

  // The disc colour, read just inside its top edge where nothing is drawn.
  const bgAt = (Math.round(size * 0.1) * size + Math.round(size / 2)) * 4;
  const bg = [data[bgAt], data[bgAt + 1], data[bgAt + 2]];

  const collect = (step: number) => {
    const found: { x: number; y: number; slash: boolean }[] = [];
    for (let y = step >> 1; y < size; y += step) {
      for (let x = step >> 1; x < size; x += step) {
        const i = (y * size + x) * 4;
        if (data[i + 3] < 128) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 90) continue;
        found.push({ x, y, slash: b - r > 80 });
      }
    }
    return found;
  };

  let step = 2;
  let found = collect(step);
  while (found.length > maxPoints && step < 12) found = collect(++step);
  if (found.length === 0) return null;

  let minX = size, minY = size, maxX = 0, maxY = 0;
  for (const p of found) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  return {
    points: found.map((p) => ({ x: (p.x - minX) / w, y: (p.y - minY) / h, slash: p.slash })),
    aspect: w / h,
    spacing: step / w,
  };
}

export function ParticleLogoField() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <ParticleLogoFieldCanvas />;
}

function ParticleLogoFieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isSmall = window.matchMedia("(max-width: 768px)").matches;
    const MAX_POINTS = isSmall ? 1000 : 2400;

    let disposed = false;
    let particles: Particle[] = [];
    let logo: LogoSample | null = null;
    let formRadius = 1.4;
    let rafId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;
    const mouse = { x: -9999, y: -9999, active: false };

    // Theme colours: read once, and again only when the theme changes.
    let ink = "#fefefe";
    let accent = "#004df6";
    function readColours() {
      const style = getComputedStyle(document.documentElement);
      ink = style.getPropertyValue("--color-ink").trim() || ink;
      accent = style.getPropertyValue("--color-accent").trim() || accent;
    }

    /** Fits the logo into the space below the header, at its real aspect ratio. */
    function placeLogo() {
      if (!logo) return;
      const headerBottom = Math.max(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0, 0);
      const top = Math.min(headerBottom, height * 0.4) + 24;
      const availableH = Math.max(height - top - 24, 80);
      const boxH = Math.min(availableH * 0.82, Math.min(width, height) * 0.46, (width * 0.82) / logo.aspect);
      const boxW = boxH * logo.aspect;
      const boxX = (width - boxW) / 2;
      const boxY = top + (availableH - boxH) / 2;
      // Dots just short of touching their neighbours, so every stroke reads solid.
      formRadius = Math.max(logo.spacing * boxW * 0.46, 0.9);
      particles.forEach((p, i) => {
        const lp = logo!.points[i];
        p.tx = boxX + lp.x * boxW;
        p.ty = boxY + lp.y * boxH;
      });
    }

    function resize() {
      const scaleX = window.innerWidth / width;
      const scaleY = window.innerHeight / height;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const p of particles) {
        p.ax *= scaleX;
        p.ay *= scaleY;
      }
      placeLogo();
    }

    function onMouseMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    }
    function onMouseLeave() {
      mouse.active = false;
    }

    function scrollProgress() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return 0;
      return Math.min(Math.max(window.scrollY / max, 0), 1);
    }

    function loop(time: number) {
      const progress = scrollProgress();
      ctx!.clearRect(0, 0, width, height);

      let formAmount = 0;
      if (progress < PHASE.formStart) {
        formAmount = 0;
      } else if (progress < PHASE.formEnd) {
        formAmount = easeInOutCubic((progress - PHASE.formStart) / (PHASE.formEnd - PHASE.formStart));
      } else if (progress < PHASE.holdEnd) {
        formAmount = 1;
      } else {
        const disperseRange = 1 - PHASE.holdEnd || 1;
        formAmount = 1 - easeInOutCubic((progress - PHASE.holdEnd) / disperseRange);
      }

      // Held back from fully opaque: the logo sits behind the page copy.
      ctx!.globalAlpha = 0.22 + 0.42 * formAmount;
      // Two passes, one fill each: the "X" in ink, then the slash in accent.
      for (const slash of [false, true]) {
        ctx!.fillStyle = slash ? accent : ink;
        ctx!.beginPath();
        for (const p of particles) {
          if (p.slash !== slash) continue;
          const driftX = Math.sin(time * 0.0003 + p.seed) * 6;
          const driftY = Math.cos(time * 0.00025 + p.seed) * 6;

          let x = p.ax + driftX * (1 - formAmount);
          let y = p.ay + driftY * (1 - formAmount);
          x = x + (p.tx - x) * formAmount;
          y = y + (p.ty - y) * formAmount;

          if (mouse.active && formAmount < 0.3) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist = Math.hypot(dx, dy);
            const radius = 90;
            if (dist < radius && dist > 0.01) {
              const force = ((radius - dist) / radius) * 10;
              x += (dx / dist) * force;
              y += (dy / dist) * force;
            }
          }

          const r = p.size + (formRadius - p.size) * formAmount;
          ctx!.moveTo(x + r, y);
          ctx!.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx!.fill();
      }

      rafId = requestAnimationFrame(loop);
    }

    function start() {
      if (!rafId && !document.hidden && particles.length) rafId = requestAnimationFrame(loop);
    }
    function stop() {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    const themeObserver = new MutationObserver(readColours);

    (async () => {
      const sample = await sampleLogo(MAX_POINTS);
      if (disposed || !sample) return;
      logo = sample;
      readColours();
      particles = sample.points.map((lp) => ({
        ax: Math.random() * width,
        ay: Math.random() * height,
        tx: 0,
        ty: 0,
        seed: Math.random() * Math.PI * 2,
        size: Math.random() * 1.2 + 0.6,
        slash: lp.slash,
      }));
      resize();

      if (!window.matchMedia("(pointer: coarse)").matches) {
        window.addEventListener("mousemove", onMouseMove, { passive: true });
        window.addEventListener("mouseleave", onMouseLeave);
      }
      window.addEventListener("resize", resize);
      document.addEventListener("visibilitychange", onVisibility);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      start();
    })();

    return () => {
      disposed = true;
      stop();
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="fixed inset-0 -z-10 pointer-events-none" />;
}
