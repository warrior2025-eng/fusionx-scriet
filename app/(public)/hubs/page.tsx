import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { HubCards } from "@/components/hubs/hub-cards";
import { getHubs, splitHubs } from "@/lib/data/hubs";
import { pageMetadata } from "@/lib/data/seo";

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** "Four operational teams and one collaborative network." (the structure, from the data). */
async function intro() {
  const { operational, network } = splitHubs(await getHubs());
  const teams = `${countWord(operational.length)} operational ${operational.length === 1 ? "team" : "teams"}`;
  if (network.length === 0) return `${teams}.`;
  return `${teams} and ${countWord(network.length).toLowerCase()} collaborative ${network.length === 1 ? "network" : "networks"}.`;
}

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("programs", { title: "FusionX Hubs", description: await intro() });
}

export default async function HubsPage() {
  // Managed from the admin panel (FusionX Hubs); falls back to lib/site-config.ts.
  const [hubs, line] = await Promise.all([getHubs(), intro()]);

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>FusionX Hubs</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink max-w-2xl">{line}</h1>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        <HubCards hubs={hubs} />
      </Section>
    </>
  );
}
