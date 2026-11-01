import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Section } from "@/components/ui/section";
import { ProfileForm } from "@/components/forms/profile-form";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = { title: "My Profile" };

type MyTeam = { group_name: string; title: string; is_lead: boolean; on_page: boolean };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const [{ data: profile }, { data: teamRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.rpc("my_core_teams"),
  ]);
  const teams = (teamRows ?? []) as MyTeam[];
  const missing = [
    !profile?.avatar_url && "a photo",
    !profile?.bio?.trim() && "a short bio",
    !profile?.department?.trim() && "your department",
    !profile?.year?.trim() && "your year",
  ].filter(Boolean) as string[];

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <Eyebrow>My Profile</Eyebrow>
      <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink mb-8">Edit your profile.</h1>
      {teams.length > 0 && (
        <section aria-labelledby="your-teams" className="mb-8 border border-line bg-surface p-5">
          <h2 id="your-teams" className="font-serif text-xl text-ink">
            Your teams
          </h2>
          <ul className="mt-3 space-y-2">
            {teams.map((team) => (
              <li key={team.group_name} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/80">
                <span className="font-medium text-ink">{team.group_name}</span>
                <span>· {team.title}</span>
                {team.is_lead && <Badge>Lead</Badge>}
                {!team.on_page && <span className="text-xs text-ink/60">Not on the Core page right now</span>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink/70">
            {missing.length > 0
              ? `Your card on the Core page is missing ${missing.join(", ")}. Add them below so it shows well.`
              : "Your profile is complete. Changes you save here show on the Core page straight away."}
          </p>
        </section>
      )}
      {profile && <ProfileForm profile={profile} email={user.email ?? ""} isCoreMember={teams.length > 0} />}
    </Section>
  );
}
