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
export const GEMINI_MODELS = [...new Set([AI_MODEL, "gemini-flash-lite-latest", "gemini-flash-latest"])];
/** The Groq fallback (free tier), used when no Gemini model answers and GROQ_API_KEY is set. */
export const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

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
