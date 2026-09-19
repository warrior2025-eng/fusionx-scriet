import type { Metadata } from "next";
import { Section } from "@/components/ui/section";

export const metadata: Metadata = { title: "Terms & Code of Conduct" };

export default function TermsPage() {
  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <h1 className="text-3xl font-serif font-normal tracking-tight text-ink mb-8">Terms &amp; Code of Conduct</h1>
      <div className="prose-fx">
        <h2>Academic integrity</h2>
        <p>
          Members are expected to uphold academic integrity in all FusionX activities: no
          plagiarism, proper attribution of others&rsquo; work, and responsible, disclosed use of
          AI tools in research and project submissions.
        </p>
        <h2>Ethical research</h2>
        <p>
          Research conducted through FusionX should follow ethical practices appropriate to its
          domain, including honest reporting of methods and results.
        </p>
        <h2>Intellectual property &amp; confidentiality</h2>
        <p>
          Respect the confidentiality of project and research work shared within teams. Do not
          claim credit for work you did not contribute to.
        </p>
        <h2>Responsible cybersecurity</h2>
        <p>
          Security-related work (research, projects, or competitions) must stay within legal and
          ethical boundaries and only target systems you are authorized to test.
        </p>
        <h2>Respectful communication</h2>
        <p>
          Treat other members, mentors, and faculty with respect. Harassment or discriminatory
          behavior of any kind is not tolerated.
        </p>
        <h2>Responsible use of college resources</h2>
        <p>Use SCRIET facilities, equipment, and platforms responsibly and only for their intended purpose.</p>
      </div>
    </Section>
  );
}
