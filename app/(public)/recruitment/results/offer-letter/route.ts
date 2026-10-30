import { getOrganizationSettings } from "@/lib/data/organization";
import { getCurrentCycle, getMyResult } from "@/lib/recruitment/data";
import { renderOfferLetter } from "@/lib/recruitment/offer-letter";
import { createClient } from "@/lib/supabase/server";

/** The signed-in candidate's offer letter: only once results are out, and only for a place they hold. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.redirect(new URL("/login?next=/recruitment/status", request.url), 307);

  const cycle = await getCurrentCycle();
  const result = cycle ? await getMyResult(cycle.id) : null;
  if (!cycle || !result || result.state !== "published" || result.outcome !== "selected" || !result.selected) {
    return new Response("There is no offer letter for this account.", { status: 404 });
  }
  const { chapter_name } = await getOrganizationSettings();
  const bytes = await renderOfferLetter({
    organization: chapter_name || "FusionX@SCRIET",
    name: result.name ?? "",
    hubs: (result.selected_hubs ?? [result.selected]).map((h) => ({ name: h.team_name, deadline: h.offer_deadline, accepted: h.offer_status === "accepted" })),
    cycle: result.cycle_title,
    issuedAt: cycle.results_publish_at ?? new Date().toISOString(),
    induction: result.induction,
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="fusionx-offer-letter.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
