import { NextResponse } from "next/server";
import { getCurrentCycle, getMyBooking } from "@/lib/recruitment/data";
import { CALENDAR_LOCATION, DEFAULT_INSTRUCTIONS } from "@/lib/recruitment/slots";
import { siteName } from "@/lib/site-config";
import { createClient } from "@/lib/supabase/server";

const pad = (n: number) => String(n).padStart(2, "0");
/** iCalendar text escaping: backslash, semicolon, comma and newlines. */
const escape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utcStamp = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

/**
 * "Add to calendar" for the signed-in candidate's interview slot. Times are
 * written in UTC so every calendar shows them correctly. The Meet link is
 * never in the file: the location says it will be shared on the day.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/recruitment/status", request.url));

  const cycle = await getCurrentCycle();
  const booking = cycle ? await getMyBooking(cycle.id) : null;
  if (!cycle || !booking) return new Response("You have no interview slot.", { status: 404 });

  const online = booking.mode === "online_meet";
  const description = online ? cycle.interview_instructions || DEFAULT_INSTRUCTIONS : cycle.reporting_note || "";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${siteName}//Recruitment//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.booking_id}@fusionx-scriet`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(new Date(booking.starts_at))}`,
    `DTEND:${utcStamp(new Date(booking.ends_at))}`,
    `SUMMARY:${escape(`${siteName} interview: ${cycle.title}`)}`,
    `LOCATION:${escape(online ? CALENDAR_LOCATION : booking.venue || "Venue to be announced")}`,
    `DESCRIPTION:${escape(description.slice(0, 900))}`,
    `URL:${new URL("/recruitment/status", request.url).toString()}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="fusionx-interview.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
