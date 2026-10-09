import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { JoinForm } from "@/components/forms/join-form";
import { createClient } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Join FusionX",
  description: "Apply to join FusionX@SCRIET.",
};

export default async function JoinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx relative z-10 pt-20 pb-12 md:pt-24 md:pb-16 max-w-3xl">
          <ScrollReveal>
            <Eyebrow>Join FusionX</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink mb-4">
              Don&rsquo;t just participate. Build.
            </h1>
            <p className="text-base text-ink/55 leading-relaxed">
              Tell us where your interests lie and how you&rsquo;d like to contribute. We review
              applications on a rolling basis.
            </p>
          </ScrollReveal>
        </div>
      </section>

      <Section className="max-w-3xl">
        <ScrollReveal delay={100}>
          <div className="card-elevated rounded-sm p-8 md:p-10">
            <JoinForm isSignedIn={!!user} />
          </div>
        </ScrollReveal>
      </Section>
    </>
  );
}
