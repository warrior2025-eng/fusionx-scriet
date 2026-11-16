import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * FusionX AI: the model and the keys. SERVER ONLY. The keys are read here and sent
 * only to the AI provider; they never go to the browser or into a log.
 */

/**
 * A free-tier Gemini model. Change it with AI_MODEL, without a code change. The default
 * is Google's alias for its newest Flash-Lite, so a retired model never breaks the
 * assistant; the other names are tried in turn when one is unavailable.
 */
export const AI_MODEL = process.env.AI_MODEL || "gemini-flash-lite-latest";
// Fast models first; a retired name answers 404 at once and the next is tried. The slower "flash-latest" is last.
export const GEMINI_MODELS = [...new Set([AI_MODEL, "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-flash-latest"])];
/** The Groq fallback (free tier), used when no Gemini model answers and GROQ_API_KEY is set. */
export const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// Groq retires models over time. Its own list of live models picks one we prefer (checked at most every 6 hours).
const GROQ_PREFERRED = [process.env.GROQ_MODEL, "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3-32b"]
  .filter((m): m is string => Boolean(m));
let groqPick: { id: string; at: number } | null = null;
/** A Groq chat model that is live now (falls back to GROQ_MODEL when the list cannot be read). */
export async function groqModel(base: string): Promise<string> {
  if (groqPick && Date.now() - groqPick.at < 6 * 3_600_000) return groqPick.id;
  if (!process.env.GROQ_API_KEY) return GROQ_MODEL;
  const res = await fetch(`${base}/openai/v1/models`, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(8_000), cache: "no-store" }).catch(() => null);
  const ids = res?.ok ? (((await res.json().catch(() => null)) as { data?: { id: string; active?: boolean }[] } | null)?.data ?? []).filter((m) => m.active !== false).map((m) => m.id) : [];
  const id = GROQ_PREFERRED.find((m) => ids.includes(m)) ?? ids.find((m) => !/whisper|guard|tts|playai|compound|embed|distil|orpheus/i.test(m)) ?? GROQ_MODEL;
  if (ids.length) groqPick = { id, at: Date.now() };
  return id;
}

/** Without a Gemini key the launcher is hidden and the route answers 404. */
export const aiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

export type AiSettings = {
  enabled: boolean;
  welcome: string;
  suggestions: string[];
  extra_facts: string;
  visitor_limit: number;
  daily_cap: number;
  log_questions: boolean;
  knowledge_version: number;
};

/** The settings row (migration 0038), or null before it has been run: then the assistant stays hidden. */
export const getAiSettings = cache(async (): Promise<AiSettings | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_settings")
      .select("enabled, welcome, suggestions, extra_facts, visitor_limit, daily_cap, log_questions, knowledge_version")
      .eq("id", true)
      .maybeSingle();
    return error || !data ? null : (data as AiSettings);
  } catch {
    return null;
  }
});
