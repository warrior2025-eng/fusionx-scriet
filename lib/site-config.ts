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

/** The site's one public address (no "www", no trailing slash), for the sitemap and robots.txt. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://fxscriet.com").replace(/\/$/, "");

/**
 * Where to find the chapter. The footer, the Contact page and the structured
 * data use what is set in the admin panel (Settings) first, and these when a
 * field there is empty.
 */
export const socialLinks = {
  instagram: "https://www.instagram.com/fx.scriet/",
  linkedin: "https://www.linkedin.com/company/fxscriet",
  email: "network@fxscriet.com",
} as const;

// The team, hubs and lists below are now managed from the admin panel
// and stored in the database (migrations 0008 and 0010). What is here is the
// fallback the site shows if that data cannot be read, e.g. before the
// migrations have run. See lib/data/people.ts, lib/data/hubs.ts and
// lib/site-content/schema.ts.
export const founders = [
  {
    name: "Pranjal Srivastav",
    role: "Founding Member, Strategic Development Lead",
    responsibilities:
      "Leads overall vision, strategic direction, institutional coordination, and long-term planning and development of FusionX.",
  },
  {
    name: "Anshika Dwivedi",
    role: "Founding Member, Network & Innovation Operations Lead",
    responsibilities:
      "Leads the student network, innovation operations, program coordination, team formation, and execution of FusionX initiatives.",
  },
  {
    name: "Sirin Bano",
    role: "Founding Member, Research & Technical Development Lead",
    responsibilities:
      "Leads research activities, technical development, experimentation, documentation, and project validation.",
  },
] as const;

export const seniorMentor = {
  name: "Jayesh Gaur",
  role: "Senior Mentor",
} as const;

