import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { endMeeting, removeMeetingEmail, resendMeetingEmail } from "@/actions/admin-meetings";
import { ActionButton } from "@/components/admin/action-button";
import { MeetingForm, type MeetingDraft } from "@/components/admin/meeting-form";
import { AdminPage, Panel, Pill } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { meetingChoices } from "@/lib/meetings/admin";

export const metadata: Metadata = { title: "Admin: Edit meeting" };

const STATUS = { waiting: "Waiting for sign-up", pass: "Has a pass", joined: "Joined" } as const;

function EmailInvites({ rows, over, started }: { rows: MeetingDraft["emails"]; over: boolean; started: boolean }) {
  return (
    <section aria-labelledby="email-invites">
      <h2 id="email-invites" className="font-serif text-xl text-ink">
        Email invites
      </h2>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {rows.map((row) => {
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm" data-email-row={row.email}>
              <span className="min-w-0 flex-1 basis-56 break-all text-ink">
                {row.email}
                {row.name && <span className="block text-xs text-ink/65">{row.name}</span>}
                {row.source === "group" && <span className="block text-xs text-ink/65">From a website section</span>}
              </span>
              <Pill tone={row.status === "waiting" ? "warn" : "good"}>
                <span className="normal-case">{STATUS[row.status]}</span>
              </Pill>
              {!over && (
                <div className="flex gap-2">
                  {row.status === "waiting" && (
                    <ActionButton title={row.can_resend ? `Resend to ${row.email}` : "You can resend this once an hour"} disabled={!row.can_resend} action={resendMeetingEmail.bind(null, row.id)}>
                      Resend
                    </ActionButton>
                  )}
                  {row.source === "manual" && !(started && row.status !== "waiting") && (
                    <ActionButton
                      danger
                      title={`Remove ${row.email}`}
                      action={removeMeetingEmail.bind(null, row.id)}
                      confirm={{ title: "Remove this email invite?", body: `${row.email} will no longer be invited to this meeting.`, confirmLabel: "Remove" }}
                    >
                      Remove
                    </ActionButton>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireCapability("meetings", `/admin/meetings/${id}`);
  const [{ data }, choices] = await Promise.all([ctx.supabase.rpc("admin_meeting_detail", { p_meeting: id }), meetingChoices(ctx)]);
  if (!data) notFound();
  const meeting = data as MeetingDraft & { phase: string; invitees: number; started_at: string | null };
  const over = meeting.phase === "ended" || meeting.phase === "cancelled";
  const editable = !meeting.started_at && !over;
  const live = meeting.phase === "live" || meeting.phase === "doors";
  const emails = meeting.emails ?? [];
  // A meeting that has started can't be edited, but it can be ended and its email invites can still be seen.
  if (!editable && !live && emails.length === 0) redirect("/admin/meetings");
  const m = { id, title: meeting.title };
  return (
    <AdminPage
      title={meeting.title}
      description={editable ? `${meeting.invitees} people have a pass. Changing the time tells everyone, and their passes update.` : `${meeting.invitees} people have a pass.`}
      crumbs={[{ label: "Meetings", href: "/admin/meetings" }, { label: editable ? "Edit" : "Email invites" }]}
    >
      {live && (
        <div className="mb-6">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink">{meeting.phase === "live" ? "This meeting is live." : "Doors are open for this meeting."} You can end it for everyone without entering the room.</p>
              <ActionButton
                danger
                action={endMeeting.bind(null, m.id)}
                confirm={{ title: `End '${m.title}' for everyone?`, body: "Everyone in the room leaves now and every pass shows it as ended. The minutes stay available.", confirmLabel: "End meeting" }}
              >
                End meeting
              </ActionButton>
            </div>
          </Panel>
        </div>
      )}
      {editable && (
        <Panel>
          <MeetingForm meeting={meeting} choices={choices} />
        </Panel>
      )}
      {emails.length > 0 && (
        <div className={editable ? "mt-6" : undefined}>
          <Panel>
            <EmailInvites rows={emails} over={over} started={Boolean(meeting.started_at)} />
          </Panel>
        </div>
      )}
    </AdminPage>
  );
}
