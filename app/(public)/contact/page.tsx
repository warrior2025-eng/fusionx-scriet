import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { ContactForm } from "@/components/forms/contact-form";
import { getOrganizationSettings } from "@/lib/data/organization";
import { Eyebrow } from "@/components/ui/eyebrow";
import { siteName } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${siteName}.`,
};

export default async function ContactPage() {
  const settings = await getOrganizationSettings();

  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx relative z-10 pt-20 pb-12 md:pt-24 md:pb-16 max-w-3xl">
          <ScrollReveal>
            <Eyebrow>Contact</Eyebrow>
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

      <Section className="max-w-3xl">
        <ScrollReveal delay={100}>
          <div className="card-elevated rounded-sm p-8 md:p-10">
            <ContactForm />
          </div>
        </ScrollReveal>
      </Section>
    </>
  );
}
