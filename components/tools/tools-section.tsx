import { ArrowRight, Sparkles } from "lucide-react";
import { Section } from "@/components/ui/section";
import { LinkButton } from "@/components/ui/button";
import { ToolCard, isNewThisWeek, type ToolRow } from "./tool-card";
import { createClient } from "@/lib/supabase/server";

/** "New · a tool added every day": the badge on the Tools Library headings (home and /tools). */
export function NewToolBadge() {
  return (
    <p className="inline-flex items-center gap-2 border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-text">
      <Sparkles size={14} aria-hidden /> New · a tool added every day
    </p>
  );
}

/** Home page: six tools from the Tools Library and a clear "See all tools" button (hidden before migration 0045). */
export async function ToolsSection({ band }: { band?: "surface" | "tint" | "navy" }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tools").select("slug, name, category, what, free_label, created_at").eq("status", "published").is("deleted_at", null).order("sort").order("name").limit(6);
  if (error || !data?.length) return null;
  return (
    <Section band={band}>
      <div className="mb-10 max-w-2xl md:mb-14">
        <NewToolBadge />
        <h2 className="mt-4 font-serif text-3xl leading-tight tracking-tight text-ink md:text-4xl lg:text-5xl">
          The FusionX <span className="text-accent-text">Tools Library</span>
        </h2>
        <p className="mt-4 leading-relaxed text-ink/70">Free guides to the tools we use: what each one is, why it matters, and how to start in 5 steps.</p>
      </div>
      <ul className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3" data-home-tools>
        {(data as Pick<ToolRow, "slug" | "name" | "category" | "what" | "free_label" | "created_at">[]).map((t) => <li key={t.slug} className="min-w-0"><ToolCard tool={t} fresh={isNewThisWeek(t.created_at)} /></li>)}
      </ul>
      <div className="mt-10 flex justify-center">
        <LinkButton href="/tools" size="lg" className="min-h-12 w-full font-semibold shadow-lg shadow-accent/30 sm:w-auto sm:px-10">
          See all tools <ArrowRight size={18} aria-hidden />
        </LinkButton>
      </div>
    </Section>
  );
}
