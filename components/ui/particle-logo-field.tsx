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
 * Reads scroll position directly inside the animation loop (no scroll
 * listener / no React state churn) — cheap, and avoids re-render thrash.
 * Returns null entirely under prefers-reduced-motion, and on very small
 * screens drops the particle count for performance.
 *
 * Not rendered on the home page: its hero runs its own 3D scene, and the two
 * animations are not stacked.
 */

type Phase = { formStart: number; formEnd: number; holdEnd: number };
const PHASE: Phase = { formStart: 0.05, formEnd: 0.28, holdEnd: 0.48 };

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface Particle {
  ax: number;
  ay: number;
  tx: number;
  ty: number;
  seed: number;
  size: number;
}

async function sampleLogoPoints(maxPoints: number): Promise<{ x: number; y: number }[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = "/logo-mark.png";
    img.onload = () => {
      const size = 160;
      const off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      const octx = off.getContext("2d");
      if (!octx) return resolve([]);
      octx.drawImage(img, 0, 0, size, size);
      const { data } = octx.getImageData(0, 0, size, size);

      const points: { x: number; y: number }[] = [];
      const step = 2;
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          const i = (y * size + x) * 4;
          const alpha = data[i + 3];
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (alpha > 140 && brightness > 120) {
            points.push({ x: x / size, y: y / size });
          }
        }
      }

      let sampled = points;
      if (points.length > maxPoints) {
        const stride = points.length / maxPoints;
        sampled = Array.from({ length: maxPoints }, (_, i) => points[Math.floor(i * stride)]);
      }
      resolve(sampled);
    };
    img.onerror = () => resolve([]);
  });
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
    const PARTICLE_COUNT = isSmall ? 450 : 1600;

    let particles: Particle[] = [];
    let rafId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;
    const mouse = { x: -9999, y: -9999, active: false };

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function randomAmbient(p: Particle) {
      p.ax = Math.random() * width;
      p.ay = Math.random() * height;
    }

    async function init() {
      resize();
      const logoPoints = await sampleLogoPoints(PARTICLE_COUNT);
      const count = logoPoints.length > 0 ? logoPoints.length : PARTICLE_COUNT;

      const boxSize = Math.min(width, height) * 0.42;
      const boxX = width / 2 - boxSize / 2;
      const boxY = height / 2 - boxSize / 2;

      particles = Array.from({ length: count }, (_, i) => {
        const lp = logoPoints[i % Math.max(logoPoints.length, 1)];
        const p: Particle = {
          ax: 0,
          ay: 0,
          tx: lp ? boxX + lp.x * boxSize : width / 2,
          ty: lp ? boxY + lp.y * boxSize : height / 2,
          seed: Math.random() * Math.PI * 2,
          size: Math.random() * 1.4 + 0.6,
        };
        randomAmbient(p);
        return p;
      });

      if (!window.matchMedia("(pointer: coarse)").matches) {
        window.addEventListener("mousemove", onMouseMove, { passive: true });
        window.addEventListener("mouseleave", onMouseLeave);
      }
      window.addEventListener("resize", resize);
      rafId = requestAnimationFrame(loop);
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

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#2f6bff";
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim() || "#eef1f6";

      for (const p of particles) {
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

        const nearLogo = formAmount > 0.6;
        ctx!.beginPath();
        ctx!.arc(x, y, p.size * (nearLogo ? 1.2 : 1), 0, Math.PI * 2);
        ctx!.fillStyle = nearLogo ? accent : ink;
        ctx!.globalAlpha = nearLogo ? 0.85 : 0.22;
        ctx!.fill();
      }

      rafId = requestAnimationFrame(loop);
    }

    init();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="fixed inset-0 -z-10 pointer-events-none" />;
}