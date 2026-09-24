import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { TeamJoinButton } from "@/components/forms/team-join-button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

export const metadata: Metadata = { title: "Teams", description: "Interdisciplinary project teams forming within FusionX." };

export default async function TeamsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  if (!user) {
    return (
      <Section className="pt-16 pb-24">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Teams</p>
        <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink mb-4">Find collaborators.</h1>
        <EmptyState
          title="Sign in to view and join teams."
          description="Team formation is available to signed-in FusionX members so contact details stay controlled."
        />
      </Section>
    );
  }

  const [{ data: teams }, { data: myMemberships }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, description, status, skills_needed")
      .order("created_at", { ascending: false }),
    supabase.from("team_members").select("team_id").eq("user_id", user.id),
  ]);

  const myTeamIds = new Set((myMemberships ?? []).map((m) => m.team_id));

  return (
    <Section className="pt-16 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Teams</p>
          <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink">Find collaborators.</h1>
        </div>
        <LinkButton href="/teams/new" size="sm">
          Create team
        </LinkButton>
      </div>
      {teams && teams.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-5">
          {teams.map((t) => (
            <div key={t.id} className="border border-ink/10 rounded-sm p-6 bg-surface">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-ink">{t.name}</p>
                <Badge>{t.status}</Badge>
              </div>
              {t.description && <p className="text-sm text-ink/55 mb-3">{t.description}</p>}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {t.skills_needed?.map((s: string) => (
                  <span key={s} className="text-xs text-ink/45 border border-ink/10 rounded-full px-2 py-0.5">
                    {s}
                  </span>
                ))}
              </div>
              <TeamJoinButton teamId={t.id} isMember={myTeamIds.has(t.id)} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No teams forming yet." description="Teams created by members will appear here." />
      )}
    </Section>
  );
}