import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Research & IP",
  description: "Published research entries from FusionX members, and how FusionX approaches IP awareness.",
};

export default async function ResearchPage() {
  const supabase = await createClient();
  const { data: research } = await supabase
    .from("research")
    .select("id, title, abstract, domain, status, publication_info")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  return (
    <>
      <Section className="pt-16 pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Research &amp; IP</p>
        <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink max-w-2xl">
          Turning projects into documented research.
        </h1>
      </Section>

      <Section className="pt-0">
        {research && research.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-5">
            {research.map((r) => (
              <div key={r.id} className="border border-ink/10 rounded-sm p-6 bg-surface">
                <div className="flex items-center justify-between mb-2">
                  <Badge>{r.status}</Badge>
                  {r.domain && <span className="text-xs text-ink/40">{r.domain}</span>}
                </div>
                <p className="font-medium text-ink">{r.title}</p>
                <p className="mt-1.5 text-sm text-ink/55 line-clamp-3">{r.abstract}</p>
                {r.publication_info && (
                  <p className="mt-3 text-xs text-ink/40">{r.publication_info}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No research entries published yet."
            description="Research from FusionX members will appear here as work is documented and shared."
          />
        )}
      </Section>

      <Section className="pt-0">
        <SectionHeading eyebrow="IP & Innovation" title="How FusionX approaches intellectual property." />
        <div className="prose-fx max-w-2xl">
          <p>
            FusionX may coordinate with the college&rsquo;s technology and intellectual property
            support mechanisms, including TCPO, where applicable. The IP &amp; Innovation Cell
            helps members understand prior-art review, novelty, and documentation practices —
            it does not itself file or grant patents.
          </p>
        </div>
      </Section>
    </>
  );
}
