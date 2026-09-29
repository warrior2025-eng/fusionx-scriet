import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Section } from "@/components/ui/section";
import { ProjectForm } from "@/components/forms/project-form";
import { createProject } from "@/actions/projects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New Project" };

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/projects/new");

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">New Project</p>
      <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink mb-8">Start a project.</h1>
      <ProjectForm action={createProject} />
    </Section>
  );
}
