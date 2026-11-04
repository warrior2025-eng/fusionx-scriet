/**
 * FusionX AI's fixed rules, applied on the server before and after the model, so they
 * hold whatever the model does: questions after private data, attempts to change the
 * rules, and plainly off-topic requests get a fixed polite answer without the model; and
 * any answer has emails, phone numbers and group links taken out on its way out.
 */

export type Refusal = "private" | "rules" | "off_topic";

const RULES = [
  /\b(ignore|disregard|forget|override|bypass)\b[\s\S]{0,40}\b(instructions?|rules?|prompt|above|previous|earlier|guidelines?)\b/i,
  /\bsystem\s*(prompt|message|instructions?)\b/i,
  /\b(your|the)\s+(instructions|rules|prompt|knowledge\s*pack|guidelines|configuration)\b/i,
  /\b(developer|god|admin|debug)\s*mode\b|\bjail\s*break\b|\bDAN\b/i,
  /\b(pretend|role-?play|act)\s+(to be|you are|as)\b|\byou are now\b/i,
  /\b(prompt|instructions?)\s+(batao|dikhao|bata do|dikha do)\b/i,
];

const PRIVATE = [
  /\b(phone|mobile|cell|contact|whats\s?app)\s*(no\.?|number|num)\b/i,
  /\bphone\b|\bmobile\b|\bnumber\s+(do|de|dena|batao|bata do|chahiye)\b/i,
  /\bwhats\s?app\s*(group|grp|gc)\b|\bgroup\s*(link|invite)\b/i,
  /\b(score|scores|scored|scoring|marks|ranking|rank list|merit list)\b/i,
  /\binterview\s*(results?|scores?|marks|feedback|slots?|notes?)\b/i,
  /\b(applications?|answers?)\s+(of|by|from)\b|\bwho applied\b|\breviewers?\b|\breview notes?\b/i,
  /\b(email|e-mail|address|password|aadhaa?r|roll\s*(no|number))\s+(of|for)\b|\bpersonal\s+(email|details|info)\b|\bpassword\b/i,
  /\b(meeting\s*minutes|minutes of (the )?meeting|audit\s*logs?|admin\s*panel\s*data)\b/i,
];

const OFF_TOPIC = [
  /\b(solve|integrate|differentiate|derivative|integral|equation|calculate|homework|assignment)\b/i,
  /\b(write|compose|generate|make)\s+(me\s+)?(a|an|some)?\s*(poem|story|essay|song|joke|code|program|script|letter|email)\b/i,
  /\b(python|javascript|java|c\+\+|html|css|sql|react)\s+(code|program|question|error|bug)\b|\bdebug\s+(my|this)\b/i,
  /\b(another|other|different)\s+(college|university|club|society|chapter)\b|\b(IIT|NIT|IIIT|BITS)\b/i,
  /\b(election|politic|government|prime minister|modi|rahul gandhi|bjp|congress party)\b/i,
];

/** Which fixed answer a question gets, if any. */
export function refusalFor(question: string): Refusal | null {
  if (RULES.some((r) => r.test(question))) return "rules";
  if (PRIVATE.some((r) => r.test(question))) return "private";
  if (OFF_TOPIC.some((r) => r.test(question))) return "off_topic";
  return null;
}

/** Devanagari, or common Hinglish words: the answer is in the same language. */
export function isHindi(text: string): boolean {
  if (/[ऀ-ॿ]/.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hinglish = new Set(["kya", "kaise", "kaisa", "kaun", "kab", "kahan", "hai", "hain", "batao", "bata", "mujhe", "mera", "meri", "karna", "karu", "kare", "chahiye", "kitne", "kitna", "nahi", "ka", "dijiye", "milega", "karein", "kaha", "aur", "ke", "ki", "ko", "mein", "me", "se", "hum", "ham", "aap", "tum", "yeh", "ye", "woh", "wo"]);
  return words.filter((w) => hinglish.has(w)).length >= 2;
}

export function refusalText(kind: Refusal, suggestions: string[], hindi: boolean): string {
  const ask = suggestions.slice(0, 3).map((s) => `- ${s}`).join("\n");
  const lines = hindi
    ? {
        private: "Main kisi ki personal details (phone, email, marks, applications, private group links) share nahi kar sakta. Main sirf FusionX ki public jaankari se jawab deta hoon.",
        rules: "Main apne rules nahi badal sakta aur unhe share bhi nahi karta. Main sirf FusionX ke baare mein sawaalon ka jawab deta hoon.",
        off_topic: "Main sirf FusionX ke baare mein sawaalon ka jawab deta hoon, isliye isme madad nahi kar paunga.",
      }
    : {
        private: "I can't share anyone's personal details (phone numbers, emails, scores, applications or private group links). I only answer from FusionX's public information.",
        rules: "I can't change or share how I work. I only answer questions about FusionX.",
        off_topic: "I only answer questions about FusionX, so I can't help with that one.",
      };
  return `${lines[kind]}\n\n${hindi ? "Aap yeh pooch sakte hain:" : "You could ask:"}\n${ask}`;
}

export const RESTING = "FusionX AI is resting right now. Try again later or email network@fxscriet.com.";

/** "I don't have that information" in the answer: logged as not known, to improve the facts. */
export const saysDontKnow = (answer: string) => /don['’]t have that information|do not have that information|jaankari nahi hai|information nahi hai/i.test(answer);

/**
 * Takes out what must never be shown: email addresses other than the official ones,
 * phone numbers, and WhatsApp group links other than the public community link.
 */
export function redact(text: string, allowed: { emails: string[]; whatsapp: string[] }): string {
  const emails = new Set(allowed.emails.map((e) => e.toLowerCase()));
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => (emails.has(m.toLowerCase()) ? m : "[hidden]"))
    .replace(/https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/gi, (m) => (allowed.whatsapp.some((w) => w.toLowerCase() === m.toLowerCase()) ? m : "[link hidden]"))
    .replace(/(?<![\w/.-])(?:\+?\d[\d\s-]{8,}\d)(?![\w/.-])/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[hidden]" : m));
}

/**
 * Streams text through redact() without cutting a pattern in half: everything but the
 * last 120 characters is let out as it comes; the rest when the answer ends.
 */
export function redactingStream(allowed: { emails: string[]; whatsapp: string[] }) {
  let held = "";
  return {
    push(chunk: string): string {
      held += chunk;
      if (held.length <= 120) return "";
      // Cut at a space not after a digit, so a word, an address or a phone number written
      // with spaces is never split between two parts.
      let cut = held.lastIndexOf(" ", held.length - 120);
      while (cut > 0 && /[\d+]/.test(held[cut - 1])) cut = held.lastIndexOf(" ", cut - 1);
      if (cut <= 0) return "";
      const out = held.slice(0, cut);
      held = held.slice(cut);
      return redact(out, allowed);
    },
    end(): string {
      const out = redact(held, allowed);
      held = "";
      return out;
    },
  };
}
