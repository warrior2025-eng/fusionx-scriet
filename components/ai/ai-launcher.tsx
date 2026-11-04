"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { AllowedLinks } from "./ai-text";

// The panel's code is fetched only when someone opens it.
const AiPanel = dynamic(() => import("./ai-panel"), { ssr: false });

/** Rooms, the admin panel and print views have their own full-screen layouts. */
const HIDDEN = [/^\/interview/, /^\/recruitment\/interview/, /^\/review/, /^\/meetings\/(?!scan)[^/]+/, /\/print(\/|$)/, /\/offer-letter/];
const TAG_KEY = "fx-ai-tag-seen";

export type AiLauncherProps = { welcome: string; suggestions: string[]; allowed: AllowedLinks };

/**
 * FusionX AI's launcher: the FusionX mark in a cut-corner tile, inside a slowly turning
 * blueprint ring. Sits above the phone's bottom bar when there is one.
 */
export function AiLauncher(props: AiLauncherProps) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState(false);
  const [lift, setLift] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const hidden = HIDDEN.some((r) => r.test(pathname));

  // The "Ask FusionX AI" tag slides out once, on the first visit.
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(TAG_KEY) === "1";
      if (!seen) localStorage.setItem(TAG_KEY, "1");
    } catch {}
    if (seen) return;
    const show = window.setTimeout(() => setTag(true), 1200);
    const hide = window.setTimeout(() => setTag(false), 7000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, []);

  // Above a fixed bar at the bottom of the screen (My Interview, Join meeting).
  useEffect(() => {
    const measure = () => {
      const bar = [...document.querySelectorAll<HTMLElement>("body .fixed.bottom-0")].find((el) => el.offsetHeight > 0 && el.getBoundingClientRect().width >= window.innerWidth * 0.9);
      setLift(bar ? bar.offsetHeight : 0);
    };
    const first = window.setTimeout(measure, 300);
    window.addEventListener("resize", measure);
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true });
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [pathname]);

  if (hidden) return null;
  return (
    <>
      {!open && (
        <div className="fixed right-4 z-[45] flex items-center gap-2 sm:right-6" style={{ bottom: `calc(${lift}px + max(1rem, env(safe-area-inset-bottom)))` }} data-ai-launcher>
          {tag && (
            <span className="ai-tag cut-corner hidden px-3 py-1.5 text-sm font-medium text-ink shadow-lg sm:block" aria-hidden>
              Ask FusionX AI
            </span>
          )}
          <button
            ref={button}
            type="button"
            onClick={() => {
              setTag(false);
              setOpen(true);
            }}
            aria-label="Ask FusionX AI"
            aria-haspopup="dialog"
            className="ai-launcher group relative grid h-14 w-14 place-items-center focus-visible:outline-none"
          >
            <svg className="ai-ring pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 56 56" aria-hidden>
              <circle cx="28" cy="28" r="26.5" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 5" />
              <circle cx="28" cy="1.5" r="1.6" fill="currentColor" />
            </svg>
            <span className="ai-tile relative grid h-10 w-10 place-items-center bg-[#00030D] text-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- the small logo mark, already cached by the header */}
              <img src="/logo-mark.png" alt="" width={24} height={24} className="h-6 w-6" />
            </span>
          </button>
        </div>
      )}
      {open && (
        <AiPanel
          {...props}
          onClose={() => {
            setOpen(false);
            window.setTimeout(() => button.current?.focus(), 0);
          }}
        />
      )}
    </>
  );
}
