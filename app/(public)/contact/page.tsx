import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { ContactForm } from "@/components/forms/contact-form";
import { getOrganizationSettings } from "@/lib/data/organization";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with FusionX@SCRIET.",
};

export default async function ContactPage() {
  const settings = await getOrganizationSettings();

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink/8">
        <div className="absolute inset-0 bg-grid-subtle" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/95 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute top-0 left-1/3 w-[500px] h-[300px] bg-accent/[0.04] rounded-full blur-[100px]" aria-hidden />

        <div className="container-fx relative z-10 pt-20 pb-12 md:pt-24 md:pb-16 max-w-3xl">
          <ScrollReveal>
            <p className="text-xs font-semibold tracking-[0.16em] uppercase text-accent mb-3">Contact</p>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink mb-4">
              Get in touch.
            </h1>
            {settings.official_email ? (
              <p className="text-base text-ink/55 leading-relaxed">
                Reach us directly at{" "}
                <a href={`mailto:${settings.official_email}`} className="text-accent hover:underline font-medium">
                  {settings.official_email}
                </a>{" "}
                or use the form below.
              </p>
            ) : (
              <p className="text-base text-ink/55 leading-relaxed">
                Use the form below and we&rsquo;ll get back to you by email.
              </p>
            )}
          </ScrollReveal>
        </div>
      </section>

      <Section className="py-12 md:py-16 max-w-3xl">
        <ScrollReveal delay={100}>
          <div className="card-elevated rounded-sm p-8 md:p-10">
            <ContactForm />
          </div>
        </ScrollReveal>
      </Section>
    </>
  );
}
