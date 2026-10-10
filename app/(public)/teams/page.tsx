import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { TeamJoinButton } from "@/components/forms/team-join-button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Teams",
  description: "Interdisciplinary project teams forming within FusionX.",
};

export default async function TeamsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  if (!user) {
    return (
      <>
        <section className="border-b border-line">

          <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
            <ScrollReveal>
              <Eyebrow>Teams</Eyebrow>
              <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink mb-4">
                Find collaborators.
              </h1>
            </ScrollReveal>
          </div>
        </section>

        <Section>
          <ScrollReveal>
            <EmptyState
              title="Sign in to view and join teams."
              description="Team formation is available to signed-in FusionX members so contact details stay controlled."
            />
          </ScrollReveal>
        </Section>
      </>
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
    <>
      <section className="border-b border-line">

        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Eyebrow>Teams</Eyebrow>
                <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
                  Find collaborators.
                </h1>
              </div>
              <LinkButton href="/teams/new" size="sm">
                Create team
              </LinkButton>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        {teams && teams.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {teams.map((t, i) => (
              <ScrollReveal key={t.id} delay={i * 80}>
                <div className="card-elevated rounded-sm p-7 h-full flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-serif text-xl font-medium text-ink group-hover:text-accent transition-colors">{t.name}</p>
                      <Badge>{t.status}</Badge>
                    </div>
                    {t.description && <p className="text-sm text-ink/55 mb-4 leading-relaxed">{t.description}</p>}
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      {t.skills_needed?.map((s: string) => (
                        <span key={s} className="text-xs text-ink/50 bg-ink/5 border border-ink/10 rounded-full px-2.5 py-0.5 font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-ink/8">
                    <TeamJoinButton
                      teamId={t.id}
                      isMember={myTeamIds.has(t.id)}
                      isOpen={t.status === "forming" || t.status === "active"}
                    />
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <ScrollReveal>
            <EmptyState title="No teams forming yet." description="Teams created by members will appear here." />
          </ScrollReveal>
        )}
      </Section>
    </>
  );
}
