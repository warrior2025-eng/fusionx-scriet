import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const supabase = await createClient();

  let results: { type: string; href: string; title: string; blurb: string }[] = [];

  if (query.length >= 2) {
    const like = `%${query}%`;
    const [projects, research, events, opportunities, announcements, resources] = await Promise.all([
      supabase.from("projects").select("id, title, description").eq("is_published", true).ilike("title", like).limit(6),
      supabase.from("research").select("id, title, abstract").eq("is_published", true).ilike("title", like).limit(6),
      supabase.from("events").select("id, title, description").eq("is_published", true).ilike("title", like).limit(6),
      supabase.from("opportunities").select("id, title, description").eq("is_published", true).ilike("title", like).limit(6),
      supabase.from("announcements").select("id, title, content").eq("status", "published").ilike("title", like).limit(6),
      supabase.from("resources").select("id, title, description").eq("is_published", true).eq("visibility", "public").ilike("title", like).limit(6),
    ]);

    results = [
      ...(projects.data ?? []).map((p) => ({ type: "Project", href: "/projects", title: p.title, blurb: p.description })),
      ...(research.data ?? []).map((r) => ({ type: "Research", href: "/research", title: r.title, blurb: r.abstract })),
      ...(events.data ?? []).map((e) => ({ type: "Event", href: "/events", title: e.title, blurb: e.description })),
      ...(opportunities.data ?? []).map((o) => ({ type: "Opportunity", href: "/opportunities", title: o.title, blurb: o.description })),
      ...(announcements.data ?? []).map((a) => ({ type: "Announcement", href: "/", title: a.title, blurb: a.content })),
      ...(resources.data ?? []).map((r) => ({ type: "Resource", href: "/resources", title: r.title, blurb: r.description ?? "" })),
    ];
  }

  return (
    <Section className="pt-16 pb-24">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Search</p>
      <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink mb-8">
        {query ? `Results for "${query}"` : "Search FusionX"}
      </h1>

      <form className="mb-10" method="get">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search projects, research, events, opportunities…"
          className="w-full max-w-xl rounded-sm border border-ink/15 bg-surface px-4 py-3 text-sm placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-accent/40"
          autoFocus
        />
      </form>

      {query.length > 0 && query.length < 2 && (
        <p className="text-sm text-ink/45">Keep typing — at least 2 characters.</p>
      )}

      {query.length >= 2 &&
        (results.length > 0 ? (
          <div className="space-y-3">
            {results.map((r, i) => (
              <Link
                key={i}
                href={r.href}
                className="block border border-ink/10 rounded-sm p-5 bg-surface hover:border-ink/25 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <p className="font-medium text-ink">{r.title}</p>
                  <Badge>{r.type}</Badge>
                </div>
                <p className="text-sm text-ink/55 line-clamp-2">{r.blurb}</p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No results found." description="Try a different search term." />
        ))}
    </Section>
  );
}
