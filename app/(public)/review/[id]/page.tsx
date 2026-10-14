import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Toaster } from "@/components/admin/toast";
import { ApplicationView } from "@/components/recruitment/application-view";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import type { Cycle } from "@/lib/recruitment/data";
import { loadApplicationDetail } from "@/lib/recruitment/detail";
import { resultsVisible } from "@/lib/recruitment/results";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Application", robots: { index: false } };

export default async function ReviewApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/review/${id}`);

  // Null unless this person reviews a team the application lists (or is an admin).
  const detail = await loadApplicationDetail(supabase, id);
  if (!detail || detail.statuses.length === 0) notFound();
  const { data: cycle } = await supabase.from("recruitment_cycles").select("*").eq("id", detail.application.cycle_id).maybeSingle();
  const locked = cycle?.decisions_locked === true || resultsVisible(cycle as Cycle | null);

  return (
    <Section className="max-w-5xl pt-16">
      <Toaster />
      <Eyebrow>Recruitment</Eyebrow>
      <p className="mb-6 text-sm">
        <Link href="/review" className="text-ink/70 underline underline-offset-2 hover:text-ink">
          Back to all applications
        </Link>
      </p>
      <ApplicationView supabase={supabase} userId={user.id} locked={locked} {...detail} />
    </Section>
  );
}
