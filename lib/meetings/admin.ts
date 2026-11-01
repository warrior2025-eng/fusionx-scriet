import type { AdminContext } from "@/lib/admin/guard";
import type { Choices, PickerGroup } from "@/components/admin/meeting-audience";

/** What the picker offers: every group with its members, in the order they are shown. */
export async function meetingChoices(ctx: AdminContext): Promise<Choices> {
  const { data } = await ctx.supabase.rpc("meeting_audience_members");
  return { groups: (data ?? []) as PickerGroup[] };
}
