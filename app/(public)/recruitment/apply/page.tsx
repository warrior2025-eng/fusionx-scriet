import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ApplyForm, type ApplyDraft } from "@/components/recruitment/apply-form";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { istDateTime } from "@/lib/events/format";
import { cycleState, getCurrentCycle, getQuestions, getSlotAvailability, getVisibleTeams, toApplication } from "@/lib/recruitment/data";
import { DEFAULT_INSTRUCTIONS } from "@/lib/recruitment/slots";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Apply", robots: { index: false } };

export default async function RecruitmentApplyPage({ searchParams }: { searchParams: Promise<{ hub?: string }> }) {
  // From a hub page's "Apply to join this hub": that hub becomes the first choice of a new draft.
  const hub = String((await searchParams).hub ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 80);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(hub ? `/recruitment/apply?hub=${hub}` : "/recruitment/apply")}`);

  const cycle = await getCurrentCycle();
  const state = cycleState(cycle);

  const [{ data: row }, { data: profile }] = await Promise.all([
    cycle
      ? supabase.from("recruitment_applications").select("*").eq("cycle_id", cycle.id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("full_name, department, year, portfolio_url, github_url, linkedin_url").eq("id", user.id).maybeSingle(),
  ]);
  const application = row ? toApplication(row as Record<string, unknown>) : null;
  if (application?.status === "submitted") redirect("/recruitment/status");

  const closed = (message: string) => (
    <Section className="max-w-3xl pt-16">
      <Eyebrow>Recruitment</Eyebrow>
      <CutCard className="h-auto">
        <p className="font-medium text-ink">{message}</p>
        <div className="mt-5">
          <LinkButton href="/recruitment" variant="secondary" size="sm">
            Back to recruitment
          </LinkButton>
        </div>
      </CutCard>
    </Section>
  );
  if (!cycle || state === "none") return closed("Recruitment is not open yet.");
  if (state === "upcoming") return closed(`Applications open on ${istDateTime(cycle.opens_at)}.`);
  if (state !== "open") return closed("Applications are closed.");

  const [teams, questions, slots] = await Promise.all([getVisibleTeams(cycle.id), getQuestions(cycle.id), getSlotAvailability(cycle.id)]);
  const open = teams.filter((t) => t.accepting_applications);
  const saved = (application?.preferences ?? []).filter((id) => open.some((t) => t.id === id));
  const fromHub = hub ? open.find((t) => t.slug === hub || t.slug.endsWith(`-${hub}`)) : undefined;

  // The saved draft, or a first draft filled in from the profile.
  const initial: ApplyDraft = {
    full_name: application?.full_name ?? (profile?.full_name as string | undefined) ?? "",
    department: application?.department ?? (profile?.department as string | undefined) ?? "",
    year: application?.year ?? (profile?.year as string | undefined) ?? "",
    preferences: saved.length === 0 && fromHub ? [fromHub.id] : saved,
    answers: application?.answers ?? {},
    links: {
      portfolio: application?.links.portfolio ?? (profile?.portfolio_url as string | undefined) ?? "",
      github: application?.links.github ?? (profile?.github_url as string | undefined) ?? "",
      linkedin: application?.links.linkedin ?? (profile?.linkedin_url as string | undefined) ?? "",
    },
    resume_path: application?.resume_path ?? null,
    public_consent: row?.public_consent === true ? true : undefined,
    website: "",
  };

  return (
    <Section className="max-w-3xl pt-16">
      <Eyebrow>Recruitment</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Apply: {cycle.title}</h1>
      {cycle.closes_at && <p className="mt-2 text-sm text-ink/70">Deadline: {istDateTime(cycle.closes_at)}</p>}
      <CutCard className="mt-8 h-auto">
        <ApplyForm
          cycleId={cycle.id}
          maxPreferences={cycle.max_preferences}
          teams={open.map((t) => ({ id: t.id, name: t.name, short_description: t.short_description, emoji: t.emoji }))}
          questions={questions.filter((q) => q.team_id === null || open.some((t) => t.id === q.team_id))}
          initial={initial}
          slots={slots}
          slotRequired={cycle.slot_required !== false}
          instructions={cycle.interview_instructions || DEFAULT_INSTRUCTIONS}
        />
      </CutCard>
    </Section>
  );
}
