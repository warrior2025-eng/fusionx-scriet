"use client";

import { useEffect, useRef } from "react";

/**
 * Thin accent bar across the top of the viewport showing how far the page has
 * been scrolled. Writes a transform straight to the element (no React state),
 * at most once per frame.
 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    // The scrollable distance is measured when the page's size changes, not
    // on every scroll frame (reading scrollHeight there forces a layout).
    let max = 0;
    const measure = () => {
      max = document.documentElement.scrollHeight - window.innerHeight;
      onScroll();
    };
    const update = () => {
      raf = 0;
      const progress = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      sizes.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div ref={barRef} className="h-full origin-left bg-accent" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
