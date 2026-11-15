import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { categoryLabel, monogram, type ToolRow } from "@/components/tools/tool-card";
import { createClient } from "@/lib/supabase/server";

// Pages change at most once a day.
export const revalidate = 3600;

async function load(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("tools").select("*").eq("slug", slug).eq("status", "published").is("deleted_at", null).maybeSingle();
  if (!data) return { tool: null, related: [] as { slug: string; name: string }[] };
  const { data: rel } = (data.related as string[]).length ? await supabase.from("tools").select("slug, name").in("slug", data.related as string[]).eq("status", "published").is("deleted_at", null) : { data: [] };
  return { tool: data as ToolRow, related: (rel ?? []) as { slug: string; name: string }[] };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { tool } = await load((await params).slug);
  return tool ? { title: `${tool.name} · Tools Library`, description: tool.what } : { title: "Tools Library", robots: { index: false } };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { tool, related } = await load((await params).slug);
  if (!tool) {
    return (
      <Section className="max-w-2xl pb-24 pt-14">
        <Eyebrow>Tools Library</Eyebrow>
        <h1 className="font-serif text-3xl text-ink" data-tool-missing>This tool is no longer listed.</h1>
        <p className="mt-3"><Link href="/tools" className="inline-flex min-h-11 items-center text-accent-text underline">See all tools</Link></p>
      </Section>
    );
  }
  const block = (title: string, items: string[], ordered = false) => {
    const L = ordered ? "ol" : "ul";
    return (
      <section className="border border-line bg-surface p-5">
        <h2 className="font-serif text-xl text-ink">{title}</h2>
        <L className={`mt-3 space-y-2 pl-5 text-ink/85 ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((x) => <li key={x} className="break-words">{x}</li>)}</L>
      </section>
    );
  };
  return (
    <Section className="max-w-4xl pb-24 pt-12">
      <Link href="/tools" className="inline-flex min-h-11 items-center text-sm underline">← Tools Library</Link>
      <div className="mt-2 flex items-start gap-4">
        <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center bg-accent text-lg font-semibold text-white">{monogram(tool.name)}</span>
        <div className="min-w-0">
          <h1 className="break-words font-serif text-3xl tracking-tight text-ink md:text-4xl" data-tool-name>{tool.name}</h1>
          <p className="text-sm text-ink/65">{categoryLabel(tool.category)} · {tool.free_label}</p>
        </div>
      </div>
      <p className="mt-5 text-lg text-ink/85">{tool.what}</p>
      <p className="mt-2 text-ink/75">{tool.why}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a href={tool.official_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 bg-accent px-4 text-sm font-semibold text-white">Official website <ArrowUpRight size={14} aria-hidden /></a>
        <a href={tool.docs_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 border border-line px-4 text-sm font-semibold text-ink">Official docs / learn <ArrowUpRight size={14} aria-hidden /></a>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {block("You'll use it for", tool.uses)}
        {block("Tips", tool.tips)}
        <div className="md:col-span-2">{block("Get started in 5 steps", tool.steps, true)}</div>
      </div>
      {related.length > 0 && (
        <p className="mt-6 text-sm text-ink/80">Related: {related.map((r, i) => <span key={r.slug}>{i > 0 && " · "}<Link href={`/tools/${r.slug}`} className="underline">{r.name}</Link></span>)}</p>
      )}
      <p className="mt-6 text-xs text-ink/55">Last updated {new Date(tool.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}. Pricing and features change: check the official site.</p>
    </Section>
  );
}
