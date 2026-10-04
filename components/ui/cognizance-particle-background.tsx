"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  z: number;
  originX: number;
  originY: number;
  originZ: number;
  size: number;
  color: string;
  alpha: number;
  speed: number;
  angle: number;
}

export function CognizanceParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Track mouse for interactive parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    function handleMouseMove(e: MouseEvent) {
      targetMouseX = (e.clientX - width / 2) * 0.08;
      targetMouseY = (e.clientY - height / 2) * 0.08;
    }

    function handleResize() {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("resize", handleResize);

    // Cognizance Inspired Color Palette (Electric Cyan, Sky Blue, Radiant Amber/Gold, White)
    const colors = [
      "#06b6d4", // Electric cyan
      "#38bdf8", // Sky blue
      "#0284c7", // Deep cyan
      "#fbbf24", // Radiant gold
      "#f59e0b", // Amber
      "#f97316", // Warm orange
      "#ffffff", // Core starlight
    ];

    const particleCount = Math.min(Math.floor((width * height) / 4500), 380);
    const particles: Particle[] = [];

    // Initialize 3D cloud formation (elliptical galaxy / constellation cluster)
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      
      // Elliptical distribution concentrated towards the top-right / center
      const radiusX = (0.2 + Math.random() * 0.5) * (width * 0.45);
      const radiusY = (0.15 + Math.random() * 0.45) * (height * 0.45);
      const radiusZ = (Math.random() - 0.5) * 400;

      const originX = Math.sin(phi) * Math.cos(theta) * radiusX + width * 0.65;
      const originY = Math.sin(phi) * Math.sin(theta) * radiusY + height * 0.4;
      const originZ = Math.cos(phi) * radiusZ;

      // Color selection: cluster of cyan and gold
      const isGold = Math.random() < 0.38;
      const color = isGold
        ? colors[3 + Math.floor(Math.random() * 3)]
        : colors[Math.floor(Math.random() * 3)];

      particles.push({
        x: originX,
        y: originY,
        z: originZ,
        originX,
        originY,
        originZ,
        size: Math.random() * 2.2 + 0.8,
        color,
        alpha: Math.random() * 0.7 + 0.3,
        speed: (Math.random() * 0.002 + 0.001) * (Math.random() > 0.5 ? 1 : -1),
        angle: Math.random() * Math.PI * 2,
      });
    }

    let globalRotation = 0;

    function render() {
      if (!ctx || !canvas) return;

      // Smooth mouse follow
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      ctx.clearRect(0, 0, width, height);

      globalRotation += 0.0015;

      // Check current theme
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const baseAlphaMultiplier = isLight ? 0.45 : 0.85;

      // Sort particles by Z for depth
      particles.sort((a, b) => b.z - a.z);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Orbit rotation around cluster center
        p.angle += p.speed;
        const cosAngle = Math.cos(globalRotation + p.angle * 0.2);
        const sinAngle = Math.sin(globalRotation + p.angle * 0.2);

        // Calculate 3D perspective
        const cx = p.originX - width * 0.65;
        const cy = p.originY - height * 0.4;

        const rotX = cx * cosAngle - p.originZ * sinAngle;
        const rotZ = cx * sinAngle + p.originZ * cosAngle;

        // Perspective scale factor
        const fov = 600;
        const scale = fov / (fov + rotZ + 200);

        const screenX = rotX * scale + width * 0.65 + mouseX * scale;
        const screenY = cy * scale + height * 0.4 + mouseY * scale;

        if (scale > 0 && screenX > -50 && screenX < width + 50 && screenY > -50 && screenY < height + 50) {
          ctx.beginPath();
          ctx.arc(screenX, screenY, Math.max(p.size * scale, 0.5), 0, Math.PI * 2);

          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.min(Math.max(p.alpha * scale * baseAlphaMultiplier, 0.05), 1);
          ctx.fill();

          // Extra radial glow on brighter foreground particles
          if (p.size * scale > 1.8 && !isLight) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
          } else {
            ctx.shadowBlur = 0;
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      animationFrameId = requestAnimationFrame(render);
    }

    render();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      aria-hidden
    />
  );
}
