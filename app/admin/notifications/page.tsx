import type { Metadata } from "next";
import { sendBroadcast } from "@/actions/admin-inbox";
import { AdminForm, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { AdminPage, Panel, formatDate } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/permissions/capabilities";

export const metadata: Metadata = { title: "Admin: Broadcast" };

type Sent = { id: string; created_at: string; metadata: { after?: { audience?: string; title?: string; recipients?: number } } | null };

export default async function BroadcastPage() {
  const ctx = await requireCapability("broadcast", "/admin/notifications");
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
      description="Send an in-app notification. It appears under Notifications for everyone in the audience; no email is sent."
      crumbs={[{ label: "Broadcast" }]}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="New notification" className="lg:col-span-2">
          <AdminForm action={sendBroadcast} submitLabel="Send notification">
            <SelectField
              name="audience"
              label="Audience"
              defaultValue="all"
              options={[
                { value: "all", label: "All members" },
                ...ALL_ROLES.map((role) => ({ value: role, label: `Everyone with the ${ROLE_LABELS[role]} role` })),
              ]}
            />
            <TextField name="title" label="Title" maxLength={120} />
            <TextareaField name="body" label="Message" rows={4} max={600} counter />
            <TextField
              name="link"
              label="Link (optional)"
              hint="A page on this site to open, like /events."
              placeholder="/events"
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
