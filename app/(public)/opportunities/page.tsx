import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Opportunities",
  description: "Hackathons, competitions, internships, and other opportunities shared by FusionX.",
};

export default async function OpportunitiesPage() {
  const supabase = await createClient();
  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("id, title, organizer, category, description, deadline, registration_url, status")
    .eq("is_published", true)
    .order("deadline", { ascending: true });

  return (
    <>
      <Section className="pt-16 pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Opportunities</p>
        <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink">
          Hackathons, internships, and more.
        </h1>
        <p className="mt-4 text-sm text-ink/50 max-w-xl">
          FusionX shares opportunities it becomes aware of. Listing here isn&rsquo;t a guarantee
          of verification — always confirm details on the organizer&rsquo;s official page before
          applying.
        </p>
      </Section>

      <Section className="pt-0">
        {opportunities && opportunities.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-5">
            {opportunities.map((o) => (
              <div key={o.id} className="border border-ink/10 rounded-sm p-6 bg-surface">
                <div className="flex items-center justify-between mb-2">
                  <Badge>{o.category.replace(/_/g, " ")}</Badge>
                  <Badge>{o.status.replace(/_/g, " ")}</Badge>
                </div>
                <p className="font-medium text-ink">{o.title}</p>
                <p className="text-xs text-ink/40 mt-1">{o.organizer}</p>
                <p className="mt-2 text-sm text-ink/55 line-clamp-3">{o.description}</p>
                {o.deadline && (
                  <p className="mt-3 text-xs text-ink/45">
                    Deadline: {new Date(o.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                )}
                {o.registration_url && (
                  <a
                    href={o.registration_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
                  >
                    View details →
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No opportunities listed yet."
            description="Hackathons, competitions, internships, and other opportunities will appear here as they're published."
          />
        )}
      </Section>
    </>
  );
}
