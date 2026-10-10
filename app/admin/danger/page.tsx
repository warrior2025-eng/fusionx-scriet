import type { Metadata } from "next";
import Link from "next/link";
import { clearBanner, setMaintenanceMode } from "@/actions/admin-danger";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, CheckboxField, TextareaField } from "@/components/admin/admin-form";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { getOrganizationSettings } from "@/lib/data/organization";

export const metadata: Metadata = { title: "Admin: Danger zone" };

export default async function DangerPage() {
  await requireCapability("danger", "/admin/danger");
  const settings = await getOrganizationSettings();

  return (
    <AdminPage
      title="Danger zone"
      description="Super admin only. These affect every visitor straight away."
      crumbs={[{ label: "Danger zone" }]}
    >
      <div className="space-y-6">
        <Panel
          title="Maintenance mode"
          description="The public sees a maintenance page. Staff can still sign in and browse everything."
          className="border-red-500/40"
        >
          <AdminForm action={setMaintenanceMode} submitLabel="Save maintenance mode">
            <CheckboxField
              name="maintenance_mode"
              label="Maintenance mode is on"
              defaultChecked={settings.maintenance_mode}
            />
            <TextareaField
              name="maintenance_message"
              label="Message shown to visitors (optional)"
              rows={3}
              max={400}
              counter
              defaultValue={settings.maintenance_message ?? ""}
            />
          </AdminForm>
        </Panel>

        <Panel
          title="Clear the announcement banner"
          description="Removes the banner text, link and dates, and switches it off."
          className="border-red-500/40"
        >
          <ActionButton
            danger
            action={clearBanner}
            confirm={{
              title: "Clear the announcement banner?",
              body: "The text, link and dates are deleted. This can't be undone.",
              confirmLabel: "Clear banner",
              typed: "CLEAR",
            }}
          >
            Clear banner
          </ActionButton>
        </Panel>

        <Panel
          title="Revoke a user's sessions"
          description="Signs one user out of every device. Open their page under Users & roles and use Revoke all sessions."
          className="border-red-500/40"
        >
          <Link href="/admin/users" className="text-sm font-medium text-ink underline underline-offset-2">
            Go to Users & roles
          </Link>
        </Panel>
      </div>
    </AdminPage>
  );
}
