import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { ActionCheck, SendMinutes } from "@/components/meetings/meeting-bits";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { istDateTime, istTime } from "@/lib/events/format";
import { attendanceByTeam, type Minutes } from "@/lib/meetings/minutes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Meeting minutes", robots: { index: false } };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8" aria-label={title}>
      <h2 className="font-serif text-xl text-ink">{title}</h2>
      <div className="mt-2 text-sm text-ink/85">{children}</div>
    </section>
  );
}

const none = <p className="text-ink/60">None.</p>;

/** Invitees and admins only. */
export default async function MinutesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/meetings/${id}/minutes`)}`);
  const { data, error } = await supabase.rpc("meeting_minutes", { p_meeting: id });
  if (error) redirect(`/meetings/${id}`);
  if (!data) notFound();
  const m = data as Minutes;
  return (
    <Section className="max-w-3xl pt-16 pb-24">
      <Eyebrow>Minutes</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">{m.title}</h1>
      <p className="mt-2 text-sm text-ink/70">
        {istDateTime(m.starts_at)} · {m.duration_min} min
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a href={`/meetings/${id}/minutes/export`} className="btn btn--secondary inline-flex items-center gap-2 rounded-sm border border-ink/40 px-3.5 py-1.5 text-sm font-medium text-ink hover:border-ink">
          <Download size={14} aria-hidden /> Download PDF
        </a>
        {m.is_host && <SendMinutes meetingId={id} />}
      </div>

      <Block title="Agenda">
        {m.agenda.length === 0 ? (
          none
        ) : (
          <ol className="list-decimal space-y-1 pl-5">
            {m.agenda.map((a, i) => (
              <li key={i}>
                {a.title}
                {a.minutes ? <span className="text-ink/60"> ({a.minutes} min)</span> : null}
              </li>
            ))}
          </ol>
        )}
      </Block>
      <Block title="Notes">{m.notes ? <p className="whitespace-pre-wrap">{m.notes}</p> : none}</Block>
      <Block title="Decisions">
        {m.decisions.length === 0 ? (
          none
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {m.decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
      </Block>
      <Block title="Action items">
        {m.actions.length === 0 ? (
          none
        ) : (
          <ul className="divide-y divide-line border border-line bg-surface">
            {m.actions.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-3">
                {(m.is_host || a.owner_id === m.me) && <ActionCheck id={a.id} done={a.done} label={a.task} />}
                <span className="min-w-0 flex-1">
                  <span className={a.done ? "line-through opacity-70" : ""}>{a.task}</span>
                  <span className="block text-xs text-ink/60">
                    {a.owner ?? "No owner"}
                    {a.due_on ? ` · due ${a.due_on}` : ""} · {a.done ? "Done" : "Open"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title="Attendance">
        {m.attendance.length === 0
          ? none
          : attendanceByTeam(m.attendance).map((group) => (
              <div key={group.name} className="mt-3 first:mt-0">
                <h3 className="font-semibold text-ink">{group.name}</h3>
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full min-w-[28rem] border-collapse text-left">
                    <thead>
                      <tr className="text-xs text-ink/60">
                        <th scope="col" className="py-1 pr-3 font-medium">Name</th>
                        <th scope="col" className="py-1 pr-3 font-medium">First join</th>
                        <th scope="col" className="py-1 pr-3 font-medium">Last leave</th>
                        <th scope="col" className="py-1 font-medium">Minutes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.people.map((p) => (
                        <tr key={p.name} className="border-t border-line">
                          <td className="py-1.5 pr-3">{p.name}</td>
                          <td className="py-1.5 pr-3">{istTime(p.first_join)}</td>
                          <td className="py-1.5 pr-3">{istTime(p.last_leave)}</td>
                          <td className="py-1.5 tabular-nums">{p.minutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
      </Block>
      <Block title="Can't make it">
        {m.cant.length === 0 ? (
          none
        ) : (
          <ul className="space-y-1">
            {m.cant.map((c) => (
              <li key={c.name}>
                <span className="font-medium">{c.name}:</span> {c.reason}
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title="Hosts and co-hosts">
        {m.hosts.length === 0 ? (
          none
        ) : (
          <ul className="space-y-1">
            {m.hosts.map((h) => (
              <li key={`${h.kind}-${h.name}`}>
                {h.name} <span className="text-ink/60">({h.kind})</span>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </Section>
  );
}
