/**
 * Static content that isn't in the database. This is deliberately narrow:
 * only facts that have actually been confirmed. Anything that could change
 * administratively (approval status, faculty guide, social links) is read
 * from `organization_settings` at request time instead — see
 * lib/data/organization.ts. Do not add placeholder achievements, partners,
 * or numbers here; see the "no fabrication" note in the README.
 */

/** The official name. Written exactly like this everywhere: no spaces around the @. */
export const siteName = "FusionX@SCRIET";

export const founders = [
  {
    name: "Pranjal Srivastav",
    role: "Founding Member — Strategic Development Lead",
    responsibilities:
      "Leads overall vision, strategic direction, institutional coordination, and long-term planning and development of FusionX.",
  },
  {
    name: "Anshika Dwivedi",
    role: "Founding Member — Network & Innovation Operations Lead",
    responsibilities:
      "Leads the student network, innovation operations, program coordination, team formation, and execution of FusionX initiatives.",
  },
  {
    name: "Sirin Bano",
    role: "Founding Member — Research & Technical Development Lead",
    responsibilities:
      "Leads research activities, technical development, experimentation, documentation, and project validation.",
  },
] as const;

export const seniorMentor = {
  name: "Jayesh Gaur",
  role: "Senior Mentor",
} as const;

export const programs = [
  {
    slug: "build-lab",
    name: "FusionX Build Lab",
    summary: "Ideation, team formation, technical workshops, build sessions, and prototype reviews.",
  },
  {
    slug: "research-forum",
    name: "FusionX Research Forum",
    summary: "Research orientation, literature review, methodology, experimentation, and documentation.",
  },
  {
    slug: "ip-innovation-cell",
    name: "FusionX IP & Innovation Cell",
    summary: "Patent and prior-art awareness, novelty checks, documentation, and IP education.",
  },
  {
    slug: "venture-cell",
    name: "FusionX Venture Cell",
    summary: "Problem discovery, customer discovery, MVPs, market research, and pitching.",
  },
  {
    slug: "competition-support",
    name: "Competition Support & Mentorship",
    summary: "Preparation, mentorship, and submission support for hackathons and innovation competitions.",
  },
  {
    slug: "fusionx-teams",
    name: "FusionX Teams",
    summary: "Interdisciplinary collaboration and skill-based project team formation.",
  },
] as const;

export const journeyStages = [
  "Discover",
  "Explore",
  "Connect",
  "Build",
  "Validate",
  "Research",
  "Protect",
  "Present",
  "Continue",
] as const;

export const buildPipeline = [
  "Problem",
  "Idea",
  "Team",
  "Build",
  "Prototype",
  "Research / IP",
  "Competition",
  "Further Development",
] as const;

export const coreAreas = ["Build", "Research", "Connect", "Compete", "Create"] as const;

export const functionalAreas = [
  "Project & Technology",
  "Research & IP",
  "Events & Community",
  "Partnerships & Outreach",
  "Design & Media",
  "Operations",
] as const;

export const skillOptions = [
  "Frontend",
  "Backend",
  "AI/ML",
  "IoT",
  "Hardware",
  "Research",
  "Design",
  "Cybersecurity",
  "Business",
  "Content",
  "Management",
] as const;

export const institution = {
  name: "SCRIET",
  fullName: "SCRIET, CCS University, Meerut",
} as const;


export const additionalFacultyGuides = [
  {
    name: "Amit Sharma",
    title: `Faculty Guide, ${siteName} · HOD, CS, SCRIET`,
  },
] as const;