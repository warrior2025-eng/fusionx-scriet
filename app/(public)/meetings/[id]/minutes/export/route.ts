import { NextResponse } from "next/server";
import type { Column } from "@/lib/admin/csv";
import { pdfResponse } from "@/lib/admin/export";
import { istDateTime, istTime } from "@/lib/events/format";
import { attendanceByTeam, type Minutes } from "@/lib/meetings/minutes";
import { createClient } from "@/lib/supabase/server";

type Row = { section: string; item: string; detail: string };

const columns: Column<Row>[] = [
  { header: "Section", value: (r) => r.section },
  { header: "Item", value: (r) => r.item },
  { header: "Detail", value: (r) => r.detail },
];

/** The minutes as a PDF, for those who can read them (the database checks). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/meetings/${id}/minutes`, request.url));
  const { data, error } = await supabase.rpc("meeting_minutes", { p_meeting: id });
  if (error) return new Response("You can't read these minutes.", { status: 403 });
  if (!data) return new Response("Not found", { status: 404 });
  const m = data as Minutes;

  const rows: Row[] = [
    ...m.agenda.map((a, i) => ({ section: "Agenda", item: `${i + 1}. ${a.title}`, detail: a.minutes ? `${a.minutes} min` : "" })),
    ...(m.notes ? [{ section: "Notes", item: m.notes, detail: "" }] : []),
    ...m.decisions.map((d) => ({ section: "Decisions", item: d, detail: "" })),
    ...m.actions.map((a) => ({ section: "Action items", item: a.task, detail: [a.owner ?? "No owner", a.due_on ? `due ${a.due_on}` : "", a.done ? "Done" : "Open"].filter(Boolean).join(" · ") })),
    ...attendanceByTeam(m.attendance).flatMap((group) =>
      group.people.map((p) => ({
        section: `Attendance: ${group.name}`,
        item: p.seat.teams.length > 1 ? `${p.name} (also ${p.seat.teams.slice(1).map((team) => team.name).join(", ")})` : p.name,
        detail: `${istTime(p.first_join)} to ${istTime(p.last_leave)} · ${p.minutes} min`,
      })),
    ),
    ...m.cant.map((c) => ({ section: "Can't make it", item: c.name, detail: c.reason })),
    ...m.hosts.map((h) => ({ section: "Hosts and co-hosts", item: h.name, detail: h.kind })),
  ];
  return pdfResponse({ filename: "meeting-minutes", title: `Minutes: ${m.title}`, filters: { When: istDateTime(m.starts_at), Length: `${m.duration_min} min` }, rows, columns });
}
