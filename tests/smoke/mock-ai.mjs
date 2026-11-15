// A local stand-in for Gemini and Groq, and for a few web pages, so the Idea Engine, the morning jobs and FusionX AI
// are tested without any real AI call. The app is built with AI_GEMINI_BASE / AI_GROQ_BASE = http://127.0.0.1:4010.
// The chat stand-in answers only from the context it is given (the knowledge pack and the matching items),
// so the answers show exactly which public data the real model would see. Test use only.
import http from "node:http";

const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
export const state = { lastPrompt: "", geminiDown: false, calls: { gemini: 0, groq: 0 } };

const full = (n, level, title) => ({
  level, learn: `How to build and ship a level ${level} project`, hubs: ["projects"], title, pitch: title, problem: "Students, every week; count complaints for a week",
  users: "Students", solution: "A simple web app", different: "check similar products", mvp: "One screen", stack: "Next.js, Supabase", data: "None needed",
  effort: "M", variations: { lite: ["MVP"], standard: ["MVP", "Pilot"], ambitious: ["MVP", "Pilot", "Launch"] },
  team: { "Design & Branding": "UI", "Competitions & Opportunities": "Pitch", "Projects, Research & Startups": "Build", "FusionX Event Crew": "Launch" },
  validate: "10 student interviews", measures: "Weekly users", startup_path: "College adoption; check incubation", risks: "Low use", opportunity: "",
});
const NAMES = ["bus tracker", "lost and found board", "notes swap", "canteen queue", "lab booking", "event check-in", "club budget sheet", "alumni map", "hostel complaints", "library seat finder",
  "carpool planner", "internship diary", "exam timetable bot", "printer status", "sports court reservations", "blood donor list", "second-hand books", "faculty office hours", "building directory", "study partner matcher", "attendance reminder", "fest volunteer roster"];
// 22 ideas: levels matching week 1 (8×L1, 5×L2, 2×L3) and extra; two are near-duplicates (the bus tracker pair; no other titles share a long word); three score low.
const weekIdeas = () => NAMES.map((n, i) => full(i, i < 11 ? 1 : i < 18 ? 2 : 3, i === 21 ? "Campus bus tracker app" : n[0].toUpperCase() + n.slice(1)));
const topic = (n) => ({ title: `Smoke topic ${n}`, question: "Does X affect Y on campus?", why: "Useful", scope: "One semester", method: n === 1 ? "Replicate Sharma et al. (2021), doi 10.1234/abcd.5678" : "Survey",
  data_sources: "verify", tools: "Python", plan: ["week 1-2", "week 3-10", "week 11-12"], output: "A short paper", venues: "find with your mentor", ethics: "Consent", keywords: ["campus"], where_to_search: "Google Scholar" });
const opps = () => [
  { title: "Smoke Near Hack", organiser: "IIT Delhi", type: "hackathon", mode: "offline", city: "Delhi", country: "India", deadline: day(5), team: "team", first_year_ok: "yes", free: "yes", prizes: "₹50,000", hubs: ["projects-research-startups"], official_link: "http://127.0.0.1:4010/ok/near-hack" },
  { title: "Smoke Internship", organiser: "Government of India", type: "internship", mode: "online", city: "", country: "India", deadline: day(20), team: "solo", free: "yes", prizes: "Stipend", hubs: ["projects-research-startups"], official_link: "http://127.0.0.1:4010/ok/internship" },
  { title: "Smoke Broken Link Fest", organiser: "IIT Kanpur", type: "tech fest", mode: "offline", city: "Kanpur", deadline: day(8), official_link: "http://127.0.0.1:4010/missing" },
  { title: "Smoke Past Contest", organiser: "IIT Roorkee", type: "competition", mode: "online", deadline: day(-2), official_link: "http://127.0.0.1:4010/ok/past" },
  { title: "Smoke No Mode Contest", organiser: "NSUT", type: "competition", mode: "", deadline: day(9), official_link: "http://127.0.0.1:4010/ok/nomode" },
  { title: "Smoke Low Value Quiz", organiser: "Some Club", type: "competition", mode: "online", deadline: day(80), official_link: "http://127.0.0.1:4010/ok/low" },
  { title: "Smoke Near Hack", organiser: "IIT Delhi", type: "hackathon", mode: "offline", city: "Delhi", deadline: day(5), official_link: "http://127.0.0.1:4010/ok/near-hack" },
];
const tool = { what: "A place to chat with your team in channels.", why: "Many student communities and hackathons use it to talk and share.", uses: ["Team chat", "Voice calls", "Community servers"],
  steps: ["Create an account", "Join a server from an invite", "Pick your channels", "Set notifications", "Say hello"], tips: ["Use threads", "Mute busy channels", "Pin key messages"], free: "Free plan available", related: ["Slack"] };

