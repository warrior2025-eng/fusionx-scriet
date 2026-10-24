import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { PanelAccess } from "@/actions/interview-panel";
import { PanelView } from "@/components/interview/panel-view";
import { getDayAccess } from "@/lib/interview/day-access";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { slotRange } from "@/lib/recruitment/slots";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Interview panel", robots: { index: false } };

/** One slot, for a reviewer: the call, their candidates' integrity signals (read-only) and their own scores. */
export default async function ReviewerInterviewSlotPage({ params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/review/interviews/${slotId}`);
  if (!/^[0-9a-f-]{36}$/i.test(slotId)) notFound();
  const { data } = await supabase.rpc("interview_panel_access", { p_slot: slotId });
  if (!data) notFound();
  const access = data as PanelAccess;
  // A room day has one room for the whole day (migration 0024): this slot opens there.
  if (access.room_enabled && (await getDayAccess(access.day_id))) redirect(`/review/interviews/day/${access.day_id}?slot=${slotId}`);
  return (
    <Section className="max-w-7xl pt-12">
      <Link href="/review/interviews" className="text-sm text-ink/70 hover:text-ink">
        ← Interview panel
      </Link>
      <Eyebrow className="mt-4">Interview</Eyebrow>
      <h1 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">{slotRange(access.starts_at, access.ends_at)}</h1>
      <div className="mt-6">
        <PanelView supabase={supabase} access={access} userId={user.id} />
      </div>
    </Section>
  );
}
