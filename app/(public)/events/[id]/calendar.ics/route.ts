import { createClient } from "@/lib/supabase/server";
import { siteName } from "@/lib/site-config";

const pad = (n: number) => String(n).padStart(2, "0");

/** iCalendar text escaping: backslash, semicolon, comma and newlines. */
const escape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** A UTC timestamp in iCalendar form: 20261012T120000Z. */
function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * "Add to calendar" for one published event. The event's date and time are
 * stored as Indian Standard Time, so they are converted to UTC here and every
 * calendar app shows the right local time.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!event || event.status === "cancelled") return new Response("Not found", { status: 404 });

  const date = String(event.event_date);
  const compactDate = date.replace(/-/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${siteName}//Events//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT"];
  lines.push(`UID:${id}@fusionx-scriet`, `DTSTAMP:${utcStamp(new Date())}`);

  if (event.event_time) {
    const start = new Date(`${date}T${String(event.event_time).slice(0, 8)}+05:30`);
    // With no end time set, a two-hour block.
    const end = event.end_date ? new Date(String(event.end_date)) : new Date(start.getTime() + 2 * 3600 * 1000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end > start ? end : new Date(start.getTime() + 3600 * 1000))}`);
  } else {
    // All-day: the end date is the day after.
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(
      `DTSTART;VALUE=DATE:${compactDate}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`,
    );
  }

  lines.push(`SUMMARY:${escape(String(event.title))}`);
  if (event.venue) lines.push(`LOCATION:${escape(String(event.venue))}`);
  lines.push(`DESCRIPTION:${escape(String(event.description).slice(0, 900))}`);
  lines.push(`URL:${new URL(`/events/${id}`, request.url).toString()}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="fusionx-event.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
