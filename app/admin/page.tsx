import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AdminPage, Panel, formatDate, param, type ListParams } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import type { Capability } from "@/lib/permissions/capabilities";

export const metadata: Metadata = { title: "Admin" };

const QUICK_ACTIONS: { href: string; label: string; cap: Capability }[] = [
  { href: "/admin/events/new", label: "Add an event", cap: "content" },
  { href: "/admin/opportunities/new", label: "Add an opportunity", cap: "content" },
  { href: "/admin/announcements/new", label: "Write an announcement", cap: "content" },
  { href: "/admin/content", label: "Edit the home page", cap: "content" },
  { href: "/admin/team/new", label: "Add a team profile", cap: "team" },
  { href: "/admin/applications?status=submitted", label: "Review applications", cap: "applications" },
  { href: "/admin/notifications", label: "Send a notification", cap: "broadcast" },
];

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("admin.access");
  const { supabase, caps } = ctx;
  const denied = param(await searchParams, "denied") === "1";
  const today = new Date().toISOString().slice(0, 10);

  // Real counts only. A count the current role may not read is simply not shown.
  const head = { count: "exact", head: true } as const;
  const [members, applications, projects, events, messages, opportunities, activity] = await Promise.all([
    supabase.rpc("get_member_count"),
    caps.includes("applications")
      ? supabase.from("applications").select("*", head).in("status", ["submitted", "under_review", "shortlisted"])
      : null,
    supabase.from("projects").select("*", head).eq("is_published", true),
    supabase.from("events").select("*", head).eq("is_published", true).in("status", ["upcoming", "live"]).gte("event_date", today),
    caps.includes("messages") ? supabase.from("contact_messages").select("*", head).eq("is_reviewed", false) : null,
    supabase.from("opportunities").select("*", head).eq("is_published", true).neq("status", "closed"),
    caps.includes("audit")
      ? supabase
          .from("audit_logs")
          .select("id, user_id, action, resource_type, created_at")
          .order("created_at", { ascending: false })
          .limit(8)
      : null,
  ]);

  const metrics = [
    { label: "Members", value: typeof members.data === "number" ? members.data : null, href: caps.includes("users") ? "/admin/users" : null },
    { label: "Pending applications", value: applications?.count ?? null, href: "/admin/applications?status=submitted" },
    { label: "Published projects", value: projects.count ?? null, href: "/admin/projects" },
    { label: "Upcoming events", value: events.count ?? null, href: "/admin/events" },
    { label: "Unread messages", value: messages?.count ?? null, href: "/admin/messages" },
    { label: "Open opportunities", value: opportunities.count ?? null, href: "/admin/opportunities" },
  ].filter((m) => m.value !== null);

  const rows = activity?.data ?? [];
  const actorIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  return (
    <AdminPage title="Dashboard" description="A live summary of the site. Every number is counted from the database.">
      {denied && (
        <p role="alert" className="mb-6 border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-sm text-ink">
          Your role doesn&rsquo;t have access to that section.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {metrics.map((metric) => {
          const body = (
            <>
              <dd className="font-serif text-3xl tabular-nums text-ink">{metric.value}</dd>
              <dt className="mt-1 text-sm text-ink/65">{metric.label}</dt>
            </>
          );
          return metric.href ? (
            <Link key={metric.label} href={metric.href} className="flex flex-col-reverse justify-end border border-line bg-surface p-5 transition-colors hover:border-accent">
              {body}
            </Link>
          ) : (
            <div key={metric.label} className="flex flex-col-reverse justify-end border border-line bg-surface p-5">
              {body}
            </div>
          );
        })}
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Quick actions">
          <ul className="divide-y divide-line">
            {QUICK_ACTIONS.filter((action) => caps.includes(action.cap)).map((action) => (
              <li key={action.href}>
                <Link href={action.href} className="group flex items-center justify-between py-2.5 text-sm text-ink hover:text-ink">
                  <span className="link-slide">{action.label}</span>
                  <ArrowRight size={14} className="arrow-nudge text-ink/55" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        {caps.includes("audit") && (
          <Panel title="Recent activity">
            {rows.length === 0 ? (
              <p className="text-sm text-ink/60">Nothing has been recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((row) => (
                  <li key={row.id} className="py-2.5 text-sm">
                    <p className="text-ink">
                      <span className="font-medium">{nameOf.get(row.user_id) ?? "Someone"}</span>{" "}
                      {String(row.action).replace(/_/g, " ")}{" "}
                      <span className="text-ink/70">{String(row.resource_type).replace(/_/g, " ")}</span>
                    </p>
                    <p className="text-xs text-ink/55">{formatDate(row.created_at, true)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/audit-logs" className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2">
              Open the audit log
            </Link>
          </Panel>
        )}
      </div>
    </AdminPage>
  );
}
