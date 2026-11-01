import type { AdminContext } from "@/lib/admin/guard";
import type { Choices } from "@/components/admin/meeting-form";

/** What the create and edit forms offer: Core teams in their order, and FusionX Teams teams. */
export async function meetingChoices(ctx: AdminContext): Promise<Choices> {
  const [groups, teams] = await Promise.all([
    ctx.supabase.from("core_groups").select("id, name, kind").order("display_order").order("created_at"),
    ctx.supabase.from("teams").select("id, name").order("name").limit(500),
  ]);
  return { groups: (groups.data ?? []) as Choices["groups"], teams: (teams.data ?? []) as Choices["teams"] };
}
