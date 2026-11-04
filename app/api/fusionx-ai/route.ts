import { createHmac } from "node:crypto";
import { z } from "zod";
import { faqAnswer } from "@/lib/ai/fallback";
import { RESTING, isHindi, redactingStream, refusalFor, refusalText, saysDontKnow } from "@/lib/ai/guard";
import { getKnowledge } from "@/lib/ai/knowledge";
import { answer, type Turn } from "@/lib/ai/model";
import { aiConfigured, getAiSettings } from "@/lib/ai/settings";
import { getOrganizationSettings } from "@/lib/data/organization";
import { socialLinks } from "@/lib/site-config";
import { createAdminClient } from "@/lib/supabase/server";
import { linkHref } from "@/lib/validation/link";

/**
 * FusionX AI. Anyone may ask; the answer streams back as plain text.
 *
 * In order: the fixed rules (lib/ai/guard.ts) answer questions after private data,
 * attempts to change the rules, and plainly off-topic requests without the model. Then
 * the visitor's limit and the daily cap (ai_take_turn, migration 0038). Then the model,
 * with the public knowledge pack; when no free model can answer, the closest public fact
 * (lib/ai/fallback.ts) or "resting". Every answer passes redact() on the way out.
 *
 * The service role is used here only for the limit and the question log, never to read
 * what the assistant knows.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(500),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(40).default([]),
  id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
});

type Outcome = "answered" | "dont_know" | "declined" | "fallback" | "resting";

function visitorKey(request: Request, id: string | undefined): string {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  // A keyed hash: the address itself is never stored.
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY || "fusionx-ai").update(`${ip}|${id ?? ""}`).digest("hex");
}

const textResponse = (text: string, source: string) =>
  new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-AI-Source": source } });

export async function POST(request: Request) {
  if (!aiConfigured()) return Response.json({ error: "Not found" }, { status: 404 });
  const settings = await getAiSettings();
  if (!settings?.enabled) return Response.json({ error: "FusionX AI is off." }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please write a question of up to 500 characters." }, { status: 400 });
  const { message, id } = parsed.data;
  const history: Turn[] = parsed.data.history.slice(-6);

  const admin = createAdminClient();
  const log = (outcome: Outcome) => {
    void admin.rpc("ai_log_question", { p_question: message, p_outcome: outcome }).then(() => null, () => null);
  };
  const hindi = isHindi(message);

  const refusal = refusalFor(message);
  if (refusal) {
    log("declined");
    return textResponse(refusalText(refusal, settings.suggestions, hindi), "guard");
  }

  const { data: turn } = await admin.rpc("ai_take_turn", { p_key: visitorKey(request, id) });
  const allowed = (turn as { ok?: boolean; reason?: string } | null)?.ok === true;
  const pack = await getKnowledge(settings.knowledge_version, settings.extra_facts);
  const fallback = (outcome: Outcome) => {
    const faq = faqAnswer(message, pack.sections);
    log(faq ? "fallback" : "resting");
    return textResponse(faq ? `${faq}\n\n_${RESTING}_` : RESTING, faq ? "fallback" : outcome);
  };
  if (!allowed) return fallback("resting");

  const org = await getOrganizationSettings();
  const keep = {
    emails: [socialLinks.email, org.official_email ?? ""].filter(Boolean),
    whatsapp: [socialLinks.whatsapp, linkHref(org.whatsapp_url, "whatsapp_group") ?? ""].filter(Boolean),
  };

  const stream = answer(pack.text, history, message);
  // The first piece decides: no model at all means the fallback, not an empty stream.
  let first: IteratorResult<string>;
  try {
    first = await stream.next();
  } catch {
    // AiUnavailable (quota, an error, no key that works): the public facts instead.
    return fallback("resting");
  }

  const encoder = new TextEncoder();
  const out = redactingStream(keep);
  let full = first.done ? "" : first.value;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) {
          const part = out.push(first.value);
          if (part) controller.enqueue(encoder.encode(part));
          for await (const chunk of stream) {
            full += chunk;
            const piece = out.push(chunk);
            if (piece) controller.enqueue(encoder.encode(piece));
          }
        }
      } catch {
        // The model stopped mid-answer: what came so far stays.
      }
      const rest = out.end();
      if (rest) controller.enqueue(encoder.encode(rest));
      if (!full.trim()) controller.enqueue(encoder.encode(RESTING));
      controller.close();
      log(!full.trim() ? "resting" : saysDontKnow(full) ? "dont_know" : "answered");
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-AI-Source": "model" } });
}
