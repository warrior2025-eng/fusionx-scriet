import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MeetingForm, type MeetingDraft } from "@/components/admin/meeting-form";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { meetingChoices } from "@/lib/meetings/admin";

export const metadata: Metadata = { title: "Admin: Edit meeting" };

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireCapability("meetings", `/admin/meetings/${id}`);
  const [{ data }, choices] = await Promise.all([ctx.supabase.rpc("admin_meeting_detail", { p_meeting: id }), meetingChoices(ctx)]);
  if (!data) notFound();
  const meeting = data as MeetingDraft & { phase: string; invitees: number; started_at: string | null };
  if (meeting.started_at || meeting.phase === "ended" || meeting.phase === "cancelled") redirect("/admin/meetings");
  return (
    <AdminPage
      title={meeting.title}
      description={`${meeting.invitees} people have a pass. Changing the time tells everyone, and their passes update.`}
      crumbs={[{ label: "Meetings", href: "/admin/meetings" }, { label: "Edit" }]}
    >
      <Panel>
        <MeetingForm meeting={meeting} choices={choices} />
      </Panel>
    </AdminPage>
  );
}
