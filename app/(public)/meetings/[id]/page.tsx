import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { EnterFlow } from "@/components/meetings/enter-flow";
import { KnockPanel } from "@/components/meetings/knock-panel";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import type { MeetingPhase, Pass, PassOwner } from "@/lib/meetings/shared";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Meeting", robots: { index: false } };

type View =
  | { found: false }
  | { found: true; wrong_account: true; now: string }
  | { found: true; allowed: true; now: string; pass: Pass; me: PassOwner | null }
  | { found: true; allowed: false; now: string; title: string; phase: MeetingPhase; knock: { status: "pending" | "let_in" | "not_now"; count: number } | null };

/**
 * One meeting. Signed out: only sign-in. Signed in with a pass: the pass, and from there
 * the room. Anyone else: knock. Opened from another person's notification: nothing.
 */
export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ for?: string; enter?: string }> }) {
  const [{ id }, { for: forTag, enter }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const query = new URLSearchParams();
    if (forTag) query.set("for", forTag);
    const next = `/meetings/${id}${query.size ? `?${query}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const { data, error } = await supabase.rpc("meeting_view", { p_meeting: id, p_for: forTag?.slice(0, 40) ?? null });
  if (error) throw new Error("The meeting could not be read.");
  const view = data as View;
  if (!view.found) notFound();

  if ("wrong_account" in view) {
    return (
      <Section className="pt-16 pb-24">
        <div className="mx-auto max-w-md border border-line bg-surface p-8 text-center">
          <h1 className="font-serif text-2xl text-ink">This pass belongs to another account</h1>
          <p className="mt-2 text-sm text-ink/70">Sign in with the account the invitation was sent to.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <form action={logoutAction}>
              <Button type="submit">Sign out</Button>
            </form>
            <Link href="/meetings" className="btn btn--secondary inline-flex items-center rounded-sm border border-ink/40 px-5 py-2.5 text-sm font-medium text-ink">
              My meetings
            </Link>
          </div>
        </div>
      </Section>
    );
  }

  if (view.allowed) {
    return (
      <Section className="pt-12 pb-24">
        <EnterFlow pass={view.pass} owner={view.me} serverNow={view.now} enter={enter === "1" || enter === "direct" ? enter : ""} />
      </Section>
    );
  }

  return (
    <Section className="pt-16 pb-24">
      {view.phase === "ended" || view.phase === "cancelled" ? (
        <p className="mx-auto max-w-md border border-line bg-surface p-8 text-center text-sm text-ink/75">This meeting is over.</p>
      ) : (
        <KnockPanel meetingId={id} title={view.title} open={view.phase === "doors" || view.phase === "live"} last={view.knock} />
      )}
    </Section>
  );
}
