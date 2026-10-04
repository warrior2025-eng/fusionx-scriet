"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function CyberNexus() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth - 0.5) * 16;
      const y = (e.clientY / innerHeight - 0.5) * 16;
      setMousePos({ x, y });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      className="relative w-full max-w-[500px] aspect-square mx-auto flex items-center justify-center select-none"
      style={{
        transform: `perspective(1000px) rotateY(${mousePos.x}deg) rotateX(${-mousePos.y}deg)`,
        transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Outer ambient glow */}
      <div className="absolute inset-4 rounded-full bg-cyan-500/10 blur-[90px] animate-pulse-ring" aria-hidden />
      <div className="absolute inset-16 rounded-full bg-blue-600/15 blur-[60px]" aria-hidden />

      {/* SVG Radar & Orbital Rings */}
      <svg
        viewBox="0 0 500 500"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      >
        <defs>
          <linearGradient id="cyberGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#2563eb" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="cyberGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Outer Ring 1 - Dashed */}
        <circle
          cx="250"
          cy="250"
          r="230"
          fill="none"
          stroke="url(#cyberGrad1)"
          strokeWidth="1.2"
          strokeDasharray="6 8 20 8"
          className="animate-radar opacity-60"
        />

        {/* Outer Ring 2 - Reverse */}
        <circle
          cx="250"
          cy="250"
          r="195"
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1"
          strokeDasharray="40 10 5 10"
          className="animate-radar-reverse opacity-40"
        />

        {/* Mid Ring 3 - Solid with tech notches */}
        <circle
          cx="250"
          cy="250"
          r="150"
          fill="none"
          stroke="rgba(37, 99, 235, 0.4)"
          strokeWidth="1.5"
        />
        <circle
          cx="250"
          cy="250"
          r="150"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.5"
          strokeDasharray="30 120"
          className="animate-radar"
        />

        {/* Inner Ring 4 */}
        <circle
          cx="250"
          cy="250"
          r="105"
          fill="none"
          stroke="url(#cyberGrad2)"
          strokeWidth="1.5"
          strokeDasharray="8 6"
          className="animate-radar-reverse opacity-70"
        />

        {/* Crosshair grid lines */}
        <line x1="20" y1="250" x2="480" y2="250" stroke="rgba(6, 182, 212, 0.15)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="250" y1="20" x2="250" y2="480" stroke="rgba(6, 182, 212, 0.15)" strokeWidth="1" strokeDasharray="4 4" />

        {/* Crosshair corner markers */}
        <path d="M 230 250 L 270 250 M 250 230 L 250 270" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />

        {/* Orbiting Tech Nodes */}
        <g className="animate-radar origin-center">
          <circle cx="250" cy="20" r="4.5" fill="#38bdf8" filter="drop-shadow(0 0 6px #38bdf8)" />
          <circle cx="250" cy="480" r="3.5" fill="#2563eb" filter="drop-shadow(0 0 6px #2563eb)" />
        </g>
        <g className="animate-radar-reverse origin-center">
          <circle cx="55" cy="250" r="4" fill="#06b6d4" filter="drop-shadow(0 0 6px #06b6d4)" />
          <circle cx="445" cy="250" r="4" fill="#38bdf8" filter="drop-shadow(0 0 6px #38bdf8)" />
        </g>
      </svg>

      {/* Central Core Reactor with Logo */}
      <div className="relative z-20 flex flex-col items-center justify-center p-6 rounded-full bg-paper/90 border border-cyan-400/40 backdrop-blur-xl shadow-[0_0_35px_rgba(6,182,212,0.3)] group cursor-pointer hover:border-cyan-300 transition-all">
        <div className="relative h-20 w-20 md:h-24 md:w-24 rounded-full overflow-hidden flex items-center justify-center bg-accent/20 border border-cyan-400/50">
          <Image
            src="/logo-mark.png"
            alt="FusionX Core"
            width={80}
            height={80}
            className="h-16 w-16 md:h-20 md:w-20 object-contain drop-shadow-[0_0_12px_rgba(6,182,212,0.8)] group-hover:scale-110 transition-transform duration-300"
          />
        </div>
        <p className="mt-3 font-mono text-[10px] tracking-[0.25em] text-cyan-300 font-bold uppercase">
          FUSIONX // CORE
        </p>
        <span className="text-[9px] font-mono text-ink/40 tracking-wider">
          SCRIET &bull; CCSU
        </span>
      </div>

      {/* Floating HUD Telemetry Tags */}
      <div className="absolute top-4 left-0 hud-corner px-3 py-1.5 rounded-sm bg-paper/85 border border-cyan-500/25 backdrop-blur-md shadow-lg pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
          <p className="font-mono text-[10px] tracking-wider text-cyan-300 font-semibold uppercase">
            NODE // 28.98° N, 77.70° E
          </p>
        </div>
        <p className="font-mono text-[9px] text-ink/50 mt-0.5">STATUS: OPERATIONAL</p>
      </div>

      <div className="absolute bottom-6 right-0 hud-corner px-3 py-1.5 rounded-sm bg-paper/85 border border-blue-500/25 backdrop-blur-md shadow-lg pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          <p className="font-mono text-[10px] tracking-wider text-blue-300 font-semibold uppercase">
            PIPELINE // SECURE
          </p>
        </div>
        <p className="font-mono text-[9px] text-ink/50 mt-0.5">PROTOCOL: IDEAS_TO_IMPACT</p>
      </div>

      <div className="absolute top-1/2 -right-4 -translate-y-1/2 hidden md:block hud-corner px-2.5 py-1 rounded-sm bg-paper/85 border border-ink/15 backdrop-blur-md pointer-events-none">
        <p className="font-mono text-[9px] text-cyan-400/80 uppercase tracking-widest">
          SYNC &bull; 100%
        </p>
      </div>
    </div>
  );
}
