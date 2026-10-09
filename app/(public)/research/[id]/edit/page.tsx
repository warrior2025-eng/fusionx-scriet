import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { Section } from "@/components/ui/section";
import { ResearchForm } from "@/components/forms/research-form";
import { updateResearch, deleteResearch } from "@/actions/research";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = { title: "Edit Research Entry" };

export default async function EditResearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/research/${id}/edit`);

  const { data: entry } = await supabase.from("research").select("*").eq("id", id).single();
  if (!entry) notFound();

  const staff = await isStaff();
  if (entry.created_by !== user.id && !staff) redirect("/research/mine");

  const boundUpdate = updateResearch.bind(null, id);

  async function remove() {
    "use server";
    await deleteResearch(id);
    redirect("/research/mine");
  }

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <Eyebrow>Edit Research Entry</Eyebrow>
      <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink mb-8">{entry.title}</h1>
      <ResearchForm action={boundUpdate} research={entry} />
      <form action={remove} className="mt-10 pt-6 border-t border-ink/10">
        <p className="text-xs text-ink/40 mb-2">Danger zone</p>
        <Button type="submit" variant="secondary" className="text-red-500 border-red-500/30 hover:border-red-500">
          Delete entry
        </Button>
      </form>
    </Section>
  );
}
