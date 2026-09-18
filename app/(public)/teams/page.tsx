import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

export const metadata: Metadata = { title: "Teams", description: "Interdisciplinary project teams forming within FusionX." };

export default async function TeamsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Team formation is a members-only feature (RLS requires auth.uid()), so
  // signed-out visitors get an explanation instead of an empty query.
  if (!user) {
    return (
      <Section className="pt-16 pb-24">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Teams</p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink mb-4">Find collaborators.</h1>
        <EmptyState
          title="Sign in to view and join teams."
          description="Team formation is available to signed-in FusionX members so contact details stay controlled."
        />
      </Section>
    );
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, description, status, skills_needed")
    .order("created_at", { ascending: false });

  return (
    <Section className="pt-16 pb-24">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Teams</p>
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink mb-8">Find collaborators.</h1>
      {teams && teams.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-5">
          {teams.map((t) => (
            <div key={t.id} className="border border-ink/10 rounded-sm p-6 bg-white/50">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-ink">{t.name}</p>
                <Badge>{t.status}</Badge>
              </div>
              {t.description && <p className="text-sm text-ink/55 mb-3">{t.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {t.skills_needed?.map((s: string) => (
                  <span key={s} className="text-xs text-ink/45 border border-ink/10 rounded-full px-2 py-0.5">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No teams forming yet." description="Teams created by members will appear here." />
      )}
    </Section>
  );
}