/** The chat stand-in: the lines of the matching block (or "I don't have that information"). */
function chatAnswer(prompt) {
  const m = /## Matching items for this question[^\n]*\n([\s\S]*)$/.exec(prompt);
  const lines = (m?.[1] ?? "").split("\n").filter((l) => l.startsWith("- ")).slice(0, 5);
  if (lines.length) return lines.join("\n");
  const no = /(No open opportunity matches[^\n]*)/.exec(prompt);
  return no ? no[1] : "I don't have that information. Please write to network@fxscriet.com.";
}

export function startMockAi(port = 4010) {
  const server = http.createServer(async (req, res) => {
    const body = await new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
    const url = req.url ?? "";
    if (url === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("User-agent: *\nAllow: /\n"); }
    if (url === "/fest") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(`<html><body><h1>Smoke Near Hack</h1><a href="http://127.0.0.1:4010/ok/near-hack">Register</a></body></html>`); }
    if (url.startsWith("/ok/")) { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<html><body>ok</body></html>"); }
    if (url === "/__last") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(state)); }
    if (url === "/__gemini-down") { state.geminiDown = true; res.writeHead(200); return res.end("down"); }
    if (url === "/__gemini-up") { state.geminiDown = false; res.writeHead(200); return res.end("up"); }
    // Gemini chat (streaming SSE)
    if (url.includes(":streamGenerateContent")) {
      state.calls.gemini++;
      if (state.geminiDown) { res.writeHead(503); return res.end("{}"); }
      const parsed = JSON.parse(body || "{}");
      state.lastPrompt = parsed.systemInstruction?.parts?.[0]?.text ?? "";
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      return res.end(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: chatAnswer(state.lastPrompt) }] } }] })}\n\n`);
    }
    // Groq chat (OpenAI-style streaming)
    if (url.includes("/openai/v1/chat/completions")) {
      state.calls.groq++;
      const parsed = JSON.parse(body || "{}");
      const sys = parsed.messages?.find((m) => m.role === "system")?.content ?? "";
      if (parsed.stream) {
        state.lastPrompt = sys;
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        return res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: `[groq] ${chatAnswer(sys)}` } }] })}\n\ndata: [DONE]\n\n`);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
    }
    // Gemini JSON (the Idea Engine and the morning jobs)
    if (url.includes(":generateContent")) {
      state.calls.gemini++;
      const prompt = JSON.stringify(JSON.parse(body || "{}"));
      let out;
      if (prompt.includes("Score each student project idea")) {
        const n = (prompt.match(/\\n\d+\. \[L/g) ?? []).length || 30;
        out = { scores: Array.from({ length: n + 1 }, (_, i) => ({ i, score: [3, 7, 12].includes(i) ? 5 : 8 })) };
      } else if (prompt.includes("project ideas for ALL its members")) out = { ideas: weekIdeas() };
      else if (prompt.includes("research topics")) out = { topics: [topic(1), topic(2), topic(3)] };
      else if (prompt.includes("list student opportunities")) out = { items: opps() };
      else if (prompt.includes("short, accurate guide") || prompt.includes("Check this guide")) out = tool;
      else out = { items: [] };
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
    }
    res.writeHead(404); res.end();
  });
  server.listen(port, "127.0.0.1");
  return server;
}
