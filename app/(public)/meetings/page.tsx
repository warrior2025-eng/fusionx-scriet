import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CallAlerts, ActionCheck } from "@/components/meetings/meeting-bits";
import { MeetingPass } from "@/components/meetings/meeting-pass";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { istDateTime } from "@/lib/events/format";
import { getMyMeetings } from "@/lib/meetings/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Meetings", robots: { index: false } };

export default async function MeetingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/meetings");

  const { now, me, passes, past, actions } = await getMyMeetings();
  const open = actions.filter((a) => !a.done);
  return (
    <Section className="pt-16 pb-24">
      <Eyebrow>Meetings</Eyebrow>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Your meeting passes.</h1>
        <CallAlerts />
      </div>

      <section aria-label="Upcoming passes" className="mt-8">
        {passes.length === 0 ? (
          <p className="border border-line bg-surface p-6 text-sm text-ink/70">You have no upcoming meetings. When you are invited, your pass appears here.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {passes.map((pass) => (
              <div key={pass.id} className="min-w-0">
                <MeetingPass pass={pass} owner={me} serverNow={now} />
                <Link href={`/meetings/${pass.id}`} className="mt-2 inline-block text-sm text-ink/70 underline underline-offset-2 hover:text-ink">
                  Calendar, phone and &ldquo;Can&rsquo;t make it&rdquo;
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="my-actions" className="mt-12">
        <h2 id="my-actions" className="font-serif text-2xl text-ink">
          My action items {open.length > 0 && <span className="text-base text-ink/60">({open.length} open)</span>}
        </h2>
        {actions.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">Nothing assigned to you.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border border-line bg-surface">
            {actions.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-3.5 text-sm">
                <ActionCheck id={a.id} done={a.done} label={a.task} />
                <span className="min-w-0 flex-1">
                  <span className={a.done ? "text-ink/60 line-through" : "text-ink"}>{a.task}</span>
                  <span className="block text-xs text-ink/60">
                    {a.meeting}
                    {a.due_on ? ` · due ${a.due_on}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past-meetings" className="mt-12">
        <h2 id="past-meetings" className="font-serif text-2xl text-ink">
          Past meetings
        </h2>
        {past.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border border-line bg-surface">
            {past.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-ink">{m.title}</span>
                  <span className="block text-xs text-ink/60">
                    {istDateTime(m.starts_at)}
                    {m.phase === "cancelled" ? " · Cancelled" : ""}
                  </span>
                </span>
                {m.phase !== "cancelled" && (
                  <Link href={`/meetings/${m.id}/minutes`} className="text-accent-text underline underline-offset-2">
                    View minutes
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Section>
  );
}
