-- 0042: FusionX Autopilot, core (PR 1).
--
-- Playbooks (with variations and versions) turn into missions; missions into tasks with real
-- dates and dependencies; tasks are offered to the best person, reminded, escalated, proven,
-- peer-reviewed and become contributions. Everything automatic runs in autopilot_tick(), which
-- pg_cron calls (supabase/setup/autopilot_cron.sql). Every part obeys Control: the master switch,
-- the level of its area (auto / suggest / manual) and the pauses. "Suggest" puts a ready item in
-- Command Center → Today, where one click carries it out.
--
-- Additive only, safe to run again: "if not exists", "create or replace", "on conflict do nothing".
-- Writes go through the functions below (they check the caller); tables are read through RLS.

-- ════════════════════════════════════════════════════════════════════════
-- Settings, permissions, secrets
-- ════════════════════════════════════════════════════════════════════════

create table if not exists autopilot_settings (
  id smallint primary key default 1 check (id = 1),
  master text not null default 'on' check (master in ('on', 'paused')),
  -- area → 'auto' | 'suggest' | 'manual'; a missing area counts as 'suggest'.
  levels jsonb not null default '{}'::jsonb,
  -- All the numbers; a missing one takes its default from ap_num().
  numbers jsonb not null default '{}'::jsonb,
  -- Paused things: {"hubs": [...], "playbooks": [...], "rules": [...], "missions": [...]}
  pauses jsonb not null default '{}'::jsonb,
  -- Founders who are in their exams: approvals go to the Head of Execution and the hub leads,
  -- and they get only the weekly email.
  founder_exam_mode uuid[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into autopilot_settings (id) values (1) on conflict do nothing;

-- Who may do what. Tokens: super_admin, admin, head_of_execution, hub_lead, mentor, member.
create table if not exists autopilot_permissions (
  action text primary key,
  label text not null,
  allowed text[] not null,
  updated_at timestamptz not null default now()
);
insert into autopilot_permissions (action, label, allowed) values
  ('missions.create', 'Create missions', '{super_admin,admin,head_of_execution,hub_lead}'),
  ('playbooks.edit', 'Edit playbooks', '{super_admin,admin,head_of_execution}'),
  ('variations.approve', 'Choose variations', '{super_admin,admin,head_of_execution,hub_lead}'),
  ('plans.change', 'Change plans', '{super_admin,admin,head_of_execution,hub_lead}'),
  ('seats.approve', 'Approve open seats', '{super_admin,admin,head_of_execution,hub_lead}'),
  ('talent.approve', 'Approve Rising Talent', '{super_admin,admin}'),
  ('projects.support', 'Approve FusionX support for projects', '{super_admin,admin,head_of_execution,hub_lead}'),
  ('ideas.adopt', 'Adopt Idea Engine drafts', '{super_admin,admin,head_of_execution}'),
  ('certificates.issue', 'Issue certificates', '{super_admin,admin}'),
  ('impact.publish', 'Publish to /impact', '{super_admin,admin}')
on conflict do nothing;

-- Server-only secrets (the web push keys). RLS on and no policy: nobody reads it through the API;
-- only server code with the service key does.
create table if not exists server_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table server_secrets enable row level security;
revoke all on server_secrets from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- Playbooks
-- ════════════════════════════════════════════════════════════════════════

create table if not exists playbooks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 120),
  description text check (description is null or char_length(description) <= 600),
  exam_safe boolean not null default false,
  -- Research: the mission starts only after a mentor approves.
  needs_mentor_approval boolean not null default false,
  default_visibility text not null default 'members' check (default_visibility in ('members', 'public')),
  status text not null default 'active' check (status in ('active', 'archived')),
  version integer not null default 1,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists playbook_variations (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references playbooks(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  -- Stretches the task offsets: Standard 8 weeks is 2× Lite 4 weeks.
  scale numeric(4,2) not null default 1 check (scale between 0.25 and 6),
  sort integer not null default 0,
  is_default boolean not null default false,
  unique (playbook_id, key)
);

create table if not exists playbook_tasks (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references playbooks(id) on delete cascade,
  -- Stable within the playbook: dependencies point at it.
  key text not null check (key ~ '^[a-z0-9-]{1,40}$'),
  sort integer not null default 0,
  title text not null check (char_length(title) between 2 and 140),
  checklist text[] not null default '{}',
  -- A hub slug (core_groups.slug) or 'any'.
  hub text not null default 'any',
  skills text[] not null default '{}',
  effort text not null default 'M' check (effort in ('S', 'M', 'L')),
  -- Days from the mission date (negative: before). Scaled by the variation.
  offset_days integer not null default 0,
  depends_on text[] not null default '{}',
  proof text not null default 'link' check (proof in ('link', 'file', 'image', 'text')),
  review text not null default 'peer' check (review in ('peer', 'lead', 'both')),
  open_seat_allowed boolean not null default false,
  community_allowed boolean not null default false,
  exam_safe boolean not null default false,
  -- One task for every member of the mission's hubs (Flagship: everyone gets a part).
  per_member boolean not null default false,
  -- Only in these variations; empty means all.
  variations text[] not null default '{}',
  archived boolean not null default false,
  unique (playbook_id, key)
);

create table if not exists playbook_versions (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references playbooks(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (playbook_id, version)
);

-- Calendar rules: a mission every week / month, created N weeks ahead.
create table if not exists autopilot_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  playbook_id uuid not null references playbooks(id) on delete cascade,
  variation_key text,
  cadence text not null check (cadence in ('weekly', 'monthly')),
  -- 0 Sunday … 6 Saturday.
  weekday smallint not null check (weekday between 0 and 6),
  -- Monthly: the nth weekday (1–4) or 5 = the last one.
  nth smallint check (nth between 1 and 5),
  weeks_ahead smallint check (weeks_ahead between 1 and 12),
  hubs text[] not null default '{}',
  is_on boolean not null default true,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Missions and tasks
-- ════════════════════════════════════════════════════════════════════════

create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (char_length(title) between 2 and 160),
  goal text check (goal is null or char_length(goal) <= 400),
  playbook_id uuid references playbooks(id) on delete set null,
  playbook_version integer,
  variation_key text,
  mission_date date not null,
  owner_id uuid references auth.users(id) on delete set null,
  hubs text[] not null default '{}',
  visibility text not null default 'members' check (visibility in ('members', 'public')),
  status text not null default 'planned' check (status in ('planned', 'active', 'review', 'done', 'paused', 'cancelled')),
  cancel_reason text,
  source text not null default 'manual' check (source in ('rule', 'opportunity', 'pitch', 'project', 'idea', 'manual')),
  rule_id uuid references autopilot_rules(id) on delete set null,
  source_ref uuid,
  outcome_links text[] not null default '{}',
  -- Research: waits for the mentor.
  mentor_id uuid references auth.users(id) on delete set null,
  mentor_approved_at timestamptz,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_missions_rule_date on missions (rule_id, mission_date) where rule_id is not null;
create index if not exists idx_missions_status on missions (status, mission_date);

create table if not exists mission_versions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (mission_id, version)
);

create table if not exists mission_tasks (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  playbook_task_key text,
  -- per_member tasks: whose part this is.
  member_for uuid references auth.users(id) on delete set null,
  sort integer not null default 0,
  title text not null check (char_length(title) between 2 and 160),
  checklist text[] not null default '{}',
  hub text not null default 'any',
  skills text[] not null default '{}',
  effort text not null default 'M' check (effort in ('S', 'M', 'L')),
  due_on date not null,
  depends_on uuid[] not null default '{}',
  proof text not null default 'link' check (proof in ('link', 'file', 'image', 'text')),
  review text not null default 'peer' check (review in ('peer', 'lead', 'both')),
  open_seat_allowed boolean not null default false,
  community_allowed boolean not null default false,
  exam_safe boolean not null default false,
  assignee_id uuid references auth.users(id) on delete set null,
  locked boolean not null default false,
  status text not null default 'open' check (status in ('waiting', 'open', 'offered', 'accepted', 'submitted', 'changes', 'approved', 'cancelled')),
  proof_text text check (proof_text is null or char_length(proof_text) <= 2000),
  proof_url text,
  submitted_at timestamptz,
  approved_at timestamptz,
  reminded_before boolean not null default false,
  reminded_due boolean not null default false,
  escalation smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mission_tasks_mission on mission_tasks (mission_id, sort);
create index if not exists idx_mission_tasks_assignee on mission_tasks (assignee_id, status);
create index if not exists idx_mission_tasks_status on mission_tasks (status, due_on);

create table if not exists task_offers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references mission_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'swapped', 'declined', 'expired', 'withdrawn')),
  offered_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists idx_task_offers_task on task_offers (task_id, status);
create index if not exists idx_task_offers_user on task_offers (user_id, status);

create table if not exists task_reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references mission_tasks(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('peer', 'lead')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes', 'replaced')),
  note text check (note is null or char_length(note) <= 1000),
  due_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_reviews_reviewer on task_reviews (reviewer_id, status);
create index if not exists idx_task_reviews_task on task_reviews (task_id);

create table if not exists task_change_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references mission_tasks(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('move', 'swap')),
  new_due date,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Verified work. Written only by the review functions: nobody creates entries for themselves.
create table if not exists contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references mission_tasks(id) on delete set null,
  mission_id uuid references missions(id) on delete set null,
  title text not null,
  kind text not null default 'task',
  skill text,
  proof text,
  reviewer_id uuid references auth.users(id) on delete set null,
  contributed_on date not null,
  -- Counts for certificates and /impact (project work stays "self-tracked" until supported).
  counts boolean not null default true,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists idx_contributions_user on contributions (user_id, contributed_on desc);

create table if not exists availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists idx_availability_user on availability (user_id, ends_on);

create table if not exists club_exam_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Exams' check (char_length(name) between 1 and 80),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  done text check (done is null or char_length(done) <= 500),
  next text check (next is null or char_length(next) <= 500),
  blocked text check (blocked is null or char_length(blocked) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- How a member gets their Autopilot news.
create table if not exists work_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  delivery text not null default 'instant' check (delivery in ('instant', 'daily')),
  push boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);

-- Phone notifications: a notification is pushed once (null = not yet).
-- Older notifications count as pushed (only on the first run).
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'pushed_at') then
    alter table notifications add column pushed_at timestamptz;
    update notifications set pushed_at = created_at;
  end if;
end $$;
create index if not exists idx_notifications_push_pending on notifications (created_at) where pushed_at is null;
-- Members may mark their notifications read, but not reset the push bookkeeping (it would push again).
create or replace function guard_notification_push_column()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.pushed_at := old.pushed_at; end if;
  return new;
end $$;
drop trigger if exists trg_guard_notification_push_column on notifications;
create trigger trg_guard_notification_push_column before update on notifications
  for each row execute function guard_notification_push_column();
-- Daily digest: Autopilot news for people who chose "daily" waits here.
create table if not exists autopilot_digest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  link text,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- Today queue and the automation log
-- ════════════════════════════════════════════════════════════════════════

-- What Suggest mode prepared, plus everything else waiting for a decision.
create table if not exists autopilot_queue (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  kind text not null,
  title text not null,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  -- One pending item per thing.
  dedupe text not null,
  safe boolean not null default false,
  hub text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'skipped', 'done')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_autopilot_queue_dedupe on autopilot_queue (dedupe) where status = 'pending';

create table if not exists automation_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  area text not null,
  action text not null,
  reason text not null,
  ref_type text,
  ref_id uuid,
  -- How to undo it, when it can be undone.
  undo jsonb,
  undone_at timestamptz,
  undone_by uuid references auth.users(id) on delete set null,
  actor uuid references auth.users(id) on delete set null
);
create index if not exists idx_automation_log_at on automation_log (at desc);

-- ════════════════════════════════════════════════════════════════════════
-- Seed: playbooks, variations, tasks and rules (active, editable)
-- ════════════════════════════════════════════════════════════════════════

insert into playbooks (slug, name, description, exam_safe, needs_mentor_approval, default_visibility, sort) values
  ('weekly-social-post', 'Weekly social post', 'One post a week on the FusionX pages.', true, false, 'members', 1),
  ('weekly-opportunity-digest', 'Weekly opportunity digest', 'The best open opportunities of the week, each with its official link.', true, false, 'members', 2),
  ('monthly-workshop', 'Monthly workshop / session', 'A session a month, from topic to recap.', false, false, 'public', 3),
  ('monthly-build-night', 'Monthly Build Night', 'An evening of building together, ending with demos.', false, false, 'public', 4),
  ('hackathon-entry', 'Hackathon entry', 'From choosing a hackathon to submitting.', false, false, 'public', 5),
  ('flagship-project-sprint', 'Flagship project sprint', 'A whole-club project: every member gets a part.', false, false, 'public', 6),
  ('research-paper', 'Research paper / idea-to-patent', 'Starts only after a mentor approves.', false, true, 'members', 7),
  ('semester-impact-report', 'Semester Impact Report', 'The semester''s outcomes for the HOD and Director.', true, false, 'members', 8)
on conflict (slug) do nothing;

insert into playbook_variations (playbook_id, key, name, description, scale, sort, is_default)
select p.id, v.key, v.name, v.description, v.scale, v.sort, v.is_default
from (values
  ('weekly-social-post', 'single', 'Single', 'One image.', 1.0, 1, true),
  ('weekly-social-post', 'carousel', 'Carousel', '4–6 slides.', 1.0, 2, false),
  ('weekly-social-post', 'reel', 'Reel', 'A 30–60 second video.', 1.25, 3, false),
  ('weekly-opportunity-digest', 'top3', 'Top 3', 'Three picks.', 1.0, 1, true),
  ('weekly-opportunity-digest', 'full', 'Full list', 'Up to eight picks.', 1.0, 2, false),
  ('monthly-workshop', 'online-short', 'Online · Short', 'A 1-hour online session.', 0.75, 1, true),
  ('monthly-workshop', 'offline-full', 'Offline · Full', 'A half-day session on campus.', 1.0, 2, false),
  ('monthly-workshop', 'hybrid-full', 'Hybrid · Full', 'On campus and streamed.', 1.0, 3, false),
  ('monthly-build-night', 'mini', 'Mini', 'Three hours, one theme.', 0.75, 1, true),
  ('monthly-build-night', 'standard', 'Standard', 'An evening with mentors.', 1.0, 2, false),
  ('monthly-build-night', 'showcase', 'Showcase', 'Ends with public demos.', 1.25, 3, false),
  ('hackathon-entry', 'solo', 'Solo', 'One builder.', 0.75, 1, false),
  ('hackathon-entry', 'mixed-hub', 'Mixed-hub team', 'A team from several hubs.', 1.0, 2, true),
  ('hackathon-entry', 'open-seat', 'Open-seat team', 'With seats open to others.', 1.0, 3, false),
  ('flagship-project-sprint', 'lite', 'Lite · 4 weeks', 'A focused MVP.', 1.0, 1, false),
  ('flagship-project-sprint', 'standard', 'Standard · 8 weeks', 'MVP tested with real users.', 2.0, 2, true),
  ('flagship-project-sprint', 'ambitious', 'Ambitious · 12 weeks', 'With a public launch.', 3.0, 3, false),
  ('research-paper', 'paper', 'Paper', 'A paper for a student venue.', 1.0, 1, true),
  ('research-paper', 'patent', 'Idea to patent', 'Prior-art search and a filing draft.', 1.0, 2, false),
  ('semester-impact-report', 'short', 'Short', 'Four pages.', 1.0, 1, true),
  ('semester-impact-report', 'full', 'Full', 'With photos and every proof link.', 1.25, 2, false)
) as v (slug, key, name, description, scale, sort, is_default)
join playbooks p on p.slug = v.slug
on conflict (playbook_id, key) do nothing;

