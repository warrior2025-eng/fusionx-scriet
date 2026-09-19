import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { JoinForm } from "@/components/forms/join-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Join FusionX",
  description: "Apply to join FusionX @ SCRIET.",
};

export default async function JoinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Join FusionX</p>
      <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink mb-4">
        Don&rsquo;t just participate. Build.
      </h1>
      <p className="text-ink/55 mb-10">
        Tell us where your interests lie and how you&rsquo;d like to contribute. We review
        applications on a rolling basis.
      </p>
      <JoinForm isSignedIn={!!user} />
    </Section>
  );
}
