import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { CONTENT, withFallback, type ContentKey, type ContentValue } from "@/lib/site-content/schema";

/** Every stored row, fetched once per request. Empty if the table isn't there yet. */
const loadRows = cache(async (): Promise<Record<string, unknown>> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("site_content").select("key, value");
    if (error || !data) return {};
    return Object.fromEntries(data.map((row) => [row.key as string, row.value as unknown]));
  } catch {
    return {};
  }
});

/**
 * The value for a content key: what the admin panel saved, validated, with
 * the shipped default behind every field. Never throws.
 */
export async function getContent<K extends ContentKey>(key: K): Promise<ContentValue<K>> {
  const entry = CONTENT[key];
  const rows = await loadRows();
  const merged = withFallback(entry.fallback, rows[key]);
  const parsed = entry.schema.safeParse(merged);
  return (parsed.success ? parsed.data : entry.fallback) as ContentValue<K>;
}
