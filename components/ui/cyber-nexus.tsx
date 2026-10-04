"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function CyberNexus() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth - 0.5) * 14;
      const y = (e.clientY / innerHeight - 0.5) * 14;
      setMousePos({ x, y });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      className="relative w-full max-w-[480px] aspect-square mx-auto flex items-center justify-center select-none"
      style={{
        transform: `perspective(1000px) rotateY(${mousePos.x}deg) rotateX(${-mousePos.y}deg)`,
        transition: "transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Outer ambient energy pulses */}
      <div className="absolute inset-2 rounded-full bg-cyan-500/15 blur-[80px] animate-pulse-ring pointer-events-none" aria-hidden />
      <div className="absolute inset-16 rounded-full bg-blue-600/20 blur-[50px] pointer-events-none" aria-hidden />

      {/* SVG High-Tech Radar & Orbital Concentric Rings */}
      <svg
        viewBox="0 0 500 500"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      >
        <defs>
          <linearGradient id="nexusGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="nexusGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.1" />
          </linearGradient>
          {/* Radar sweep gradient */}
          <radialGradient id="radarSweep" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="#06b6d4" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer Ring 1 - Precision Ticks */}
        <circle
          cx="250"
          cy="250"
          r="234"
          fill="none"
          stroke="url(#nexusGrad1)"
          strokeWidth="1.2"
          strokeDasharray="4 8 16 8"
          className="animate-radar opacity-70"
        />

        {/* Degree Markers */}
        <text x="250" y="12" fill="#06b6d4" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.6">000°</text>
        <text x="488" y="253" fill="#06b6d4" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.6">090°</text>
        <text x="250" y="496" fill="#06b6d4" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.6">180°</text>
        <text x="12" y="253" fill="#06b6d4" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.6">270°</text>

        {/* Outer Ring 2 - Reverse segment ring */}
        <circle
          cx="250"
          cy="250"
          r="200"
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.5"
          strokeDasharray="30 20 60 20"
          className="animate-radar-reverse opacity-50"
        />

        {/* Mid Ring 3 - Tech Grid with notches */}
        <circle
          cx="250"
          cy="250"
          r="160"
          fill="none"
          stroke="rgba(59, 130, 246, 0.35)"
          strokeWidth="1.5"
        />
        <circle
          cx="250"
          cy="250"
          r="160"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.5"
          strokeDasharray="40 120"
          className="animate-radar"
        />

        {/* Inner Ring 4 - Rapid Pulse Ring */}
        <circle
          cx="250"
          cy="250"
          r="120"
          fill="none"
          stroke="url(#nexusGrad2)"
          strokeWidth="1.5"
          strokeDasharray="6 6"
          className="animate-radar-reverse opacity-80"
        />

        {/* Crosshair Grid Lines */}
        <line x1="30" y1="250" x2="470" y2="250" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="1" strokeDasharray="4 6" />
        <line x1="250" y1="30" x2="250" y2="470" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="1" strokeDasharray="4 6" />

        {/* Center Target Crosshairs */}
        <path d="M 235 250 L 265 250 M 250 235 L 250 265" stroke="#38bdf8" strokeWidth="1" opacity="0.6" />

        {/* Orbiting Satellite Data Nodes */}
        <g className="animate-radar origin-center">
          <circle cx="250" cy="16" r="4.5" fill="#38bdf8" filter="drop-shadow(0 0 6px #38bdf8)" />
          <circle cx="250" cy="484" r="3.5" fill="#2563eb" filter="drop-shadow(0 0 6px #2563eb)" />
        </g>
        <g className="animate-radar-reverse origin-center">
          <circle cx="50" cy="250" r="4" fill="#06b6d4" filter="drop-shadow(0 0 6px #06b6d4)" />
          <circle cx="450" cy="250" r="4" fill="#38bdf8" filter="drop-shadow(0 0 6px #38bdf8)" />
        </g>
      </svg>

      {/* Central Perfectly-Circular Emblem Container */}
      <div className="relative z-20 flex items-center justify-center p-2 rounded-full bg-paper/95 border-2 border-cyan-400/60 backdrop-blur-2xl shadow-[0_0_40px_rgba(6,182,212,0.45)] group hover:scale-105 hover:border-cyan-300 transition-all duration-300">
        {/* Animated Rotating Outer Glow Ring */}
        <div className="absolute -inset-2 rounded-full border border-dashed border-cyan-400/40 animate-radar pointer-events-none" />

        {/* Circular Official Logo Frame */}
        <div className="relative h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden flex items-center justify-center bg-black/40 border border-cyan-400/30">
          <Image
            src="/fusionx-official-logo.png"
            alt="FusionX Official Emblem"
            width={160}
            height={160}
            priority
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 drop-shadow-[0_0_15px_rgba(6,182,212,0.7)]"
          />
        </div>
      </div>

      {/* Symmetrical Corner Telemetry Boxes */}
      {/* Top-Left: Node Coordinates */}
      <div className="absolute top-2 left-0 hud-corner px-3 py-1.5 rounded-sm bg-paper/90 border border-cyan-500/30 backdrop-blur-md shadow-lg pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-mono text-[9px] sm:text-[10px] tracking-wider text-cyan-300 font-semibold uppercase">
            NODE // 28.98° N, 77.70° E
          </span>
        </div>
        <p className="font-mono text-[8px] sm:text-[9px] text-ink/50 mt-0.5">STATUS: OPERATIONAL</p>
      </div>

      {/* Top-Right: Protocol Status */}
      <div className="absolute top-2 right-0 hud-corner px-3 py-1.5 rounded-sm bg-paper/90 border border-blue-500/30 backdrop-blur-md shadow-lg pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="font-mono text-[9px] sm:text-[10px] tracking-wider text-blue-300 font-semibold uppercase">
            PROTOCOL // ACTIVE
          </span>
        </div>
        <p className="font-mono text-[8px] sm:text-[9px] text-ink/50 mt-0.5">FROM IDEAS TO IMPACT</p>
      </div>

      {/* Bottom-Left: Chapter */}
      <div className="absolute bottom-2 left-0 hud-corner px-3 py-1.5 rounded-sm bg-paper/90 border border-cyan-500/30 backdrop-blur-md shadow-lg pointer-events-none">
        <p className="font-mono text-[9px] sm:text-[10px] tracking-wider text-cyan-300 font-semibold uppercase">
          FUSIONX // SCRIET
        </p>
        <p className="font-mono text-[8px] sm:text-[9px] text-ink/50 mt-0.5">CCS UNIVERSITY, MEERUT</p>
      </div>

      {/* Bottom-Right: Network Sync */}
      <div className="absolute bottom-2 right-0 hud-corner px-3 py-1.5 rounded-sm bg-paper/90 border border-blue-500/30 backdrop-blur-md shadow-lg pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="font-mono text-[9px] sm:text-[10px] tracking-wider text-emerald-300 font-semibold uppercase">
            NETWORK // 100% SYNC
          </span>
        </div>
        <p className="font-mono text-[8px] sm:text-[9px] text-ink/50 mt-0.5">INNOVATION &amp; RESEARCH</p>
      </div>
    </div>
  );
}
