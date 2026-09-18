import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ContactForm } from "@/components/forms/contact-form";
import { getOrganizationSettings } from "@/lib/data/organization";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with FusionX @ SCRIET.",
};

export default async function ContactPage() {
  const settings = await getOrganizationSettings();

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Contact</p>
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink mb-4">Get in touch.</h1>
      {settings.official_email ? (
        <p className="text-ink/55 mb-10">
          Reach us directly at{" "}
          <a href={`mailto:${settings.official_email}`} className="text-accent hover:underline">
            {settings.official_email}
          </a>{" "}
          or use the form below.
        </p>
      ) : (
        <p className="text-ink/55 mb-10">Use the form below and we&rsquo;ll get back to you by email.</p>
      )}
      <ContactForm />
    </Section>
  );
}
