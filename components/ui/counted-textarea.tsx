"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "./field";

/** A text box that shows how much of its limit is used, and goes red past it. */
export function CountedTextarea({ max, defaultValue, onChange, ...props }: { max: number } & React.ComponentProps<typeof Textarea>) {
  const [length, setLength] = useState(String(defaultValue ?? "").length);
  return (
    <>
      <Textarea
        {...props}
        defaultValue={defaultValue}
        onChange={(e) => {
          setLength(e.target.value.length);
          onChange?.(e);
        }}
      />
      <p className={cn("mt-1 text-right text-xs tabular-nums", length > max ? "font-medium text-red-600" : "text-ink/50")}>
        {length}/{max}
      </p>
    </>
  );
}
