import type { Metadata } from "next";
import Link from "next/link";
import { sendBroadcast } from "@/actions/admin-inbox";
import { AdminForm, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { AdminPage, Panel, formatDate } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { DEFAULT_CHECKLIST } from "@/lib/interview/shared";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/permissions/capabilities";
import { getCurrentCycle } from "@/lib/recruitment/data";

export const metadata: Metadata = { title: "Admin: Broadcast" };

type Sent = { id: string; created_at: string; metadata: { after?: { audience?: string; title?: string; recipients?: number } } | null };

/** "25 Oct" */
const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * ?preset=interview fills in the reminder for candidates with an interview
 * booking: the next interview day's date and its checklist (Slots → Interview
 * mode). Nothing is sent until the admin presses Send.
 */
async function interviewPreset(ctx: Awaited<ReturnType<typeof requireCapability>>) {
  const cycle = await getCurrentCycle();
  if (!cycle) return null;
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10); // IST date
  const { data: days } = await ctx.supabase.from("recruitment_slot_days").select("id, date").eq("cycle_id", cycle.id).gte("date", today).order("date").limit(1);
  const day = (days ?? [])[0] as { id: string; date: string } | undefined;
  const { data: room } = day ? await ctx.supabase.from("recruitment_room_settings").select("*").eq("day_id", day.id).maybeSingle() : { data: null };
  const checklist = ((room as { candidate_checklist?: string | null } | null)?.candidate_checklist || DEFAULT_CHECKLIST).trim();
  return {
    title: `Your FusionX@SCRIET interview${day ? ` on ${shortDate(day.date)}` : ""}`,
    body: checklist,
  };
}

export default async function BroadcastPage({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  const ctx = await requireCapability("broadcast", "/admin/notifications");
  const { preset } = await searchParams;
  const canInterview = ctx.caps.includes("recruitment");
  const filled = preset === "interview" && canInterview ? await interviewPreset(ctx) : null;
  const { data } = await ctx.supabase
    .from("audit_logs")
    .select("id, created_at, metadata")
    .eq("action", "sent_broadcast")
    .order("created_at", { ascending: false })
    .limit(8);
  const sent = (data ?? []) as Sent[];

  return (
    <AdminPage
      title="Broadcast"
      description="Send an in-app notification. It appears under Notifications for everyone in the audience, and goes by email too when email notifications are on in Settings."
      crumbs={[{ label: "Broadcast" }]}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="New notification" className="lg:col-span-2">
          {canInterview && !filled && (
            <p className="mb-5 text-sm">
              <Link href="/admin/notifications?preset=interview" className="font-medium text-accent underline underline-offset-2">
                Fill in the interview reminder for booked candidates
              </Link>
            </p>
          )}
          {filled && (
            <p className="mb-5 border border-line bg-paper px-3 py-2 text-sm text-ink">
              Interview reminder filled in. Check it, then press <span className="font-semibold">Send notification</span>. Nothing has been sent yet.
            </p>
          )}
          <AdminForm key={filled ? "interview" : "blank"} action={sendBroadcast} submitLabel="Send notification">
            <SelectField
              name="audience"
              label="Audience"
              defaultValue={filled ? "interview_booked" : "all"}
              options={[
                { value: "all", label: "All members" },
                ...(canInterview ? [{ value: "interview_booked", label: "Candidates with an interview booking in this cycle" }] : []),
                ...ALL_ROLES.map((role) => ({ value: role, label: `Everyone with the ${ROLE_LABELS[role]} role` })),
              ]}
            />
            <TextField name="title" label="Title" maxLength={120} defaultValue={filled?.title} />
            <TextareaField name="body" label="Message" rows={filled ? 12 : 4} max={1000} counter defaultValue={filled?.body} />
            <TextField
              name="link"
              label="Link (optional)"
              hint="A page on this site to open, like /events."
              placeholder="/events"
              defaultValue={filled ? "/recruitment/status" : undefined}
            />
          </AdminForm>
        </Panel>

        <Panel title="Recently sent">
          {sent.length === 0 ? (
            <p className="text-sm text-ink/60">Nothing has been sent yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {sent.map((item) => (
                <li key={item.id} className="py-2.5 text-sm">
                  <p className="font-medium text-ink">{item.metadata?.after?.title ?? "Notification"}</p>
                  <p className="text-xs text-ink/60">
                    {item.metadata?.after?.recipients ?? 0} people, {formatDate(item.created_at, true)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
