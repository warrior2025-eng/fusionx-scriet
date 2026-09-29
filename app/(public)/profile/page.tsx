import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Section } from "@/components/ui/section";
import { ProfileForm } from "@/components/forms/profile-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">My Profile</p>
      <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink mb-8">Edit your profile.</h1>
      {profile && <ProfileForm profile={profile} email={user.email ?? ""} />}
    </Section>
  );
}
