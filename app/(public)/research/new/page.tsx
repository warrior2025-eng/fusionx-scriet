import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Section } from "@/components/ui/section";
import { ResearchForm } from "@/components/forms/research-form";
import { createResearch } from "@/actions/research";
import { createClient } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = { title: "New Research Entry" };

export default async function NewResearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/research/new");

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <Eyebrow>New Research Entry</Eyebrow>
      <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink mb-8">Document your research.</h1>
      <ResearchForm action={createResearch} />
    </Section>
  );
}
