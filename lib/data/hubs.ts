import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hubs as shippedHubs } from "@/lib/site-config";
import type { Hub } from "@/types/database";

const FALLBACK: Hub[] = shippedHubs.map((h, i) => ({
  ...h,
  id: `fallback-${h.slug}`,
  responsibilities: [...h.responsibilities],
  display_order: i + 1,
  is_visible: true,
}));

const COLUMNS =
  "id, slug, name, tagline, summary, about, responsibilities, who_should_join, what_you_gain, type_label, type_note, cta, icon_name, display_order, is_visible";

/**
 * Visible hubs in display order (managed from the admin panel: FusionX Hubs).
 * Falls back to the five in lib/site-config.ts if the table can't be read,
 * e.g. before migration 0019 has added the hub columns.
 */
export const getHubs = cache(async (): Promise<Hub[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("programs")
      .select(COLUMNS)
      .eq("is_visible", true)
      .order("display_order", { ascending: true });
    if (error || !data || data.length === 0) return FALLBACK;
    return data as Hub[];
  } catch {
    return FALLBACK;
  }
});

/** The text of a field split into paragraphs at empty lines. */
export function paragraphs(text: string | null): string[] {
  return (text ?? "")
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** "Title: description" items, split at the first colon. */
export function responsibilityItems(hub: Hub): { title: string; description: string }[] {
  return hub.responsibilities.map((item) => {
    const at = item.indexOf(":");
    return at > 0
      ? { title: item.slice(0, at).trim(), description: item.slice(at + 1).trim() }
      : { title: "", description: item.trim() };
  });
}

/** Operational hubs (apply through recruitment) and the collaborative ones (FusionX Teams). */
export function splitHubs(hubs: Hub[]): { operational: Hub[]; network: Hub[] } {
  return { operational: hubs.filter((h) => h.cta !== "teams"), network: hubs.filter((h) => h.cta === "teams") };
}
