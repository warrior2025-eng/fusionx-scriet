import type { Metadata } from "next";
import { SlotList, type ListSlot } from "@/components/interview/slot-list";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { getCurrentCycle } from "@/lib/recruitment/data";
import { loadBoard, loadSlotDays } from "@/lib/recruitment/slot-admin";

export const metadata: Metadata = { title: "Admin: Interviews" };

/** Every booked interview slot of the current recruitment, by date, to open the panel. */
export default async function InterviewsPage() {
  const ctx = await requireCapability("recruitment", "/admin/interviews");
  const cycle = await getCurrentCycle();
  if (!cycle) {
    return (
      <AdminPage title="Interviews" description="The FusionX Interview Room panel.">
        <Panel title="No recruitment">
          <p className="text-sm text-ink/70">There is no recruitment cycle yet.</p>
        </Panel>
      </AdminPage>
    );
  }
  const [days, board, { data: teamRows }, { data: roomRows, error: roomError }] = await Promise.all([
    loadSlotDays(ctx.supabase, cycle.id),
    loadBoard(ctx.supabase, cycle.id),
    ctx.supabase.from("recruitment_teams").select("id, name").eq("cycle_id", cycle.id),
    ctx.supabase.from("recruitment_room_settings").select("day_id, room_enabled"),
  ]);
  const teamName = Object.fromEntries((teamRows ?? []).map((t) => [t.id as string, t.name as string]));
  const roomOn = new Set(((roomRows ?? []) as { day_id: string; room_enabled: boolean }[]).filter((r) => r.room_enabled).map((r) => r.day_id));
  const slots: ListSlot[] = board
    .filter((s) => s.bookings.length > 0)
    .map((s) => ({
      id: s.id,
      day: days.find((d) => d.id === s.day_id)?.date ?? s.starts_at.slice(0, 10),
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      room: roomOn.has(s.day_id),
      candidates: s.bookings.map((b) => ({ name: b.full_name, hubs: b.preferences.map((p) => teamName[p] ?? "").filter(Boolean).join(", "), status: b.status })),
    }));

  return (
    <AdminPage
      title="Interviews"
      description={`${cycle.title}. Open a slot to join its call, watch the integrity signals, reveal questions and score. The room detects and discourages cheating; it cannot fully prevent it.`}
    >
      {roomError ? (
        <Panel title="Not set up yet">
          <p className="text-sm text-ink/75">The interview room needs database migration 0023. Run it in the Supabase SQL editor, then reload this page.</p>
        </Panel>
      ) : (
        <SlotList slots={slots} base="/admin/interviews" />
      )}
    </AdminPage>
  );
}
