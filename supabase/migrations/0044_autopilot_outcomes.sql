-- 0044: FusionX Autopilot, outcomes (PR 3): Now building, the Impact Board and story pages, share cards,
-- skill badges, contribution certificates with a verify page, recognition, the Idea Engine (project ideas,
-- research topics, opportunities radar) and a cookie-free visitor count.
--
-- Truth rule: every public number and line comes from recorded, verified data. Public functions return
-- only positive public fields; nothing late, internal or private leaves the database through them.
-- Additive only, safe to run again. Needs 0042 and 0043.

-- ════════════════════════════════════════════════════════════════════════
-- Additive columns
-- ════════════════════════════════════════════════════════════════════════

-- Members can hide themselves from public pages (Now building, story pages, /impact).
alter table profiles add column if not exists show_on_impact boolean not null default true;

alter table missions add column if not exists event_id uuid references events(id) on delete set null;
alter table missions add column if not exists done_at timestamptz;
-- Public outcome state (written only by ap_publish_public): never goes backwards.
alter table missions add column if not exists public_hidden boolean not null default false;
alter table missions add column if not exists public_listed boolean not null default false;
alter table missions add column if not exists public_done integer not null default 0;
alter table missions add column if not exists public_total integer not null default 0;
alter table missions add column if not exists public_phase integer not null default 1;
alter table missions add column if not exists public_updated_at timestamptz;
alter table missions add column if not exists story_summary text check (story_summary is null or char_length(story_summary) <= 600);
alter table missions add column if not exists story_summary_by uuid references auth.users(id) on delete set null;

-- People hidden from public pages by an admin (on top of their own choice).
alter table profiles add column if not exists public_hidden boolean not null default false;

-- Opportunities found by the radar keep where they came from (additive; the existing pages ignore them).
alter table opportunities add column if not exists city text;
alter table opportunities add column if not exists distance_km integer;
alter table opportunities add column if not exists mode text;
alter table opportunities add column if not exists value_score integer;
alter table opportunities add column if not exists source_checked_on date;

-- ════════════════════════════════════════════════════════════════════════
-- Tables
-- ════════════════════════════════════════════════════════════════════════

create table if not exists skill_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, label)
);

create table if not exists share_cards (
  code text primary key check (code ~ '^[a-z0-9]{10}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, mission_id)
);

create table if not exists certificate_verifications (
  code text primary key check (code ~ '^FXC-[0-9A-F]{8}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  holder text not null,
  period_label text not null,
  -- The verified contributions it lists, as they were when issued.
  contributions jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'revoked')),
  issued_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_cert_one_draft on certificate_verifications (user_id, period_label) where status <> 'revoked';

create table if not exists recognitions (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'suggested' check (status in ('suggested', 'published', 'skipped')),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  unique (month, user_id)
);

create table if not exists idea_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('project', 'research')),
  title text not null check (char_length(title) between 3 and 160),
  pitch text not null,
  data jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'saved', 'adopted', 'rejected')),
  reject_reason text,
  mentor_id uuid references auth.users(id) on delete set null,
  adopted_mission uuid references missions(id) on delete set null,
  adopted_ref uuid,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_idea_drafts on idea_drafts (kind, status, created_at desc);

create table if not exists idea_likes (
  idea_id uuid not null references idea_drafts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (idea_id, user_id)
);

create table if not exists opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique check (url ~* '^https?://\S+$'),
  region text not null default 'national' check (region in ('near', 'national', 'international')),
  active boolean not null default true,
  last_fetched_at timestamptz,
  last_result text,
  created_at timestamptz not null default now()
);

