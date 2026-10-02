"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return document.documentElement.getAttribute("data-theme") === "light";
}

// Matches the no-attribute (dark) default the server always renders, so
// hydration never mismatches — useSyncExternalStore re-checks on the
// client right after mount and updates without a flash or a warning.
function getServerSnapshot() {
  return false;
}

function setTheme(light: boolean) {
  if (light) {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "dark");
  }
  listeners.forEach((l) => l());
}

export function ThemeToggle({ className }: { className?: string }) {
  const isLight = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => setTheme(!isLight)}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className={className ?? "p-2 text-ink/65 hover:text-ink transition-colors"}
    >
      {isLight ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}