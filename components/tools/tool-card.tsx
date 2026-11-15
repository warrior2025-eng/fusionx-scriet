import Link from "next/link";
import { TOOL_CATEGORIES } from "@/lib/tools/candidates";

export type ToolRow = {
  slug: string; name: string; category: string; what: string; why: string; uses: string[]; steps: string[]; tips: string[]; free_label: string;
  official_url: string; docs_url: string; related: string[]; auto: boolean; created_at: string; updated_at: string;
};

export const categoryLabel = (c: string) => TOOL_CATEGORIES.find((x) => x.key === c)?.label ?? c;
/** A monogram (no brand logos): one or two letters from the name. */
export const monogram = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
export const isNewThisWeek = (created: string) => Date.parse(created) > Date.parse(new Date().toISOString().slice(0, 10)) - 7 * 864e5;

/** Equal-height card: monogram, name, category, one line, "New this week". */
export function ToolCard({ tool, fresh }: { tool: Pick<ToolRow, "slug" | "name" | "category" | "what" | "free_label">; fresh?: boolean }) {
  return (
    <Link href={`/tools/${tool.slug}`} className="group flex h-full min-w-0 flex-col border border-line bg-surface p-5 transition-colors hover:border-ink/40 focus-visible:outline-2" data-tool-card={tool.slug}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center bg-accent font-semibold text-white">{monogram(tool.name)}</span>
        <div className="min-w-0">
          <h3 className="break-words font-serif text-lg leading-snug text-ink group-hover:underline">{tool.name}</h3>
          <p className="text-xs text-ink/65">{categoryLabel(tool.category)} · {tool.free_label}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink/80">{tool.what}</p>
      {fresh && <span className="mt-auto self-start pt-3 text-xs font-semibold text-accent-text">New this week</span>}
    </Link>
  );
}
