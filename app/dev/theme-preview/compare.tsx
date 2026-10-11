"use client";

import { useEffect, useRef, useState } from "react";
import { OPTIONS, type OptionKey } from "./guard";

const SIZES = { desktop: 1440, phone: 390 } as const;
type Size = keyof typeof SIZES;

/**
 * The two options next to each other. Each is the real specimen page in its
 * own frame, laid out at a true desktop (or phone) width and scaled down to
 * fit, so what you compare is the real layout, not a squeezed one.
 */
export function Compare() {
  const [size, setSize] = useState<Size>("desktop");
  const [scale, setScale] = useState(0.45);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const fit = () => {
      const column = (row.clientWidth - 24) / 2;
      setScale(Math.min(1, column / SIZES[size]));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [size]);

  const width = SIZES[size];
  const height = size === "desktop" ? 5200 : 7600;

  return (
    <div className="lt-compare px-4 pb-10 pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Light theme: pick A or B</h1>
          <p className="text-sm opacity-75">Preview only. Dark mode and the live site are not affected.</p>
        </div>
        <div className="flex gap-2 text-sm">
          {(Object.keys(SIZES) as Size[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-pressed={size === s}
              className={`border px-3 py-1.5 capitalize ${size === s ? "border-white bg-white text-black" : "border-white/40"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div ref={rowRef} className="grid grid-cols-2 gap-6">
        {(Object.keys(OPTIONS) as OptionKey[]).map((key) => (
          <div key={key} className="min-w-0">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                Option {key.toUpperCase()}: {OPTIONS[key].name}
              </p>
              <a href={`/dev/theme-preview/${key}`} target="_blank" rel="noreferrer" className="text-sm underline">
                Open full size
              </a>
            </div>
            <p className="mb-3 text-sm opacity-75">{OPTIONS[key].note}</p>
            <div style={{ width: width * scale, height: height * scale, overflow: "hidden", margin: "0 auto" }}>
              <iframe
                key={size}
                title={`Option ${key.toUpperCase()}`}
                src={`/dev/theme-preview/${key}`}
                className="lt-compare__frame"
                style={{ width, height, transform: `scale(${scale})` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
