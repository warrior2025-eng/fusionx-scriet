import type { Metadata } from "next";
import { MeetingForm } from "@/components/admin/meeting-form";
import { AdminPage, Panel, param, type ListParams } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { meetingChoices } from "@/lib/meetings/admin";

export const metadata: Metadata = { title: "Admin: New meeting" };

/** `?team=` comes from "Schedule a meeting with this team" on a Core team's card. */
export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("meetings", "/admin/meetings/new");
  const team = param(await searchParams, "team");
  const choices = await meetingChoices(ctx);
  return (
    <AdminPage title="New meeting" crumbs={[{ label: "Meetings", href: "/admin/meetings" }, { label: "New" }]}>
      <Panel>
        <MeetingForm choices={choices} preselectTeam={choices.groups.some((g) => g.id === team) ? team : undefined} />
      </Panel>
    </AdminPage>
  );
}
