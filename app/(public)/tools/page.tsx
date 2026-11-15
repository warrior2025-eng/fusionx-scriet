import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ToolCard, isNewThisWeek, type ToolRow } from "@/components/tools/tool-card";
import { TOOL_CATEGORIES } from "@/lib/tools/candidates";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Tools Library",
  description: "The tools FusionX members use for code, design, documents, research, data and events: what each one is, why it matters, and how to start in 5 steps.",
};

/** The public Tools Library (migration 0045): one new tool a day, each page checked (both official links load). */
export default async function ToolsPage({ searchParams }: { searchParams: Promise<{ q?: string; c?: string }> }) {
  const { q, c } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("tools").select("slug, name, category, what, free_label, created_at, sort").eq("status", "published").is("deleted_at", null).order("sort").order("name");
  const all = (data ?? []) as (Pick<ToolRow, "slug" | "name" | "category" | "what" | "free_label" | "created_at">)[];
  const needle = (q ?? "").trim().toLowerCase();
  const list = all.filter((t) => (!c || t.category === c) && (!needle || `${t.name} ${t.what}`.toLowerCase().includes(needle)));
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ q, c, ...patch }).filter(([, v]) => v) as [string, string][]);
    return p.size ? `/tools?${p}` : "/tools";
  };
  return (
    <Section className="pb-24 pt-14">
      <Eyebrow>Tools Library</Eyebrow>
      <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">Tools we use.</h1>
      <p className="mt-3 max-w-2xl text-ink/75">What each tool is, why it matters for students, and how to start in five steps. A new one is added every day.</p>
      <form action="/tools" className="mt-8 flex flex-col gap-3 sm:flex-row" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Search tools" aria-label="Search tools" className="min-h-11 w-full min-w-0 border border-line bg-paper px-3 text-sm text-ink sm:max-w-md" />
        {c && <input type="hidden" name="c" value={c} />}
        <button className="min-h-11 bg-accent px-5 text-sm font-semibold text-white">Search</button>
      </form>
      <nav aria-label="Categories" className="mt-4 flex flex-wrap gap-2" data-tool-categories>
        <Link href={href({ c: undefined })} className={cn("inline-flex min-h-11 items-center border px-3 text-sm", !c ? "border-ink text-ink" : "border-line text-ink/70")}>All</Link>
        {TOOL_CATEGORIES.map((x) => <Link key={x.key} href={href({ c: x.key })} className={cn("inline-flex min-h-11 items-center border px-3 text-sm", c === x.key ? "border-ink text-ink" : "border-line text-ink/70")}>{x.label}</Link>)}
      </nav>
      <p className="mt-4 text-sm text-ink/65" data-tool-count>{list.length} tool{list.length === 1 ? "" : "s"}</p>
      {list.length ? (
        <ul className="mt-4 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{list.map((t) => <li key={t.slug} className="min-w-0"><ToolCard tool={t} fresh={isNewThisWeek(t.created_at)} /></li>)}</ul>
      ) : <p className="mt-4 border border-dashed border-line p-4 text-sm text-ink/70">No tools match. Try another word or category.</p>}
    </Section>
  );
}
