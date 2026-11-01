import { createClient } from "@/lib/supabase/server";

/** The room closing (sent as a beacon when the tab goes away): the person's time stops here, not 30 seconds later. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  await supabase.rpc("meeting_left", { p_meeting: id });
  return new Response(null, { status: 204 });
}