// The FusionX Hubs, in page order. The same text is seeded into the database
// by migration 0019; this copy is what shows if the table cannot be read.
export const hubs = [
  {
    slug: "design-branding",
    name: "Design & Branding",
    tagline: "Create. Design. Tell the Story.",
    summary: "The Design & Branding team is responsible for shaping the visual identity and digital presence of FusionX@SCRIET. It transforms ideas into compelling visual content that communicates the network's vision, activities, projects, and achievements.",
    about: "The Design & Branding team is responsible for shaping the visual identity and digital presence of FusionX@SCRIET. It transforms ideas into compelling visual content that communicates the network's vision, activities, projects, and achievements.\n\nThe team works on creative design, brand consistency, social media content, and storytelling to build a recognisable and professional identity for FusionX@SCRIET.",
    responsibilities: [
      "Visual Identity: Maintain consistent branding across FusionX@SCRIET's platforms and activities.",
      "Graphic Design: Create posters, banners, announcements, certificates, and promotional creatives.",
      "Social Media: Develop engaging content for digital platforms.",
      "Content & Storytelling: Communicate events, projects, achievements, and opportunities through effective visual and written content.",
      "Creative Campaigns: Design promotional campaigns for recruitment, events, and innovation initiatives.",
      "Digital Assets: Develop reusable design resources and templates for the network."
    ],
    who_should_join: "Students interested in graphic design, visual communication, content creation, branding, social media, UI/UX, or creative storytelling.",
    what_you_gain: "Practical creative experience, portfolio-building opportunities, teamwork, branding knowledge, and the opportunity to contribute to the identity of a growing student innovation network.",
    type_label: null,
    type_note: null,
    cta: "recruitment",
    icon_name: "Palette"
  },
  {
    slug: "competitions-opportunities",
    name: "Competitions & Opportunities",
    tagline: "Explore. Discover. Unlock New Possibilities.",
    summary: "The Competitions & Opportunities team helps students discover opportunities that can support their academic, technical, and professional growth. It researches relevant hackathons, competitions, internships, fellowships, challenges, and other development opportunities.",
    about: "The Competitions & Opportunities team helps students discover opportunities that can support their academic, technical, and professional growth. It researches relevant hackathons, competitions, internships, fellowships, challenges, and other development opportunities.\n\nThe team's goal is to make valuable opportunities easier to discover, understand, and pursue by sharing reliable information and helping students stay informed about upcoming possibilities.",
    responsibilities: [
      "Hackathon Discovery: Identify relevant hackathons, innovation challenges, and technical competitions.",
      "Opportunity Research: Find internships, fellowships, scholarships, and other student development opportunities where relevant.",
      "Information Verification: Check eligibility criteria, deadlines, application requirements, and official sources before sharing opportunities.",
      "Opportunity Updates: Communicate upcoming deadlines and important announcements to students.",
      "Application Support: Help students understand application processes and prepare required information.",
      "Career Pathways Research: Explore learning opportunities, skill-development programmes, and pathways relevant to students.",
      "Outreach & Coordination: Connect students with relevant organisers, programmes, and opportunity providers when appropriate."
    ],
    who_should_join: "Students who enjoy research, discovering opportunities, organising information, communication, coordination, and helping other students grow.",
    what_you_gain: "Opportunity research skills, professional communication, networking experience, awareness of competitions and internships, and practical exposure to the student innovation ecosystem.",
    type_label: null,
    type_note: null,
    cta: "recruitment",
    icon_name: "Trophy"
  },
  {
    slug: "projects-research-startups",
    name: "Projects, Research & Startups",
    tagline: "Ideate. Build. Research. Create Impact.",
    summary: "The Projects, Research & Startups team focuses on turning ideas into meaningful projects, exploring research possibilities, and encouraging entrepreneurial thinking.",
    about: "The Projects, Research & Startups team focuses on turning ideas into meaningful projects, exploring research possibilities, and encouraging entrepreneurial thinking.\n\nIt provides a collaborative environment where students can explore problems, research potential solutions, develop prototypes, investigate emerging technologies, and understand how innovative ideas can evolve into practical projects or startup concepts.\n\nThe team encourages experimentation, interdisciplinary collaboration, documentation, and continuous improvement.",
    responsibilities: [
      "Research & Ideation: Identify problems, explore emerging technologies, and develop promising ideas.",
      "Project Development: Support students in planning, developing, testing, and improving projects.",
      "Prototype Development: Encourage practical experimentation and the creation of early-stage prototypes.",
      "Startup Exploration: Explore business models, market needs, product concepts, and entrepreneurial possibilities.",
      "Innovation & Intellectual Property: Introduce students to innovation documentation, patents, intellectual property awareness, and responsible idea development.",
      "Technical Collaboration: Encourage students from different branches and skill sets to work together on projects.",
      "Project Documentation: Maintain records of project progress, research findings, prototypes, and outcomes."
    ],
    who_should_join: "Students interested in technology, research, problem-solving, product development, innovation, entrepreneurship, or building practical solutions.\n\nYou do not need to be an expert. Beginners with curiosity, commitment, and a willingness to learn are welcome.",
    what_you_gain: "Hands-on project experience, research exposure, problem-solving skills, prototype development experience, interdisciplinary collaboration, and an understanding of how ideas can progress towards products or startups.",
    type_label: null,
    type_note: null,
    cta: "recruitment",
    icon_name: "Rocket"
  },
  {
    slug: "event-crew",
    name: "FusionX Event Crew",
    tagline: "Plan. Coordinate. Bring Ideas to Life.",
    summary: "FusionX Event Crew manages the planning, coordination, and execution of activities organised by FusionX@SCRIET. The team helps transform event concepts into well-organised experiences for students, participants, speakers, and collaborators.",
    about: "FusionX Event Crew manages the planning, coordination, and execution of activities organised by FusionX@SCRIET. The team helps transform event concepts into well-organised experiences for students, participants, speakers, and collaborators.\n\nFrom workshops and innovation challenges to networking sessions and larger events, the crew focuses on coordination, logistics, participant experience, and smooth execution.",
    responsibilities: [
      "Event Planning: Assist in developing event plans, timelines, schedules, and execution strategies.",
      "Operations & Logistics: Coordinate venues, equipment, materials, and other operational requirements.",
      "Participant Experience: Help participants understand event procedures, schedules, and requirements.",
      "On-Ground Execution: Support event-day coordination and resolve routine operational issues.",
      "Team Coordination: Work with other FusionX@SCRIET teams to ensure events run smoothly.",
      "Workshop & Session Support: Assist with speaker coordination, session preparation, and event arrangements.",
      "Post-Event Coordination: Support feedback collection, documentation, and event reviews."
    ],
    who_should_join: "Students who enjoy organising activities, coordinating people, communicating, managing responsibilities, and working in a team.",
    what_you_gain: "Leadership experience, event management skills, coordination and communication abilities, teamwork, operational problem-solving, and practical experience in organising student initiatives.",
    type_label: null,
    type_note: null,
    cta: "recruitment",
    icon_name: "CalendarCheck"
  },
  {
    slug: "fusionx-teams",
    name: "FusionX Teams",
    tagline: "Connect. Collaborate. Build Together.",
    summary: "FusionX Teams is the collaborative space within FusionX@SCRIET where students and student teams can connect, form collaborations, exchange ideas, and work together on meaningful projects.",
    about: "FusionX Teams is the collaborative space within FusionX@SCRIET where students and student teams can connect, form collaborations, exchange ideas, and work together on meaningful projects.\n\nUnlike the four operational teams, FusionX Teams is not a conventional department with fixed job roles. Its purpose is to encourage collaboration between existing teams, help students find potential teammates, and support the formation of new teams around shared interests, ideas, and challenges.\n\nIt creates opportunities for students from different branches, backgrounds, and skill sets to work together and explore possibilities that may be difficult to pursue individually.",
    responsibilities: [],
    who_should_join: null,
    what_you_gain: null,
    type_label: "Collaborative Network",
    type_note: "Not a regular recruitment department",
    cta: "teams",
    icon_name: "Users"
  }
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
    title: `Faculty Guide, ${siteName} and HOD, CS, SCRIET`,
  },
] as const;