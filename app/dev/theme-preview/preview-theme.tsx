"use client";

import { useEffect } from "react";

/**
 * Puts the page into one preview option: the light theme plus `data-lt` on
 * <html>, which is what preview.css keys on. Both are undone on leaving, and
 * the visitor's saved theme choice is never written.
 */
export function PreviewTheme({ option }: { option: string }) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "light");
    root.setAttribute("data-lt", option);
    return () => {
      root.removeAttribute("data-lt");
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("theme");
      } catch {}
      if (saved === "light") root.setAttribute("data-theme", "light");
      else root.removeAttribute("data-theme");
    };
  }, [option]);
  return null;
}