insert into playbook_tasks (playbook_id, key, sort, title, checklist, hub, skills, effort, offset_days, depends_on, proof, review, open_seat_allowed, community_allowed, exam_safe, per_member, variations)
select p.id, t.key, t.sort, t.title, t.checklist, t.hub, t.skills, t.effort, t.offset_days, t.depends_on, t.proof, t.review, t.open_seat, t.community, t.exam_safe, t.per_member, t.variations
from (values
  -- Weekly social post
  ('weekly-social-post', 'topic', 1, 'Pick the topic and write the caption', '{"Topic fits this week","Caption under 150 words","Official links only"}'::text[], 'design-branding', '{writing,social media}'::text[], 'S', -4, '{}'::text[], 'text', 'peer', false, true, true, false, '{}'::text[]),
  ('weekly-social-post', 'visual', 2, 'Design the visual', '{"FusionX colours and logo","Readable on a phone"}', 'design-branding', '{design,canva,figma}', 'M', -3, '{topic}', 'image', 'peer', false, true, true, false, '{single,carousel}'),
  ('weekly-social-post', 'reel', 3, 'Shoot and edit the reel', '{"30–60 seconds","Captions on"}', 'design-branding', '{video,editing}', 'L', -3, '{topic}', 'link', 'peer', true, false, true, false, '{reel}'),
  ('weekly-social-post', 'publish', 4, 'Review and publish', '{"Final check","Post at the planned time"}', 'design-branding', '{social media}', 'S', 0, '{visual,reel}', 'link', 'lead', false, false, true, false, '{}'),
  -- Weekly opportunity digest
  ('weekly-opportunity-digest', 'collect', 1, 'Collect opportunities with official links', '{"Only official links","Deadline still open"}', 'competitions-opportunities', '{research}', 'M', -3, '{}', 'text', 'peer', false, true, true, false, '{}'),
  ('weekly-opportunity-digest', 'verify', 2, 'Open each link and confirm it', '{"Link works","Deadline and eligibility match"}', 'competitions-opportunities', '{research}', 'S', -2, '{collect}', 'text', 'lead', false, false, true, false, '{}'),
  ('weekly-opportunity-digest', 'design', 3, 'Design the digest post', '{"One line per opportunity"}', 'design-branding', '{design,canva}', 'S', -1, '{verify}', 'image', 'peer', false, true, true, false, '{}'),
  ('weekly-opportunity-digest', 'publish', 4, 'Publish the digest', '{"Links in the caption or bio"}', 'competitions-opportunities', '{social media}', 'S', 0, '{design}', 'link', 'lead', false, false, true, false, '{}'),
  -- Monthly workshop
  ('monthly-workshop', 'topic', 1, 'Pick the topic and the speaker', '{"Speaker confirmed","Date fixed"}', 'event-crew', '{planning}', 'M', -21, '{}', 'text', 'lead', false, false, false, false, '{}'),
  ('monthly-workshop', 'venue', 2, 'Book the venue', '{"Room booked","Projector and sound"}', 'event-crew', '{planning}', 'S', -18, '{topic}', 'text', 'peer', false, false, false, false, '{offline-full,hybrid-full}'),
  ('monthly-workshop', 'page', 3, 'Create the event page and registrations', '{"Event page live","Registration open"}', 'event-crew', '{web}', 'S', -14, '{topic}', 'link', 'peer', false, false, false, false, '{}'),
  ('monthly-workshop', 'poster', 4, 'Design the poster', '{"Date, time, place","Registration link"}', 'design-branding', '{design,canva,figma}', 'M', -12, '{page}', 'image', 'peer', true, true, false, false, '{}'),
  ('monthly-workshop', 'promote', 5, 'Promote it in groups and on social media', '{"Posted in every group"}', 'competitions-opportunities', '{social media}', 'S', -10, '{poster}', 'text', 'peer', false, true, false, false, '{}'),
  ('monthly-workshop', 'content', 6, 'Prepare the content and slides', '{"Slides shared with the speaker"}', 'projects-research-startups', '{presentation}', 'M', -5, '{topic}', 'link', 'lead', false, false, false, false, '{}'),
  ('monthly-workshop', 'run', 7, 'Run the session and take attendance', '{"Attendance taken","Photos"}', 'event-crew', '{hosting}', 'M', 0, '{page,content}', 'text', 'lead', false, false, false, false, '{}'),
  ('monthly-workshop', 'recap', 8, 'Post the recap', '{"Photos","Thanks to the speaker"}', 'design-branding', '{design,writing}', 'S', 2, '{run}', 'link', 'peer', false, true, false, false, '{}'),
  -- Monthly Build Night
  ('monthly-build-night', 'theme', 1, 'Choose the theme and problem list', '{"3–5 problems"}', 'projects-research-startups', '{planning}', 'M', -14, '{}', 'text', 'lead', false, false, false, false, '{}'),
  ('monthly-build-night', 'room', 2, 'Book the room or online space', '{"Room or link ready"}', 'event-crew', '{planning}', 'S', -10, '{theme}', 'text', 'peer', false, false, false, false, '{}'),
  ('monthly-build-night', 'poster', 3, 'Design the poster', '{"Theme and date"}', 'design-branding', '{design,canva}', 'S', -9, '{theme}', 'image', 'peer', true, true, false, false, '{}'),
  ('monthly-build-night', 'mentors', 4, 'Invite mentors', '{"At least one mentor"}', 'projects-research-startups', '{communication}', 'S', -7, '{theme}', 'text', 'peer', false, false, false, false, '{standard,showcase}'),
  ('monthly-build-night', 'run', 5, 'Host the Build Night', '{"Attendance","Photos"}', 'event-crew', '{hosting}', 'M', 0, '{room,poster}', 'text', 'lead', false, false, false, false, '{}'),
  ('monthly-build-night', 'demos', 6, 'Run the public demos', '{"Demo order","Judges"}', 'event-crew', '{hosting}', 'M', 0, '{room}', 'text', 'lead', false, false, false, false, '{showcase}'),
  ('monthly-build-night', 'recap', 7, 'Post the showcase recap', '{"What was built"}', 'design-branding', '{design,writing}', 'S', 2, '{run}', 'link', 'peer', false, true, false, false, '{}'),
  -- Hackathon entry
  ('hackathon-entry', 'register', 1, 'Pick the hackathon and register', '{"Official link","Team size fits"}', 'competitions-opportunities', '{research}', 'S', -21, '{}', 'link', 'lead', false, false, false, false, '{}'),
  ('hackathon-entry', 'team', 2, 'Form the team', '{"Roles agreed"}', 'competitions-opportunities', '{communication}', 'S', -18, '{register}', 'text', 'peer', true, false, false, false, '{mixed-hub,open-seat}'),
  ('hackathon-entry', 'plan', 3, 'Idea and build plan', '{"Problem","Solution","Stack"}', 'projects-research-startups', '{planning}', 'M', -14, '{register}', 'text', 'lead', false, false, false, false, '{}'),
  ('hackathon-entry', 'build', 4, 'Build the MVP', '{"Repository","Demo works"}', 'projects-research-startups', '{programming,web}', 'L', -3, '{plan}', 'link', 'peer', true, false, false, false, '{}'),
  ('hackathon-entry', 'deck', 5, 'Make the pitch deck', '{"Under 10 slides"}', 'design-branding', '{design,presentation}', 'M', -2, '{plan}', 'link', 'peer', true, true, false, false, '{}'),
  ('hackathon-entry', 'submit', 6, 'Submit the entry', '{"Submitted before the deadline"}', 'competitions-opportunities', '{}', 'S', 0, '{build,deck}', 'link', 'lead', false, false, false, false, '{}'),
  -- Flagship project sprint
  ('flagship-project-sprint', 'users', 1, 'Talk to real users about the problem', '{"At least 5 conversations","Notes shared"}', 'projects-research-startups', '{research}', 'M', -28, '{}', 'text', 'lead', false, true, false, false, '{}'),
  ('flagship-project-sprint', 'spec', 2, 'Write the spec and milestones', '{"Scope","Milestones"}', 'projects-research-startups', '{planning}', 'M', -24, '{users}', 'link', 'lead', false, false, false, false, '{}'),
  ('flagship-project-sprint', 'ui', 3, 'Design the screens', '{"Main screens","Mobile first"}', 'design-branding', '{figma,design}', 'M', -20, '{spec}', 'link', 'peer', true, true, false, false, '{}'),
  ('flagship-project-sprint', 'part', 4, 'Your part in the build', '{"Agreed with the owner"}', 'any', '{}', 'S', -12, '{spec}', 'link', 'peer', false, false, false, true, '{}'),
  ('flagship-project-sprint', 'build', 5, 'Build the core', '{"Main flow works"}', 'projects-research-startups', '{programming,web}', 'L', -10, '{spec}', 'link', 'peer', true, false, false, false, '{}'),
  ('flagship-project-sprint', 'test', 6, 'Test with users and fix', '{"5 users tried it"}', 'projects-research-startups', '{testing}', 'M', -5, '{build,ui}', 'text', 'lead', false, true, false, false, '{}'),
  ('flagship-project-sprint', 'launch-post', 7, 'Launch post', '{"Screens","Link"}', 'design-branding', '{design,writing}', 'S', 0, '{test}', 'link', 'peer', false, true, false, false, '{}'),
  ('flagship-project-sprint', 'launch-event', 8, 'Public launch event', '{"Demo","Attendance"}', 'event-crew', '{hosting}', 'M', 1, '{test}', 'text', 'lead', false, false, false, false, '{ambitious}'),
  -- Research paper / idea to patent
  ('research-paper', 'search', 1, 'Literature search', '{"Google Scholar, arXiv, IEEE Xplore, Semantic Scholar","Real papers only"}', 'projects-research-startups', '{research}', 'M', -70, '{}', 'link', 'lead', false, false, false, false, '{}'),
  ('research-paper', 'method', 2, 'Question and method', '{"Mentor agrees"}', 'projects-research-startups', '{research}', 'M', -60, '{search}', 'text', 'lead', false, false, false, false, '{}'),
  ('research-paper', 'data', 3, 'Collect the data', '{"Source noted"}', 'projects-research-startups', '{data}', 'L', -40, '{method}', 'link', 'peer', false, false, false, false, '{paper}'),
  ('research-paper', 'prior-art', 4, 'Prior-art search', '{"Patent databases searched"}', 'projects-research-startups', '{research}', 'L', -40, '{method}', 'link', 'lead', false, false, false, false, '{patent}'),
  ('research-paper', 'draft', 5, 'Write the draft', '{"Mentor review asked"}', 'projects-research-startups', '{writing}', 'L', -14, '{data,prior-art}', 'file', 'both', false, false, false, false, '{}'),
  ('research-paper', 'submit', 6, 'Submit or file', '{"Mentor approved"}', 'projects-research-startups', '{}', 'S', 0, '{draft}', 'link', 'lead', false, false, false, false, '{}'),
  -- Semester Impact Report
  ('semester-impact-report', 'collect', 1, 'Collect the semester''s outcomes', '{"Every mission","Every event"}', 'any', '{}', 'M', -10, '{}', 'link', 'lead', false, false, true, false, '{}'),
  ('semester-impact-report', 'photos', 2, 'Pick the photos', '{"Best 10"}', 'design-branding', '{design}', 'S', -8, '{}', 'link', 'peer', false, false, true, false, '{full}'),
  ('semester-impact-report', 'draft', 3, 'Check the generated report', '{"Numbers match the records"}', 'projects-research-startups', '{writing}', 'M', -5, '{collect}', 'file', 'lead', false, false, true, false, '{}'),
  ('semester-impact-report', 'send', 4, 'Send it to the HOD and Director', '{"Sent"}', 'any', '{}', 'S', 0, '{draft}', 'text', 'lead', false, false, true, false, '{}')
) as t (slug, key, sort, title, checklist, hub, skills, effort, offset_days, depends_on, proof, review, open_seat, community, exam_safe, per_member, variations)
join playbooks p on p.slug = t.slug
on conflict (playbook_id, key) do nothing;

-- The first version of each seeded playbook.
insert into playbook_versions (playbook_id, version, snapshot, note)
select p.id, 1, jsonb_build_object('playbook', to_jsonb(p),
  'variations', (select coalesce(jsonb_agg(to_jsonb(v) order by v.sort), '[]') from playbook_variations v where v.playbook_id = p.id),
  'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.sort), '[]') from playbook_tasks t where t.playbook_id = p.id)), 'Seeded'
from playbooks p
on conflict (playbook_id, version) do nothing;

-- Calendar rules: weekly post (Friday), weekly digest (Monday), workshop (2nd Saturday), Build Night (last Friday).
insert into autopilot_rules (name, playbook_id, variation_key, cadence, weekday, nth, hubs)
select r.name, p.id, r.variation, r.cadence, r.weekday, r.nth, r.hubs
from (values
  ('Weekly social post', 'weekly-social-post', 'single', 'weekly', 5, null::smallint, '{design-branding}'::text[]),
  ('Weekly opportunity digest', 'weekly-opportunity-digest', 'top3', 'weekly', 1, null, '{competitions-opportunities,design-branding}'),
  ('Monthly workshop', 'monthly-workshop', 'online-short', 'monthly', 6, 2, '{event-crew,design-branding,competitions-opportunities,projects-research-startups}'),
  ('Monthly Build Night', 'monthly-build-night', 'mini', 'monthly', 5, 5, '{projects-research-startups,event-crew,design-branding}')
) as r (name, slug, variation, cadence, weekday, nth, hubs)
join playbooks p on p.slug = r.slug
where not exists (select 1 from autopilot_rules x where x.name = r.name);

-- Which automatic run wrote a row (the dry run reads its own rows back, then rolls them back).
alter table automation_log add column if not exists run_id uuid;
alter table autopilot_queue add column if not exists run_id uuid;

-- ════════════════════════════════════════════════════════════════════════
-- Helpers
-- ════════════════════════════════════════════════════════════════════════

-- "Now" for the engine: the real time, or the time a test or the dry run asks for.
create or replace function ap_now() returns timestamptz
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('ap.now', true), '')::timestamptz, now());
$$;

create or replace function ap_today() returns date
language sql stable set search_path = public as $$
  select (ap_now() at time zone 'Asia/Kolkata')::date;
$$;

