import type { Section } from "./knowledge";

/**
 * When the model can't be used (the visitor's limit, the daily cap, the free quota, or an
 * error): the closest part of the same public facts, by keywords, with its page. No match:
 * null, and the caller says the assistant is resting.
 */

const STOP = new Set([
  "what", "whats", "which", "who", "whom", "when", "where", "how", "the", "and", "for", "are", "is", "was", "were", "you", "your", "about", "tell", "can", "does", "do", "fusionx", "scriet",
  "kya", "kaise", "kaun", "kab", "kahan", "hai", "hain", "batao", "mujhe", "ke", "ki", "ko", "mein", "please", "there", "this", "that", "with", "any",
]);

// Words people use for a section's topic.
const TOPICS: Record<string, string[]> = {
  "How to join": ["join", "member", "membership", "apply", "register", "signup", "sign", "judna", "join karna"],
  Recruitment: ["recruitment", "recruit", "hiring", "selection", "apply"],
  "Recruitment results": ["result", "results", "selected"],
  Events: ["event", "events", "upcoming", "workshop", "hackathon", "session"],
  "FusionX Hubs": ["hub", "hubs", "team", "teams", "department", "wing"],
  Contact: ["contact", "email", "instagram", "linkedin", "community", "reach", "social"],
  "Founding team": ["founder", "founders", "founded", "started"],
  "Faculty guides": ["faculty", "guide", "professor", "teacher"],
  "Core page": ["core", "lead", "leads", "head", "heads"],
  Mentors: ["mentor", "mentors", "mentorship"],
  Opportunities: ["opportunity", "opportunities", "internship", "competition", "competitions", "deadline"],
  Resources: ["resource", "resources", "learn", "material", "notes"],
};

const words = (text: string) => (text.toLowerCase().match(/[a-zऀ-ॿ]+/g) ?? []).filter((w) => w.length >= 3 && !STOP.has(w));

export function faqAnswer(question: string, sections: Section[]): string | null {
  const asked = words(question);
  const whatIs = /\bwhat\s+is\s+fusionx\b|\bfusionx\s+(kya|kya hai)\b|\babout\s+fusionx\b/i.test(question);
  let best: { s: Section; score: number } | null = null;
  for (const s of sections) {
    const title = s.title.toLowerCase();
    const body = s.text.toLowerCase();
    let score = whatIs && title.startsWith("about") ? 10 : 0;
    for (const w of asked) {
      if ((TOPICS[s.title] ?? []).includes(w)) score += 4;
      if (title.includes(w)) score += 3;
      if (body.includes(w)) score += 1;
    }
    if (score > (best?.score ?? 0)) best = { s, score };
  }
  if (!best || best.score < 2) return null;
  const lines = best.s.text.split("\n").filter(Boolean);
  const short = lines.slice(0, 6).join("\n");
  return `Here is what the site says about **${best.s.title}**:\n${short.length > 900 ? `${short.slice(0, 899)}…` : short}\n\nMore: ${best.s.url}`;
}
