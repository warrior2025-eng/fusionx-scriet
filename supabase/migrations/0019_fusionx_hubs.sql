-- "Programs" become "FusionX Hubs": four operational hubs and FusionX Teams.
--
-- The `programs` table stays (it is what the admin panel edits) and gains the
-- fields a hub page needs. The six old programs are hidden, not deleted, so
-- their history stays; "fusionx-teams" is the same slug in both lists, so that
-- row is updated in place. Saved links in the site content (footer, hero
-- button) move from /programs and /founders to /hubs and /core.
--
-- Run once, as one piece. Running it again changes nothing.

begin;

alter table programs
  add column if not exists tagline text check (char_length(tagline) <= 200),
  add column if not exists about text check (char_length(about) <= 4000),
  -- One per item, written "Title: description".
  add column if not exists responsibilities text[] not null default '{}',
  add column if not exists who_should_join text check (char_length(who_should_join) <= 2000),
  add column if not exists what_you_gain text check (char_length(what_you_gain) <= 2000),
  -- A badge on the hub, with a short note under it (FusionX Teams).
  add column if not exists type_label text check (char_length(type_label) <= 60),
  add column if not exists type_note text check (char_length(type_note) <= 200),
  -- What the hub page's button does: apply through recruitment, or register a team.
  add column if not exists cta text not null default 'recruitment' check (cta in ('recruitment', 'teams', 'none'));

-- The old programs: hidden, kept, moved to the end of the list.
update programs set is_visible = false, display_order = 100 + display_order
where slug in ('build-lab', 'research-forum', 'ip-innovation-cell', 'venture-cell', 'competition-support')
  and display_order < 100;

insert into programs
  (slug, name, tagline, summary, about, responsibilities, who_should_join, what_you_gain, type_label, type_note, cta, icon_name, details, display_order, is_visible)