create or replace function ap_num(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (s.numbers ->> p_key)::numeric from autopilot_settings s where s.id = 1),
    case p_key
      when 'weeks_ahead' then 3 when 'offer_timeout_hours' then 24 when 'remind_days_before' then 2
      when 'escalate_lead_days' then 1 when 'escalate_owner_days' then 3 when 'escalate_center_days' then 5
      when 'review_hours' then 48 when 'load_cap' then 2 when 'load_cap_exams' then 1
      when 'rotation_days' then 14 when 'checkin_weekday' then 5 when 'guest_days' then 7
      when 'community_head_start_hours' then 48 when 'community_task_limit' then 1
      when 'talent_contributions' then 3 when 'talent_weeks' then 8 when 'voting_days' then 5
      when 'public_hide_days' then 7 when 'project_limit' then 2 when 'project_team_size' then 6
      when 'idea_projects_per_week' then 3 when 'idea_research_per_month' then 3 when 'idea_daily_cap' then 20
      when 'weekly_email_weekday' then 1 when 'digest_hour' then 19
    end);
$$;

create or replace function ap_level(p_area text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select s.levels ->> p_area from autopilot_settings s where s.id = 1), 'suggest');
$$;

create or replace function ap_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.master = 'on' from autopilot_settings s where s.id = 1), false);
$$;

create or replace function ap_paused(p_kind text, p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.pauses -> p_kind) ? p_id from autopilot_settings s where s.id = 1), false);
$$;

create or replace function ap_has(p_user uuid, p_role app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles r where r.user_id = p_user and r.role = p_role);
$$;

-- The Head of Execution: a member of the FusionX Core group with that title.
create or replace function ap_is_hoe(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from core_group_members m join core_groups g on g.id = m.group_id
                 where m.user_id = p_user and g.kind = 'core' and m.title ilike '%head of execution%');
$$;

create or replace function ap_lead_hubs(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(g.slug), '{}') from core_group_members m join core_groups g on g.id = m.group_id
  where m.user_id = p_user and m.is_lead and g.kind = 'hub';
$$;

