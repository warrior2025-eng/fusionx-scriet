import type { Metadata } from "next";
import { pageMetadata } from "@/lib/data/seo";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { ContactForm } from "@/components/forms/contact-form";
import { getOrganizationSettings } from "@/lib/data/organization";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InstagramIcon, LinkedInIcon, WhatsAppIcon } from "@/components/ui/brand-icons";
import { siteName, socialLinks } from "@/lib/site-config";
import { linkHref } from "@/lib/validation/link";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("contact", { title: "Contact", description: `Get in touch with ${siteName}.` });

export default async function ContactPage() {
  const settings = await getOrganizationSettings();
  const email = settings.official_email || socialLinks.email;
  // Settings first; the built-in links when a field there is empty (as in the footer).
  const socials = [
    { href: linkHref(settings.instagram_url, "instagram") || socialLinks.instagram, label: "Instagram", aria: `${settings.chapter_name} on Instagram`, icon: <InstagramIcon />, note: "" },
    { href: linkHref(settings.linkedin_url, "linkedin") || socialLinks.linkedin, label: "LinkedIn", aria: `${settings.chapter_name} on LinkedIn`, icon: <LinkedInIcon />, note: "" },
    { href: linkHref(settings.whatsapp_url, "whatsapp_group") || socialLinks.whatsapp, label: "WhatsApp community", aria: `Join ${settings.org_name} on WhatsApp`, icon: <WhatsAppIcon />, note: "Join our community" },
  ];

  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx relative z-10 pt-20 pb-12 md:pt-24 md:pb-16 max-w-3xl">
          <ScrollReveal>
            <Eyebrow>Contact</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink mb-4">
              Get in touch.
            </h1>
            <p className="text-base text-ink/55 leading-relaxed">
              Reach us directly at{" "}
              <a href={`mailto:${email}`} className="text-accent hover:underline font-medium">
                {email}
              </a>{" "}
              or use the form below.
            </p>
            <ul className="mt-6 flex flex-wrap gap-3">
              {socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.aria}
                    className="flex items-center gap-3 border border-line px-4 py-2.5 text-ink/70 transition-colors duration-150 hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent"
                  >
                    {s.icon}
                    <span className="flex flex-col text-sm leading-tight">
                      <span className="font-medium text-ink">{s.label}</span>
                      {s.note && <span className="text-xs text-ink/55">{s.note}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
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
