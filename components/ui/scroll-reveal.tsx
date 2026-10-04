"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Wraps children in a container that fades/slides into view
 * when it enters the viewport. Uses IntersectionObserver for
 * performance — no scroll listeners, no heavy libraries.
 *
 * Respects prefers-reduced-motion automatically via CSS.
 */
export function ScrollReveal({
  children,
  className,
  delay = 0,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.transitionDelay = `${delay}ms`;
          el.classList.add("scroll-revealed");
          observer.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  const dirClass =
    direction === "up"
      ? "scroll-reveal-up"
      : direction === "down"
        ? "scroll-reveal-down"
        : direction === "left"
          ? "scroll-reveal-left"
          : direction === "right"
            ? "scroll-reveal-right"
            : "scroll-reveal-fade";

  return (
    <div ref={ref} className={`scroll-reveal ${dirClass} ${className ?? ""}`}>
      {children}
    </div>
  );
}
