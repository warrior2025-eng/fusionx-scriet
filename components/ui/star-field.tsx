"use client";

import { useMemo } from "react";

// Deterministic 0–1 value per (star, property): keeps render pure, and the
// server and client agree on every position.
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * CSS-only star field that creates subtle drifting particles.
 * No canvas, no heavy JS — just positioned divs with CSS animation.
 * Each star has randomized position, delay, and duration for organic feel.
 */
export function StarField({ count = 40 }: { count?: number }) {
  const stars = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${seeded(i, 1) * 100}%`,
      top: `${60 + seeded(i, 2) * 40}%`,
      size: 1 + seeded(i, 3) * 1.5,
      duration: 8 + seeded(i, 4) * 16,
      delay: seeded(i, 5) * 12,
      opacity: 0.15 + seeded(i, 6) * 0.4,
    }));
  }, [count]);

  return (
    <div className="star-field" aria-hidden>
      {stars.map((s) => (
        <div
          key={s.id}
          className="star"
          style={{
            left: s.left,
            top: s.top,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
}
