import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mentors", description: "Faculty, seniors, and alumni mentoring FusionX members." };

export default async function MentorsPage() {
  const supabase = await createClient();
  const { data: mentors } = await supabase
    .from("mentors")
    .select("id, name, role_title, expertise, experience, linkedin_url, availability, bio")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  return (
    <Section className="pt-16 pb-24">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Mentors</p>
      <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink mb-8">
        People who can guide you.
      </h1>

      {mentors && mentors.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-5">
          {mentors.map((m) => (
            <div key={m.id} className="border border-ink/10 rounded-sm p-6 bg-surface">
              <p className="font-medium text-ink">{m.name}</p>
              <p className="text-sm text-accent mt-0.5">{m.role_title}</p>
              {m.bio && <p className="mt-3 text-sm text-ink/55 leading-relaxed">{m.bio}</p>}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {m.expertise?.map((e: string) => (
                  <span key={e} className="text-xs text-ink/45 border border-ink/10 rounded-full px-2 py-0.5">
                    {e}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-ink/45">
                {m.availability && <span>{m.availability}</span>}
                {m.linkedin_url && (
                  <a href={m.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    LinkedIn →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No mentors listed yet." description="Mentors added by FusionX staff will appear here." />
      )}
    </Section>
  );
}
