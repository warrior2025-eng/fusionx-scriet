import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { Section } from "@/components/ui/section";
import { ProjectForm } from "@/components/forms/project-form";
import { updateProject, deleteProject } from "@/actions/projects";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = { title: "Edit Project" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/projects/${id}/edit`);

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).single();
  if (!project) notFound();

  const staff = await isStaff();
  if (project.owner_id !== user.id && !staff) redirect("/projects/mine");

  const boundUpdate = updateProject.bind(null, id);

  async function remove() {
    "use server";
    await deleteProject(id);
    redirect("/projects/mine");
  }

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <Eyebrow>Edit Project</Eyebrow>
      <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink mb-8">{project.title}</h1>
      <ProjectForm action={boundUpdate} project={project} />
      <form action={remove} className="mt-10 pt-6 border-t border-ink/10">
        <p className="text-xs text-ink/40 mb-2">Danger zone</p>
        <Button type="submit" variant="secondary" className="text-red-500 border-red-500/30 hover:border-red-500">
          Delete project
        </Button>
      </form>
    </Section>
  );
}
