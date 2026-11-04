"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { checkModels } from "@/lib/ai/model";
import { aiConfigured } from "@/lib/ai/settings";

/** FusionX AI's settings (migration 0038). Everything here can be shown to anyone. */

const schema = z.object({
  enabled: z.boolean(),
  welcome: z.string().trim().min(1, "Write a welcome message").max(500, "Keep the welcome under 500 characters"),
  suggestions: z
    .array(z.string().trim().min(1).max(80, "Keep each suggested question under 80 characters"))
    .max(6, "At most 6 suggested questions"),
  extra_facts: z.string().trim().max(8000, "Keep the extra facts under 8000 characters"),
  visitor_limit: z.coerce.number().int("A whole number").min(1, "At least 1").max(100, "At most 100"),
  daily_cap: z.coerce.number().int("A whole number").min(1, "At least 1").max(5000, "At most 5000"),
  log_questions: z.boolean(),
});

const touched = () => {
  revalidatePath("/admin/settings/ai");
  revalidatePath("/", "layout");
};

export async function saveAiSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("settings");
  if (!ctx) return FORBIDDEN;
  const parsed = schema.safeParse({
    enabled: formData.get("enabled") === "on",
    welcome: String(formData.get("welcome") ?? ""),
    suggestions: String(formData.get("suggestions") ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    extra_facts: String(formData.get("extra_facts") ?? ""),
    visitor_limit: formData.get("visitor_limit"),
    daily_cap: formData.get("daily_cap"),
    log_questions: formData.get("log_questions") === "on",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { data: before } = await ctx.supabase.from("ai_settings").select("*").eq("id", true).maybeSingle();
  if (!before) return fail("Run migration 0038 first.");
  // A change to the facts reaches the assistant at once.
  const values = { ...parsed.data, knowledge_version: before.knowledge_version + 1, updated_by: ctx.user.id };
  const { error } = await ctx.supabase.from("ai_settings").update(values).eq("id", true);
  if (error) return fail("Could not save the settings.");
  await logAudit(ctx, { action: "updated_ai_settings", table: "ai_settings", id: "1", before, after: values });
  touched();
  return ok("Saved.");
}

export async function refreshAiKnowledge(): Promise<ActionState> {
  const ctx = await authorize("settings");
  if (!ctx) return FORBIDDEN;
  const { data } = await ctx.supabase.from("ai_settings").select("knowledge_version").eq("id", true).maybeSingle();
  if (!data) return fail("Run migration 0038 first.");
  const { error } = await ctx.supabase.from("ai_settings").update({ knowledge_version: data.knowledge_version + 1, updated_by: ctx.user.id }).eq("id", true);
  if (error) return fail("Could not refresh it.");
  await logAudit(ctx, { action: "refreshed_ai_knowledge", table: "ai_settings", id: "1" });
  touched();
  return ok("The assistant will use the latest public information from its next answer.");
}

/** Asks each model for a one-word reply and says which answer. Reads only; nothing is saved. */
export async function testAiConnection(): Promise<ActionState> {
  const ctx = await authorize("settings");
  if (!ctx) return FORBIDDEN;
  if (!aiConfigured()) return fail("GEMINI_API_KEY is not set on the server.");
  const lines = await checkModels();
  const works = lines.some((l) => l.endsWith("works"));
  return works ? ok(lines.join(" · ")) : fail(`No model answered: ${lines.join(" · ")}. 403 means the key is wrong or blocked, 404 a retired model.`);
}
