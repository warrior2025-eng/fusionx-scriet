import { NextResponse } from "next/server";
import type { Pass } from "@/lib/meetings/shared";
import { siteName } from "@/lib/site-config";
import { createClient } from "@/lib/supabase/server";

const pad = (n: number) => String(n).padStart(2, "0");
/** iCalendar text escaping: backslash, semicolon, comma and newlines. */
const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utcStamp = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

/** "Add to calendar" for someone with a pass. The address opens only for them, and the file holds no code. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/meetings/${id}/calendar.ics`)}`, request.url));

  const { data } = await supabase.rpc("meeting_view", { p_meeting: id, p_for: null });
  const pass = (data as { allowed?: boolean; pass?: Pass } | null)?.allowed ? (data as { pass: Pass }).pass : null;
  if (!pass) return new Response("You have no pass for this meeting.", { status: 404 });

  const start = new Date(pass.starts_at);
  const description = [pass.description ?? "", pass.agenda.length ? `Agenda: ${pass.agenda.join("; ")}` : "", "Open your FusionX Meeting Pass on the website to enter."].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${siteName}//Meetings//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${id}@fusionx-scriet`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(new Date(start.getTime() + pass.duration_min * 60000))}`,
    `SUMMARY:${escape(pass.title)}`,
    `LOCATION:${escape(`${siteName} website, with your Meeting Pass`)}`,
    `DESCRIPTION:${escape(description.slice(0, 900))}`,
    pass.phase === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="fusionx-meeting.ics"`, "Cache-Control": "private, no-store" },
  });
}
