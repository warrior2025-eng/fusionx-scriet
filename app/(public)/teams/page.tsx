import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { Pill } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input, Select } from "@/components/ui/field";
import { Section } from "@/components/ui/section";
import { getContent } from "@/lib/data/site-content";
import { createClient } from "@/lib/supabase/server";
import {
  TEAM_STATUS_LABELS,
  TEAM_TYPE_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_TONE,
  getFocusCategories,
  getTeamSettings,
  type Team,
} from "@/lib/teams/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "FusionX Teams" };

type Params = { tab?: string; focus?: string; looking?: string; skill?: string };

export default async function TeamsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teams");
  const params = await searchParams;
  const mineTab = params.tab === "mine";

  const [page, settings, categories, { data: memberRows }] = await Promise.all([
    getContent("teams.page"),
    getTeamSettings(),
    getFocusCategories(),
    supabase.from("team_members").select("team_id").eq("user_id", user.id),
  ]);
  const myIds = (memberRows ?? []).map((m) => m.team_id as string);

  // Row level security already limits this to verified teams and the caller's own.
  let query = supabase.from("teams").select("*").order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(120);
  if (mineTab) {
    query = query.in("id", myIds.length ? myIds : ["00000000-0000-0000-0000-000000000000"]);
  } else {
    query = query.eq("verification_status", "verified").in("status", ["forming", "active"]);
    if (params.focus) query = query.eq("focus", params.focus);
    if (params.looking === "on") query = query.eq("looking_for_members", true);
  }
  const { data: teamRows } = await query;
  const skill = (params.skill ?? "").trim().toLowerCase();
  const teams = ((teamRows ?? []) as Team[]).filter(
    (t) => mineTab || !skill || (t.skills_needed ?? []).some((s) => s.toLowerCase().includes(skill)),
  );

  const { data: allMembers } = teams.length
    ? await supabase.from("team_members").select("team_id").in("team_id", teams.map((t) => t.id))
    : { data: [] };
  const sizes = new Map<string, number>();
  for (const m of allMembers ?? []) sizes.set(m.team_id as string, (sizes.get(m.team_id as string) ?? 0) + 1);

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("border-b-2 px-1 pb-2 text-sm font-medium", active ? "border-accent text-ink" : "border-transparent text-ink/65 hover:text-ink")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx pb-12 pt-20 md:pb-16 md:pt-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <Eyebrow>FusionX Teams</Eyebrow>
              <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">{page.heading}</h1>
              {page.intro && <p className="mt-4 whitespace-pre-line leading-relaxed text-ink/70">{page.intro}</p>}
            </div>
            {settings.open ? (
              <LinkButton href="/teams/register" size="sm">
                Register a team <ArrowRight size={14} className="arrow-nudge" />
              </LinkButton>
            ) : (
              <p className="max-w-xs text-sm text-ink/70">{settings.closedMessage || "Team registration is closed right now."}</p>
            )}
          </div>
        </div>
      </section>

      <Section>
        <nav aria-label="Teams" className="mb-8 flex gap-6 border-b border-line">
          {tab("/teams", "All teams", !mineTab)}
          {tab("/teams?tab=mine", `My teams${myIds.length ? ` (${myIds.length})` : ""}`, mineTab)}
        </nav>

        {!mineTab && (
          <form method="get" action="/teams" className="mb-8 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-ink/60">Focus</span>
              <Select name="focus" defaultValue={params.focus ?? ""} className="w-auto min-w-[10rem] py-2">
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink/60">Skill</span>
              <Input name="skill" defaultValue={params.skill ?? ""} placeholder="For example: React" className="w-44 py-2" />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-ink">
              <input type="checkbox" name="looking" defaultChecked={params.looking === "on"} className="h-4 w-4 accent-[var(--color-accent)]" />
              Looking for members
            </label>
            <button type="submit" className="btn btn--secondary rounded-sm border border-ink/40 px-3.5 py-2 text-sm font-medium text-ink hover:border-ink">
              Apply
            </button>
          </form>
        )}

        {teams.length === 0 ? (
          <EmptyState
            title={mineTab ? "You are not on a team yet." : "No teams to show."}
            description={
              mineTab
                ? "Register your own team, or ask to join one that is looking for members."
                : "Verified teams appear here. Try clearing the filters."
            }
          />
        ) : (
          <ul className="grid gap-6 md:grid-cols-2">
            {teams.map((t) => (
              <li key={t.id}>
                <Link href={`/teams/${t.id}`} className="card-elevated group flex h-full flex-col p-7">
                  <div className="flex flex-wrap items-center gap-2">
                    {t.verification_status === "verified" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                        <BadgeCheck size={15} aria-hidden /> Verified
                      </span>
                    ) : (
                      <Pill tone={VERIFICATION_TONE[t.verification_status]}>{VERIFICATION_LABELS[t.verification_status]}</Pill>
                    )}
                    {t.focus && <Badge className="rounded-none">{t.focus}</Badge>}
                    {t.looking_for_members && t.verification_status === "verified" && <Pill tone="good">Looking for members</Pill>}
                    {mineTab && t.status !== "active" && t.status !== "forming" && <Pill>{TEAM_STATUS_LABELS[t.status]}</Pill>}
                  </div>
                  <h2 className="mt-3 font-serif text-xl font-medium text-ink">{t.name}</h2>
                  {t.project_title && <p className="mt-1 text-sm font-medium text-ink/80">{t.project_title}</p>}
                  {t.description && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink/70">{t.description}</p>}
                  {t.skills_needed?.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {t.skills_needed.map((s) => (
                        <li key={s} className="border border-ink/10 px-2.5 py-0.5 text-xs text-ink/70">
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-auto pt-5 text-sm text-ink/65">
                    {TEAM_TYPE_LABELS[t.team_type]}, {sizes.get(t.id) ?? 0}
                    {t.max_size ? ` of ${t.max_size}` : ""} member{(sizes.get(t.id) ?? 0) === 1 && !t.max_size ? "" : "s"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
