import { z } from "zod";
import { EVENT_TYPES } from "@/lib/interview/shared";
import { createClient } from "@/lib/supabase/server";

/**
 * The last integrity events of a candidate's page as it closes (the tab or
 * the browser): sent with navigator.sendBeacon, which still goes out while
 * the page closes, with the candidate's own sign-in cookies. The database
 * checks everything as for the page's other events (log_interview_events:
 * only their own booking, only while their room is open, rate-limited).
 */
const body = z.object({
  booking: z.string().uuid(),
  events: z
    .array(
      z.object({
        type: z.enum(EVENT_TYPES),
        at: z.string().datetime(),
        detail: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean()])).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 20_000) return new Response(null, { status: 413 });
  let parsed;
  try {
    parsed = body.safeParse(JSON.parse(raw));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed.success) return new Response(null, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { error } = await supabase.rpc("log_interview_events", { p_booking: parsed.data.booking, p_events: parsed.data.events });
  return new Response(null, { status: error ? 400 : 204 });
}
