import Link from "next/link";
import { Section, SectionHeading } from "@/components/ui/section";
import { ToolCard, isNewThisWeek, type ToolRow } from "./tool-card";
import { createClient } from "@/lib/supabase/server";

/** Home page: six tools from the Tools Library and "See all tools" (hidden before migration 0045). */
export async function ToolsSection({ band }: { band?: "surface" | "tint" | "navy" }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tools").select("slug, name, category, what, free_label, created_at").eq("status", "published").is("deleted_at", null).order("sort").order("name").limit(6);
  if (error || !data?.length) return null;
  return (
    <Section band={band}>
      <SectionHeading eyebrow="Tools we use" title="Learn the tools, then build." />
      <ul className="mt-8 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3" data-home-tools>
        {(data as Pick<ToolRow, "slug" | "name" | "category" | "what" | "free_label" | "created_at">[]).map((t) => <li key={t.slug} className="min-w-0"><ToolCard tool={t} fresh={isNewThisWeek(t.created_at)} /></li>)}
      </ul>
      <p className="mt-6"><Link href="/tools" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline">See all tools</Link></p>
    </Section>
  );
}
