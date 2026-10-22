import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SlotList, type ListSlot } from "@/components/interview/slot-list";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import type { SlotPerson } from "@/lib/interview/shared";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Interview panel", robots: { index: false } };

/**
 * For a hub's reviewers: the interview slots with one of their candidates.
 * The database decides which (my_interview_panel_slots) and whom they see in
 * each (interview_slot_people).
 */
export default async function ReviewerInterviewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/review/interviews");

  const { data: ids } = await supabase.rpc("my_interview_panel_slots");
  const slotIds = (Array.isArray(ids) ? ids : []) as string[];
  const { data: slotRows } = slotIds.length
    ? await supabase.from("recruitment_slots").select("id, starts_at, ends_at, recruitment_slot_days(date)").in("id", slotIds)
    : { data: [] };
  const slots: ListSlot[] = [];
  for (const s of (slotRows ?? []) as unknown as { id: string; starts_at: string; ends_at: string; recruitment_slot_days: { date: string } | null }[]) {
    const [{ data: people }, { data: access }] = await Promise.all([
      supabase.rpc("interview_slot_people", { p_slot: s.id }),
      supabase.rpc("interview_panel_access", { p_slot: s.id }),
    ]);
    slots.push({
      id: s.id,
      day: s.recruitment_slot_days?.date ?? s.starts_at.slice(0, 10),
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      room: Boolean((access as { room_enabled?: boolean } | null)?.room_enabled),
      candidates: ((Array.isArray(people) ? people : []) as SlotPerson[]).map((p) => ({
        name: p.name,
        hubs: (p.hubs ?? []).map((h) => h.name).join(", "),
        status: p.status,
      })),
    });
  }

  return (
    <Section className="pt-16">
      <Eyebrow>Recruitment</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Interview panel</h1>
      <p className="mb-8 mt-2 max-w-2xl text-sm text-ink/70">
        The interview slots with candidates for the hubs you review. You can join the call, see their integrity signals and score them. The room
        detects and discourages cheating; it cannot fully prevent it.
      </p>
      <SlotList slots={slots} base="/review/interviews" />
    </Section>
  );
}
