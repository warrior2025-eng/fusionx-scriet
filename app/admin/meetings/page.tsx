import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ActionButton } from "@/components/admin/action-button";
import { InstantMeetingButton } from "@/components/admin/meeting-form";
import { AdminPage, EmptyRow, Pill, Table, Td, Th, formatDate, param, type ListParams } from "@/components/admin/ui";
import { cancelMeeting } from "@/actions/admin-meetings";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import { meetingChoices } from "@/lib/meetings/admin";
import type { MeetingPhase } from "@/lib/meetings/shared";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin: Meetings" };

type Row = {
  id: string;
  title: string;
  starts_at: string;
  duration_min: number;
  phase: MeetingPhase;
  instant: boolean;
  series: boolean;
  host: string | null;
  invitees: number;
  attendees: number;
  inside: number;
  chips: string[];
};

const TABS = [
  { key: "upcoming", label: "Upcoming", phases: ["upcoming", "doors"] },
  { key: "live", label: "Live now", phases: ["live"] },
  { key: "past", label: "Past", phases: ["ended", "cancelled"] },
] as const;

export default async function MeetingsAdminPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("meetings", "/admin/meetings");
  const params = await searchParams;
  const tab = TABS.find((t) => t.key === param(params, "tab")) ?? TABS[0];
  const [{ data, error }, choices] = await Promise.all([ctx.supabase.rpc("admin_meetings"), meetingChoices(ctx)]);
  const all = (data ?? []) as Row[];
  const rows = all.filter((m) => (tab.phases as readonly string[]).includes(m.phase));
  if (tab.key !== "past") rows.reverse();

  return (
    <AdminPage
      title="Meetings"
      description="Discussion meetings, joined with a personal Meeting Pass. There are no codes and no links: people enter because they are invited."
      crumbs={[{ label: "Meetings" }]}
      actions={
        <>
          <InstantMeetingButton choices={choices} />
          <LinkButton href="/admin/meetings/new" size="sm">
            <Plus size={15} aria-hidden /> New meeting
          </LinkButton>
        </>
      }
    >
      <nav aria-label="Meeting lists" className="mb-6 flex flex-wrap gap-x-6 gap-y-1 border-b border-line">
        {TABS.map((t) => {
          const count = all.filter((m) => (t.phases as readonly string[]).includes(m.phase)).length;
          return (
            <Link
              key={t.key}
              href={`/admin/meetings?tab=${t.key}`}
              aria-current={t.key === tab.key ? "page" : undefined}
              className={cn("border-b-2 px-1 pb-2 text-sm font-medium", t.key === tab.key ? "border-accent text-ink" : "border-transparent text-ink/65 hover:text-ink")}
            >
              {t.label} <span className="text-xs text-ink/55">{count}</span>
            </Link>
          );
        })}
      </nav>
      {error && (
        <p role="alert" className="mb-4 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          The meetings could not be loaded. If migration 0032 has not been run yet, run it and reload.
        </p>
      )}
      <Table label="Meetings">
        <thead>
          <tr>
            <Th>Meeting</Th>
            <Th>Date and time (IST)</Th>
            <Th>Audience</Th>
            <Th>Host</Th>
            <Th>Invitees</Th>
            <Th>Attendees</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow colSpan={7}>Nothing here yet.</EmptyRow>}
          {rows.map((m) => {
            const editable = m.phase === "upcoming" || m.phase === "doors";
            return (
              <tr key={m.id}>
                <Td className="font-medium text-ink">
                  {editable ? (
                    <Link href={`/admin/meetings/${m.id}`} className="hover:underline">
                      {m.title}
                    </Link>
                  ) : (
                    m.title
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.phase === "live" && <Pill tone="good">Live · {m.inside} inside</Pill>}
                    {m.phase === "doors" && <Pill tone="good">Doors open</Pill>}
                    {m.phase === "cancelled" && <Pill tone="bad">Cancelled</Pill>}
                    {m.instant && <Pill>Instant</Pill>}
                    {m.series && <Pill>Weekly</Pill>}
                  </div>
                </Td>
                <Td className="whitespace-nowrap">
                  {formatDate(m.starts_at, true)}
                  <span className="block text-xs text-ink/60">{m.duration_min} min</span>
                </Td>
                <Td>
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {m.chips.map((c) => (
                      <span key={c} className="border border-line px-1.5 py-0.5 text-xs">
                        {c}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td>{m.host ?? ""}</Td>
                <Td className="tabular-nums">{m.invitees}</Td>
                <Td className="tabular-nums">{m.attendees}</Td>
                <Td className="whitespace-nowrap text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {(m.phase === "doors" || m.phase === "live") && (
                      <LinkButton href={`/meetings/${m.id}?enter=1`} size="sm">
                        Enter
                      </LinkButton>
                    )}
                    {m.phase === "ended" && (
                      <LinkButton href={`/meetings/${m.id}/minutes`} variant="secondary" size="sm">
                        Minutes
                      </LinkButton>
                    )}
                    {editable && (
                      <>
                        <LinkButton href={`/admin/meetings/${m.id}`} variant="secondary" size="sm">
                          Edit
                        </LinkButton>
                        <ActionButton
                          danger
                          action={cancelMeeting.bind(null, m.id)}
                          confirm={{ title: "Cancel this meeting?", body: `"${m.title}" will be cancelled and everyone invited will be told.`, confirmLabel: "Cancel the meeting" }}
                        >
                          Cancel
                        </ActionButton>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </AdminPage>
  );
}
