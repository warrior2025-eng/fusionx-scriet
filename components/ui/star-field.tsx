"use client";

import { useMemo } from "react";

/**
 * CSS-only star field that creates subtle drifting particles.
 * No canvas, no heavy JS — just positioned divs with CSS animation.
 * Each star has randomized position, delay, and duration for organic feel.
 */
export function StarField({ count = 40 }: { count?: number }) {
  const stars = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${60 + Math.random() * 40}%`,
      size: 1 + Math.random() * 1.5,
      duration: 8 + Math.random() * 16,
      delay: Math.random() * 12,
      opacity: 0.15 + Math.random() * 0.4,
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
