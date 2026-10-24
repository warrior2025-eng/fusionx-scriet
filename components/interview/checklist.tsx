import { DEFAULT_CHECKLIST } from "@/lib/interview/shared";
import { cn } from "@/lib/utils";

/**
 * The candidates' checklist (the day's text, else the default): lines ending
 * in ":" are headings, lines starting with "-" are points.
 */
export function Checklist({ text, className }: { text?: string | null; className?: string }) {
  const lines = (text?.trim() || DEFAULT_CHECKLIST).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blocks: { heading: string | null; points: string[] }[] = [];
  for (const line of lines) {
    if (/^[-•*]\s*/.test(line)) {
      if (!blocks.length) blocks.push({ heading: null, points: [] });
      blocks[blocks.length - 1].points.push(line.replace(/^[-•*]\s*/, ""));
    } else blocks.push({ heading: line, points: [] });
  }
  return (
    <div className={cn("space-y-3 text-sm", className)}>
      {blocks.map((b, i) => (
        <div key={i}>
          {b.heading && <p className="font-semibold text-ink">{b.heading}</p>}
          {b.points.length > 0 && (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink/85">
              {b.points.map((p, j) => (
                <li key={j}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
