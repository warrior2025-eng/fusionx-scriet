import { Check } from "lucide-react";
import type { TimelineStep } from "@/lib/recruitment/stages";
import { cn } from "@/lib/utils";

/** The five-step progress row on the status page (steps from timeline() in lib/recruitment/stages.ts). */
export function StageTimeline({ steps, label }: { steps: TimelineStep[]; label: string }) {
  return (
    <ol className="mt-6 grid grid-cols-5 gap-1.5" aria-label={label}>
      {steps.map((step, i) => {
        const on = step.state === "done" || step.state === "current";
        return (
          <li key={step.label} className="text-center" aria-current={step.state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "mx-auto flex h-7 w-7 items-center justify-center border text-xs font-semibold",
                on ? "border-accent bg-accent text-white" : step.state === "na" ? "border-dashed border-ink/25 text-ink/45" : "border-ink/25 text-ink/50",
              )}
            >
              {step.state === "done" ? <Check size={14} aria-label="Done" /> : i + 1}
            </span>
            <span className={cn("mt-1.5 block text-[10px] leading-tight tracking-tight sm:text-xs sm:tracking-normal", on ? "text-ink" : "text-ink/55")}>{step.label}</span>
            {step.note && <span className="mt-0.5 block text-[10px] leading-tight text-ink/55 sm:text-[11px]">{step.note}</span>}
          </li>
        );
      })}
    </ol>
  );
}