values
  ('design-branding', 'Design & Branding', 'Create. Design. Tell the Story.',
   $t$The Design & Branding team is responsible for shaping the visual identity and digital presence of FusionX@SCRIET. It transforms ideas into compelling visual content that communicates the network's vision, activities, projects, and achievements.$t$,
   $t$The Design & Branding team is responsible for shaping the visual identity and digital presence of FusionX@SCRIET. It transforms ideas into compelling visual content that communicates the network's vision, activities, projects, and achievements.

The team works on creative design, brand consistency, social media content, and storytelling to build a recognisable and professional identity for FusionX@SCRIET.$t$,
   array[
     $t$Visual Identity: Maintain consistent branding across FusionX@SCRIET's platforms and activities.$t$,
     $t$Graphic Design: Create posters, banners, announcements, certificates, and promotional creatives.$t$,
     $t$Social Media: Develop engaging content for digital platforms.$t$,
     $t$Content & Storytelling: Communicate events, projects, achievements, and opportunities through effective visual and written content.$t$,
     $t$Creative Campaigns: Design promotional campaigns for recruitment, events, and innovation initiatives.$t$,
     $t$Digital Assets: Develop reusable design resources and templates for the network.$t$],
   $t$Students interested in graphic design, visual communication, content creation, branding, social media, UI/UX, or creative storytelling.$t$,
   $t$Practical creative experience, portfolio-building opportunities, teamwork, branding knowledge, and the opportunity to contribute to the identity of a growing student innovation network.$t$,
   null, null, 'recruitment', 'Palette', '{}', 1, true),

  ('competitions-opportunities', 'Competitions & Opportunities', 'Explore. Discover. Unlock New Possibilities.',
   $t$The Competitions & Opportunities team helps students discover opportunities that can support their academic, technical, and professional growth. It researches relevant hackathons, competitions, internships, fellowships, challenges, and other development opportunities.$t$,
   $t$The Competitions & Opportunities team helps students discover opportunities that can support their academic, technical, and professional growth. It researches relevant hackathons, competitions, internships, fellowships, challenges, and other development opportunities.

The team's goal is to make valuable opportunities easier to discover, understand, and pursue by sharing reliable information and helping students stay informed about upcoming possibilities.$t$,
   array[
     $t$Hackathon Discovery: Identify relevant hackathons, innovation challenges, and technical competitions.$t$,
     $t$Opportunity Research: Find internships, fellowships, scholarships, and other student development opportunities where relevant.$t$,
     $t$Information Verification: Check eligibility criteria, deadlines, application requirements, and official sources before sharing opportunities.$t$,
     $t$Opportunity Updates: Communicate upcoming deadlines and important announcements to students.$t$,
     $t$Application Support: Help students understand application processes and prepare required information.$t$,
     $t$Career Pathways Research: Explore learning opportunities, skill-development programmes, and pathways relevant to students.$t$,
     $t$Outreach & Coordination: Connect students with relevant organisers, programmes, and opportunity providers when appropriate.$t$],
   $t$Students who enjoy research, discovering opportunities, organising information, communication, coordination, and helping other students grow.$t$,
   $t$Opportunity research skills, professional communication, networking experience, awareness of competitions and internships, and practical exposure to the student innovation ecosystem.$t$,
   null, null, 'recruitment', 'Trophy', '{}', 2, true),

  ('projects-research-startups', 'Projects, Research & Startups', 'Ideate. Build. Research. Create Impact.',
   $t$The Projects, Research & Startups team focuses on turning ideas into meaningful projects, exploring research possibilities, and encouraging entrepreneurial thinking.$t$,
   $t$The Projects, Research & Startups team focuses on turning ideas into meaningful projects, exploring research possibilities, and encouraging entrepreneurial thinking.

It provides a collaborative environment where students can explore problems, research potential solutions, develop prototypes, investigate emerging technologies, and understand how innovative ideas can evolve into practical projects or startup concepts.

The team encourages experimentation, interdisciplinary collaboration, documentation, and continuous improvement.$t$,
   array[
     $t$Research & Ideation: Identify problems, explore emerging technologies, and develop promising ideas.$t$,
     $t$Project Development: Support students in planning, developing, testing, and improving projects.$t$,
     $t$Prototype Development: Encourage practical experimentation and the creation of early-stage prototypes.$t$,
     $t$Startup Exploration: Explore business models, market needs, product concepts, and entrepreneurial possibilities.$t$,
     $t$Innovation & Intellectual Property: Introduce students to innovation documentation, patents, intellectual property awareness, and responsible idea development.$t$,
     $t$Technical Collaboration: Encourage students from different branches and skill sets to work together on projects.$t$,
     $t$Project Documentation: Maintain records of project progress, research findings, prototypes, and outcomes.$t$],
   $t$Students interested in technology, research, problem-solving, product development, innovation, entrepreneurship, or building practical solutions.

You do not need to be an expert. Beginners with curiosity, commitment, and a willingness to learn are welcome.$t$,
   $t$Hands-on project experience, research exposure, problem-solving skills, prototype development experience, interdisciplinary collaboration, and an understanding of how ideas can progress towards products or startups.$t$,
   null, null, 'recruitment', 'Rocket', '{}', 3, true),

  ('event-crew', 'FusionX Event Crew', 'Plan. Coordinate. Bring Ideas to Life.',
   $t$FusionX Event Crew manages the planning, coordination, and execution of activities organised by FusionX@SCRIET. The team helps transform event concepts into well-organised experiences for students, participants, speakers, and collaborators.$t$,
   $t$FusionX Event Crew manages the planning, coordination, and execution of activities organised by FusionX@SCRIET. The team helps transform event concepts into well-organised experiences for students, participants, speakers, and collaborators.

From workshops and innovation challenges to networking sessions and larger events, the crew focuses on coordination, logistics, participant experience, and smooth execution.$t$,
   array[
     $t$Event Planning: Assist in developing event plans, timelines, schedules, and execution strategies.$t$,
     $t$Operations & Logistics: Coordinate venues, equipment, materials, and other operational requirements.$t$,
     $t$Participant Experience: Help participants understand event procedures, schedules, and requirements.$t$,
     $t$On-Ground Execution: Support event-day coordination and resolve routine operational issues.$t$,
     $t$Team Coordination: Work with other FusionX@SCRIET teams to ensure events run smoothly.$t$,
     $t$Workshop & Session Support: Assist with speaker coordination, session preparation, and event arrangements.$t$,
     $t$Post-Event Coordination: Support feedback collection, documentation, and event reviews.$t$],
   $t$Students who enjoy organising activities, coordinating people, communicating, managing responsibilities, and working in a team.$t$,
   $t$Leadership experience, event management skills, coordination and communication abilities, teamwork, operational problem-solving, and practical experience in organising student initiatives.$t$,
   null, null, 'recruitment', 'CalendarCheck', '{}', 4, true),

  ('fusionx-teams', 'FusionX Teams', 'Connect. Collaborate. Build Together.',
   $t$FusionX Teams is the collaborative space within FusionX@SCRIET where students and student teams can connect, form collaborations, exchange ideas, and work together on meaningful projects.$t$,
   $t$FusionX Teams is the collaborative space within FusionX@SCRIET where students and student teams can connect, form collaborations, exchange ideas, and work together on meaningful projects.

Unlike the four operational teams, FusionX Teams is not a conventional department with fixed job roles. Its purpose is to encourage collaboration between existing teams, help students find potential teammates, and support the formation of new teams around shared interests, ideas, and challenges.

It creates opportunities for students from different branches, backgrounds, and skill sets to work together and explore possibilities that may be difficult to pursue individually.$t$,
   '{}', null, null,
   'Collaborative Network', 'Not a regular recruitment department', 'teams', 'Users', '{}', 5, true)
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, summary = excluded.summary, about = excluded.about,
  responsibilities = excluded.responsibilities, who_should_join = excluded.who_should_join,
  what_you_gain = excluded.what_you_gain, type_label = excluded.type_label, type_note = excluded.type_note,
  cta = excluded.cta, icon_name = excluded.icon_name, details = excluded.details,
  display_order = excluded.display_order, is_visible = excluded.is_visible;

