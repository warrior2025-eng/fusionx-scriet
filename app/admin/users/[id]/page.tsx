import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { revokeSessions } from "@/actions/admin-danger";
import { grantRole, revokeRole, setAccountActive } from "@/actions/admin-users";
import { ActionButton } from "@/components/admin/action-button";
import { AdminPage, Panel, Pill, formatDate } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { getUserEmail } from "@/lib/admin/users";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/permissions/capabilities";
import type { AppRole, Profile } from "@/types/database";

export const metadata: Metadata = { title: "Admin: User" };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.08em] text-ink/55">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{children || <span className="text-ink/45">Not provided</span>}</dd>
    </div>
  );
}

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("users", "/admin/users");
  const { supabase, caps } = ctx;

  const [{ data: profileRow }, { data: roleRows }, projects, research] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("user_roles").select("role, granted_at").eq("user_id", id),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("owner_id", id),
    supabase.from("research").select("*", { count: "exact", head: true }).eq("created_by", id),
  ]);
  if (!profileRow) notFound();
  const profile = profileRow as Profile;
  const email = await getUserEmail(id).catch(() => null);

  const roles = (roleRows ?? []).map((r) => r.role as AppRole);
  const isSelf = id === ctx.user.id;
  const isActive = profile.is_active !== false;
  const targetIsAdmin = roles.includes("admin") || roles.includes("super_admin");
  const canManageRoles = caps.includes("roles");
  const canDeactivate = !isSelf && (!targetIsAdmin || canManageRoles);

  return (
    <AdminPage
      title={profile.full_name}
      crumbs={[{ label: "Users & roles", href: "/admin/users" }, { label: profile.full_name }]}
      actions={isActive ? <Pill>Active</Pill> : <Pill tone="bad">Deactivated</Pill>}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Profile" className="lg:col-span-2">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Detail label="Email">{email}</Detail>
            <Detail label="Joined">{formatDate(profile.created_at, true)}</Detail>
            <Detail label="Department">{profile.department}</Detail>
            <Detail label="Year">{profile.year}</Detail>
            <Detail label="Membership">{profile.membership_type.replace(/_/g, " ")}</Detail>
            <Detail label="Public profile">{profile.is_profile_public ? "Yes" : "No"}</Detail>
            <Detail label="Projects">{String(projects.count ?? 0)}</Detail>
            <Detail label="Research entries">{String(research.count ?? 0)}</Detail>
            <div className="sm:col-span-2">
              <Detail label="Bio">{profile.bio}</Detail>
            </div>
            <div className="sm:col-span-2">
              <Detail label="Skills">{profile.skills?.join(", ")}</Detail>
            </div>
            <Detail label="GitHub">{profile.github_url}</Detail>
            <Detail label="LinkedIn">{profile.linkedin_url}</Detail>
          </dl>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Roles"
            description={canManageRoles ? undefined : "Only a super admin can change roles."}
          >
            <ul className="space-y-2">
              {ALL_ROLES.map((role) => {
                const has = roles.includes(role);
                const locked = role === "super_admin" && has && isSelf;
                return (
                  <li key={role} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm text-ink">
                      {ROLE_LABELS[role]}
                      {has && <Pill tone="good">Has role</Pill>}
                    </span>
                    {canManageRoles &&
                      (has ? (
                        <ActionButton
                          variant="ghost"
                          disabled={locked}
                          title={locked ? "You can't remove your own super admin role" : undefined}
                          action={revokeRole.bind(null, id, role)}
                          confirm={{
                            title: `Revoke ${ROLE_LABELS[role]}?`,
                            body: `${profile.full_name} will lose everything this role allows.`,
                            confirmLabel: "Revoke",
                          }}
                        >
                          Revoke
                        </ActionButton>
                      ) : (
                        <ActionButton
                          action={grantRole.bind(null, id, role)}
                          confirm={
                            role === "super_admin" || role === "admin"
                              ? {
                                  title: `Grant ${ROLE_LABELS[role]}?`,
                                  body: `${profile.full_name} will be able to manage the site.`,
                                  confirmLabel: "Grant",
                                }
                              : undefined
                          }
                        >
                          Grant
                        </ActionButton>
                      ))}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel
            title="Account"
            description={
              isActive
                ? "Deactivating blocks sign-in and hides this account's published work from the public."
                : `Deactivated ${formatDate(profile.deactivated_at, true)}.`
            }
          >
            <div className="flex flex-col items-start gap-3">
              {isActive ? (
                <ActionButton
                  danger
                  disabled={!canDeactivate}
                  title={
                    isSelf
                      ? "You can't deactivate your own account"
                      : !canDeactivate
                        ? "Only a super admin can deactivate an admin"
                        : undefined
                  }
                  action={setAccountActive.bind(null, id, false)}
                  confirm={{
                    title: "Deactivate this account?",
                    body: `${profile.full_name} will not be able to sign in until the account is reactivated.`,
                    confirmLabel: "Deactivate",
                  }}
                >
                  Deactivate account
                </ActionButton>
              ) : (
                <ActionButton action={setAccountActive.bind(null, id, true)}>Reactivate account</ActionButton>
              )}
              {caps.includes("danger") && (
                <ActionButton
                  danger
                  action={revokeSessions.bind(null, id)}
                  confirm={{
                    title: "Sign this user out everywhere?",
                    body: "All of their sessions are ended. They can sign in again unless the account is deactivated.",
                    confirmLabel: "Revoke sessions",
                    typed: "REVOKE",
                  }}
                >
                  Revoke all sessions
                </ActionButton>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </AdminPage>
  );
}
