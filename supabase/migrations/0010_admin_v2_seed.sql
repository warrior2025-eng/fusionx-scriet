-- Admin v2, step 4 of 4: seed. Run once.
--
-- Moves the values that were hard-coded in lib/site-config.ts (and the
-- faculty guide held in organization_settings) into the database, exactly as
-- they are today. Nothing is added.

begin;

insert into org_people (full_name, role_title, category, about, display_order) values
  ('Pranjal Srivastav', 'Founding Member, Strategic Development Lead', 'founder',
   'Leads overall vision, strategic direction, institutional coordination, and long-term planning and development of FusionX.', 1),
  ('Anshika Dwivedi', 'Founding Member, Network & Innovation Operations Lead', 'founder',
   'Leads the student network, innovation operations, program coordination, team formation, and execution of FusionX initiatives.', 2),
  ('Sirin Bano', 'Founding Member, Research & Technical Development Lead', 'founder',
   'Leads research activities, technical development, experimentation, documentation, and project validation.', 3),
  ('Jayesh Gaur', 'Senior Mentor', 'senior_mentor', null, 1);

-- The primary faculty guide, exactly as it is stored today.
insert into org_people (full_name, role_title, category, display_order)
select faculty_guide_name, faculty_guide_title, 'faculty_guide', 1
from organization_settings
where id;

insert into org_people (full_name, role_title, category, display_order) values
  ('Amit Sharma', 'Faculty Guide, FusionX@SCRIET and HOD, CS, SCRIET', 'faculty_guide', 2);

insert into programs (slug, name, summary, details, display_order) values
  ('build-lab', 'FusionX Build Lab',
   'Ideation, team formation, technical workshops, build sessions, and prototype reviews.',
   array['Ideation', 'Team formation', 'Technical workshops', 'Build sessions', 'Prototype reviews', 'Demonstrations'], 1),
  ('research-forum', 'FusionX Research Forum',
   'Research orientation, literature review, methodology, experimentation, and documentation.',
   array['Research orientation', 'Literature review', 'Methodology', 'Experimentation', 'Documentation', 'Research collaboration'], 2),
  ('ip-innovation-cell', 'FusionX IP & Innovation Cell',
   'Patent and prior-art awareness, novelty checks, documentation, and IP education.',
   array['Patent awareness', 'Prior-art awareness', 'Novelty', 'Documentation', 'IP education', 'TCPO coordination where applicable'], 3),
  ('venture-cell', 'FusionX Venture Cell',
   'Problem discovery, customer discovery, MVPs, market research, and pitching.',
   array['Problem discovery', 'Customer discovery', 'MVP', 'Market research', 'Business models', 'Pitching', 'Incubation/funding awareness'], 4),
  ('competition-support', 'Competition Support & Mentorship',
   'Preparation, mentorship, and submission support for hackathons and innovation competitions.',
   array['Hackathons', 'Innovation competitions', 'Preparation', 'Mentorship', 'Submission support', 'Post-competition continuation'], 5),
  ('fusionx-teams', 'FusionX Teams',
   'Interdisciplinary collaboration and skill-based project team formation.',
   array['Interdisciplinary collaboration', 'Skill-based team formation', 'Project teams', 'Team coordination'], 6);

insert into site_content (key, scope, value) values
  ('lists.pipeline', 'content',
   '["Problem","Idea","Team","Build","Prototype","Research / IP","Competition","Further Development"]'),
  ('lists.journey', 'content',
   '["Discover","Explore","Connect","Build","Validate","Research","Protect","Present","Continue"]'),
  ('lists.core_areas', 'content',
   '[{"label":"Build","icon":"Hammer"},{"label":"Research","icon":"FlaskConical"},{"label":"Connect","icon":"Users"},{"label":"Compete","icon":"Trophy"},{"label":"Create","icon":"Sparkles"}]');

commit;
