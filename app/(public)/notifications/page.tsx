import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { markAllNotificationsRead } from "@/actions/notifications";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, link, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const hasUnread = (notifications ?? []).some((n) => !n.is_read);

  async function markAll() {
    "use server";
    await markAllNotificationsRead();
  }

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <Eyebrow>Notifications</Eyebrow>
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink">Updates for you.</h1>
        </div>
        {hasUnread && (
          <form action={markAll}>
            <Button type="submit" variant="secondary" size="sm">
              Mark all as read
            </Button>
          </form>
        )}
      </div>

      {notifications && notifications.length > 0 ? (
        <div className="space-y-2">
          {notifications.map((n) => {
            const content = (
              <div
                className={`border rounded-sm p-4 transition-colors ${
                  n.is_read ? "border-ink/10 bg-surface" : "border-accent/40 bg-accent/10"
                }`}
              >
                <p className="font-medium text-ink text-sm">{n.title}</p>
                {n.body && <p className="text-sm text-ink/55 mt-1">{n.body}</p>}
                <p className="text-xs text-ink/35 mt-2">
                  {new Date(n.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link}>
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No notifications yet."
          description="You'll see updates here about your applications, teams, projects, and events."
        />
      )}
    </Section>
  );
}