-- Saved site content: the footer and the hero button pointed at /programs and /founders.
update site_content set value = replace(replace(replace(replace(replace(value::text,
    '"href": "/programs", "label": "Programs"', '"href": "/hubs", "label": "FusionX Hubs"'),
    '"href": "/programs", "label": "Explore Programs"', '"href": "/hubs", "label": "Explore FusionX Hubs"'),
    '"href": "/founders", "label": "Founding Team"', '"href": "/core", "label": "Core"'),
    '"/programs"', '"/hubs"'),
    '"/founders"', '"/core"')::jsonb
where key in ('home.hero', 'footer.columns')
  and (value::text like '%"/programs"%' or value::text like '%"/founders"%');

-- A saved page title or description that still says "Programs" or "Team" falls back to the page's own.
update site_content set value = jsonb_set(value, '{programs}',
    (value -> 'programs') - 'title' - 'description')
where key = 'seo.pages' and jsonb_typeof(value -> 'programs') = 'object'
  and (coalesce(value -> 'programs' ->> 'title', '') ~* 'program' or coalesce(value -> 'programs' ->> 'description', '') ~* 'program');

update site_content set value = jsonb_set(value, '{founders}',
    (value -> 'founders') - 'title' - 'description')
where key = 'seo.pages' and jsonb_typeof(value -> 'founders') = 'object'
  and (coalesce(value -> 'founders' ->> 'title', '') ~* 'founding|team' or coalesce(value -> 'founders' ->> 'description', '') ~* 'founding|team');

commit;
