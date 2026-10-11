import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { registerTeam } from "@/actions/teams";
import { AdminForm, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { Toaster } from "@/components/admin/toast";
import { TeamDetailFields } from "@/components/teams/team-fields";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { getContent } from "@/lib/data/site-content";
import { istDateTime } from "@/lib/events/format";
import { createClient } from "@/lib/supabase/server";
import { TEAM_TYPE_LABELS, getFocusCategories, getTeamSettings } from "@/lib/teams/data";

export const metadata: Metadata = { title: "Register a team" };

export default async function RegisterTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teams/register");

  const [page, settings, categories] = await Promise.all([getContent("teams.register"), getTeamSettings(), getFocusCategories()]);

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx max-w-3xl pb-12 pt-20 md:pb-16 md:pt-24">
          <Eyebrow>FusionX Teams</Eyebrow>
          <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">{page.heading}</h1>
          {page.intro && <p className="mt-4 whitespace-pre-line leading-relaxed text-ink/70">{page.intro}</p>}
          {page.difference && (
            <p className="mt-4 text-sm leading-relaxed text-ink/70">
              {page.difference}{" "}
              <Link href="/recruitment" className="font-medium text-accent">
                Recruitment
              </Link>
            </p>
          )}
        </div>
      </section>

      <Section className="max-w-3xl">
        <Toaster />
        <CutCard className="h-auto">
          {!settings.open ? (
            <div>
              <p className="font-medium text-ink">Team registration is closed</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/70">
                {settings.closedMessage || "We are not taking new team registrations right now. Please check back later."}
              </p>
              <div className="mt-5">
                <LinkButton href="/teams" variant="secondary" size="sm">
                  Browse teams
                </LinkButton>
              </div>
            </div>
          ) : (
            <AdminForm action={registerTeam} submitLabel="Register team">
              <p className="text-sm text-ink/70">
                A team has {settings.minSize} to {settings.maxSize} members, and you can be in up to {settings.maxTeamsPerUser} team
                {settings.maxTeamsPerUser === 1 ? "" : "s"} at once. FusionX verifies each team before it is listed.
                {settings.deadline && ` Registration closes on ${istDateTime(settings.deadline)}.`}
              </p>
              <SelectField
                name="team_type"
                label="Kind of team"
                hint="Existing: your team is already formed. New: you are forming one and may still be looking for members."
                options={[
                  { value: "", label: "Choose one" },
                  { value: "existing", label: TEAM_TYPE_LABELS.existing },
                  { value: "new", label: TEAM_TYPE_LABELS.new },
                ]}
              />
              <TextField name="name" label="Team name" maxLength={120} />
              <TeamDetailFields categories={categories} minSize={settings.minSize} maxSize={settings.maxSize} />
              <TextareaField
                name="invites"
                label="Invite members (optional)"
                rows={3}
                hint={`Email addresses, one per line. People with a FusionX account get a notification; for anyone else you get a link to send them. Invitations last ${settings.inviteExpiryDays} days.`}
              />
              {/* Honeypot: hidden from people, tempting to bots. */}
              <div className="hidden" aria-hidden="true">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
            </AdminForm>
          )}
        </CutCard>
      </Section>
    </>
  );
}
