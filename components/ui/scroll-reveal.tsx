"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Wraps children in a container that fades/slides into view
 * when it enters the viewport. Uses IntersectionObserver for
 * performance: no scroll listeners, no heavy libraries.
 *
 * Every instance on the page shares one observer, and an element is
 * unobserved as soon as it has been revealed.
 *
 * Respects prefers-reduced-motion automatically via CSS.
 */

const delays = new WeakMap<Element, number>();
let shared: IntersectionObserver | null = null;

function observer(): IntersectionObserver {
  shared ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.style.transitionDelay = `${delays.get(el) ?? 0}ms`;
        el.classList.add("scroll-revealed");
        shared?.unobserve(el);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  return shared;
}

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
    delays.set(el, delay);
    const io = observer();
    io.observe(el);
    return () => io.unobserve(el);
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