create table if not exists opportunity_drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organiser text not null,
  kind text not null,
  mode text,
  city text,
  distance_km integer,
  deadline date not null,
  dates text,
  team_size text,
  eligibility text,
  fees text,
  prizes text,
  official_link text not null check (official_link ~* '^https?://\S+$'),
  source_link text,
  hubs text[] not null default '{}',
  value_score integer not null default 0,
  dedupe_key text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'mission', 'rejected')),
  source_checked_on date,
  opportunity_id uuid references opportunities(id) on delete set null,
  mission_id uuid references missions(id) on delete set null,
  idea_id uuid references idea_drafts(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_opportunity_drafts_dedupe on opportunity_drafts (dedupe_key);

-- A cookie-free count of public page views per day (no IP, no visitor id).
create table if not exists site_visits (
  day date not null,
  path_group text not null,
  views integer not null default 0,
  primary key (day, path_group)
);

-- ════════════════════════════════════════════════════════════════════════
-- Seeds: radar sources (official pages and public listings), off-switch for grounding
-- ════════════════════════════════════════════════════════════════════════

insert into opportunity_sources (name, url, region) values
  ('Smart India Hackathon', 'https://www.sih.gov.in/', 'national'),
  ('MLH events', 'https://mlh.io/seasons/2026/events', 'international'),
  ('Devfolio hackathons', 'https://devfolio.co/hackathons', 'national'),
  ('Unstop hackathons', 'https://unstop.com/hackathons', 'national'),
  ('Devpost hackathons', 'https://devpost.com/hackathons', 'international'),
  ('Techkriti, IIT Kanpur', 'https://techkriti.org/', 'near'),
  ('Cognizance, IIT Roorkee', 'https://www.cognizance.org.in/', 'near'),
  ('Tryst, IIT Delhi', 'https://tryst-iitd.org/', 'near')
on conflict (url) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Skill badges: kept up to date from verified contributions
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_badge_label(p_skill text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_skill is null then 'Contributor'
    when lower(p_skill) ~ '(design|figma|canva|poster)' then 'Design'
    when lower(p_skill) ~ '(writ|caption|content)' then 'Writing'
    when lower(p_skill) ~ '(host|event|planning)' then 'Event host'
    when lower(p_skill) ~ '(program|web|code|build)' then 'Build'
    when lower(p_skill) ~ '(research|data)' then 'Research'
    when lower(p_skill) ~ '(social|video|edit)' then 'Social media'
    when lower(p_skill) ~ '(present)' then 'Presentation'
    when p_skill ~ '^[a-z-]+$' and p_skill like '%-%' then initcap(split_part(p_skill, '-', 1))
    else initcap(left(p_skill, 30)) end;
$$;

create or replace function ap_badges_refresh() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from skill_badges where user_id = coalesce(new.user_id, old.user_id);
  insert into skill_badges (user_id, label, count)
  select c.user_id, ap_badge_label(c.skill), count(*) from contributions c
  where c.user_id = coalesce(new.user_id, old.user_id) and c.counts
  group by c.user_id, ap_badge_label(c.skill);
  return null;
end $$;
drop trigger if exists trg_badges_refresh on contributions;
create trigger trg_badges_refresh after insert or update or delete on contributions for each row execute function ap_badges_refresh();
-- Badges for work verified before this migration.
insert into skill_badges (user_id, label, count)
select c.user_id, ap_badge_label(c.skill), count(*) from contributions c where c.counts group by 1, 2
on conflict (user_id, label) do update set count = excluded.count;

-- Badges on the public Core cards, by card (core_group_members.id), for people who show on public pages.
create or replace function ap_core_badges()
returns table (member_id uuid, labels text[])
language sql stable security definer set search_path = public as $q$
  select m.id, array_agg(b.label || ' ×' || b.count order by b.count desc)
  from core_group_members m join skill_badges b on b.user_id = m.user_id join profiles p on p.id = m.user_id
  where m.is_visible and p.show_on_impact and not p.public_hidden
  group by m.id;
$q$;

-- Mission done: the day it was done (story pages, the Impact Board).
create or replace function ap_mission_done_at() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then new.done_at := coalesce(new.done_at, now()); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_mission_done_at on missions;
create trigger trg_mission_done_at before update of status on missions for each row execute function ap_mission_done_at();

-- ════════════════════════════════════════════════════════════════════════
-- Now building (public, positive only)
-- ════════════════════════════════════════════════════════════════════════

-- A public mission is listed while it moves: not paused or cancelled, not hidden, and not stuck
-- (nothing approved for N days while behind its plan). It comes back when it moves again.
-- Progress shown never goes backwards: if the plan grows, a new phase starts at its own count.
create or replace function ap_publish_public() returns integer
language plpgsql security definer set search_path = public as $$
declare m record; done integer; total integer; stuck boolean; n integer := 0;
begin
  for m in select * from missions where visibility = 'public' loop
    select count(*) filter (where status = 'approved'), count(*) filter (where status <> 'cancelled') into done, total from mission_tasks where mission_id = m.id;
    stuck := m.status in ('planned', 'active') and ap_mission_health(m.id) <> 'green'
      and not exists (select 1 from mission_tasks t where t.mission_id = m.id and t.approved_at > ap_now() - make_interval(days => ap_num('public_hide_days')::int))
      and m.created_at < ap_now() - make_interval(days => ap_num('public_hide_days')::int);
    update missions set
      public_listed = m.status in ('planned', 'active', 'review') and not m.public_hidden and not stuck and total > 0,
      public_phase = case when total > 0 and m.public_total > 0 and done::numeric / total < m.public_done::numeric / m.public_total then m.public_phase + 1 else m.public_phase end,
      public_done = done, public_total = total, public_updated_at = ap_now()
    where id = m.id;
    n := n + 1;
  end loop;
  perform ap_log('public_updates', 'Updated Now building and Impact', n || ' public missions');
  return n;
end;
$$;

-- Who may appear: they did verified work on it, chose to show, and are not hidden by an admin.
create or replace function ap_public_people(p_mission uuid)
returns table (name text, avatar_url text, role text, department text)
language sql stable security definer set search_path = public as $$
  select left(p.full_name, 80), case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end,
         string_agg(distinct c.title, ', '), left(nullif(btrim(p.department), ''), 80)
  from contributions c join profiles p on p.id = c.user_id
  where c.mission_id = p_mission and c.counts and p.show_on_impact and not p.public_hidden and p.is_active
  group by p.id, p.full_name, p.avatar_url, p.department
  order by min(c.contributed_on);
$$;

create or replace function ap_outside_count(p_mission uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(distinct c.user_id)::int from contributions c where c.mission_id = p_mission and c.counts and not ap_is_core_member(c.user_id);
$$;

create or replace function ap_now_building()
returns table (slug text, title text, goal text, hubs text[], done integer, total integer, phase integer, wins jsonb,
               people jsonb, outside integer, next_label text, next_date date, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.slug, m.title, left(split_part(coalesce(m.goal, ''), ' · ', 1), 160), m.hubs,
         m.public_done, m.public_total, m.public_phase,
         (select coalesce(jsonb_agg(jsonb_build_object('title', t.title, 'at', t.approved_at) order by t.approved_at desc), '[]')
          from (select t.title, t.approved_at from mission_tasks t where t.mission_id = m.id and t.status = 'approved' and t.approved_at is not null order by t.approved_at desc limit 3) t),
         (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'avatar_url', x.avatar_url)), '[]') from ap_public_people(m.id) x),
         ap_outside_count(m.id),
         (select t.title from mission_tasks t where t.mission_id = m.id and t.status not in ('approved', 'cancelled') order by t.due_on limit 1),
         -- A date only when the mission is on track.
         case when ap_mission_health(m.id) = 'green' then (select min(t.due_on) from mission_tasks t where t.mission_id = m.id and t.status not in ('approved', 'cancelled')) end,
         m.public_updated_at
  from missions m where m.public_listed and m.visibility = 'public'
  order by m.public_updated_at desc nulls last, m.mission_date;
$$;

-- The latest real wins, for when nothing is listed right now.
create or replace function ap_latest_wins(p_limit integer default 6)
returns table (title text, mission text, slug text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.title, m.title, m.slug, t.approved_at from mission_tasks t join missions m on m.id = t.mission_id
  where m.visibility = 'public' and not m.public_hidden and m.status not in ('cancelled') and t.status = 'approved' and t.approved_at is not null
  order by t.approved_at desc limit p_limit;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Story pages and the Impact Board
-- ════════════════════════════════════════════════════════════════════════

-- A done public mission's story is public once a lead wrote a summary, or 3 days after it was done.
create or replace function ap_story_published(p_mission uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from missions m where m.id = p_mission and m.status = 'done' and m.visibility = 'public' and not m.public_hidden
                 and (m.story_summary is not null or m.done_at <= ap_now() - interval '3 days'));
$$;

create or replace function ap_story(p_slug text)
returns table (id uuid, slug text, title text, goal text, variation text, playbook text, done_at timestamptz, summary text,
               timeline jsonb, outcome_links text[], people jsonb, hubs text[], outside integer, attendance integer, event_title text)
language sql stable security definer set search_path = public as $$
  select m.id, m.slug, m.title, left(split_part(coalesce(m.goal, ''), ' · ', 1), 300),
         (select v.name from playbook_variations v where v.playbook_id = m.playbook_id and v.key = m.variation_key), (select p.name from playbooks p where p.id = m.playbook_id),
         m.done_at, m.story_summary,
         (select coalesce(jsonb_agg(jsonb_build_object('title', t.title, 'at', t.approved_at) order by t.approved_at), '[]') from mission_tasks t where t.mission_id = m.id and t.status = 'approved' and t.approved_at is not null),
         m.outcome_links,
         (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'avatar_url', x.avatar_url, 'role', x.role, 'department', x.department)), '[]') from ap_public_people(m.id) x),
         m.hubs, ap_outside_count(m.id),
         (select count(*)::int from event_registrations r where r.event_id = m.event_id and (r.status = 'attended' or r.checked_in_at is not null)),
         (select e.title from events e where e.id = m.event_id)
  from missions m where m.slug = p_slug and ap_story_published(m.id);
