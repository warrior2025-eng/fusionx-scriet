import type { Metadata } from "next";
import { Section } from "@/components/ui/section";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <h1 className="text-3xl font-serif font-normal tracking-tight text-ink mb-8">Privacy Policy</h1>
      <div className="prose-fx">
        <p>
          FusionX @ SCRIET collects only the personal information necessary to operate the
          network — for example, your name, college email, department, and the details you
          choose to share on your profile or in an application.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>Account information you provide at sign-up (name, email).</li>
          <li>Profile details you choose to add (skills, interests, links, bio).</li>
          <li>Application and form submissions (join applications, contact messages, event registrations).</li>
        </ul>
        <h2>Profile visibility</h2>
        <p>
          Profile fields are private by default. You control what becomes visible to other
          members or the public through your profile&rsquo;s privacy settings.
        </p>
        <h2>How we use it</h2>
        <p>
          To operate FusionX programs, review applications, coordinate teams and events, and
          communicate with you about your involvement. We do not sell personal information.
        </p>
        <h2>Data storage</h2>
        <p>
          Data is stored with Supabase and protected by row-level security policies that
          restrict access to authorized roles only.
        </p>
        <h2>Contact</h2>
        <p>For questions about this policy or your data, use the contact form.</p>
      </div>
    </Section>
  );
}