-- Runs Autopilot day to day: admins, super admins and the Head of Execution.
create or replace function ap_is_operator(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (ap_has(p_user, 'super_admin') or ap_has(p_user, 'admin') or ap_is_hoe(p_user));
$$;

-- Command Center: operators and hub leads (who see their hub).
create or replace function ap_can_open_center(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select ap_is_operator(p_user) or cardinality(ap_lead_hubs(p_user)) > 0;
$$;

-- The permissions matrix (Control). The super admin may always.
create or replace function ap_can(p_action text, p_hub text default null, p_user uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare allowed text[];
begin
  if p_user is null then return false; end if;
  if ap_has(p_user, 'super_admin') then return true; end if;
  select a.allowed into allowed from autopilot_permissions a where a.action = p_action;
  if allowed is null then return false; end if;
  return ('admin' = any(allowed) and ap_has(p_user, 'admin'))
      or ('head_of_execution' = any(allowed) and ap_is_hoe(p_user))
      or ('hub_lead' = any(allowed) and (case when p_hub is null then cardinality(ap_lead_hubs(p_user)) > 0 else p_hub = any(ap_lead_hubs(p_user)) end))
      or ('mentor' = any(allowed) and ap_has(p_user, 'mentor'))
      or ('member' = any(allowed));
end;
$$;

-- Active members of these hubs (by slug).
create or replace function ap_hub_members(p_hubs text[]) returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct m.user_id from core_group_members m
  join core_groups g on g.id = m.group_id
  join profiles p on p.id = m.user_id
  where g.kind = 'hub' and g.slug = any(p_hubs) and p.is_active;
$$;

create or replace function ap_founders_in_exams() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce((select s.founder_exam_mode from autopilot_settings s where s.id = 1), '{}');
$$;

-- An Autopilot notification (in-app; email and push follow from it). Founders in exam mode get only
-- the weekly email; "daily" people get one digest a day instead.
create or replace function ap_notify(p_user uuid, p_title text, p_body text, p_link text, p_weekly boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if not p_weekly and p_user = any(ap_founders_in_exams()) then return; end if;
  if not p_weekly and exists (select 1 from work_preferences w where w.user_id = p_user and w.delivery = 'daily') then
    insert into autopilot_digest (user_id, title, link) values (p_user, left(p_title, 200), p_link);
    return;
  end if;
  insert into notifications (user_id, title, body, link) values (p_user, left(p_title, 200), left(p_body, 1000), p_link);
end;
$$;

-- People who decide: admins (not in exam mode), the Head of Execution and the hub's leads.
create or replace function ap_approvers(p_hub text default null) returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select r.user_id from user_roles r where r.role in ('super_admin', 'admin') and not (r.user_id = any(ap_founders_in_exams()))
  union
  select m.user_id from core_group_members m join core_groups g on g.id = m.group_id
  where (g.kind = 'core' and m.title ilike '%head of execution%') or (p_hub is not null and g.kind = 'hub' and g.slug = p_hub and m.is_lead);
$$;

create or replace function ap_log(p_area text, p_action text, p_reason text, p_ref_type text default null, p_ref_id uuid default null, p_undo jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into automation_log (at, area, action, reason, ref_type, ref_id, undo, actor, run_id)
  values (ap_now(), p_area, left(p_action, 200), left(p_reason, 500), p_ref_type, p_ref_id, p_undo, auth.uid(),
          nullif(current_setting('ap.run', true), '')::uuid)
  returning id into new_id;
  return new_id;
end;
$$;

-- A prepared item for Command Center → Today (one pending item per thing).
create or replace function ap_suggest(p_area text, p_kind text, p_title text, p_detail text, p_payload jsonb, p_dedupe text, p_safe boolean, p_hub text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into autopilot_queue (area, kind, title, detail, payload, dedupe, safe, hub, created_at, run_id)
  values (p_area, p_kind, left(p_title, 200), left(p_detail, 600), coalesce(p_payload, '{}'), p_dedupe, p_safe, p_hub, ap_now(),
          nullif(current_setting('ap.run', true), '')::uuid)
  on conflict (dedupe) where status = 'pending' do nothing;
end;
$$;

create or replace function ap_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select p.full_name from profiles p where p.id = p_user), 'someone');
$$;

-- Green / amber / red, from the tasks' dates (internal only; never shown publicly).
create or replace function ap_mission_health(p_mission uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when m.status in ('done', 'cancelled', 'paused') then 'green'
    when exists (select 1 from mission_tasks t where t.mission_id = m.id and t.status not in ('approved', 'cancelled') and t.due_on < ap_today() - 2)
      or (m.mission_date < ap_today() and m.status in ('planned', 'active')
          and exists (select 1 from mission_tasks t where t.mission_id = m.id and t.status not in ('approved', 'cancelled'))) then 'red'
    when exists (select 1 from mission_tasks t where t.mission_id = m.id and t.status not in ('approved', 'cancelled')
                 and (t.due_on < ap_today() or (t.due_on <= ap_today() + 3 and t.status in ('open', 'offered')))) then 'amber'
    else 'green' end
  from missions m where m.id = p_mission;
$$;

-- Who may see a mission: operators, its owner, anyone working or reviewing on it, and its hubs' leads.
create or replace function ap_can_see_mission(p_mission uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    ap_is_operator(p_user)
    or exists (select 1 from missions m where m.id = p_mission and (m.owner_id = p_user or m.mentor_id = p_user or m.hubs && ap_lead_hubs(p_user)))
    or exists (select 1 from mission_tasks t where t.mission_id = p_mission and (t.assignee_id = p_user or t.member_for = p_user))
    or exists (select 1 from task_offers o join mission_tasks t on t.id = o.task_id where t.mission_id = p_mission and o.user_id = p_user)
    or exists (select 1 from task_reviews r join mission_tasks t on t.id = r.task_id where t.mission_id = p_mission and r.reviewer_id = p_user));
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Missions: the plan a playbook gives for a variation, date and hubs
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_target_tasks(p_playbook uuid, p_variation text, p_date date, p_hubs text[])
returns table (key text, member_for uuid, sort integer, title text, checklist text[], hub text, skills text[], effort text,
               due_on date, depends_keys text[], proof text, review text, open_seat_allowed boolean,
               community_allowed boolean, exam_safe boolean)
language sql stable security definer set search_path = public as $$
  with v as (
    select coalesce((select pv.scale from playbook_variations pv where pv.playbook_id = p_playbook and pv.key = p_variation), 1) as scale
  ), pt as (
    select t.* from playbook_tasks t
    where t.playbook_id = p_playbook and not t.archived
      and (cardinality(t.variations) = 0 or p_variation = any(t.variations))
  )
  select pt.key, null::uuid, pt.sort, pt.title, pt.checklist, pt.hub, pt.skills, pt.effort,
         p_date + round(pt.offset_days * (select scale from v))::int,
         array(select d from unnest(pt.depends_on) d where d in (select key from pt)),
         pt.proof, pt.review, pt.open_seat_allowed, pt.community_allowed, pt.exam_safe
  from pt where not pt.per_member
  union all
  select pt.key, hm.user_id, pt.sort, pt.title, pt.checklist, pt.hub, pt.skills, pt.effort,
         p_date + round(pt.offset_days * (select scale from v))::int,
         array(select d from unnest(pt.depends_on) d where d in (select key from pt)),
         pt.proof, pt.review, pt.open_seat_allowed, pt.community_allowed, pt.exam_safe
  from pt cross join lateral ap_hub_members(p_hubs) hm where pt.per_member;
$$;

create or replace function ap_snapshot(p_mission uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('mission', to_jsonb(m),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.sort, t.title), '[]') from mission_tasks t where t.mission_id = m.id))
  from missions m where m.id = p_mission;
$$;

-- Waiting tasks whose dependencies are done (and, for research, whose mentor approved) become open.
create or replace function ap_unlock(p_mission uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update mission_tasks t set status = 'open', updated_at = now()
  from missions m left join playbooks p on p.id = m.playbook_id
  where t.mission_id = m.id and t.status = 'waiting' and (p_mission is null or m.id = p_mission)
    and m.status in ('planned', 'active')
    and (not coalesce(p.needs_mentor_approval, false) or m.mentor_approved_at is not null)
    and not exists (select 1 from mission_tasks d where d.id = any(t.depends_on) and d.status not in ('approved', 'cancelled'));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Inserts the missing tasks of the plan; dependencies point at the mission's own tasks.
create or replace function ap_add_target_tasks(p_mission uuid, p_keys text[] default null) returns integer
language plpgsql security definer set search_path = public as $$
declare m missions; n integer;
begin
  select * into m from missions where id = p_mission;
  insert into mission_tasks (mission_id, playbook_task_key, member_for, sort, title, checklist, hub, skills, effort, due_on,
                             proof, review, open_seat_allowed, community_allowed, exam_safe, status)
  select m.id, t.key, t.member_for, t.sort, t.title, t.checklist, t.hub, t.skills, t.effort, t.due_on,
         t.proof, t.review, t.open_seat_allowed, t.community_allowed, t.exam_safe, 'waiting'
  from ap_target_tasks(m.playbook_id, m.variation_key, m.mission_date, m.hubs) t
  where (p_keys is null or t.key = any(p_keys))
    and not exists (select 1 from mission_tasks x where x.mission_id = m.id and x.playbook_task_key = t.key
                    and x.member_for is not distinct from t.member_for and x.status <> 'cancelled');
  get diagnostics n = row_count;
  -- Dependencies by key, within this mission.
  update mission_tasks x set depends_on = array(
      select d.id from mission_tasks d
      where d.mission_id = m.id and d.status <> 'cancelled'
        and d.playbook_task_key = any(coalesce((select pt.depends_on from playbook_tasks pt where pt.playbook_id = m.playbook_id and pt.key = x.playbook_task_key), '{}')))
  where x.mission_id = m.id and x.playbook_task_key is not null and x.status in ('waiting', 'open');
  perform ap_unlock(m.id);
  return n;
end;
$$;

create or replace function ap_slug(p_title text, p_date date) returns text
language plpgsql stable set search_path = public as $$
declare base text := trim(both '-' from left(regexp_replace(lower(p_title), '[^a-z0-9]+', '-', 'g'), 60)) || '-' || to_char(p_date, 'yyyymmdd');
        candidate text := base; i integer := 1;
begin
  while exists (select 1 from missions where slug = candidate) loop i := i + 1; candidate := base || '-' || i; end loop;
  return candidate;
end;
$$;

create or replace function ap_create_mission(p_playbook uuid, p_variation text, p_date date, p_title text default null, p_goal text default null,
  p_owner uuid default null, p_hubs text[] default null, p_source text default 'manual', p_rule uuid default null,
  p_source_ref uuid default null, p_visibility text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare pb playbooks; v text; hubs text[]; owner uuid; new_id uuid; title text;
begin
  select * into pb from playbooks where id = p_playbook and status = 'active';
  if pb.id is null then raise exception 'That playbook is not active.'; end if;
  v := coalesce(p_variation, (select key from playbook_variations where playbook_id = pb.id order by is_default desc, sort limit 1));
  hubs := coalesce(nullif(p_hubs, '{}'), (select coalesce(array_agg(distinct t.hub), '{}') from playbook_tasks t where t.playbook_id = pb.id and t.hub <> 'any' and not t.archived));
  owner := coalesce(p_owner,
    (select m.user_id from core_group_members m join core_groups g on g.id = m.group_id where g.slug = hubs[1] and m.is_lead order by m.display_order limit 1),
    auth.uid());
  title := coalesce(nullif(trim(p_title), ''), pb.name || ' · ' || to_char(p_date, 'DD Mon'));
  insert into missions (slug, title, goal, playbook_id, playbook_version, variation_key, mission_date, owner_id, hubs, visibility,
                        source, rule_id, source_ref, created_by)
  values (ap_slug(title, p_date), title, p_goal, pb.id, pb.version, v, p_date, owner, hubs,
          coalesce(p_visibility, pb.default_visibility), p_source, p_rule, p_source_ref, auth.uid())
  returning id into new_id;
  perform ap_add_target_tasks(new_id);
  insert into mission_versions (mission_id, version, snapshot, reason, changed_by) values (new_id, 1, ap_snapshot(new_id), 'Created', auth.uid());
  if owner is not null then
    perform ap_notify(owner, 'New mission: ' || title, 'You own this mission. Its tasks will be offered to the right people.', '/command/missions?m=' || new_id);
  end if;
  return new_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Fair assignment
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_in_exams(p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_exam_periods e where p_day between e.starts_on and e.ends_on);
$$;

create or replace function ap_load(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select (select count(*) from mission_tasks t where t.assignee_id = p_user and t.status in ('accepted', 'changes'))::int
       + (select count(*) from task_offers o where o.user_id = p_user and o.status = 'offered')::int;
$$;

-- The best person for a task: their hub, matching skills, the lowest load, who had the fewest offers
-- lately (rotation), not busy, not over the cap, and not someone who already passed on it.
create or replace function ap_best_person(p_task uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare t mission_tasks; m missions; cap integer; pool text[]; best uuid;
begin
  select * into t from mission_tasks where id = p_task;
  select * into m from missions where id = t.mission_id;
  cap := case when ap_in_exams(ap_today()) then ap_num('load_cap_exams') else ap_num('load_cap') end;
  -- A per-member task belongs to that member.
  if t.member_for is not null then
    if not exists (select 1 from task_offers o where o.task_id = t.id and o.user_id = t.member_for and o.status in ('declined', 'swapped', 'expired'))
       and not exists (select 1 from availability a where a.user_id = t.member_for and daterange(a.starts_on, a.ends_on, '[]') && daterange(ap_today(), greatest(t.due_on, ap_today()), '[]'))
    then return t.member_for; end if;
  end if;
  pool := case when t.hub = 'any' then m.hubs else array[t.hub] end;
  select c.user_id into best
  from ap_hub_members(pool) c
  join profiles p on p.id = c.user_id
  where c.user_id is distinct from t.member_for
    and not exists (select 1 from task_offers o where o.task_id = t.id and o.user_id = c.user_id and o.status in ('declined', 'swapped', 'expired', 'withdrawn'))
    and not exists (select 1 from availability a where a.user_id = c.user_id and daterange(a.starts_on, a.ends_on, '[]') && daterange(ap_today(), greatest(t.due_on, ap_today()), '[]'))
    and ap_load(c.user_id) < cap
  order by
    (select count(*) from unnest(t.skills) s where exists (select 1 from unnest(p.skills) ps where lower(ps) = lower(s))) desc,
    ap_load(c.user_id) asc,
    (select count(*) from task_offers o where o.user_id = c.user_id and o.offered_at > ap_now() - make_interval(days => ap_num('rotation_days')::int)) asc,
    (select max(o.offered_at) from task_offers o where o.user_id = c.user_id) asc nulls first,
    c.user_id
  limit 1;
  return best;
end;
$$;

create or replace function ap_offer(p_task uuid, p_user uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t mission_tasks; m missions; offer_id uuid;
begin
  select * into t from mission_tasks where id = p_task for update;
  if t.status <> 'open' or t.assignee_id is not null then return null; end if;
  select * into m from missions where id = t.mission_id;
  insert into task_offers (task_id, user_id, offered_at) values (t.id, p_user, ap_now()) returning id into offer_id;
  update mission_tasks set status = 'offered', updated_at = now() where id = t.id;
  perform ap_notify(p_user, 'Task offered: ' || t.title,
    m.title || ' · due ' || to_char(t.due_on, 'DD Mon') || '. Accept, swap or say you can''t in My work.', '/my-work');
  perform ap_log('assignment', 'Offered "' || t.title || '" to ' || ap_name(p_user), p_reason, 'task', t.id,
    jsonb_build_object('type', 'withdraw_offer', 'offer_id', offer_id));
  return offer_id;
end;
$$;

-- Offers one task now if the area is on Auto, prepares it in Suggest, or leaves it in Manual.
create or replace function ap_assign_task(p_task uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t mission_tasks; m missions; who uuid; lvl text := ap_level('assignment');
begin
  select * into t from mission_tasks where id = p_task;
  if t.status <> 'open' or t.locked or t.assignee_id is not null then return 'skip'; end if;
  select * into m from missions where id = t.mission_id;
  if m.status not in ('planned', 'active') or ap_paused('missions', m.id::text) or ap_paused('hubs', t.hub)
     or ap_paused('playbooks', coalesce(m.playbook_id::text, '')) then return 'paused'; end if;
  if lvl = 'manual' then return 'manual'; end if;
  who := ap_best_person(t.id);
  if who is null then return 'nobody'; end if;
  if lvl = 'auto' then
    perform ap_offer(t.id, who, 'Best fit by hub, skills, load and rotation');
    return 'offered';
  end if;
  perform ap_suggest('assignment', 'offer_task', 'Offer "' || t.title || '" to ' || ap_name(who),
    m.title || ' · due ' || to_char(t.due_on, 'DD Mon') || ' · best fit by hub, skills, load and rotation',
    jsonb_build_object('task_id', t.id, 'user_id', who), 'offer:' || t.id, true, t.hub);
  return 'suggested';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Reviewers
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_pick_lead(p_task uuid) returns uuid
language sql stable security definer set search_path = public as $$
  with t as (select t.*, m.owner_id, m.hubs from mission_tasks t join missions m on m.id = t.mission_id where t.id = p_task)
  select coalesce(
    (select gm.user_id from core_group_members gm join core_groups g on g.id = gm.group_id, t
     where g.kind = 'hub' and gm.is_lead and gm.user_id is distinct from t.assignee_id
       and g.slug = case when t.hub = 'any' then t.hubs[1] else t.hub end order by gm.display_order limit 1),
    (select t.owner_id from t where t.owner_id is distinct from t.assignee_id),
    (select gm.user_id from core_group_members gm join core_groups g on g.id = gm.group_id, t
     where g.kind = 'core' and gm.title ilike '%head of execution%' and gm.user_id is distinct from t.assignee_id limit 1),
    (select r.user_id from user_roles r, t where r.role in ('admin', 'super_admin') and r.user_id is distinct from t.assignee_id order by r.role limit 1));
$$;

-- A peer from the same hub (never the doer), rotating: whoever reviewed least lately.
create or replace function ap_pick_peer(p_task uuid) returns uuid
language sql stable security definer set search_path = public as $$
  with t as (select t.*, m.hubs from mission_tasks t join missions m on m.id = t.mission_id where t.id = p_task)
  select c.user_id from t, ap_hub_members(case when t.hub = 'any' then t.hubs else array[t.hub] end) c
  where c.user_id is distinct from t.assignee_id
  order by (select count(*) from task_reviews r where r.reviewer_id = c.user_id and r.created_at > ap_now() - interval '30 days'),
           (select max(r.created_at) from task_reviews r where r.reviewer_id = c.user_id) asc nulls first, c.user_id
  limit 1;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- What members do (called from server actions as the signed-in member)
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_mission_touch(p_mission uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Planned → Active at the first accepted task; Active → Review when every task is approved.
  update missions m set status = 'active', updated_at = now()
  where m.id = p_mission and m.status = 'planned'
    and exists (select 1 from mission_tasks t where t.mission_id = m.id and t.status in ('accepted', 'submitted', 'changes', 'approved'));
  update missions m set status = 'review', updated_at = now()
  where m.id = p_mission and m.status = 'active'
    and exists (select 1 from mission_tasks t where t.mission_id = m.id and t.status = 'approved')
    and not exists (select 1 from mission_tasks t where t.mission_id = m.id and t.status not in ('approved', 'cancelled'));
end;
$$;

-- Accept / Swap / Can't do. Swap also offers the member another open task that fits them.
create or replace function task_offer_respond(p_offer uuid, p_answer text) returns text
language plpgsql security definer set search_path = public as $$
declare o task_offers; t mission_tasks; other uuid;
begin
  select * into o from task_offers where id = p_offer for update;
  if o.id is null or o.user_id is distinct from auth.uid() then raise exception 'This offer is not yours.'; end if;
  if o.status <> 'offered' then return 'This offer was already answered.'; end if;
  select * into t from mission_tasks where id = o.task_id for update;
  if p_answer = 'accept' then
    update task_offers set status = 'accepted', answered_at = ap_now() where id = o.id;
    update mission_tasks set status = 'accepted', assignee_id = o.user_id, updated_at = now() where id = t.id;
    perform ap_mission_touch(t.mission_id);
    perform ap_log('assignment', ap_name(o.user_id) || ' accepted "' || t.title || '"', 'Answered the offer', 'task', t.id);
    return 'Accepted. It is in your tasks now.';
  elsif p_answer in ('swap', 'cant') then
    update task_offers set status = case when p_answer = 'swap' then 'swapped' else 'declined' end, answered_at = ap_now() where id = o.id;
    update mission_tasks set status = 'open', updated_at = now() where id = t.id;
    perform ap_log('assignment', ap_name(o.user_id) || case when p_answer = 'swap' then ' asked to swap "' else ' can''t do "' end || t.title || '"', 'Answered the offer', 'task', t.id);
    if ap_on() then perform ap_assign_task(t.id); end if;
    if p_answer = 'swap' and ap_on() then
      select x.id into other from mission_tasks x join missions m on m.id = x.mission_id
      where x.status = 'open' and not x.locked and x.id <> t.id and m.status in ('planned', 'active')
        and (x.hub = any(array(select g.slug from core_group_members gm join core_groups g on g.id = gm.group_id where gm.user_id = o.user_id and g.kind = 'hub'))
             or (x.hub = 'any' and m.hubs && array(select g.slug from core_group_members gm join core_groups g on g.id = gm.group_id where gm.user_id = o.user_id)))
        and not exists (select 1 from task_offers y where y.task_id = x.id and y.user_id = o.user_id)
      order by x.due_on limit 1;
      if other is not null and ap_load(o.user_id) < ap_num('load_cap') then
        if ap_level('assignment') = 'auto' then perform ap_offer(other, o.user_id, 'Swap: another task that fits');
        else perform ap_suggest('assignment', 'offer_task', 'Offer "' || (select title from mission_tasks where id = other) || '" to ' || ap_name(o.user_id) || ' (swap)',
               'They asked to swap "' || t.title || '"', jsonb_build_object('task_id', other, 'user_id', o.user_id), 'offer:' || other, true, null);
        end if;
      end if;
    end if;
    return case when p_answer = 'swap' then 'Swapped. Someone else will get it.' else 'Noted. Someone else will get it.' end;
  end if;
  raise exception 'Unknown answer.';
end;
$$;

-- Closes a task with its proof; the reviewers are picked and told.
create or replace function task_submit(p_task uuid, p_text text, p_url text) returns text
language plpgsql security definer set search_path = public as $$
declare t mission_tasks; peer uuid; lead uuid; hrs integer := ap_num('review_hours')::int;
begin
  select * into t from mission_tasks where id = p_task for update;
  if t.id is null or t.assignee_id is distinct from auth.uid() then raise exception 'Only the person doing this task can submit it.'; end if;
  if t.status not in ('accepted', 'changes') then raise exception 'This task cannot be submitted now.'; end if;
  if t.proof = 'text' and coalesce(btrim(p_text), '') = '' then raise exception 'Write what you did.'; end if;
  if t.proof <> 'text' and coalesce(p_url, '') !~* '^(https?://\S+|storage:task-proofs/[0-9a-f-]{36}/\S+)$' then raise exception 'Add the proof link or upload.'; end if;
  -- An upload must be the doer's own file.
  if p_url ~ '^storage:' and split_part(substr(p_url, 21), '/', 1) <> auth.uid()::text then raise exception 'Upload the file again.'; end if;
  update mission_tasks set status = 'submitted', proof_text = nullif(btrim(p_text), ''), proof_url = nullif(p_url, ''),
         submitted_at = ap_now(), updated_at = now() where id = t.id;
  update task_reviews set status = 'replaced' where task_id = t.id and status = 'pending';
  if t.review in ('peer', 'both') then
    peer := coalesce(ap_pick_peer(t.id), ap_pick_lead(t.id));
    insert into task_reviews (task_id, reviewer_id, kind, due_at) values (t.id, peer, 'peer', ap_now() + make_interval(hours => hrs));
    perform ap_notify(peer, 'Review asked: ' || t.title, 'Please approve it or ask for changes within ' || hrs || ' hours.', '/my-work#reviews');
  end if;
  if t.review in ('lead', 'both') then
    lead := ap_pick_lead(t.id);
    insert into task_reviews (task_id, reviewer_id, kind, due_at) values (t.id, lead, 'lead', ap_now() + make_interval(hours => hrs));
    perform ap_notify(lead, 'Review asked: ' || t.title, 'Please approve it or ask for changes within ' || hrs || ' hours.', '/my-work#reviews');
  end if;
  perform ap_log('reviews', ap_name(t.assignee_id) || ' submitted "' || t.title || '"', 'Proof added', 'task', t.id);
  return 'Submitted. A reviewer has been asked.';
end;
$$;

-- Approve or ask for changes. When every review is approved the task is done and becomes a contribution.
create or replace function task_review_decide(p_review uuid, p_approve boolean, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare r task_reviews; t mission_tasks; m missions;
begin
  select * into r from task_reviews where id = p_review for update;
  if r.id is null or r.status <> 'pending' then raise exception 'This review is closed.'; end if;
  if r.reviewer_id is distinct from auth.uid() and not ap_is_operator() then raise exception 'This review is not yours.'; end if;
  select * into t from mission_tasks where id = r.task_id for update;
  if t.assignee_id = auth.uid() then raise exception 'Nobody reviews their own work.'; end if;
  select * into m from missions where id = t.mission_id;
  if not p_approve and coalesce(btrim(p_note), '') = '' then raise exception 'Say what needs to change.'; end if;
  update task_reviews set status = case when p_approve then 'approved' else 'changes' end, note = nullif(btrim(p_note), ''),
         decided_at = ap_now(), reviewer_id = coalesce(reviewer_id, auth.uid()) where id = r.id;
  if not p_approve then
    update mission_tasks set status = 'changes', updated_at = now() where id = t.id;
    update task_reviews set status = 'replaced' where task_id = t.id and status = 'pending';
    perform ap_notify(t.assignee_id, 'Changes asked: ' || t.title, p_note, '/my-work');
    perform ap_log('reviews', 'Changes asked on "' || t.title || '"', 'Reviewed by ' || ap_name(auth.uid()), 'task', t.id);
    return 'Sent back with your note.';
  end if;
  if exists (select 1 from task_reviews x where x.task_id = t.id and x.status = 'pending') then
    return 'Approved. Waiting for the other review.';
  end if;
  update mission_tasks set status = 'approved', approved_at = ap_now(), updated_at = now() where id = t.id;
  insert into contributions (user_id, task_id, mission_id, title, kind, skill, proof, reviewer_id, contributed_on)
  values (t.assignee_id, t.id, t.mission_id, t.title, 'task', coalesce(t.skills[1], t.hub), coalesce(t.proof_url, t.proof_text), auth.uid(), ap_today())
  on conflict (task_id, user_id) do nothing;
  perform ap_notify(t.assignee_id, 'Approved: ' || t.title, 'It is now in your contributions.', '/my-work#contributions');
  perform ap_log('reviews', 'Approved "' || t.title || '"', 'Reviewed by ' || ap_name(auth.uid()), 'task', t.id);
  perform ap_unlock(t.mission_id);
  perform ap_mission_touch(t.mission_id);
  return 'Approved. It counts as ' || ap_name(t.assignee_id) || '''s contribution.';
end;
$$;

-- A member asks to move their task or swap it; a lead approves in one click.
create or replace function task_request_change(p_task uuid, p_kind text, p_new_due date, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare t mission_tasks; req uuid;
begin
  select * into t from mission_tasks where id = p_task;
  if t.id is null or t.assignee_id is distinct from auth.uid() then raise exception 'Only the person doing this task can ask.'; end if;
  if p_kind = 'move' and (p_new_due is null or p_new_due < ap_today()) then raise exception 'Choose a new date from today on.'; end if;
  insert into task_change_requests (task_id, requested_by, kind, new_due, note) values (t.id, auth.uid(), p_kind, p_new_due, left(p_note, 500)) returning id into req;
  perform ap_suggest('changes', 'change_request',
    ap_name(auth.uid()) || case when p_kind = 'move' then ' asks to move "' || t.title || '" to ' || to_char(p_new_due, 'DD Mon') else ' asks to swap "' || t.title || '"' end,
    p_note, jsonb_build_object('request_id', req), 'change:' || req, false, t.hub);
  return 'Asked. A lead will decide.';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Change plan: preview, apply, restore
-- ════════════════════════════════════════════════════════════════════════

-- p_changes: {variation_key, mission_date, owner_id, hubs, title, goal, add_tasks: [{title, hub, due_on, effort, proof, review}], remove_tasks: [ids]}
create or replace function ap_plan_preview(p_mission uuid, p_changes jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m missions; v text; d date; h text[]; result jsonb;
begin
  select * into m from missions where id = p_mission;
  if m.id is null then raise exception 'No such mission.'; end if;
  if auth.uid() is not null and not ap_can_see_mission(m.id) then raise exception 'No such mission.'; end if;
  v := coalesce(p_changes ->> 'variation_key', m.variation_key);
  d := coalesce((p_changes ->> 'mission_date')::date, m.mission_date);
  h := coalesce(array(select jsonb_array_elements_text(p_changes -> 'hubs')), m.hubs);
  if p_changes -> 'hubs' is null then h := m.hubs; end if;
  with target as (select * from ap_target_tasks(m.playbook_id, v, d, h)),
  cur as (select * from mission_tasks where mission_id = m.id and status <> 'cancelled'),
  removed_ids as (select (x)::uuid id from jsonb_array_elements_text(coalesce(p_changes -> 'remove_tasks', '[]')) x),
  added as (
    select t.title, t.due_on from target t
    where m.playbook_id is not null and not exists (select 1 from cur c where c.playbook_task_key = t.key and c.member_for is not distinct from t.member_for)
    union all
    select a ->> 'title', (a ->> 'due_on')::date from jsonb_array_elements(coalesce(p_changes -> 'add_tasks', '[]')) a),
  dropped as (
    select c.* from cur c
    where (m.playbook_id is not null and c.playbook_task_key is not null
           and not exists (select 1 from target t where t.key = c.playbook_task_key and t.member_for is not distinct from c.member_for))
       or c.id in (select id from removed_ids)),
  moved as (
    select c.title, c.due_on as old_due, t.due_on as new_due, c.assignee_id from cur c join target t on t.key = c.playbook_task_key and t.member_for is not distinct from c.member_for
    where c.due_on <> t.due_on and c.status not in ('approved')),
  people as (
    select assignee_id u from moved where assignee_id is not null
    union select assignee_id from dropped where assignee_id is not null
    union select (p_changes ->> 'owner_id')::uuid where p_changes ? 'owner_id' and (p_changes ->> 'owner_id') is not null)
  select jsonb_build_object(
    'added', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'due_on', due_on) order by due_on), '[]') from added),
    'removed', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'due_on', due_on)), '[]') from dropped where status not in ('submitted', 'approved')),
    'kept', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'status', status)), '[]') from dropped where status in ('submitted', 'approved')),
    'moved', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'from', old_due, 'to', new_due) order by new_due), '[]') from moved),
    'people', (select coalesce(jsonb_agg(ap_name(u)), '[]') from people),
    'notifications', (select count(*) from people),
    'new_date', d, 'variation', v)
  into result;
  return result;
end;
$$;

create or replace function ap_can_change_plan(p_mission uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (ap_is_operator(p_user)
    or exists (select 1 from missions m where m.id = p_mission and (m.owner_id = p_user
               or exists (select 1 from unnest(m.hubs) h where ap_can('plans.change', h, p_user)))));
$$;

create or replace function ap_plan_apply(p_mission uuid, p_changes jsonb, p_reason text, p_system boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m missions; preview jsonb; v text; d date; h text[]; a jsonb; c record; ver integer;
begin
  if not (p_system and auth.uid() is null) and not ap_can_change_plan(p_mission) then raise exception 'You may not change this plan.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Say why the plan changes.'; end if;
  select * into m from missions where id = p_mission for update;
  preview := ap_plan_preview(p_mission, p_changes);
  v := coalesce(p_changes ->> 'variation_key', m.variation_key);
  d := coalesce((p_changes ->> 'mission_date')::date, m.mission_date);
  h := case when p_changes ? 'hubs' then array(select jsonb_array_elements_text(p_changes -> 'hubs')) else m.hubs end;
  -- Tasks no longer in the plan (finished work is never lost).
  for c in
    select x.* from mission_tasks x where x.mission_id = m.id and x.status not in ('cancelled', 'submitted', 'approved')
      and ((m.playbook_id is not null and x.playbook_task_key is not null and not exists (
              select 1 from ap_target_tasks(m.playbook_id, v, d, h) t where t.key = x.playbook_task_key and t.member_for is not distinct from x.member_for))
           or x.id in (select (e)::uuid from jsonb_array_elements_text(coalesce(p_changes -> 'remove_tasks', '[]')) e))
  loop
    update mission_tasks set status = 'cancelled', updated_at = now() where id = c.id;
    update task_offers set status = 'withdrawn', answered_at = ap_now() where task_id = c.id and status = 'offered';
    if c.assignee_id is not null then perform ap_notify(c.assignee_id, 'Task removed: ' || c.title, 'The plan of ' || m.title || ' changed: ' || p_reason, '/my-work'); end if;
  end loop;
  update missions set variation_key = v, mission_date = d, hubs = h,
         owner_id = case when p_changes ? 'owner_id' then (p_changes ->> 'owner_id')::uuid else owner_id end,
         title = coalesce(nullif(p_changes ->> 'title', ''), title), goal = case when p_changes ? 'goal' then p_changes ->> 'goal' else goal end,
         version = version + 1, updated_at = now()
  where id = m.id returning version into ver;
  -- New dates for the tasks still in the plan.
  for c in
    select x.id, x.title, x.assignee_id, x.due_on, t.due_on as new_due from mission_tasks x
    join ap_target_tasks(m.playbook_id, v, d, h) t on t.key = x.playbook_task_key and t.member_for is not distinct from x.member_for
    where x.mission_id = m.id and x.status not in ('cancelled', 'approved') and x.due_on <> t.due_on
  loop
    update mission_tasks set due_on = c.new_due, reminded_before = false, reminded_due = false, escalation = 0, updated_at = now() where id = c.id;
    if c.assignee_id is not null then perform ap_notify(c.assignee_id, 'New date for ' || c.title || ': ' || to_char(c.new_due, 'DD Mon'), 'The plan of ' || m.title || ' changed: ' || p_reason, '/my-work'); end if;
  end loop;
  if m.playbook_id is not null then perform ap_add_target_tasks(m.id); end if;
  for a in select * from jsonb_array_elements(coalesce(p_changes -> 'add_tasks', '[]')) loop
    insert into mission_tasks (mission_id, sort, title, hub, effort, due_on, proof, review, status)
    values (m.id, 100, left(a ->> 'title', 160), coalesce(a ->> 'hub', 'any'), coalesce(a ->> 'effort', 'M'),
            coalesce((a ->> 'due_on')::date, d), coalesce(a ->> 'proof', 'link'), coalesce(a ->> 'review', 'peer'), 'open');
  end loop;
  if p_changes ? 'owner_id' and (p_changes ->> 'owner_id') is not null then
    perform ap_notify((p_changes ->> 'owner_id')::uuid, 'You now own ' || m.title, p_reason, '/command/missions?m=' || m.id);
  end if;
  insert into mission_versions (mission_id, version, snapshot, reason, changed_by) values (m.id, ver, ap_snapshot(m.id), left(p_reason, 300), auth.uid());
  perform ap_log('plans', 'Changed the plan of ' || m.title, p_reason, 'mission', m.id,
    jsonb_build_object('type', 'restore_plan', 'mission_id', m.id, 'version', ver - 1));
  return preview;
end;
$$;

-- Back to an earlier version: its variation, date, owner and hubs, its tasks back where they were.
-- Work done since is kept.
create or replace function ap_plan_restore(p_mission uuid, p_version integer, p_system boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare s jsonb; sm jsonb; ver integer; x record;
begin
  if not (p_system and auth.uid() is null) and not ap_can_change_plan(p_mission) then raise exception 'You may not change this plan.'; end if;
  select snapshot into s from mission_versions where mission_id = p_mission and version = p_version;
  if s is null then raise exception 'No such version.'; end if;
  sm := s -> 'mission';
  update missions set variation_key = sm ->> 'variation_key', mission_date = (sm ->> 'mission_date')::date,
         owner_id = (sm ->> 'owner_id')::uuid, hubs = array(select jsonb_array_elements_text(sm -> 'hubs')),
         title = sm ->> 'title', goal = sm ->> 'goal', version = version + 1, updated_at = now()
  where id = p_mission returning version into ver;
  -- Tasks in the old plan: back (unless finished), with their old dates.
  for x in select (e ->> 'id')::uuid id, (e ->> 'due_on')::date due_on, e ->> 'status' status from jsonb_array_elements(s -> 'tasks') e loop
    update mission_tasks set due_on = x.due_on,
           status = case when status = 'cancelled' and x.status <> 'cancelled' then case when cardinality(depends_on) > 0 then 'waiting' else 'open' end else status end,
           updated_at = now()
    where id = x.id and status not in ('approved', 'submitted');
  end loop;
  -- Tasks added since: removed unless work was done.
  update mission_tasks set status = 'cancelled', updated_at = now()
  where mission_id = p_mission and status not in ('approved', 'submitted', 'cancelled')
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(s -> 'tasks') e);
  perform ap_unlock(p_mission);
  insert into mission_versions (mission_id, version, snapshot, reason, changed_by) values (p_mission, ver, ap_snapshot(p_mission), 'Restored version ' || p_version, auth.uid());
  perform ap_log('plans', 'Restored version ' || p_version || ' of ' || (sm ->> 'title'), 'Restore previous plan', 'mission', p_mission);
  return 'Restored.';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- The automatic run (pg_cron every 15 minutes; tests pass a time)
-- ════════════════════════════════════════════════════════════════════════

-- The dates a rule wants in the next N weeks.
create or replace function ap_rule_dates(p_rule uuid) returns table (d date)
language plpgsql stable security definer set search_path = public as $$
declare r autopilot_rules; first date := ap_today() + 1; last date; mon date; cand date;
begin
  select * into r from autopilot_rules where id = p_rule;
  last := ap_today() + 7 * coalesce(r.weeks_ahead, ap_num('weeks_ahead')::int);
  if r.cadence = 'weekly' then
    return query select g::date from generate_series(first, last, interval '1 day') g where extract(dow from g) = r.weekday;
  else
    mon := date_trunc('month', first)::date;
    while mon <= last loop
      if coalesce(r.nth, 1) = 5 then
        cand := (mon + interval '1 month' - interval '1 day')::date;
        cand := cand - ((extract(dow from cand)::int - r.weekday + 7) % 7);
      else
        cand := mon + ((r.weekday - extract(dow from mon)::int + 7) % 7) + 7 * (coalesce(r.nth, 1) - 1);
      end if;
      if cand between first and last then d := cand; return next; end if;
      mon := (mon + interval '1 month')::date;
    end loop;
  end if;
end;
$$;

create or replace function ap_step_rules() returns void
language plpgsql security definer set search_path = public as $$
declare r record; day date; lvl text := ap_level('missions_rules'); id uuid;
begin
  if lvl = 'manual' then return; end if;
  for r in select x.*, p.name as pb_name, p.exam_safe from autopilot_rules x join playbooks p on p.id = x.playbook_id
           where x.is_on and p.status = 'active' and not ap_paused('rules', x.id::text) and not ap_paused('playbooks', p.id::text) loop
    for day in select d from ap_rule_dates(r.id) loop
      continue when exists (select 1 from missions m where m.rule_id = r.id and m.mission_date = day);
      -- During club exams only exam-safe playbooks run.
      continue when not r.exam_safe and ap_in_exams(day);
      if lvl = 'auto' then
        id := ap_create_mission(r.playbook_id, r.variation_key, day, null, null, null, nullif(r.hubs, '{}'), 'rule', r.id);
        perform ap_log('missions_rules', 'Created ' || r.name || ' for ' || to_char(day, 'DD Mon'), 'Calendar rule "' || r.name || '"', 'mission', id,
          jsonb_build_object('type', 'cancel_mission', 'mission_id', id));
      else
        perform ap_suggest('missions_rules', 'create_mission', 'Create "' || r.name || '" for ' || to_char(day, 'Dy DD Mon'),
          r.pb_name || ' · ' || coalesce(r.variation_key, 'default') || ' · from the calendar rule',
          jsonb_build_object('rule_id', r.id, 'date', day, 'playbook_id', r.playbook_id), 'rule:' || r.id || ':' || day, false, r.hubs[1]);
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function ap_step_assign() returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  perform ap_unlock(null);
  for t in select x.id from mission_tasks x join missions m on m.id = x.mission_id
           where x.status = 'open' and not x.locked and x.assignee_id is null and m.status in ('planned', 'active')
           order by x.due_on, x.sort loop
    perform ap_assign_task(t.id);
  end loop;
end;
$$;

-- No answer in time: the offer expires and the next best person gets it.
create or replace function ap_step_reoffers() returns void
language plpgsql security definer set search_path = public as $$
declare o record; lvl text := ap_level('re_offers');
begin
  if lvl = 'manual' then return; end if;
  for o in select x.*, t.title, t.hub from task_offers x join mission_tasks t on t.id = x.task_id join missions m on m.id = t.mission_id
           where x.status = 'offered' and x.offered_at < ap_now() - make_interval(hours => ap_num('offer_timeout_hours')::int)
             and not ap_paused('missions', m.id::text) loop
    if lvl = 'auto' then
      perform ap_expire_offer(o.id);
    else
      perform ap_suggest('re_offers', 'reoffer', 'Re-offer "' || o.title || '" (' || ap_name(o.user_id) || ' did not answer)',
        'No answer in ' || ap_num('offer_timeout_hours') || ' hours', jsonb_build_object('offer_id', o.id), 'reoffer:' || o.id, true, o.hub);
    end if;
  end loop;
end;
$$;

create or replace function ap_expire_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o task_offers; t mission_tasks;
begin
  select * into o from task_offers where id = p_offer for update;
  if o.status <> 'offered' then return; end if;
  select * into t from mission_tasks where id = o.task_id;
  update task_offers set status = 'expired', answered_at = ap_now() where id = o.id;
  update mission_tasks set status = 'open', updated_at = now() where id = t.id and status = 'offered';
  perform ap_log('re_offers', 'Offer of "' || t.title || '" to ' || ap_name(o.user_id) || ' expired', 'No answer in time', 'task', t.id);
  perform ap_assign_task(t.id);
end;
$$;

-- 2 days before and on the day.
create or replace function ap_step_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare t record; lvl text := ap_level('reminders'); before integer := ap_num('remind_days_before')::int; msg text; kind text;
begin
  if lvl = 'manual' then return; end if;
  for t in select x.*, m.title as mission_title from mission_tasks x join missions m on m.id = x.mission_id
           where x.status in ('accepted', 'changes') and x.assignee_id is not null and not ap_paused('missions', m.id::text)
             and ((not x.reminded_before and x.due_on = ap_today() + before) or (not x.reminded_due and x.due_on = ap_today())) loop
    kind := case when t.due_on = ap_today() then 'due' else 'before' end;
    msg := case when kind = 'due' then 'Due today: ' else 'Due in ' || before || ' days: ' end || t.title;
    if lvl = 'auto' then
      perform ap_notify(t.assignee_id, msg, t.mission_title, '/my-work');
      update mission_tasks set reminded_before = reminded_before or kind = 'before', reminded_due = reminded_due or kind = 'due' where id = t.id;
      perform ap_log('reminders', 'Reminded ' || ap_name(t.assignee_id) || ': ' || t.title, msg, 'task', t.id);
    else
      perform ap_suggest('reminders', 'reminder', 'Remind ' || ap_name(t.assignee_id) || ': ' || msg, t.mission_title,
        jsonb_build_object('task_id', t.id, 'kind', kind), 'remind:' || t.id || ':' || kind, true, t.hub);
    end if;
  end loop;
end;
$$;

-- Overdue: the lead after 1 day, the owner after 3, Command Center after 5. Late reviews go to the lead.
create or replace function ap_step_escalations() returns void
language plpgsql security definer set search_path = public as $$
declare t record; r record; late integer; lvl text := ap_level('escalations'); target uuid; step smallint; who text;
begin
  for t in select x.*, m.title as mission_title, m.owner_id from mission_tasks x join missions m on m.id = x.mission_id
           where x.status not in ('approved', 'cancelled', 'waiting', 'submitted') and x.due_on < ap_today()
             and m.status in ('planned', 'active') and not ap_paused('missions', m.id::text) loop
    late := ap_today() - t.due_on;
    step := case when late >= ap_num('escalate_center_days') then 3 when late >= ap_num('escalate_owner_days') then 2
                 when late >= ap_num('escalate_lead_days') then 1 else 0 end;
    continue when step <= t.escalation;
    -- Command Center always hears about a task 5 days late.
    if step = 3 then
      perform ap_suggest('escalations', 'red_task', '"' || t.title || '" is ' || late || ' days late', t.mission_title || coalesce(' · ' || ap_name(t.assignee_id), ' · nobody has it'),
        jsonb_build_object('task_id', t.id), 'late:' || t.id, false, t.hub);
      update mission_tasks set escalation = 3 where id = t.id;
      continue;
    end if;
    continue when lvl = 'manual';
    target := case when step = 2 then t.owner_id else ap_pick_lead(t.id) end;
    who := case when step = 2 then 'owner' else 'lead' end;
    if lvl = 'auto' then
      perform ap_notify(target, 'Late: ' || t.title || ' (' || late || ' days)', t.mission_title || coalesce(' · with ' || ap_name(t.assignee_id), ' · nobody has it yet'), '/command/missions?m=' || t.mission_id);
      update mission_tasks set escalation = step where id = t.id;
      perform ap_log('escalations', 'Told the ' || who || ' about "' || t.title || '"', late || ' days late', 'task', t.id);
    else
      perform ap_suggest('escalations', 'escalate', 'Tell the ' || who || ' (' || ap_name(target) || '): "' || t.title || '" is ' || late || ' days late',
        t.mission_title, jsonb_build_object('task_id', t.id, 'user_id', target, 'step', step), 'esc:' || t.id || ':' || step, true, t.hub);
    end if;
  end loop;
  -- Reviews not done in time go to the lead.
  for r in select x.*, mt.title, mt.hub from task_reviews x join mission_tasks mt on mt.id = x.task_id
           where x.status = 'pending' and x.kind = 'peer' and x.due_at < ap_now() loop
    continue when lvl = 'manual';
    if lvl = 'auto' then perform ap_reroute_review(r.id);
    else perform ap_suggest('escalations', 'review_reroute', 'Give the review of "' || r.title || '" to the lead', ap_name(r.reviewer_id) || ' did not review it in time',
           jsonb_build_object('review_id', r.id), 'rr:' || r.id, true, r.hub);
    end if;
  end loop;
end;
$$;

create or replace function ap_reroute_review(p_review uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r task_reviews; lead uuid; t mission_tasks;
begin
  select * into r from task_reviews where id = p_review for update;
  if r.status <> 'pending' then return; end if;
  select * into t from mission_tasks where id = r.task_id;
  lead := ap_pick_lead(r.task_id);
  update task_reviews set status = 'replaced' where id = r.id;
  insert into task_reviews (task_id, reviewer_id, kind, due_at) values (r.task_id, lead, 'lead', ap_now() + make_interval(hours => ap_num('review_hours')::int));
  perform ap_notify(lead, 'Review asked: ' || t.title, 'The peer review did not happen in time.', '/my-work#reviews');
  perform ap_log('escalations', 'Gave the review of "' || t.title || '" to ' || ap_name(lead), 'Not reviewed in time', 'task', t.id);
end;
$$;

-- Club exams: missions that are not exam-safe move to after the exams.
create or replace function ap_step_exam_shifts() returns void
language plpgsql security definer set search_path = public as $$
declare m record; lvl text := ap_level('exam_shifts'); e club_exam_periods;
begin
  if lvl = 'manual' then return; end if;
  for m in select x.* from missions x join playbooks p on p.id = x.playbook_id
           where x.status in ('planned', 'active') and not p.exam_safe and ap_in_exams(x.mission_date)
             and not ap_paused('missions', x.id::text) loop
    select * into e from club_exam_periods where m.mission_date between starts_on and ends_on order by ends_on desc limit 1;
    if lvl = 'auto' then
      perform ap_plan_apply(m.id, jsonb_build_object('mission_date', e.ends_on + 1), 'Club exams (' || e.name || '): moved to after them', true);
    else
      perform ap_suggest('exam_shifts', 'exam_shift', 'Move ' || m.title || ' to ' || to_char(e.ends_on + 1, 'DD Mon') || ' (after ' || e.name || ')',
        'Only exam-safe playbooks run during club exams', jsonb_build_object('mission_id', m.id, 'date', e.ends_on + 1), 'exam:' || m.id, false, m.hubs[1]);
    end if;
  end loop;
end;
$$;

-- Missions in red get a line in Today.
create or replace function ap_step_health() returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  for m in select x.* from missions x where x.status in ('planned', 'active') and ap_mission_health(x.id) = 'red' loop
    perform ap_suggest('escalations', 'red_mission', m.title || ' is in red', 'Open it to change the plan, reassign or pause.',
      jsonb_build_object('mission_id', m.id), 'red:' || m.id || ':' || ap_today(), false, m.hubs[1]);
  end loop;
end;
$$;

-- The weekly check-in prompt, the daily digest and the weekly email.
create or replace function ap_step_messages() returns void
language plpgsql security definer set search_path = public as $$
declare u record; hour integer := extract(hour from ap_now() at time zone 'Asia/Kolkata'); week date := date_trunc('week', ap_today())::date;
        body text; lvl text;
begin
  -- Check-in: once a week, from 18:00 on the check-in day, to everyone with work this week.
  lvl := ap_level('reminders');
  if extract(dow from ap_today()) = ap_num('checkin_weekday') and hour >= 18 and lvl <> 'manual'
     and not exists (select 1 from automation_log l where l.area = 'checkins' and l.at >= week::timestamptz) then
    if lvl = 'auto' then
      for u in select distinct assignee_id as id from mission_tasks where assignee_id is not null and status in ('accepted', 'changes', 'submitted', 'approved')
                 and updated_at > ap_now() - interval '14 days'
                 and not exists (select 1 from checkins c where c.user_id = assignee_id and c.week_start = week) loop
        perform ap_notify(u.id, 'Your 1-minute check-in', 'Done, next, blocked: three short lines for your lead.', '/my-work#checkin');
      end loop;
      perform ap_log('checkins', 'Asked for the weekly check-ins', 'Check-in day');
    else
      perform ap_suggest('reminders', 'checkins', 'Ask everyone with work for their weekly check-in', 'Three short lines each',
        '{}'::jsonb, 'checkins:' || week, true, null);
    end if;
  end if;
  -- Daily digest at the digest hour.
  if hour >= ap_num('digest_hour') then
    for u in select user_id, count(*) n, string_agg(title, E'\n' order by created_at) lines from autopilot_digest
             where created_at < ap_now() group by user_id loop
      insert into notifications (user_id, title, body, link) values (u.user_id, 'Your FusionX day: ' || u.n || ' update' || case when u.n > 1 then 's' else '' end, left(u.lines, 1000), '/my-work');
      delete from autopilot_digest where user_id = u.user_id and created_at < ap_now();
    end loop;
  end if;
  -- Weekly email to the people who decide (founders in exam mode get only this one).
  lvl := ap_level('weekly_emails');
  if extract(dow from ap_today()) = ap_num('weekly_email_weekday') and hour >= 8 and lvl <> 'manual'
     and not exists (select 1 from automation_log l where l.area = 'weekly_emails' and l.at >= week::timestamptz) then
    body := (select count(*) from missions where status in ('planned', 'active')) || ' active missions · '
         || (select count(*) from missions m where m.status in ('planned', 'active') and ap_mission_health(m.id) = 'red') || ' in red · '
         || (select count(*) from contributions where contributed_on >= ap_today() - 7) || ' tasks approved this week · '
         || (select count(*) from autopilot_queue where status = 'pending') || ' waiting for you';
    if lvl = 'auto' then
      for u in select distinct user_id as id from ap_approvers(null) union select unnest(ap_founders_in_exams()) loop
        perform ap_notify(u.id, 'FusionX this week', body, '/command', true);
      end loop;
      perform ap_log('weekly_emails', 'Sent the weekly email', body);
    else
      perform ap_suggest('weekly_emails', 'weekly_email', 'Send the weekly email', body, '{}'::jsonb, 'weekly:' || week, true, null);
    end if;
  end if;
end;
$$;

create or replace function autopilot_tick(p_now timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare run uuid := coalesce(nullif(current_setting('ap.run', true), '')::uuid, gen_random_uuid());
begin
  perform set_config('ap.now', coalesce(p_now, now())::text, true);
  perform set_config('ap.run', run::text, true);
  -- Paused: nothing new is created, offered, reminded or escalated; nothing is lost.
  if not ap_on() then return jsonb_build_object('paused', true); end if;
  perform ap_step_rules();
  perform ap_step_exam_shifts();
  perform ap_step_assign();
  perform ap_step_reoffers();
  perform ap_step_reminders();
  perform ap_step_escalations();
  perform ap_step_health();
  perform ap_step_messages();
  return jsonb_build_object('paused', false, 'now', ap_now(),
    'logged', (select count(*) from automation_log where run_id = run),
    'suggested', (select count(*) from autopilot_queue where run_id = run));
end;
$$;

-- What the next N days would do, without doing it: every run is rolled back.
create or replace function ap_dry_run(p_days integer default 7) returns jsonb
language plpgsql security definer set search_path = public as $$
declare run uuid := gen_random_uuid(); out jsonb := '[]'; day integer; base timestamptz := now();
begin
  if not ap_is_operator() then raise exception 'Only Command Center operators can run this.'; end if;
  begin
    perform set_config('ap.run', run::text, true);
    for day in 0 .. least(greatest(p_days, 1), 14) - 1 loop
      perform autopilot_tick(base + make_interval(days => day, hours => 1));
    end loop;
    select coalesce(jsonb_agg(x order by x ->> 'at'), '[]') into out from (
      select jsonb_build_object('at', l.at, 'kind', 'done', 'area', l.area, 'text', l.action, 'reason', l.reason) x from automation_log l where l.run_id = run
      union all
      select jsonb_build_object('at', q.created_at, 'kind', 'suggest', 'area', q.area, 'text', q.title, 'reason', q.detail) from autopilot_queue q where q.run_id = run) s;
    raise exception 'ap-dry-run-rollback';
  exception when others then
    if sqlerrm <> 'ap-dry-run-rollback' then raise; end if;
  end;
  perform set_config('ap.run', '', true);
  perform set_config('ap.now', '', true);
  return out;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Today: one click carries out a prepared item
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_queue_decide(p_item uuid, p_approve boolean, p_edit jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare q autopilot_queue; p jsonb; r autopilot_rules; t mission_tasks; req task_change_requests; new_id uuid; msg text := 'Done.';
begin
  select * into q from autopilot_queue where id = p_item for update;
  if q.id is null or q.status <> 'pending' then return 'Already decided.'; end if;
  if not (ap_is_operator() or (q.hub is not null and q.hub = any(ap_lead_hubs(auth.uid())))) then raise exception 'Not yours to decide.'; end if;
  p := q.payload || coalesce(p_edit, '{}');
  if not p_approve then
    update autopilot_queue set status = 'skipped', decided_by = auth.uid(), decided_at = now() where id = q.id;
    if q.kind = 'change_request' then
      update task_change_requests set status = 'declined', decided_by = auth.uid(), decided_at = now() where id = (p ->> 'request_id')::uuid;
      select * into req from task_change_requests where id = (p ->> 'request_id')::uuid;
      perform ap_notify(req.requested_by, 'Your request was not approved', 'Talk to your lead if you need to.', '/my-work');
    end if;
    perform ap_log(q.area, 'Skipped: ' || q.title, 'Decided in Today');
    return 'Skipped.';
  end if;
  case q.kind
    when 'create_mission' then
      select * into r from autopilot_rules where id = (p ->> 'rule_id')::uuid;
      if exists (select 1 from missions where rule_id = r.id and mission_date = (p ->> 'date')::date) then msg := 'It already exists.';
      else
        new_id := ap_create_mission(r.playbook_id, coalesce(p ->> 'variation_key', r.variation_key), (p ->> 'date')::date, p ->> 'title', p ->> 'goal',
                                    (p ->> 'owner_id')::uuid, nullif(r.hubs, '{}'), 'rule', r.id);
        perform ap_log(q.area, 'Created ' || r.name || ' for ' || to_char((p ->> 'date')::date, 'DD Mon'), 'Approved in Today', 'mission', new_id,
          jsonb_build_object('type', 'cancel_mission', 'mission_id', new_id));
        msg := 'Mission created.';
      end if;
    when 'offer_task' then
      if ap_offer((p ->> 'task_id')::uuid, (p ->> 'user_id')::uuid, 'Approved in Today') is null then msg := 'The task is no longer open.'; else msg := 'Offered.'; end if;
    when 'reoffer' then perform ap_expire_offer((p ->> 'offer_id')::uuid); msg := 'Re-offered.';
    when 'reminder' then
      select * into t from mission_tasks where id = (p ->> 'task_id')::uuid;
      perform ap_notify(t.assignee_id, case when p ->> 'kind' = 'due' then 'Due today: ' else 'Due soon: ' end || t.title, null, '/my-work');
      update mission_tasks set reminded_before = reminded_before or p ->> 'kind' = 'before', reminded_due = reminded_due or p ->> 'kind' = 'due' where id = t.id;
      perform ap_log('reminders', 'Reminded ' || ap_name(t.assignee_id) || ': ' || t.title, 'Approved in Today', 'task', t.id);
      msg := 'Reminder sent.';
    when 'escalate' then
      select * into t from mission_tasks where id = (p ->> 'task_id')::uuid;
      perform ap_notify((p ->> 'user_id')::uuid, 'Late: ' || t.title, 'Please help it move.', '/command/missions?m=' || t.mission_id);
      update mission_tasks set escalation = greatest(escalation, (p ->> 'step')::smallint) where id = t.id;
      perform ap_log('escalations', 'Told ' || ap_name((p ->> 'user_id')::uuid) || ' about "' || t.title || '"', 'Approved in Today', 'task', t.id);
      msg := 'Sent.';
    when 'review_reroute' then perform ap_reroute_review((p ->> 'review_id')::uuid); msg := 'Given to the lead.';
    when 'exam_shift' then perform ap_plan_apply((p ->> 'mission_id')::uuid, jsonb_build_object('mission_date', p ->> 'date'), 'Club exams: moved to after them', true); msg := 'Moved.';
    when 'change_request' then
      select * into req from task_change_requests where id = (p ->> 'request_id')::uuid for update;
      select * into t from mission_tasks where id = req.task_id;
      if req.kind = 'move' then
        update mission_tasks set due_on = coalesce((p ->> 'new_due')::date, req.new_due), reminded_before = false, reminded_due = false, escalation = 0 where id = t.id;
      else
        update task_offers set status = 'swapped', answered_at = ap_now() where task_id = t.id and user_id = req.requested_by;
        insert into task_offers (task_id, user_id, status, answered_at) select t.id, req.requested_by, 'swapped', ap_now()
          where not exists (select 1 from task_offers where task_id = t.id and user_id = req.requested_by);
        update mission_tasks set assignee_id = null, status = 'open' where id = t.id;
        perform ap_assign_task(t.id);
      end if;
      update task_change_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = req.id;
      perform ap_notify(req.requested_by, 'Approved: your request for ' || t.title, null, '/my-work');
      perform ap_log('changes', 'Approved ' || ap_name(req.requested_by) || '''s request on "' || t.title || '"', 'Approved in Today', 'task', t.id);
      msg := 'Approved.';
    when 'checkins' then
      perform ap_log('checkins', 'Asked for the weekly check-ins', 'Approved in Today');
      insert into notifications (user_id, title, body, link)
      select distinct assignee_id, 'Your 1-minute check-in', 'Done, next, blocked: three short lines for your lead.', '/my-work#checkin'
      from mission_tasks where assignee_id is not null and status in ('accepted', 'changes', 'submitted', 'approved') and updated_at > ap_now() - interval '14 days';
      msg := 'Asked.';
    when 'weekly_email' then
      perform ap_notify(a.user_id, 'FusionX this week', q.detail, '/command', true) from (select distinct user_id from ap_approvers(null) union select unnest(ap_founders_in_exams())) a;
      perform ap_log('weekly_emails', 'Sent the weekly email', 'Approved in Today');
      msg := 'Sent.';
    else
      -- Information items (red missions, late tasks): approving means "seen".
      msg := 'Marked as seen.';
  end case;
  update autopilot_queue set status = 'done', decided_by = auth.uid(), decided_at = now() where id = q.id;
  return msg;
end;
$$;

-- "Approve all safe items": reminders, offers, re-offers, review moves, check-ins and digests.
create or replace function ap_queue_approve_safe() returns integer
language plpgsql security definer set search_path = public as $$
declare q record; n integer := 0;
begin
  if not ap_can_open_center() then raise exception 'Not allowed.'; end if;
  for q in select id from autopilot_queue where status = 'pending' and safe
           and (ap_is_operator() or hub = any(ap_lead_hubs(auth.uid()))) order by created_at loop
    perform ap_queue_decide(q.id, true, null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Control
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_undo(p_log uuid) returns text
language plpgsql security definer set search_path = public as $$
declare l automation_log; o task_offers; m missions;
begin
  if not ap_is_operator() then raise exception 'Only operators can undo.'; end if;
  select * into l from automation_log where id = p_log for update;
  if l.undo is null then return 'This one cannot be undone.'; end if;
  if l.undone_at is not null then return 'Already undone.'; end if;
  case l.undo ->> 'type'
    when 'withdraw_offer' then
      select * into o from task_offers where id = (l.undo ->> 'offer_id')::uuid;
      if o.status <> 'offered' then return 'They already answered; change it on the task instead.'; end if;
      update task_offers set status = 'withdrawn', answered_at = ap_now() where id = o.id;
      update mission_tasks set status = 'open', locked = true where id = o.task_id and status = 'offered';
    when 'cancel_mission' then
      select * into m from missions where id = (l.undo ->> 'mission_id')::uuid;
      if exists (select 1 from mission_tasks where mission_id = m.id and status in ('accepted', 'submitted', 'approved', 'changes')) then
        return 'Work has started on it; cancel it from the mission with a reason instead.';
      end if;
      update missions set status = 'cancelled', cancel_reason = 'Undone in Control', updated_at = now() where id = m.id;
      update task_offers set status = 'withdrawn' where status = 'offered' and task_id in (select id from mission_tasks where mission_id = m.id);
      update mission_tasks set status = 'cancelled' where mission_id = m.id and status <> 'approved';
    when 'restore_plan' then
      perform ap_plan_restore((l.undo ->> 'mission_id')::uuid, (l.undo ->> 'version')::int, true);
    else return 'This one cannot be undone.';
  end case;
  update automation_log set undone_at = now(), undone_by = auth.uid() where id = l.id;
  perform ap_log('control', 'Undid: ' || l.action, 'Undo in Control');
  return 'Undone.';
end;
$$;

-- Settings: master switch, levels, numbers, pauses, founder exam mode (super admin; exam mode also by the founder).
create or replace function ap_settings_update(p_patch jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare current_mode uuid[]; wanted uuid[];
begin
  select founder_exam_mode into current_mode from autopilot_settings where id = 1 for update;
  if not ap_has(auth.uid(), 'super_admin') then
    -- An admin may switch only their own exam mode.
    if not (ap_has(auth.uid(), 'admin') and (select array_agg(k) from jsonb_object_keys(p_patch) k) = array['founder_exam_mode']) then
      raise exception 'Only the super admin can change Control.';
    end if;
    wanted := array(select jsonb_array_elements_text(p_patch -> 'founder_exam_mode'))::uuid[];
    if exists (select 1 from unnest(wanted) w where w <> auth.uid() and not (w = any(current_mode)))
       or exists (select 1 from unnest(current_mode) c where c <> auth.uid() and not (c = any(wanted))) then
      raise exception 'You can switch only your own exam mode.';
    end if;
  end if;
  update autopilot_settings set
    master = coalesce(p_patch ->> 'master', master),
    levels = case when p_patch ? 'levels' then levels || (p_patch -> 'levels') else levels end,
    numbers = case when p_patch ? 'numbers' then numbers || (p_patch -> 'numbers') else numbers end,
    pauses = case when p_patch ? 'pauses' then p_patch -> 'pauses' else pauses end,
    founder_exam_mode = case when p_patch ? 'founder_exam_mode' then array(select jsonb_array_elements_text(p_patch -> 'founder_exam_mode'))::uuid[] else founder_exam_mode end,
    updated_by = auth.uid(), updated_at = now()
  where id = 1;
  insert into audit_logs (user_id, action, resource_type, metadata)
  values (auth.uid(), 'autopilot.control', 'autopilot_settings', jsonb_build_object('change', p_patch));
  perform ap_log('control', 'Control changed: ' || (select string_agg(k, ', ') from jsonb_object_keys(p_patch) k), 'By ' || ap_name(auth.uid()));
  return 'Saved.';
end;
$$;

create or replace function ap_permissions_update(p_action text, p_allowed text[]) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not ap_has(auth.uid(), 'super_admin') then raise exception 'Only the super admin can change permissions.'; end if;
  update autopilot_permissions set allowed = array(select distinct x from unnest(p_allowed) x
    where x in ('super_admin', 'admin', 'head_of_execution', 'hub_lead', 'mentor', 'member')), updated_at = now() where action = p_action;
  insert into audit_logs (user_id, action, resource_type, metadata) values (auth.uid(), 'autopilot.permissions', 'autopilot_permissions', jsonb_build_object('action', p_action, 'allowed', p_allowed));
  return 'Saved.';
end;
$$;

-- Overrides on a task: assign (and lock), unlock, force-close, reopen, cancel, move.
create or replace function ap_task_override(p_task uuid, p_action text, p_user uuid default null, p_date date default null, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare t mission_tasks; m missions;
begin
  select * into t from mission_tasks where id = p_task for update;
  select * into m from missions where id = t.mission_id;
  if not (ap_is_operator() or m.owner_id = auth.uid() or t.hub = any(ap_lead_hubs(auth.uid())) or m.hubs && ap_lead_hubs(auth.uid())) then
    raise exception 'Not allowed.';
  end if;
  case p_action
    when 'assign' then
      if p_user is null then raise exception 'Choose a person.'; end if;
      update task_offers set status = 'withdrawn', answered_at = ap_now() where task_id = t.id and status = 'offered';
      update mission_tasks set assignee_id = p_user, status = case when status in ('open', 'offered', 'waiting') then 'accepted' else status end,
             locked = true, updated_at = now() where id = t.id;
      insert into task_offers (task_id, user_id, status, answered_at) values (t.id, p_user, 'accepted', ap_now());
      perform ap_notify(p_user, 'Assigned to you: ' || t.title, m.title || ' · due ' || to_char(t.due_on, 'DD Mon'), '/my-work');
      perform ap_mission_touch(m.id);
    when 'lock' then update mission_tasks set locked = true where id = t.id;
    when 'unlock' then update mission_tasks set locked = false where id = t.id;
    when 'close' then update mission_tasks set status = 'approved', approved_at = ap_now() where id = t.id; perform ap_unlock(m.id); perform ap_mission_touch(m.id);
    when 'reopen' then update mission_tasks set status = case when assignee_id is null then 'open' else 'accepted' end, approved_at = null where id = t.id;
    when 'cancel' then
      update mission_tasks set status = 'cancelled' where id = t.id and status <> 'approved';
      update task_offers set status = 'withdrawn' where task_id = t.id and status = 'offered';
      perform ap_unlock(m.id);
    when 'move' then
      if p_date is null then raise exception 'Choose a date.'; end if;
      update mission_tasks set due_on = p_date, reminded_before = false, reminded_due = false, escalation = 0 where id = t.id;
      if t.assignee_id is not null then perform ap_notify(t.assignee_id, 'New date for ' || t.title || ': ' || to_char(p_date, 'DD Mon'), p_reason, '/my-work'); end if;
    else raise exception 'Unknown action.';
  end case;
  update mission_tasks set updated_at = now() where id = t.id;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'autopilot.task.' || p_action, 'mission_tasks', t.id, jsonb_build_object('user', p_user, 'date', p_date, 'reason', p_reason));
  perform ap_log('overrides', initcap(p_action) || ': ' || t.title, coalesce(p_reason, 'By ' || ap_name(auth.uid())), 'task', t.id);
  return 'Done.';
end;
$$;

-- Mission status by hand: pause, resume, review, done (with outcome links), cancel (with a reason), mentor approval.
create or replace function ap_mission_set(p_mission uuid, p_action text, p_reason text default null, p_links text[] default null) returns text
language plpgsql security definer set search_path = public as $$
declare m missions;
begin
  select * into m from missions where id = p_mission for update;
  if p_action = 'mentor_approve' then
    if not (m.mentor_id = auth.uid() or ap_is_operator()) then raise exception 'Only the mentor can approve this.'; end if;
    update missions set mentor_approved_at = now(), updated_at = now() where id = m.id;
    perform ap_unlock(m.id);
    perform ap_log('missions', 'Mentor approved ' || m.title, 'By ' || ap_name(auth.uid()), 'mission', m.id);
    return 'Approved. The tasks are open now.';
  end if;
  if not (ap_is_operator() or m.owner_id = auth.uid() or m.hubs && ap_lead_hubs(auth.uid())) then raise exception 'Not allowed.'; end if;
  case p_action
    when 'pause' then update missions set status = 'paused' where id = m.id;
    when 'resume' then update missions set status = case when exists (select 1 from mission_tasks where mission_id = m.id and status in ('accepted', 'submitted', 'approved', 'changes')) then 'active' else 'planned' end where id = m.id;
    when 'review' then update missions set status = 'review' where id = m.id;
    when 'done' then update missions set status = 'done', outcome_links = coalesce(p_links, outcome_links) where id = m.id;
    when 'reopen' then update missions set status = 'active' where id = m.id;
    when 'cancel' then
      if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason.'; end if;
      update missions set status = 'cancelled', cancel_reason = p_reason where id = m.id;
      update task_offers set status = 'withdrawn' where status = 'offered' and task_id in (select id from mission_tasks where mission_id = m.id);
      update mission_tasks set status = 'cancelled' where mission_id = m.id and status not in ('approved', 'submitted');
    when 'links' then update missions set outcome_links = coalesce(p_links, '{}') where id = m.id;
    else raise exception 'Unknown action.';
  end case;
  update missions set updated_at = now() where id = m.id;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'autopilot.mission.' || p_action, 'missions', m.id, jsonb_build_object('reason', p_reason));
  perform ap_log('overrides', initcap(p_action) || ': ' || m.title, coalesce(p_reason, 'By ' || ap_name(auth.uid())), 'mission', m.id);
  return 'Done.';
end;
$$;

-- A mission by hand (Start mission / Run as mission).
create or replace function ap_start_mission(p_playbook uuid, p_variation text, p_date date, p_title text, p_goal text, p_owner uuid, p_hubs text[], p_visibility text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not ap_can('missions.create', p_hubs[1]) then raise exception 'You may not create missions.'; end if;
  new_id := ap_create_mission(p_playbook, p_variation, p_date, p_title, p_goal, p_owner, p_hubs, 'manual', null, null, p_visibility);
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.mission.create', 'missions', new_id, jsonb_build_object('playbook', p_playbook, 'date', p_date));
  perform ap_log('missions', 'Started ' || (select title from missions where id = new_id), 'By ' || ap_name(auth.uid()), 'mission', new_id,
    jsonb_build_object('type', 'cancel_mission', 'mission_id', new_id));
  return new_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Playbook editing (with a version for every save)
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_playbook_snapshot(p_playbook uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('playbook', to_jsonb(p),
    'variations', (select coalesce(jsonb_agg(to_jsonb(v) order by v.sort), '[]') from playbook_variations v where v.playbook_id = p.id),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.sort), '[]') from playbook_tasks t where t.playbook_id = p.id))
  from playbooks p where p.id = p_playbook;
$$;

-- p_data: {name, description, exam_safe, needs_mentor_approval, default_visibility, status,
--          variations: [{key, name, description, scale, is_default}], tasks: [{key, title, ...}]}
create or replace function ap_playbook_save(p_playbook uuid, p_data jsonb, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid := p_playbook; ver integer; v jsonb; t jsonb; i integer := 0;
begin
  if not ap_can('playbooks.edit') then raise exception 'You may not edit playbooks.'; end if;
  if pid is null then
    insert into playbooks (slug, name, description) values (
      trim(both '-' from regexp_replace(lower(p_data ->> 'name'), '[^a-z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 4),
      p_data ->> 'name', p_data ->> 'description') returning id into pid;
  end if;
  update playbooks set name = coalesce(p_data ->> 'name', name), description = case when p_data ? 'description' then p_data ->> 'description' else description end,
         exam_safe = coalesce((p_data ->> 'exam_safe')::boolean, exam_safe),
         needs_mentor_approval = coalesce((p_data ->> 'needs_mentor_approval')::boolean, needs_mentor_approval),
         default_visibility = coalesce(p_data ->> 'default_visibility', default_visibility),
         status = coalesce(p_data ->> 'status', status), version = version + 1, updated_at = now()
  where id = pid returning version into ver;
  if p_data ? 'variations' then
    delete from playbook_variations where playbook_id = pid and key not in (select x ->> 'key' from jsonb_array_elements(p_data -> 'variations') x);
    for v in select * from jsonb_array_elements(p_data -> 'variations') loop
      i := i + 1;
      insert into playbook_variations (playbook_id, key, name, description, scale, sort, is_default)
      values (pid, v ->> 'key', v ->> 'name', v ->> 'description', coalesce((v ->> 'scale')::numeric, 1), i, coalesce((v ->> 'is_default')::boolean, false))
      on conflict (playbook_id, key) do update set name = excluded.name, description = excluded.description, scale = excluded.scale, sort = excluded.sort, is_default = excluded.is_default;
    end loop;
  end if;
  if p_data ? 'tasks' then
    i := 0;
    -- Tasks left out are archived (missions keep theirs).
    update playbook_tasks set archived = true where playbook_id = pid and key not in (select x ->> 'key' from jsonb_array_elements(p_data -> 'tasks') x);
    for t in select * from jsonb_array_elements(p_data -> 'tasks') loop
      i := i + 1;
      insert into playbook_tasks (playbook_id, key, sort, title, checklist, hub, skills, effort, offset_days, depends_on, proof, review,
                                  open_seat_allowed, community_allowed, exam_safe, per_member, variations, archived)
      values (pid, t ->> 'key', i, t ->> 'title',
              array(select jsonb_array_elements_text(coalesce(t -> 'checklist', '[]'))), coalesce(t ->> 'hub', 'any'),
              array(select jsonb_array_elements_text(coalesce(t -> 'skills', '[]'))), coalesce(t ->> 'effort', 'M'), coalesce((t ->> 'offset_days')::int, 0),
              array(select jsonb_array_elements_text(coalesce(t -> 'depends_on', '[]'))), coalesce(t ->> 'proof', 'link'), coalesce(t ->> 'review', 'peer'),
              coalesce((t ->> 'open_seat_allowed')::boolean, false), coalesce((t ->> 'community_allowed')::boolean, false),
              coalesce((t ->> 'exam_safe')::boolean, false), coalesce((t ->> 'per_member')::boolean, false),
              array(select jsonb_array_elements_text(coalesce(t -> 'variations', '[]'))), coalesce((t ->> 'archived')::boolean, false))
      on conflict (playbook_id, key) do update set sort = excluded.sort, title = excluded.title, checklist = excluded.checklist, hub = excluded.hub,
        skills = excluded.skills, effort = excluded.effort, offset_days = excluded.offset_days, depends_on = excluded.depends_on, proof = excluded.proof,
        review = excluded.review, open_seat_allowed = excluded.open_seat_allowed, community_allowed = excluded.community_allowed,
        exam_safe = excluded.exam_safe, per_member = excluded.per_member, variations = excluded.variations, archived = excluded.archived;
    end loop;
  end if;
  insert into playbook_versions (playbook_id, version, snapshot, note, changed_by) values (pid, ver, ap_playbook_snapshot(pid), left(p_note, 300), auth.uid())
  on conflict (playbook_id, version) do update set snapshot = excluded.snapshot, note = excluded.note, changed_by = excluded.changed_by;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.playbook.save', 'playbooks', pid, jsonb_build_object('version', ver, 'note', p_note));
  return pid;
end;
$$;

create or replace function ap_playbook_restore(p_playbook uuid, p_version integer) returns text
language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  select snapshot into s from playbook_versions where playbook_id = p_playbook and version = p_version;
  if s is null then raise exception 'No such version.'; end if;
  perform ap_playbook_save(p_playbook, (s -> 'playbook') || jsonb_build_object('variations', s -> 'variations', 'tasks', s -> 'tasks'), 'Restored version ' || p_version);
  return 'Restored.';
end;
$$;

create or replace function ap_playbook_duplicate(p_playbook uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  s := ap_playbook_snapshot(p_playbook);
  return ap_playbook_save(null, ((s -> 'playbook') - 'status') || jsonb_build_object('name', (s -> 'playbook' ->> 'name') || ' (copy)', 'variations', s -> 'variations',
    'tasks', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(s -> 'tasks') x where not (x ->> 'archived')::boolean)), 'Duplicated');
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Row level security: reads. Writes go through the functions above.
-- ════════════════════════════════════════════════════════════════════════

alter table autopilot_settings enable row level security;
alter table autopilot_permissions enable row level security;
alter table playbooks enable row level security;
alter table playbook_variations enable row level security;
alter table playbook_tasks enable row level security;
alter table playbook_versions enable row level security;
alter table autopilot_rules enable row level security;
alter table missions enable row level security;
alter table mission_versions enable row level security;
alter table mission_tasks enable row level security;
alter table task_offers enable row level security;
alter table task_reviews enable row level security;
alter table task_change_requests enable row level security;
alter table contributions enable row level security;
alter table availability enable row level security;
alter table club_exam_periods enable row level security;
alter table checkins enable row level security;
alter table work_preferences enable row level security;
alter table push_subscriptions enable row level security;
alter table autopilot_digest enable row level security;
alter table autopilot_queue enable row level security;
alter table automation_log enable row level security;

drop policy if exists "center reads settings" on autopilot_settings;
create policy "center reads settings" on autopilot_settings for select using (ap_can_open_center());
drop policy if exists "center reads permissions" on autopilot_permissions;
create policy "center reads permissions" on autopilot_permissions for select using (ap_can_open_center());

drop policy if exists "members read playbooks" on playbooks;
create policy "members read playbooks" on playbooks for select to authenticated using (true);
drop policy if exists "members read variations" on playbook_variations;
create policy "members read variations" on playbook_variations for select to authenticated using (true);
drop policy if exists "members read playbook tasks" on playbook_tasks;
create policy "members read playbook tasks" on playbook_tasks for select to authenticated using (true);
drop policy if exists "center reads playbook versions" on playbook_versions;
create policy "center reads playbook versions" on playbook_versions for select using (ap_can_open_center());
drop policy if exists "center reads rules" on autopilot_rules;
create policy "center reads rules" on autopilot_rules for select using (ap_can_open_center());
drop policy if exists "operators edit rules" on autopilot_rules;
create policy "operators edit rules" on autopilot_rules for update using (ap_is_operator()) with check (ap_is_operator());

drop policy if exists "people in a mission read it" on missions;
create policy "people in a mission read it" on missions for select using (ap_can_see_mission(id));
drop policy if exists "people in a mission read its versions" on mission_versions;
create policy "people in a mission read its versions" on mission_versions for select using (ap_can_see_mission(mission_id));
drop policy if exists "people in a mission read its tasks" on mission_tasks;
create policy "people in a mission read its tasks" on mission_tasks for select using (ap_can_see_mission(mission_id));

drop policy if exists "own offers" on task_offers;
create policy "own offers" on task_offers for select using (user_id = auth.uid() or ap_can_open_center());
drop policy if exists "reviews: reviewer, doer, center" on task_reviews;
create policy "reviews: reviewer, doer, center" on task_reviews for select using (
  reviewer_id = auth.uid() or ap_can_open_center() or exists (select 1 from mission_tasks t where t.id = task_id and t.assignee_id = auth.uid()));
drop policy if exists "change requests: own and center" on task_change_requests;
create policy "change requests: own and center" on task_change_requests for select using (requested_by = auth.uid() or ap_can_open_center());
drop policy if exists "own contributions" on contributions;
create policy "own contributions" on contributions for select using (user_id = auth.uid() or ap_can_open_center());

drop policy if exists "own busy dates" on availability;
create policy "own busy dates" on availability for select using (user_id = auth.uid() or ap_can_open_center());
drop policy if exists "add own busy dates" on availability;
create policy "add own busy dates" on availability for insert with check (user_id = auth.uid());
drop policy if exists "remove own busy dates" on availability;
create policy "remove own busy dates" on availability for delete using (user_id = auth.uid());

drop policy if exists "members read exam periods" on club_exam_periods;
create policy "members read exam periods" on club_exam_periods for select to authenticated using (true);
drop policy if exists "operators add exam periods" on club_exam_periods;
create policy "operators add exam periods" on club_exam_periods for insert with check (ap_is_operator());
drop policy if exists "operators remove exam periods" on club_exam_periods;
create policy "operators remove exam periods" on club_exam_periods for delete using (ap_is_operator());

drop policy if exists "own check-ins" on checkins;
create policy "own check-ins" on checkins for select using (user_id = auth.uid() or ap_can_open_center());
drop policy if exists "write own check-ins" on checkins;
create policy "write own check-ins" on checkins for insert with check (user_id = auth.uid());
drop policy if exists "edit own check-ins" on checkins;
create policy "edit own check-ins" on checkins for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own preferences" on work_preferences;
create policy "own preferences" on work_preferences for select using (user_id = auth.uid());
drop policy if exists "write own preferences" on work_preferences;
create policy "write own preferences" on work_preferences for insert with check (user_id = auth.uid());
drop policy if exists "edit own preferences" on work_preferences;
create policy "edit own preferences" on work_preferences for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own push subscriptions" on push_subscriptions;
create policy "own push subscriptions" on push_subscriptions for select using (user_id = auth.uid());
drop policy if exists "add own push subscription" on push_subscriptions;
create policy "add own push subscription" on push_subscriptions for insert with check (user_id = auth.uid());
drop policy if exists "remove own push subscription" on push_subscriptions;
create policy "remove own push subscription" on push_subscriptions for delete using (user_id = auth.uid());

drop policy if exists "center reads the queue" on autopilot_queue;
create policy "center reads the queue" on autopilot_queue for select using (ap_is_operator() or (hub is not null and hub = any(ap_lead_hubs(auth.uid()))));
drop policy if exists "operators read the automation log" on automation_log;
create policy "operators read the automation log" on automation_log for select using (ap_is_operator());

revoke all on server_secrets, autopilot_digest from anon, authenticated;
revoke insert, update, delete on autopilot_settings, autopilot_permissions, playbooks, playbook_variations, playbook_tasks, playbook_versions,
  missions, mission_versions, mission_tasks, task_offers, task_reviews, task_change_requests, contributions, autopilot_queue, automation_log from anon, authenticated;
grant update on autopilot_rules to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- Proof uploads: a private bucket, up to 10 MB. Members upload into their own folder;
-- the doer, their reviewers and Command Center read it (through signed links).
-- ════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-proofs', 'task-proofs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'text/plain'])
on conflict (id) do nothing;

create or replace function ap_can_read_proof(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    (storage.foldername(p_name))[1] = auth.uid()::text
    or ap_can_open_center()
    or exists (select 1 from mission_tasks t join task_reviews r on r.task_id = t.id
               where t.proof_url = 'storage:task-proofs/' || p_name and r.reviewer_id = auth.uid()));
$$;

drop policy if exists "proofs: own, reviewers, center" on storage.objects;
create policy "proofs: own, reviewers, center" on storage.objects for select using (bucket_id = 'task-proofs' and ap_can_read_proof(name));
drop policy if exists "proofs: upload into own folder" on storage.objects;
create policy "proofs: upload into own folder" on storage.objects for insert with check (bucket_id = 'task-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

-- The count next to "My work": offers to answer, tasks to do, reviews to give.
create or replace function ap_my_work_count() returns integer
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 0 else (
    (select count(*) from task_offers o where o.user_id = auth.uid() and o.status = 'offered')
    + (select count(*) from mission_tasks t where t.assignee_id = auth.uid() and t.status in ('accepted', 'changes'))
    + (select count(*) from task_reviews r where r.reviewer_id = auth.uid() and r.status = 'pending'))::int end;
$$;

-- Phone notifications: takes the notifications not pushed yet (at most a day old) for people with a
-- subscription and push on, and marks them pushed. Everyone else's are marked too, so nothing piles up.
-- With "Phone notifications" on Manual in Control nothing is pushed.
create or replace function ap_claim_pushes(p_limit integer default 200)
returns table (notification_id uuid, user_id uuid, title text, body text, link text, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select array_agg(n.id) into ids from (
    select n.id from notifications n where n.pushed_at is null and n.created_at > now() - interval '1 day'
    order by n.created_at limit p_limit for update skip locked) n;
  if ids is null then return; end if;
  update notifications set pushed_at = now() where id = any(ids);
  if ap_level('push') = 'manual' then return; end if;
  return query
    select n.id, n.user_id, n.title, n.body, n.link, s.endpoint, s.p256dh, s.auth
    from notifications n join push_subscriptions s on s.user_id = n.user_id
    where n.id = any(ids) and coalesce((select w.push from work_preferences w where w.user_id = n.user_id), true);
end;
$$;

-- A weekly check-in that says "blocked" pings the member's hub leads.
create or replace function ap_checkin_blocked(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare u record;
begin
  if auth.uid() is null or coalesce(btrim(p_text), '') = '' then return; end if;
  for u in select distinct lm.user_id from core_group_members me
           join core_group_members lm on lm.group_id = me.group_id and lm.is_lead and lm.user_id <> me.user_id
           join core_groups g on g.id = me.group_id and g.kind = 'hub'
           where me.user_id = auth.uid() loop
    perform ap_notify(u.user_id, ap_name(auth.uid()) || ' is blocked', left(p_text, 500), '/command/people');
  end loop;
end;
$$;

-- Health for many missions at once (Command Center).
create or replace function ap_missions_health(p_ids uuid[]) returns table (id uuid, health text)
language sql stable security definer set search_path = public as $$
  select m.id, ap_mission_health(m.id) from missions m where m.id = any(p_ids) and ap_can_see_mission(m.id);
$$;

-- Execute rights: nothing for the public; the policy helpers and the checked entry points for members.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'ap_%' or p.proname like 'task_%' or p.proname = 'autopilot_tick') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
grant execute on function ap_can_open_center(uuid), ap_is_operator(uuid), ap_can_see_mission(uuid, uuid), ap_lead_hubs(uuid), ap_can_read_proof(text) to anon, authenticated;
grant execute on function ap_my_work_count(), ap_checkin_blocked(text) to authenticated;
grant execute on function task_offer_respond(uuid, text), task_submit(uuid, text, text), task_review_decide(uuid, boolean, text),
  task_request_change(uuid, text, date, text), ap_plan_preview(uuid, jsonb), ap_plan_apply(uuid, jsonb, text, boolean),
  ap_plan_restore(uuid, integer, boolean), ap_queue_decide(uuid, boolean, jsonb), ap_queue_approve_safe(), ap_undo(uuid),
  ap_settings_update(jsonb), ap_permissions_update(text, text[]), ap_task_override(uuid, text, uuid, date, text),
  ap_mission_set(uuid, text, text, text[]), ap_start_mission(uuid, text, date, text, text, uuid, text[], text),
  ap_playbook_save(uuid, jsonb, text), ap_playbook_restore(uuid, integer), ap_playbook_duplicate(uuid), ap_dry_run(integer),
  ap_missions_health(uuid[]), ap_can(text, text, uuid), ap_target_tasks(uuid, text, date, text[]) to authenticated;
-- The engine runs only from pg_cron (as the database owner) and the website's cron route (service key).
grant execute on function autopilot_tick(timestamptz), ap_claim_pushes(integer) to service_role;