$$;

create or replace function ap_story_list()
returns table (slug text, title text, done_at timestamptz, playbook text)
language sql stable security definer set search_path = public as $$
  select m.slug, m.title, m.done_at, (select p.slug from playbooks p where p.id = m.playbook_id) from missions m
  where ap_story_published(m.id) order by m.done_at desc;
$$;

-- A lead's optional 2–3 line summary (the story publishes without it after 3 days).
create or replace function ap_story_summary(p_mission uuid, p_text text) returns text
language plpgsql security definer set search_path = public as $$
declare m missions;
begin
  select * into m from missions where id = p_mission;
  if not (ap_is_operator() or m.owner_id = auth.uid() or m.hubs && ap_lead_hubs(auth.uid())) then raise exception 'Only the owner or a lead can write it.'; end if;
  update missions set story_summary = nullif(left(btrim(p_text), 600), ''), story_summary_by = auth.uid() where id = m.id;
  return 'Saved.';
end;
$$;

-- Real counts for /impact: since p_from (a semester) and all time. Public outcomes only.
create or replace function ap_impact_stats(p_from date default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  with done as (
    select m.*, (select slug from playbooks p where p.id = m.playbook_id) as pb from missions m
    where m.status = 'done' and m.visibility = 'public' and not m.public_hidden and (p_from is null or m.done_at >= p_from)
  )
  select jsonb_build_object(
    'missions', (select count(*) from done),
    'workshops', (select count(*) from done where pb = 'monthly-workshop'),
    'build_nights', (select count(*) from done where pb = 'monthly-build-night'),
    'attendance', (select count(*) from done d join event_registrations r on r.event_id = d.event_id where r.status = 'attended' or r.checked_in_at is not null),
    'posts', (select count(*) from done where pb in ('weekly-social-post', 'weekly-opportunity-digest')),
    'hackathons', (select count(*) from done where pb = 'hackathon-entry'),
    'projects_shipped', (select count(*) from projects p where p.status = 'completed' and (p.is_published or p.mission_id in (select id from done)) and (p_from is null or p.updated_at >= p_from)),
    'research', (select count(*) from done where pb = 'research-paper'),
    'contributions', (select count(*) from contributions c where c.counts and (p_from is null or c.contributed_on >= p_from)),
    'members', (select count(distinct c.user_id) from contributions c where c.counts and ap_is_core_member(c.user_id) and (p_from is null or c.contributed_on >= p_from)),
    'outside', (select count(distinct c.user_id) from contributions c where c.counts and not ap_is_core_member(c.user_id) and (p_from is null or c.contributed_on >= p_from)),
    'departments', (select count(distinct nullif(btrim(p.department), '')) from contributions c join profiles p on p.id = c.user_id where c.counts and (p_from is null or c.contributed_on >= p_from)),
    'evidence', (select coalesce(jsonb_agg(jsonb_build_object('slug', d.slug, 'title', d.title, 'kind', d.pb, 'done_at', d.done_at, 'links', d.outcome_links,
                   'published', ap_story_published(d.id)) order by d.done_at desc), '[]') from done d)
  );
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Share cards (only verified work; nothing is posted automatically)
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_make_share_card(p_mission uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if ap_level('share_cards') = 'manual' then raise exception 'Share cards are off.'; end if;
  if not exists (select 1 from contributions c where c.user_id = auth.uid() and c.mission_id = p_mission and c.counts) then raise exception 'Only for work you did on it.'; end if;
  if not exists (select 1 from missions m where m.id = p_mission and m.status = 'done' and m.visibility = 'public') then raise exception 'Cards are for finished public missions.'; end if;
  select s.code into code from share_cards s where s.user_id = auth.uid() and s.mission_id = p_mission;
  if code is null then
    code := substr(md5(gen_random_uuid()::text), 1, 10);
    insert into share_cards (code, user_id, mission_id) values (code, auth.uid(), p_mission);
  end if;
  return code;
end;
$$;

create or replace function ap_share_card(p_code text)
returns table (name text, mission text, slug text, tasks text[], done_at timestamptz, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.full_name, m.title, m.slug,
         array(select c.title from contributions c where c.user_id = s.user_id and c.mission_id = m.id and c.counts order by c.contributed_on),
         m.done_at, case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end
  from share_cards s join missions m on m.id = s.mission_id join profiles p on p.id = s.user_id
  where s.code = p_code and m.status = 'done' and m.visibility = 'public' and not m.public_hidden and not p.public_hidden;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Contribution certificates (admin confirms each; anyone can verify)
-- ════════════════════════════════════════════════════════════════════════

-- Drafts for everyone with verified, counted work in the period (a line each in Today).
create or replace function ap_certificate_drafts(p_from date, p_to date, p_label text) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; code text; n integer := 0;
begin
  if not ap_can('certificates.issue') and auth.uid() is not null then raise exception 'Only admins prepare certificates.'; end if;
  if ap_level('certificate_drafts') = 'manual' and auth.uid() is null then return 0; end if;
  for r in select c.user_id, p.full_name, jsonb_agg(jsonb_build_object('title', c.title, 'mission', m.title, 'on', c.contributed_on) order by c.contributed_on) items
           from contributions c join profiles p on p.id = c.user_id left join missions m on m.id = c.mission_id
           where c.counts and c.contributed_on between p_from and p_to group by c.user_id, p.full_name loop
    continue when exists (select 1 from certificate_verifications v where v.user_id = r.user_id and v.period_label = p_label and v.status <> 'revoked');
    code := 'FXC-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    insert into certificate_verifications (code, user_id, holder, period_label, contributions) values (code, r.user_id, r.full_name, p_label, r.items);
    perform ap_suggest('certificate_drafts', 'certificate', 'Certificate for ' || r.full_name || ' (' || p_label || ')',
      jsonb_array_length(r.items) || ' verified contributions', jsonb_build_object('code', code), 'cert:' || code, false, null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function ap_certificate_set(p_code text, p_action text, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v certificate_verifications;
begin
  if not ap_can('certificates.issue') then raise exception 'Only admins issue certificates.'; end if;
  select * into v from certificate_verifications where code = p_code for update;
  if p_action = 'issue' then
    update certificate_verifications set status = 'issued', issued_at = now(), issued_by = auth.uid() where code = v.code and status = 'draft';
    perform ap_notify(v.user_id, 'Your FusionX certificate is ready', v.period_label || ' · verified contributions', '/my-work#contributions');
  elsif p_action = 'revoke' then
    update certificate_verifications set status = 'revoked', revoked_at = now(), revoked_reason = left(p_reason, 300) where code = v.code;
  elsif p_action = 'skip' then
    delete from certificate_verifications where code = v.code and status = 'draft';
  end if;
  update autopilot_queue set status = 'done', decided_by = auth.uid(), decided_at = now() where dedupe = 'cert:' || v.code and status = 'pending';
  insert into audit_logs (user_id, action, resource_type, metadata) values (auth.uid(), 'autopilot.certificate.' || p_action, 'certificate_verifications', jsonb_build_object('code', v.code, 'reason', p_reason));
  return case p_action when 'issue' then 'Issued.' when 'revoke' then 'Revoked.' else 'Skipped.' end;
end;
$$;

-- Public check: holder, contributions, issue date, or "revoked". Drafts look like unknown codes.
create or replace function ap_verify_contribution_certificate(p_code text)
returns table (code text, holder text, period_label text, contributions jsonb, issued_at timestamptz, revoked boolean)
language sql stable security definer set search_path = public as $$
  select v.code, v.holder, v.period_label, case when v.status = 'revoked' then '[]'::jsonb else v.contributions end, v.issued_at, v.status = 'revoked'
  from certificate_verifications v where v.code = upper(btrim(p_code)) and v.status in ('issued', 'revoked');
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Recognition: the month's top contributors, published only after an admin confirms
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_suggest_recognition(p_month date) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; m date := date_trunc('month', p_month)::date;
begin
  for r in select c.user_id, count(*) k from contributions c join profiles p on p.id = c.user_id
           where c.counts and c.contributed_on >= m and c.contributed_on < (m + interval '1 month') and p.show_on_impact and not p.public_hidden
           group by c.user_id order by count(*) desc limit 3 loop
    insert into recognitions (month, user_id, reason) values (m, r.user_id, r.k || ' verified contributions in ' || to_char(m, 'Mon YYYY')) on conflict do nothing;
    perform ap_suggest('recognition', 'recognition', 'Top contributor of ' || to_char(m, 'Mon') || ': ' || ap_name(r.user_id), r.k || ' verified contributions',
      jsonb_build_object('month', m, 'user_id', r.user_id), 'recog:' || m || ':' || r.user_id, false, null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function ap_recognition_set(p_month date, p_user uuid, p_publish boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not ap_can('impact.publish') then raise exception 'Only admins publish recognition.'; end if;
  update recognitions set status = case when p_publish then 'published' else 'skipped' end, published_by = auth.uid(), published_at = now()
  where month = date_trunc('month', p_month)::date and user_id = p_user;
  update autopilot_queue set status = 'done', decided_by = auth.uid(), decided_at = now() where dedupe = 'recog:' || date_trunc('month', p_month)::date || ':' || p_user and status = 'pending';
  if p_publish then perform ap_notify(p_user, 'You''re a FusionX top contributor this month', 'Thank you! It is on the Impact Board.', '/impact'); end if;
  return case when p_publish then 'Published.' else 'Skipped.' end;
end;
$$;

create or replace function ap_recognitions_public()
returns table (month date, name text, avatar_url text, reason text)
language sql stable security definer set search_path = public as $$
  select r.month, p.full_name, case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end, r.reason from recognitions r join profiles p on p.id = r.user_id
  where r.status = 'published' and p.show_on_impact and not p.public_hidden order by r.month desc, r.reason desc limit 9;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Idea Engine (drafts by the system, decisions by people)
-- ════════════════════════════════════════════════════════════════════════

-- Adopt a project idea: an existing-style Projects draft (not published) + a Flagship mission.
create or replace function ap_idea_adopt(p_idea uuid, p_variation text, p_owner uuid, p_date date) returns uuid
language plpgsql security definer set search_path = public as $$
declare d idea_drafts; owner uuid; pid uuid; mid uuid; flagship uuid; research uuid;
begin
  if not ap_can('ideas.adopt') then raise exception 'You may not adopt ideas.'; end if;
  select * into d from idea_drafts where id = p_idea for update;
  if d.status in ('adopted', 'rejected') then raise exception 'Already decided.'; end if;
  if d.kind = 'project' then
    owner := coalesce(p_owner, (select m.user_id from core_group_members m join core_groups g on g.id = m.group_id where g.slug = 'projects-research-startups' and m.is_lead limit 1), auth.uid());
    insert into projects (title, slug, description, owner_id, status, is_published, tracked, plan_variation, target_date)
    values (d.title, trim(both '-' from regexp_replace(lower(d.title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(d.id::text), 1, 6), d.pitch || E'\n\n' || coalesce(d.data ->> 'problem', ''),
            owner, 'idea', false, true, coalesce(p_variation, 'standard'), coalesce(p_date, ap_today() + 56))
    returning id into pid;
    flagship := (select id from playbooks where slug = 'flagship-project-sprint');
    mid := ap_create_mission(flagship, coalesce(p_variation, 'standard'), coalesce(p_date, ap_today() + 56), d.title, left(d.pitch, 300), owner, null, 'idea', null, d.id, 'public');
    update projects set mission_id = mid where id = pid;
  else
    owner := coalesce(p_owner, d.mentor_id, auth.uid());
    insert into research (title, abstract, created_by, is_published) values (d.title, d.pitch || E'\n\n' || coalesce(d.data ->> 'question', ''), owner, false) returning id into research;
    pid := research;
    mid := ap_create_mission((select id from playbooks where slug = 'research-paper'), coalesce(p_variation, 'paper'), coalesce(p_date, ap_today() + 84), d.title, left(d.pitch, 300), owner, '{projects-research-startups}', 'idea', null, d.id, 'members');
    update missions set mentor_id = coalesce(d.mentor_id, owner) where id = mid;
    perform ap_notify(coalesce(d.mentor_id, owner), 'Mentor approval asked: ' || d.title, 'The research mission starts when you approve it.', '/command/missions?m=' || mid);
  end if;
  update idea_drafts set status = 'adopted', adopted_mission = mid, adopted_ref = pid, decided_by = auth.uid() where id = d.id;
  update autopilot_queue set status = 'done', decided_by = auth.uid(), decided_at = now() where dedupe = 'idea:' || d.id and status = 'pending';
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.idea.adopt', 'idea_drafts', d.id, jsonb_build_object('mission', mid, 'ref', pid));
  perform ap_log(case when d.kind = 'project' then 'idea_projects' else 'idea_research' end, 'Adopted idea: ' || d.title, 'By ' || ap_name(auth.uid()), 'mission', mid);
  return mid;
end;
$$;

create or replace function ap_idea_set(p_idea uuid, p_action text, p_reason text default null, p_patch jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not ap_can('ideas.adopt') then raise exception 'You may not decide ideas.'; end if;
  if p_action = 'save' then update idea_drafts set status = 'saved', decided_by = auth.uid() where id = p_idea;
  elsif p_action = 'reject' then update idea_drafts set status = 'rejected', reject_reason = left(coalesce(p_reason, 'Not for us'), 300), decided_by = auth.uid() where id = p_idea;
  elsif p_action = 'edit' then
    update idea_drafts set title = coalesce(nullif(p_patch ->> 'title', ''), title), pitch = coalesce(nullif(p_patch ->> 'pitch', ''), pitch) where id = p_idea;
    return 'Saved.';
  end if;
  update autopilot_queue set status = case when p_action = 'reject' then 'skipped' else 'done' end, decided_by = auth.uid(), decided_at = now() where dedupe = 'idea:' || p_idea and status = 'pending';
  return case p_action when 'save' then 'Saved for members.' else 'Rejected.' end;
end;
$$;

-- Members see saved project ideas, like them, and start one as their own project.
create or replace function ap_saved_ideas()
returns table (id uuid, title text, pitch text, likes integer, liked boolean, data jsonb)
language sql stable security definer set search_path = public as $$
  select d.id, d.title, d.pitch, (select count(*)::int from idea_likes l where l.idea_id = d.id),
         exists (select 1 from idea_likes l where l.idea_id = d.id and l.user_id = auth.uid()), d.data
  from idea_drafts d where d.kind = 'project' and d.status = 'saved' and auth.uid() is not null order by d.created_at desc limit 20;
$$;

create or replace function ap_idea_like(p_idea uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from idea_drafts where id = p_idea and status = 'saved') then raise exception 'Not available.'; end if;
  if exists (select 1 from idea_likes where idea_id = p_idea and user_id = auth.uid()) then delete from idea_likes where idea_id = p_idea and user_id = auth.uid(); return 'Unliked.'; end if;
  insert into idea_likes (idea_id, user_id) values (p_idea, auth.uid());
  return 'Liked.';
end;
$$;

create or replace function ap_idea_start(p_idea uuid, p_variation text, p_target date) returns uuid
language plpgsql security definer set search_path = public as $$
declare d idea_drafts; pid uuid;
begin
  select * into d from idea_drafts where id = p_idea and status = 'saved';
  if d.id is null then raise exception 'Not available.'; end if;
  insert into projects (title, slug, description, owner_id, status, is_published)
  values (d.title, trim(both '-' from regexp_replace(lower(d.title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
          d.pitch || E'\n\n' || coalesce(d.data ->> 'problem', ''), auth.uid(), 'idea', false) returning id into pid;
  perform ap_project_set_plan(pid, p_variation, coalesce(p_target, ap_today() + 28), true);
  return pid;
end;
$$;

-- Opportunity drafts: publish (with "Source checked"), run as a mission, match an idea, reject.
create or replace function ap_opportunity_draft_set(p_draft uuid, p_action text, p_extra jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare d opportunity_drafts; oid uuid; mid uuid;
begin
  if not ap_is_operator() and not ('competitions-opportunities' = any(ap_lead_hubs(auth.uid()))) then raise exception 'Not allowed.'; end if;
  select * into d from opportunity_drafts where id = p_draft for update;
  if d.deadline < ap_today() then raise exception 'Its deadline has passed.'; end if;
  if p_action = 'publish' then
    insert into opportunities (title, organizer, category, description, eligibility, deadline, registration_url, status, is_published, created_by, city, distance_km, mode, value_score, source_checked_on)
    values (d.title, d.organiser,
            (case when d.kind ilike '%intern%' then 'internship' when d.kind ilike '%fellow%' then 'fellowship' when d.kind ilike '%research%' then 'research' else 'hackathon' end)::opportunity_category,
            concat_ws(E'\n', nullif(d.dates, ''), nullif('Team: ' || d.team_size, 'Team: '), nullif('Fees: ' || d.fees, 'Fees: '), nullif('Prizes: ' || d.prizes, 'Prizes: '),
                      'Source checked: ' || to_char(ap_today(), 'DD Mon YYYY')),
            d.eligibility, d.deadline, d.official_link, 'open', true, auth.uid(), d.city, d.distance_km, d.mode, d.value_score, ap_today())
    returning id into oid;
    update opportunity_drafts set status = 'published', opportunity_id = oid, source_checked_on = ap_today(), decided_by = auth.uid() where id = d.id;
  elsif p_action = 'mission' then
    mid := ap_create_mission((select id from playbooks where slug = 'hackathon-entry'), 'mixed-hub', d.deadline, d.title, 'Official link: ' || d.official_link, null, null, 'opportunity', null, d.id, 'public');
    update opportunity_drafts set status = 'mission', mission_id = mid, decided_by = auth.uid() where id = d.id;
  elsif p_action = 'match' then
    update opportunity_drafts set idea_id = (p_extra ->> 'idea_id')::uuid where id = d.id;
    return 'Matched.';
  elsif p_action = 'reject' then
    update opportunity_drafts set status = 'rejected', decided_by = auth.uid() where id = d.id;
  end if;
  update autopilot_queue set status = case when p_action = 'reject' then 'skipped' else 'done' end, decided_by = auth.uid(), decided_at = now() where dedupe = 'opp:' || d.id and status = 'pending';
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.opportunity.' || p_action, 'opportunity_drafts', d.id, '{}');
  return case p_action when 'publish' then 'Published with "Source checked".' when 'mission' then 'Mission created.' else 'Done.' end;
end;
$$;

-- Today: the outcome kinds, then 0043's wrapper for the rest.
create or replace function ap_queue_decide_outcomes(p_item uuid, p_approve boolean, p_edit jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare q autopilot_queue; p jsonb;
begin
  select * into q from autopilot_queue where id = p_item;
  if q.id is null or q.status <> 'pending' then return 'Already decided.'; end if;
  p := q.payload || coalesce(p_edit, '{}');
  case q.kind
    when 'certificate' then return ap_certificate_set(p ->> 'code', case when p_approve then 'issue' else 'skip' end);
    when 'recognition' then return ap_recognition_set((p ->> 'month')::date, (p ->> 'user_id')::uuid, p_approve);
    when 'idea_draft' then
      if not p_approve then return ap_idea_set((p ->> 'idea_id')::uuid, coalesce(p ->> 'action', 'reject'), p ->> 'reason'); end if;
      perform ap_idea_adopt((p ->> 'idea_id')::uuid, p ->> 'variation_key', (p ->> 'owner_id')::uuid, (p ->> 'date')::date);
      return 'Adopted.';
    when 'opportunity_draft' then return ap_opportunity_draft_set((p ->> 'draft_id')::uuid, case when p_approve then coalesce(p ->> 'action', 'publish') else 'reject' end, p);
    when 'public_update' then
      if p_approve then perform ap_publish_public(); end if;
      update autopilot_queue set status = case when p_approve then 'done' else 'skipped' end, decided_by = auth.uid(), decided_at = now() where id = q.id;
      return case when p_approve then 'Now building updated.' else 'Skipped.' end;
    else return ap_queue_decide_people(p_item, p_approve, p_edit);
  end case;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- The run: public updates and the monthly recognition (the Idea Engine runs in the website's cron route)
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_step_outcomes() returns void
language plpgsql security definer set search_path = public as $$
declare lvl text := ap_level('public_updates');
begin
  if lvl = 'auto' then perform ap_publish_public();
  elsif lvl = 'suggest' then
    perform ap_suggest('public_updates', 'public_update', 'Update Now building and the Impact Board', 'Progress and wins from verified work only',
      '{}'::jsonb, 'public:' || ap_today(), true, null);
  end if;
  -- First days of a month: last month's top contributors, for an admin to confirm.
  if extract(day from ap_today()) <= 3 and ap_level('recognition') <> 'manual'
     and not exists (select 1 from recognitions where month = (date_trunc('month', ap_today()) - interval '1 month')::date) then
    perform ap_suggest_recognition((date_trunc('month', ap_today()) - interval '1 month')::date);
  end if;
end;
$$;

create or replace function autopilot_tick(p_now timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare run uuid := coalesce(nullif(current_setting('ap.run', true), '')::uuid, gen_random_uuid());
begin
  perform set_config('ap.now', coalesce(p_now, now())::text, true);
  perform set_config('ap.run', run::text, true);
  if not ap_on() then return jsonb_build_object('paused', true); end if;
  perform ap_step_rules();
  perform ap_step_exam_shifts();
  perform ap_step_assign();
  perform ap_step_reoffers();
  perform ap_step_reminders();
  perform ap_step_escalations();
  perform ap_step_health();
  perform ap_step_people();
  perform ap_step_outcomes();
  perform ap_step_messages();
  return jsonb_build_object('paused', false, 'now', ap_now(),
    'logged', (select count(*) from automation_log where run_id = run),
    'suggested', (select count(*) from autopilot_queue where run_id = run));
end;
$$;

-- "Update now" in Command Center → Outcomes (operators).
create or replace function ap_publish_now() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not ap_is_operator() then raise exception 'Not allowed.'; end if;
  perform ap_publish_public();
  return 'Now building and the Impact Board are updated.';
end;
$$;

-- Counted from public pages (the beacon route); no cookies, no IP, no visitor id.
create or replace function ap_count_visit(p_group text) returns void
language sql security definer set search_path = public as $$
  insert into site_visits (day, path_group, views) values ((now() at time zone 'Asia/Kolkata')::date, left(p_group, 40), 1)
  on conflict (day, path_group) do update set views = site_visits.views + 1;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════

alter table skill_badges enable row level security;
alter table share_cards enable row level security;
alter table certificate_verifications enable row level security;
alter table recognitions enable row level security;
alter table idea_drafts enable row level security;
alter table idea_likes enable row level security;
alter table opportunity_sources enable row level security;
alter table opportunity_drafts enable row level security;
alter table site_visits enable row level security;

-- Badges are public (they say only "Design ×5"), for people who show on public pages.
drop policy if exists "badges are public" on skill_badges;
create policy "badges are public" on skill_badges for select using (exists (select 1 from profiles p where p.id = user_id and p.show_on_impact and not p.public_hidden) or user_id = auth.uid());
drop policy if exists "own share cards" on share_cards;
create policy "own share cards" on share_cards for select using (user_id = auth.uid());
drop policy if exists "own certificates and admins" on certificate_verifications;
create policy "own certificates and admins" on certificate_verifications for select using ((user_id = auth.uid() and status = 'issued') or ap_is_operator());
drop policy if exists "recognition: operators" on recognitions;
create policy "recognition: operators" on recognitions for select using (ap_is_operator());
drop policy if exists "ideas: center" on idea_drafts;
create policy "ideas: center" on idea_drafts for select using (ap_can_open_center());
drop policy if exists "likes: own" on idea_likes;
create policy "likes: own" on idea_likes for select using (user_id = auth.uid());
drop policy if exists "sources: center" on opportunity_sources;
create policy "sources: center" on opportunity_sources for select using (ap_can_open_center());
drop policy if exists "sources: operators edit" on opportunity_sources;
create policy "sources: operators edit" on opportunity_sources for all using (ap_is_operator()) with check (ap_is_operator());
drop policy if exists "opportunity drafts: center" on opportunity_drafts;
create policy "opportunity drafts: center" on opportunity_drafts for select using (ap_can_open_center());
drop policy if exists "visits: operators" on site_visits;
create policy "visits: operators" on site_visits for select using (ap_is_operator());

revoke insert, update, delete on skill_badges, share_cards, certificate_verifications, recognitions, idea_drafts, idea_likes, opportunity_drafts, site_visits from anon, authenticated;
grant insert, update, delete on opportunity_sources to authenticated;

-- Execute rights for every Autopilot function (0042, 0043 and these): nothing for the public, then the checked entry points.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           -- "\_" is a real underscore: plain "_" would also match older functions such as apply_result_corrections.
           where n.nspname = 'public' and (p.proname like 'ap\_%' or p.proname like 'task\_%' or p.proname = 'autopilot_tick') loop
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
grant execute on function ap_can_read_proof(text) to anon, authenticated;
grant execute on function ap_full_view(uuid, uuid), ap_project_member(uuid, uuid), ap_is_core_member(uuid), ap_reviews_task(uuid, uuid) to anon, authenticated;
grant execute on function ap_open_seat(uuid, text, text), ap_visible_seats(), ap_seat_apply(uuid, text, text), ap_seat_decide(uuid, boolean),
  ap_take_community_task(uuid), ap_pitch_submit(text, text, text, jsonb), ap_pitch_vote(uuid, text), ap_pitch_board(),
  ap_pitch_approve(uuid, uuid, text, date, text[]), ap_pitch_decline(uuid, text), ap_talent_nominate(uuid, text),
  ap_talent_decide(uuid, text, uuid[], uuid, date), ap_collaborator_end(uuid, text, date), ap_project_set_plan(uuid, text, date, boolean),
  ap_project_milestone(uuid, text, uuid, text, date, text), ap_project_task(uuid, text, uuid, text, uuid, uuid, date),
  ap_project_status_set(uuid, project_status, boolean), ap_project_support_request(uuid, text), ap_project_support_decide(uuid, boolean, boolean),
  ap_queue_decide_people(uuid, boolean, jsonb), ap_applicant_contributions(uuid), ap_project_plan(text, date) to authenticated;
grant execute on function ap_now_building(), ap_latest_wins(integer), ap_story(text), ap_story_list(), ap_impact_stats(date), ap_share_card(text),
  ap_verify_contribution_certificate(text), ap_recognitions_public(), ap_story_published(uuid), ap_core_badges() to anon, authenticated;
grant execute on function ap_story_summary(uuid, text), ap_make_share_card(uuid), ap_certificate_drafts(date, date, text), ap_certificate_set(text, text, text),
  ap_suggest_recognition(date), ap_recognition_set(date, uuid, boolean), ap_idea_adopt(uuid, text, uuid, date), ap_idea_set(uuid, text, text, jsonb),
  ap_saved_ideas(), ap_idea_like(uuid), ap_idea_start(uuid, text, date), ap_opportunity_draft_set(uuid, text, jsonb), ap_queue_decide_outcomes(uuid, boolean, jsonb),
  ap_publish_now() to authenticated;
grant execute on function ap_count_visit(text), ap_publish_public() to service_role;
