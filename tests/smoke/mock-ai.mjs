// A local stand-in for the Gemini API and for one fest page, so the Idea Engine is tested without any real
// AI call or website. The app is built with AI_GEMINI_BASE=http://127.0.0.1:4010. Test use only.
import http from "node:http";

const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const idea = (n) => ({
  title: `Smoke idea ${n}: campus ${["bus tracker", "lost and found", "notes swap"][n - 1]}`, pitch: "One line pitch", problem: "Students, every day; count complaints for a week",
  users: "Students", solution: "A simple web app", different: "check similar products", mvp: "One screen", stack: "Next.js, Supabase", data: "None needed",
  effort: "M", variations: { lite: ["MVP"], standard: ["MVP", "Pilot"], ambitious: ["MVP", "Pilot", "Launch"] },
  team: { "Design & Branding": "UI", "Competitions & Opportunities": "Pitch", "Projects, Research & Startups": "Build", "FusionX Event Crew": "Launch" },
  validate: "10 student interviews", measures: "Weekly users", startup_path: "College adoption; check incubation", risks: "Low use", opportunity: "",
});
const topic = (n) => ({
  title: `Smoke topic ${n}`, question: "Does X affect Y on campus?", why: "Useful", scope: "One semester",
  method: n === 1 ? "Replicate Sharma et al. (2021), doi 10.1234/abcd.5678, on campus" : "Survey and analysis", data_sources: "verify", tools: "Python",
  plan: ["week 1-2: reading", "week 3-10: data", "week 11-12: write"], output: "A short paper", venues: "find with your mentor", ethics: "Consent forms",
  keywords: ["campus", "survey"], where_to_search: "Google Scholar",
});
const items = () => [
  { title: "Smoke Near Hack", organiser: "IIT Delhi", type: "hackathon", mode: "offline", city: "Delhi", deadline: day(10), official_link: "https://example.org/near-hack", hubs: ["projects-research-startups"], prizes: "₹50,000" },
  { title: "Smoke Online Ideathon", organiser: "Some Club", type: "ideathon", mode: "online", city: "", deadline: day(40), official_link: "https://example.org/online", hubs: [] },
  { title: "Smoke No Link Contest", organiser: "Unknown", type: "contest", deadline: day(10), official_link: "" },
  { title: "Smoke Past Fest", organiser: "Old Org", type: "fest", deadline: day(-3), official_link: "https://example.org/past" },
  { title: "Smoke Near Hack", organiser: "IIT Delhi", type: "hackathon", city: "Delhi", deadline: day(10), official_link: "https://example.org/near-hack" },
];

export function startMockAi(port = 4010) {
  const server = http.createServer(async (req, res) => {
    const body = await new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
    if (req.url === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("User-agent: *\nAllow: /\n"); }
    if (req.url === "/fest") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(`<html><body><h1>Smoke Near Hack</h1><a href="https://example.org/near-hack">Register</a></body></html>`); }
    if (req.url?.includes(":generateContent")) {
      const prompt = JSON.stringify(JSON.parse(body || "{}"));
      const out = prompt.includes("project ideas") ? { ideas: [idea(1), idea(2), idea(3)] } : prompt.includes("research topics") ? { topics: [topic(1), topic(2), topic(3)] } : { items: items() };
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
    }
    res.writeHead(404); res.end();
  });
  server.listen(port, "127.0.0.1");
  return server;
}
