-- 0043: FusionX Autopilot, people (PR 2): open seats and guests, community members, pitches and votes,
-- Rising Talent and Core Collaborators, and tracking for members' own projects.
--
-- Additive only, safe to run again. Needs 0042. Writes go through the functions below (they check the
-- caller); tables are read through RLS.

-- ════════════════════════════════════════════════════════════════════════
-- Settings
-- ════════════════════════════════════════════════════════════════════════

create table if not exists community_settings (
  id smallint primary key default 1 check (id = 1),
  community_on boolean not null default true,
  talent_on boolean not null default true,
  projects_on boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into community_settings (id) values (1) on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Who is who
-- ════════════════════════════════════════════════════════════════════════

-- In any Core group (a hub or FusionX Core). Everyone else signed in is a community member.
create or replace function ap_is_core_member(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from core_group_members m where m.user_id = p_user and m.title <> 'Collaborator');
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Open seats and guests
-- ════════════════════════════════════════════════════════════════════════

create table if not exists open_seats (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references mission_tasks(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  skill text check (skill is null or char_length(skill) <= 80),
  note text check (note is null or char_length(note) <= 400),
  -- Signed-in website members see it first; everyone signed in after this.
  members_only_until timestamptz not null,
  status text not null default 'open' check (status in ('open', 'filled', 'closed')),
  opened_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_open_seats_task on open_seats (task_id) where status = 'open';

create table if not exists seat_applications (
  id uuid primary key default gen_random_uuid(),
  seat_id uuid not null references open_seats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pitch text not null check (char_length(pitch) between 10 and 500),
  previous_work text check (previous_work is null or previous_work ~* '^https?://\S+$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (seat_id, user_id)
);

-- A guest sees only this mission and their tasks, until access_until.
create table if not exists mission_guests (
  mission_id uuid not null references missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat_id uuid references open_seats(id) on delete set null,
  access_until date,
  created_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

-- ════════════════════════════════════════════════════════════════════════
-- Pitches and votes
-- ════════════════════════════════════════════════════════════════════════

create table if not exists pitches (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 4 and 120),
  summary text not null check (char_length(summary) between 20 and 800),
  pitched_by uuid not null references auth.users(id) on delete cascade,
  hub text,
  status text not null default 'voting' check (status in ('voting', 'waiting', 'approved', 'declined', 'withdrawn')),
  voting_ends_at timestamptz not null,
  mission_id uuid references missions(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decline_reason text,
  created_at timestamptz not null default now()
);

-- Small / full (or more): members vote for one; the rest stay as "other options".
create table if not exists pitch_variations (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references pitches(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null check (char_length(description) between 5 and 400),
  unique (pitch_id, key)
);

create table if not exists pitch_votes (
  pitch_id uuid not null references pitches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  variation_key text not null,
  created_at timestamptz not null default now(),
  primary key (pitch_id, user_id)
);

-- ════════════════════════════════════════════════════════════════════════
-- Rising Talent and Core Collaborators
-- ════════════════════════════════════════════════════════════════════════

create table if not exists talent_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('contributions', 'top_pitch', 'nomination')),
  reason text not null,
  nominated_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'not_now', 'declined')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_talent_pending on talent_suggestions (user_id) where status = 'pending';

create table if not exists collaborators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_ids uuid[] not null default '{}',
  core_group_id uuid references core_groups(id) on delete set null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  -- "Shortlist in the next recruitment": a note for admins only; nobody is selected automatically.
  shortlisted boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_collaborators_user on collaborators (user_id, status);

-- ════════════════════════════════════════════════════════════════════════
-- Members' own projects: tracking on top of the existing projects table
-- ════════════════════════════════════════════════════════════════════════

alter table projects add column if not exists plan_variation text;
alter table projects add column if not exists target_date date;
alter table projects add column if not exists tracked boolean not null default false;
-- The owner set the status by hand: progress no longer changes it.
alter table projects add column if not exists status_locked boolean not null default false;
alter table projects add column if not exists mission_id uuid references missions(id) on delete set null;

create table if not exists project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 140),
  due_on date,
  sort integer not null default 0,
  plan_key text,
  done_at timestamptz,
  proof_url text check (proof_url is null or proof_url ~* '^https?://\S+$'),
  created_at timestamptz not null default now()
);
create index if not exists idx_project_milestones on project_milestones (project_id, sort);

create table if not exists project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  milestone_id uuid references project_milestones(id) on delete set null,
  title text not null check (char_length(title) between 2 and 140),
  assignee_id uuid references auth.users(id) on delete set null,
  due_on date,
  done_at timestamptz,
  -- Supported projects: the same task in its mission (reviewed, counted).
  mission_task_id uuid references mission_tasks(id) on delete set null,
  reminded_before boolean not null default false,
  reminded_due boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_tasks on project_tasks (project_id);
create index if not exists idx_project_tasks_assignee on project_tasks (assignee_id) where done_at is null;

create table if not exists project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  text text not null,
  at timestamptz not null default now()
);
create index if not exists idx_project_activity on project_activity (project_id, at desc);

create table if not exists project_support_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  note text check (note is null or char_length(note) <= 600),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_support_pending on project_support_requests (project_id) where status = 'pending';

-- ════════════════════════════════════════════════════════════════════════
-- Who sees what (replaces 0042's version): Core people as before; collaborators their missions;
-- guests their mission (until access ends); community members and guests only their own tasks.
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_full_view(p_mission uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    ap_is_operator(p_user)
    or exists (select 1 from missions m where m.id = p_mission and (m.owner_id = p_user or m.mentor_id = p_user or m.hubs && ap_lead_hubs(p_user)))
    or exists (select 1 from collaborators c where c.user_id = p_user and c.status = 'active' and p_mission = any(c.mission_ids))
    or (ap_is_core_member(p_user) and (
          exists (select 1 from mission_tasks t where t.mission_id = p_mission and (t.assignee_id = p_user or t.member_for = p_user))
       or exists (select 1 from task_offers o join mission_tasks t on t.id = o.task_id where t.mission_id = p_mission and o.user_id = p_user)
       or exists (select 1 from task_reviews r join mission_tasks t on t.id = r.task_id where t.mission_id = p_mission and r.reviewer_id = p_user))));
$$;

create or replace function ap_can_see_mission(p_mission uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    ap_full_view(p_mission, p_user)
    or exists (select 1 from mission_guests g where g.mission_id = p_mission and g.user_id = p_user and (g.access_until is null or g.access_until >= ap_today()))
    -- Their own task's mission, unless they were a guest whose access has ended.
    or (exists (select 1 from mission_tasks t where t.mission_id = p_mission and t.assignee_id = p_user)
        and not exists (select 1 from mission_guests g where g.mission_id = p_mission and g.user_id = p_user and g.access_until < ap_today()))
    or exists (select 1 from task_reviews r join mission_tasks t on t.id = r.task_id where t.mission_id = p_mission and r.reviewer_id = p_user));
$$;

-- Whether this person reviews this task (a function, so the policy below does not loop through task_reviews' own policy).
create or replace function ap_reviews_task(p_task uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from task_reviews r where r.task_id = p_task and r.reviewer_id = p_user);
$$;

drop policy if exists "people in a mission read its tasks" on mission_tasks;
create policy "people in a mission read its tasks" on mission_tasks for select using (
  ap_full_view(mission_id) or assignee_id = auth.uid() or ap_reviews_task(id)
  or (community_allowed and status = 'open' and assignee_id is null and auth.uid() is not null));
drop policy if exists "people in a mission read its versions" on mission_versions;
create policy "people in a mission read its versions" on mission_versions for select using (ap_full_view(mission_id));

-- ════════════════════════════════════════════════════════════════════════
-- Open seats
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_open_seat(p_task uuid, p_skill text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t mission_tasks; m missions; seat uuid; head integer := ap_num('community_head_start_hours')::int;
begin
  select * into t from mission_tasks where id = p_task;
  select * into m from missions where id = t.mission_id;
  if not (ap_is_operator() or m.owner_id = auth.uid() or (t.hub = any(ap_lead_hubs(auth.uid()))) or m.hubs && ap_lead_hubs(auth.uid())) then raise exception 'Only the owner or a lead can open a seat.'; end if;
  if not t.open_seat_allowed then raise exception 'This task does not allow open seats.'; end if;
  if t.status not in ('open', 'offered') or t.assignee_id is not null then raise exception 'This task is already taken.'; end if;
  if ap_level('open_seats') = 'manual' and not ap_is_operator() then raise exception 'Open seats are off.'; end if;
  insert into open_seats (task_id, mission_id, skill, note, members_only_until, opened_by)
  values (t.id, m.id, nullif(btrim(p_skill), ''), nullif(btrim(p_note), ''), ap_now() + make_interval(hours => head), auth.uid())
  returning id into seat;
  update task_offers set status = 'withdrawn', answered_at = ap_now() where task_id = t.id and status = 'offered';
  update mission_tasks set locked = true, status = 'open' where id = t.id;
  perform ap_log('open_seats', 'Opened a seat: ' || t.title, 'By ' || ap_name(auth.uid()), 'task', t.id);
  return seat;
end;
$$;

-- Open seats someone signed in may see: website members first (the head start), then everyone.
create or replace function ap_visible_seats()
returns table (id uuid, task_title text, mission_title text, mission_date date, due_on date, skill text, effort text, note text, hub text, members_first boolean, applied boolean)
language sql stable security definer set search_path = public as $$
  select s.id, t.title, m.title, m.mission_date, t.due_on, coalesce(s.skill, t.skills[1]), t.effort, s.note, t.hub,
         s.members_only_until > ap_now(), exists (select 1 from seat_applications a where a.seat_id = s.id and a.user_id = auth.uid())
  from open_seats s join mission_tasks t on t.id = s.task_id join missions m on m.id = s.mission_id
  where s.status = 'open' and auth.uid() is not null and m.status in ('planned', 'active')
    and (s.members_only_until <= ap_now() or exists (select 1 from profiles p where p.id = auth.uid() and p.is_active and p.membership_type <> 'alumni'))
    and (select community_on from community_settings where id = 1)
  order by t.due_on;
$$;

create or replace function ap_seat_apply(p_seat uuid, p_pitch text, p_work text) returns text
language plpgsql security definer set search_path = public as $$
declare s open_seats; m missions;
begin
  select * into s from open_seats where id = p_seat;
  if s.id is null or s.status <> 'open' then raise exception 'This seat is closed.'; end if;
  if not exists (select 1 from ap_visible_seats() v where v.id = s.id) then raise exception 'This seat is not open to you yet.'; end if;
  insert into seat_applications (seat_id, user_id, pitch, previous_work) values (s.id, auth.uid(), btrim(p_pitch), nullif(btrim(p_work), ''));
  select * into m from missions where id = s.mission_id;
  perform ap_notify(m.owner_id, ap_name(auth.uid()) || ' applied for an open seat', m.title, '/command/missions?m=' || m.id);
  perform ap_suggest('open_seats', 'seat_application', ap_name(auth.uid()) || ' applied for "' || (select title from mission_tasks where id = s.task_id) || '"',
    left(btrim(p_pitch), 300), jsonb_build_object('application_id', (select id from seat_applications where seat_id = s.id and user_id = auth.uid())),
    'seat:' || s.id || ':' || auth.uid(), false, (select hub from mission_tasks where id = s.task_id));
  return 'Applied. The mission owner will decide.';
end;
$$;

create or replace function ap_seat_decide(p_application uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare a seat_applications; s open_seats; t mission_tasks; m missions;
begin
  select * into a from seat_applications where id = p_application for update;
  if a.status <> 'pending' then return 'Already decided.'; end if;
  select * into s from open_seats where id = a.seat_id;
  select * into t from mission_tasks where id = s.task_id;
  select * into m from missions where id = s.mission_id;
  if not (m.owner_id = auth.uid() or exists (select 1 from unnest(m.hubs) h where ap_can('seats.approve', h))) then raise exception 'Only the owner or a lead can decide.'; end if;
  update seat_applications set status = case when p_accept then 'accepted' else 'declined' end, decided_by = auth.uid(), decided_at = now() where id = a.id;
  if p_accept then
    update open_seats set status = 'filled' where id = s.id;
    update seat_applications set status = 'declined', decided_by = auth.uid(), decided_at = now() where seat_id = s.id and status = 'pending';
    update mission_tasks set assignee_id = a.user_id, status = 'accepted', updated_at = now() where id = t.id;
    insert into task_offers (task_id, user_id, status, answered_at) values (t.id, a.user_id, 'accepted', ap_now());
    if not ap_is_core_member(a.user_id) then
      insert into mission_guests (mission_id, user_id, seat_id, access_until) values (m.id, a.user_id, s.id, null)
      on conflict (mission_id, user_id) do nothing;
    end if;
    perform ap_notify(a.user_id, 'You''re in: ' || t.title, m.title || ' · due ' || to_char(t.due_on, 'DD Mon') || '. It is in My work.', '/my-work');
    perform ap_mission_touch(m.id);
  else
    perform ap_notify(a.user_id, 'Open seat: not this time', t.title || ' · thank you for applying.', '/autopilot/open-seats');
  end if;
  update autopilot_queue set status = 'done', decided_by = auth.uid(), decided_at = now() where dedupe = 'seat:' || s.id || ':' || a.user_id and status = 'pending';
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.seat.' || case when p_accept then 'accept' else 'decline' end, 'seat_applications', a.id, '{}');
  perform ap_log('open_seats', case when p_accept then 'Accepted ' else 'Declined ' end || ap_name(a.user_id) || ' for ' || t.title, 'By ' || ap_name(auth.uid()), 'task', t.id);
  return case when p_accept then 'Accepted. They have the task now.' else 'Declined.' end;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Community tasks
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_take_community_task(p_task uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t mission_tasks; m missions; mine integer;
begin
  if not (select community_on from community_settings where id = 1) or ap_level('community_tasks') = 'manual' then raise exception 'Community tasks are off.'; end if;
  select * into t from mission_tasks where id = p_task for update;
  if t.id is null or not t.community_allowed or t.status <> 'open' or t.assignee_id is not null or t.locked then raise exception 'This task is not open.'; end if;
  select count(*) into mine from mission_tasks x where x.assignee_id = auth.uid() and x.community_allowed and x.status in ('accepted', 'changes', 'submitted');
  if mine >= ap_num('community_task_limit') then raise exception 'Finish your open community task first.'; end if;
  select * into m from missions where id = t.mission_id;
  if m.status not in ('planned', 'active') then raise exception 'This mission is not running.'; end if;
  update mission_tasks set assignee_id = auth.uid(), status = 'accepted', updated_at = now() where id = t.id;
  insert into task_offers (task_id, user_id, status, answered_at) values (t.id, auth.uid(), 'accepted', ap_now());
  perform ap_mission_touch(m.id);
  perform ap_log('community_tasks', ap_name(auth.uid()) || ' took "' || t.title || '"', 'Community task', 'task', t.id);
  return 'It is yours. Submit the proof when done.';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Pitches
-- ════════════════════════════════════════════════════════════════════════

-- p_variations: [{key, name, description}], 1–3 of them.
create or replace function ap_pitch_submit(p_title text, p_summary text, p_hub text, p_variations jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; v jsonb; n integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from pitches where pitched_by = auth.uid() and status = 'voting') >= 2 then raise exception 'You already have two pitches in voting.'; end if;
  insert into pitches (title, summary, pitched_by, hub, voting_ends_at)
  values (btrim(p_title), btrim(p_summary), auth.uid(), nullif(p_hub, ''), ap_now() + make_interval(days => ap_num('voting_days')::int))
  returning id into pid;
  for v in select * from jsonb_array_elements(coalesce(p_variations, '[]')) loop
    n := n + 1;
    exit when n > 3;
    insert into pitch_variations (pitch_id, key, name, description) values (pid, coalesce(v ->> 'key', 'v' || n), v ->> 'name', v ->> 'description');
  end loop;
  if n = 0 then insert into pitch_variations (pitch_id, key, name, description) values (pid, 'full', 'As pitched', btrim(p_summary)); end if;
  perform ap_log('pitch_to_mission', ap_name(auth.uid()) || ' pitched "' || btrim(p_title) || '"', 'Voting for ' || ap_num('voting_days') || ' days', 'pitch', pid);
  return pid;
end;
$$;

create or replace function ap_pitch_vote(p_pitch uuid, p_variation text) returns text
language plpgsql security definer set search_path = public as $$
declare p pitches;
begin
  select * into p from pitches where id = p_pitch;
  if p.status <> 'voting' or p.voting_ends_at < ap_now() then raise exception 'Voting is closed.'; end if;
  if p.pitched_by = auth.uid() then raise exception 'You cannot vote for your own pitch.'; end if;
  if not exists (select 1 from pitch_variations where pitch_id = p.id and key = p_variation) then raise exception 'Choose one of the options.'; end if;
  insert into pitch_votes (pitch_id, user_id, variation_key) values (p.id, auth.uid(), p_variation)
  on conflict (pitch_id, user_id) do update set variation_key = excluded.variation_key, created_at = now();
  return 'Vote saved.';
end;
$$;

-- What signed-in members see of pitches: the pitch, the options, the counts and their own vote.
create or replace function ap_pitch_board()
returns table (id uuid, title text, summary text, pitched_by_name text, mine boolean, status text, voting_ends_at timestamptz,
               options jsonb, my_vote text, votes integer)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.summary, ap_name(p.pitched_by), p.pitched_by = auth.uid(), p.status, p.voting_ends_at,
         (select jsonb_agg(jsonb_build_object('key', v.key, 'name', v.name, 'description', v.description,
                 'votes', (select count(*) from pitch_votes x where x.pitch_id = p.id and x.variation_key = v.key)) order by v.key) from pitch_variations v where v.pitch_id = p.id),
         (select x.variation_key from pitch_votes x where x.pitch_id = p.id and x.user_id = auth.uid()),
         (select count(*)::int from pitch_votes x where x.pitch_id = p.id)
  from pitches p
  where auth.uid() is not null and (p.status in ('voting', 'waiting') or p.pitched_by = auth.uid() or p.created_at > now() - interval '30 days')
  order by p.status = 'voting' desc, p.voting_ends_at desc;
$$;

-- A lead approves a pitch: a mission with the chosen playbook and variation, "Pitched by …".
create or replace function ap_pitch_approve(p_pitch uuid, p_playbook uuid, p_variation text, p_date date, p_hubs text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare p pitches; mid uuid; top text;
begin
  select * into p from pitches where id = p_pitch for update;
  if p.status not in ('voting', 'waiting') then raise exception 'Already decided.'; end if;
  if not ap_can('missions.create', coalesce(p_hubs[1], p.hub)) then raise exception 'You may not approve pitches.'; end if;
  select variation_key into top from pitch_votes where pitch_id = p.id group by variation_key order by count(*) desc limit 1;
  mid := ap_create_mission(p_playbook, p_variation, p_date, p.title,
           left(p.summary, 300) || ' · Pitched by ' || ap_name(p.pitched_by) || coalesce(' · members chose: ' || (select name from pitch_variations where pitch_id = p.id and key = top), ''),
           null, nullif(p_hubs, '{}'), 'pitch', null, p.id, 'public');
  update pitches set status = 'approved', mission_id = mid, decided_by = auth.uid() where id = p.id;
  perform ap_notify(p.pitched_by, 'Your pitch is a mission: ' || p.title, 'Pitched by you. Thank you!', '/my-work');
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.pitch.approve', 'pitches', p.id, jsonb_build_object('mission', mid));
  perform ap_log('pitch_to_mission', 'Pitch "' || p.title || '" became a mission', 'Approved by ' || ap_name(auth.uid()), 'mission', mid,
    jsonb_build_object('type', 'cancel_mission', 'mission_id', mid));
  update autopilot_queue set status = 'done', decided_by = auth.uid(), decided_at = now() where dedupe = 'pitch:' || p.id and status = 'pending';
  return mid;
end;
$$;

create or replace function ap_pitch_decline(p_pitch uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare p pitches;
begin
  select * into p from pitches where id = p_pitch for update;
  if not ap_can('missions.create', p.hub) then raise exception 'You may not decide pitches.'; end if;
  update pitches set status = 'declined', decline_reason = left(p_reason, 300), decided_by = auth.uid() where id = p.id;
  perform ap_notify(p.pitched_by, 'Your pitch: not now', coalesce(p_reason, 'Thank you for pitching.'), '/my-work#pitches');
  update autopilot_queue set status = 'skipped', decided_by = auth.uid(), decided_at = now() where dedupe = 'pitch:' || p.id and status = 'pending';
  return 'Declined.';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Rising Talent
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_talent_nominate(p_user uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not (cardinality(ap_lead_hubs(auth.uid())) > 0 or ap_has(auth.uid(), 'mentor') or exists (select 1 from mentors where user_id = auth.uid()) or ap_is_operator()) then
    raise exception 'Only leads and mentors can nominate.';
  end if;
  if ap_is_core_member(p_user) then raise exception 'They are already in the Core team.'; end if;
  insert into talent_suggestions (user_id, kind, reason, nominated_by) values (p_user, 'nomination', 'Nominated by ' || ap_name(auth.uid()) || ': ' || left(p_reason, 300), auth.uid())
  on conflict (user_id) where status = 'pending' do nothing;
  perform ap_suggest('rising_talent', 'talent', 'Rising Talent: ' || ap_name(p_user), 'Nominated by ' || ap_name(auth.uid()),
    jsonb_build_object('user_id', p_user), 'talent:' || p_user, false, null);
  return 'Nominated. An admin decides.';
end;
$$;

-- p_decision: approve | not_now | decline. Approve: p_missions and/or p_group, until p_until (default 8 weeks).
create or replace function ap_talent_decide(p_user uuid, p_decision text, p_missions uuid[], p_group uuid, p_until date) returns text
language plpgsql security definer set search_path = public as $$
declare until date := coalesce(p_until, ap_today() + 7 * ap_num('talent_weeks')::int);
begin
  if not ap_can('talent.approve') then raise exception 'Only admins can decide Rising Talent.'; end if;
  update talent_suggestions set status = case p_decision when 'approve' then 'approved' when 'not_now' then 'not_now' else 'declined' end,
         decided_by = auth.uid(), decided_at = now() where user_id = p_user and status = 'pending';
  update autopilot_queue set status = case when p_decision = 'approve' then 'done' else 'skipped' end, decided_by = auth.uid(), decided_at = now()
  where dedupe = 'talent:' || p_user and status = 'pending';
  if p_decision = 'approve' then
    if coalesce(cardinality(p_missions), 0) = 0 and p_group is null then raise exception 'Choose missions or a Core team.'; end if;
    insert into collaborators (user_id, mission_ids, core_group_id, starts_on, ends_on, approved_by) values (p_user, coalesce(p_missions, '{}'), p_group, ap_today(), until, auth.uid());
    if p_group is not null then
      insert into core_group_members (group_id, user_id, title, is_lead, added_by) values (p_group, p_user, 'Collaborator', false, auth.uid())
      on conflict (group_id, user_id) do nothing;
    end if;
    perform ap_notify(p_user, 'You''re a FusionX Core Collaborator', 'Until ' || to_char(until, 'DD Mon YYYY') || '. Your tasks are in My work.', '/my-work');
  end if;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'autopilot.talent.' || p_decision, 'talent_suggestions', null, jsonb_build_object('user', p_user, 'missions', p_missions, 'group', p_group, 'until', until));
  perform ap_log('rising_talent', initcap(replace(p_decision, '_', ' ')) || ': ' || ap_name(p_user), 'By ' || ap_name(auth.uid()));
  return case p_decision when 'approve' then 'Approved as a Core Collaborator.' when 'not_now' then 'Not now.' else 'Declined.' end;
end;
$$;

-- At the end date: extend, end or shortlist (a note for admins in the next recruitment; nobody is selected automatically).
create or replace function ap_collaborator_end(p_id uuid, p_action text, p_until date default null) returns text
language plpgsql security definer set search_path = public as $$
declare c collaborators;
begin
  if not ap_can('talent.approve') then raise exception 'Only admins can do this.'; end if;
  select * into c from collaborators where id = p_id for update;
  if p_action = 'extend' then
    update collaborators set ends_on = coalesce(p_until, ends_on + 7 * ap_num('talent_weeks')::int), status = 'active' where id = c.id;
  else
    update collaborators set status = 'ended', ends_on = least(ends_on, ap_today()), shortlisted = (p_action = 'shortlist') or shortlisted where id = c.id;
    delete from core_group_members where user_id = c.user_id and group_id = c.core_group_id and title = 'Collaborator';
  end if;
  update autopilot_queue set status = 'done', decided_by = auth.uid(), decided_at = now() where dedupe = 'collab-end:' || c.id and status = 'pending';
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.collaborator.' || p_action, 'collaborators', c.id, '{}');
  return 'Saved.';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Projects
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_project_member(p_project uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (exists (select 1 from projects p where p.id = p_project and p.owner_id = p_user)
    or exists (select 1 from project_members m where m.project_id = p_project and m.user_id = p_user));
$$;

create or replace function ap_project_log(p_project uuid, p_text text) returns void
language sql security definer set search_path = public as $$
  insert into project_activity (project_id, user_id, text) values (p_project, auth.uid(), left(p_text, 300));
$$;

-- Status from progress (unless the owner set it by hand): first milestone → building; all done with a link → completed.
create or replace function ap_project_status(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p projects; total integer; done integer;
begin
  select * into p from projects where id = p_project;
  if p.status_locked then return; end if;
  select count(*), count(done_at) into total, done from project_milestones where project_id = p.id;
  if total > 0 and done = total and (p.github_url is not null or p.demo_url is not null) then
    update projects set status = 'completed', updated_at = now() where id = p.id and status <> 'completed';
  elsif done > 0 and p.status = 'idea' then
    update projects set status = 'building', updated_at = now() where id = p.id;
  end if;
end;
$$;

-- The milestones a plan gives: the Flagship sprint's tasks (by variation), counted back from the target date.
create or replace function ap_project_plan(p_variation text, p_target date)
returns table (plan_key text, title text, due_on date, sort integer)
language sql stable security definer set search_path = public as $$
  select t.key, t.title, t.due_on, t.sort
  from ap_target_tasks((select id from playbooks where slug = 'flagship-project-sprint'), p_variation, p_target, '{}') t
  where t.member_for is null;
$$;

-- Start or change a project's plan. p_variation null: "No plan, I'll add milestones myself".
create or replace function ap_project_set_plan(p_project uuid, p_variation text, p_target date, p_apply boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p projects; active integer; preview jsonb;
begin
  select * into p from projects where id = p_project for update;
  if p.id is null or p.owner_id <> auth.uid() then raise exception 'Only the owner can plan the project.'; end if;
  if not (select projects_on from community_settings where id = 1) then raise exception 'Project tracking is off.'; end if;
  if not p.tracked then
    select count(*) into active from projects where owner_id = auth.uid() and tracked and status not in ('completed');
    if active >= ap_num('project_limit') then raise exception 'You already track % active projects.', active; end if;
  end if;
  with target as (select * from ap_project_plan(p_variation, p_target) where p_variation is not null),
  cur as (select * from project_milestones where project_id = p.id)
  select jsonb_build_object(
    'added', (select coalesce(jsonb_agg(jsonb_build_object('title', t.title, 'due_on', t.due_on) order by t.due_on), '[]') from target t where not exists (select 1 from cur c where c.plan_key = t.plan_key)),
    'removed', (select coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'due_on', c.due_on)), '[]') from cur c where c.plan_key is not null and c.done_at is null and not exists (select 1 from target t where t.plan_key = c.plan_key)),
    'kept', (select coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'status', 'done')), '[]') from cur c where c.done_at is not null),
    'moved', (select coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'from', c.due_on, 'to', t.due_on)), '[]') from cur c join target t on t.plan_key = c.plan_key where c.due_on is distinct from t.due_on and c.done_at is null),
    'people', (select coalesce(jsonb_agg(distinct ap_name(x.assignee_id)), '[]') from project_tasks x where x.project_id = p.id and x.assignee_id is not null and x.done_at is null),
    'notifications', (select count(distinct x.assignee_id) from project_tasks x where x.project_id = p.id and x.assignee_id is not null and x.done_at is null),
    'new_date', p_target, 'variation', coalesce(p_variation, 'none'))
  into preview;
  if not p_apply then return preview; end if;
  delete from project_milestones c where c.project_id = p.id and c.plan_key is not null and c.done_at is null
    and not exists (select 1 from ap_project_plan(p_variation, p_target) t where t.plan_key = c.plan_key and p_variation is not null);
  update project_milestones c set due_on = t.due_on from ap_project_plan(p_variation, p_target) t
  where c.project_id = p.id and c.plan_key = t.plan_key and c.done_at is null and p_variation is not null;
  insert into project_milestones (project_id, title, due_on, sort, plan_key)
  select p.id, t.title, t.due_on, t.sort, t.plan_key from ap_project_plan(p_variation, p_target) t
  where p_variation is not null and not exists (select 1 from project_milestones c where c.project_id = p.id and c.plan_key = t.plan_key);
  update projects set tracked = true, plan_variation = p_variation, target_date = p_target, updated_at = now() where id = p.id;
  perform ap_project_log(p.id, case when p_variation is null then 'Tracking started (own milestones)' else 'Plan: ' || p_variation || ', target ' || to_char(p_target, 'DD Mon') end);
  return preview;
end;
$$;

create or replace function ap_project_milestone(p_project uuid, p_action text, p_id uuid, p_title text, p_due date, p_proof text) returns text
language plpgsql security definer set search_path = public as $$
declare mt project_milestones;
begin
  if not ap_project_member(p_project) then raise exception 'Only the project team can do this.'; end if;
  if p_action = 'add' then
    insert into project_milestones (project_id, title, due_on, sort) values (p_project, btrim(p_title), p_due, 100);
    perform ap_project_log(p_project, 'Milestone added: ' || btrim(p_title));
    update projects set tracked = true where id = p_project and owner_id = auth.uid();
  elsif p_action = 'edit' then
    update project_milestones set title = coalesce(nullif(btrim(p_title), ''), title), due_on = coalesce(p_due, due_on) where id = p_id and project_id = p_project;
  elsif p_action = 'done' then
    if coalesce(p_proof, '') !~* '^https?://\S+$' then raise exception 'Add a proof link for the milestone.'; end if;
    update project_milestones set done_at = now(), proof_url = p_proof where id = p_id and project_id = p_project returning * into mt;
    perform ap_project_log(p_project, 'Milestone done: ' || mt.title);
    perform ap_project_status(p_project);
  elsif p_action = 'reopen' then
    update project_milestones set done_at = null where id = p_id and project_id = p_project;
  elsif p_action = 'delete' then
    delete from project_milestones where id = p_id and project_id = p_project and done_at is null;
  end if;
  return 'Saved.';
end;
$$;

create or replace function ap_project_task(p_project uuid, p_action text, p_id uuid, p_title text, p_milestone uuid, p_assignee uuid, p_due date) returns text
language plpgsql security definer set search_path = public as $$
declare t project_tasks;
begin
  if not ap_project_member(p_project) then raise exception 'Only the project team can do this.'; end if;
  if p_assignee is not null and not ap_project_member(p_project, p_assignee) then raise exception 'Assign it to someone in the project team.'; end if;
  if p_action = 'add' then
    insert into project_tasks (project_id, milestone_id, title, assignee_id, due_on) values (p_project, p_milestone, btrim(p_title), p_assignee, p_due) returning * into t;
    if p_assignee is not null and p_assignee <> auth.uid() then perform ap_notify(p_assignee, 'Project task: ' || t.title, (select title from projects where id = p_project), '/my-work'); end if;
    perform ap_project_log(p_project, 'Task added: ' || t.title);
  elsif p_action = 'done' then
    update project_tasks set done_at = now() where id = p_id and project_id = p_project returning * into t;
    perform ap_project_log(p_project, 'Task done: ' || t.title);
  elsif p_action = 'reopen' then
    update project_tasks set done_at = null where id = p_id and project_id = p_project;
  elsif p_action = 'delete' then
    delete from project_tasks where id = p_id and project_id = p_project;
  end if;
  return 'Saved.';
end;
$$;

-- The owner sets the status by hand (Progress no longer changes it until they unlock it).
create or replace function ap_project_status_set(p_project uuid, p_status project_status, p_lock boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  update projects set status = coalesce(p_status, status), status_locked = p_lock, updated_at = now() where id = p_project and owner_id = auth.uid();
  if not found then raise exception 'Only the owner can do this.'; end if;
  return 'Saved.';
end;
$$;

create or replace function ap_project_support_request(p_project uuid, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare p projects; req uuid;
begin
  select * into p from projects where id = p_project;
  if p.owner_id <> auth.uid() then raise exception 'Only the owner can ask.'; end if;
  if p.mission_id is not null then raise exception 'FusionX already supports it.'; end if;
  insert into project_support_requests (project_id, requested_by, note) values (p.id, auth.uid(), left(p_note, 600)) returning id into req;
  perform ap_suggest('project_support', 'project_support', 'FusionX support for "' || p.title || '"', 'Asked by ' || ap_name(auth.uid()) || coalesce(' · ' || left(p_note, 200), ''),
    jsonb_build_object('request_id', req), 'support:' || p.id, false, 'projects-research-startups');
  perform ap_project_log(p.id, 'Asked for FusionX support');
  return 'Asked. A lead or admin decides.';
end;
$$;

-- Approved: the project gets a mission (Command Center, escalations, reviews); its open tasks become mission tasks,
-- so their work is reviewed and counts. Public outcome only when the admin says so.
create or replace function ap_project_support_decide(p_request uuid, p_approve boolean, p_public boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare r project_support_requests; p projects; mid uuid; t project_tasks; tid uuid;
begin
  select * into r from project_support_requests where id = p_request for update;
  if r.status <> 'pending' then return 'Already decided.'; end if;
  if not ap_can('projects.support', 'projects-research-startups') then raise exception 'You may not approve project support.'; end if;
  select * into p from projects where id = r.project_id for update;
  update project_support_requests set status = case when p_approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now() where id = r.id;
  update autopilot_queue set status = case when p_approve then 'done' else 'skipped' end, decided_by = auth.uid(), decided_at = now() where dedupe = 'support:' || p.id and status = 'pending';
  if not p_approve then
    perform ap_notify(p.owner_id, 'Project support: not now', p.title, '/projects/' || p.id || '/work');
    return 'Declined.';
  end if;
  insert into missions (slug, title, goal, mission_date, owner_id, hubs, visibility, source, source_ref, created_by)
  values (ap_slug(p.title, coalesce(p.target_date, ap_today() + 56)), p.title, left(p.description, 400), coalesce(p.target_date, ap_today() + 56), p.owner_id,
          '{projects-research-startups}', case when p_public then 'public' else 'members' end, 'project', p.id, auth.uid())
  returning id into mid;
  for t in select * from project_tasks where project_id = p.id and done_at is null loop
    insert into mission_tasks (mission_id, sort, title, hub, due_on, assignee_id, status, proof, review)
    values (mid, 50, t.title, 'projects-research-startups', coalesce(t.due_on, coalesce(p.target_date, ap_today() + 56)), t.assignee_id,
            case when t.assignee_id is null then 'open' else 'accepted' end, 'link', 'peer')
    returning id into tid;
    update project_tasks set mission_task_id = tid where id = t.id;
  end loop;
  insert into mission_versions (mission_id, version, snapshot, reason, changed_by) values (mid, 1, ap_snapshot(mid), 'FusionX support approved', auth.uid());
  update projects set mission_id = mid, tracked = true, updated_at = now() where id = p.id;
  perform ap_notify(p.owner_id, 'FusionX supports your project', p.title || ': reviewed work now counts.', '/projects/' || p.id || '/work');
  perform ap_project_log(p.id, 'FusionX support approved by ' || ap_name(auth.uid()));
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.project.support', 'projects', p.id, jsonb_build_object('mission', mid));
  return 'Approved. The project is linked to a mission.';
end;
$$;

-- A supported project's task finishes through its mission task (proof + review), so the project task follows it.
create or replace function ap_sync_project_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update project_tasks set done_at = coalesce(done_at, now()) where mission_task_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_project_task on mission_tasks;
create trigger trg_sync_project_task after update of status on mission_tasks for each row execute function ap_sync_project_task();

-- ════════════════════════════════════════════════════════════════════════
-- The run: new steps (0042's autopilot_tick calls ap_step_people)
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_step_people() returns void
language plpgsql security definer set search_path = public as $$
declare r record; lvl text;
begin
  -- Pitches whose voting ended wait for a lead (a line in Today).
  for r in select * from pitches where status = 'voting' and voting_ends_at <= ap_now() loop
    update pitches set status = 'waiting' where id = r.id;
    if ap_level('pitch_to_mission') <> 'manual' then
      perform ap_suggest('pitch_to_mission', 'pitch', 'Pitch "' || r.title || '": voting ended (' || (select count(*) from pitch_votes where pitch_id = r.id) || ' votes)',
        'Pitched by ' || ap_name(r.pitched_by) || '. Approve it as a mission, or decline.', jsonb_build_object('pitch_id', r.id), 'pitch:' || r.id, false, r.hub);
    end if;
  end loop;
  -- Guests: access ends when the mission is done (+ guest days) or cancelled.
  update mission_guests g set access_until = coalesce(m.updated_at::date, ap_today()) + ap_num('guest_days')::int
  from missions m where m.id = g.mission_id and m.status in ('done', 'cancelled') and g.access_until is null;
  -- Rising Talent suggestions (never access by themselves).
  lvl := ap_level('rising_talent');
  if lvl <> 'manual' and (select talent_on from community_settings where id = 1) then
    for r in
      select c.user_id, count(*) n from contributions c
      where c.counts and not ap_is_core_member(c.user_id)
        and not exists (select 1 from collaborators x where x.user_id = c.user_id and x.status = 'active')
        and not exists (select 1 from talent_suggestions s where s.user_id = c.user_id and (s.status = 'pending' or (s.status in ('declined', 'not_now') and s.decided_at > ap_now() - interval '60 days')))
      group by c.user_id having count(*) >= ap_num('talent_contributions')
    loop
      continue when exists (select 1 from (select r2.status from task_reviews r2 join mission_tasks t on t.id = r2.task_id
                                            where t.assignee_id = r.user_id and r2.status in ('approved', 'changes') order by r2.decided_at desc limit 2) x where x.status = 'changes');
      insert into talent_suggestions (user_id, kind, reason) values (r.user_id, 'contributions', r.n || ' verified contributions, no changes asked in the last two reviews')
      on conflict (user_id) where status = 'pending' do nothing;
      perform ap_suggest('rising_talent', 'talent', 'Rising Talent: ' || ap_name(r.user_id), r.n || ' verified contributions, clean last two reviews',
        jsonb_build_object('user_id', r.user_id), 'talent:' || r.user_id, false, null);
    end loop;
    -- The month's top-voted pitch that became a mission.
    for r in select p.pitched_by user_id, p.title from pitches p
             where p.status = 'approved' and p.created_at >= date_trunc('month', ap_now()) - interval '1 month' and not ap_is_core_member(p.pitched_by)
               and not exists (select 1 from talent_suggestions s where s.user_id = p.pitched_by and s.kind = 'top_pitch' and s.created_at > ap_now() - interval '60 days')
             order by (select count(*) from pitch_votes v where v.pitch_id = p.id) desc limit 1 loop
      insert into talent_suggestions (user_id, kind, reason) values (r.user_id, 'top_pitch', 'Top-voted pitch that became a mission: ' || r.title)
      on conflict (user_id) where status = 'pending' do nothing;
      perform ap_suggest('rising_talent', 'talent', 'Rising Talent: ' || ap_name(r.user_id), 'Top-voted pitch: ' || r.title, jsonb_build_object('user_id', r.user_id), 'talent:' || r.user_id, false, null);
    end loop;
  end if;
  -- Collaborators at their end date: Extend / End / Shortlist in Today; with no decision, access ends.
  for r in select * from collaborators where status = 'active' and ends_on <= ap_today() + 3 loop
    if r.ends_on < ap_today() then
      update collaborators set status = 'ended' where id = r.id;
      delete from core_group_members where user_id = r.user_id and group_id = r.core_group_id and title = 'Collaborator';
      perform ap_log('rising_talent', 'Collaborator access ended: ' || ap_name(r.user_id), 'End date reached', 'user', r.user_id);
    else
      perform ap_suggest('rising_talent', 'collab_end', 'Core Collaborator ' || ap_name(r.user_id) || ' ends ' || to_char(r.ends_on, 'DD Mon'),
        'Extend, end, or shortlist for the next recruitment (admins only see the note).', jsonb_build_object('collaborator_id', r.id), 'collab-end:' || r.id, false, null);
    end if;
  end loop;
  -- Project tasks: reminders 2 days before and on the day (same level as mission reminders).
  if ap_level('reminders') = 'auto' then
    for r in select t.*, p.title ptitle from project_tasks t join projects p on p.id = t.project_id
             where t.done_at is null and t.assignee_id is not null and t.mission_task_id is null and p.tracked
               and ((not t.reminded_before and t.due_on = ap_today() + ap_num('remind_days_before')::int) or (not t.reminded_due and t.due_on = ap_today())) loop
      perform ap_notify(r.assignee_id, case when r.due_on = ap_today() then 'Due today: ' else 'Due soon: ' end || r.title, r.ptitle, '/my-work');
      update project_tasks set reminded_before = reminded_before or r.due_on > ap_today(), reminded_due = reminded_due or r.due_on = ap_today() where id = r.id;
    end loop;
  end if;
end;
$$;

-- autopilot_tick with the people step (as in 0042, one step more).
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
  perform ap_step_messages();
  return jsonb_build_object('paused', false, 'now', ap_now(),
    'logged', (select count(*) from automation_log where run_id = run),
    'suggested', (select count(*) from autopilot_queue where run_id = run));
end;
$$;

-- Collaborators join the pool for their missions (ap_hub_members + their missions).
create or replace function ap_best_person(p_task uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare t mission_tasks; m missions; cap integer; pool text[]; best uuid;
begin
  select * into t from mission_tasks where id = p_task;
  select * into m from missions where id = t.mission_id;
  cap := case when ap_in_exams(ap_today()) then ap_num('load_cap_exams') else ap_num('load_cap') end;
  if t.member_for is not null then
    if not exists (select 1 from task_offers o where o.task_id = t.id and o.user_id = t.member_for and o.status in ('declined', 'swapped', 'expired'))
       and not exists (select 1 from availability a where a.user_id = t.member_for and daterange(a.starts_on, a.ends_on, '[]') && daterange(ap_today(), greatest(t.due_on, ap_today()), '[]'))
    then return t.member_for; end if;
  end if;
  pool := case when t.hub = 'any' then m.hubs else array[t.hub] end;
  select c.user_id into best
  from (select user_id from ap_hub_members(pool)
        union select x.user_id from collaborators x where x.status = 'active' and m.id = any(x.mission_ids)) c
  join profiles p on p.id = c.user_id and p.is_active
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

-- Today: the new kinds carry out as in 0042's ap_queue_decide; this wraps it.
create or replace function ap_queue_decide_people(p_item uuid, p_approve boolean, p_edit jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare q autopilot_queue; p jsonb;
begin
  select * into q from autopilot_queue where id = p_item;
  if q.id is null or q.status <> 'pending' then return 'Already decided.'; end if;
  p := q.payload || coalesce(p_edit, '{}');
  case q.kind
    when 'seat_application' then return ap_seat_decide((p ->> 'application_id')::uuid, p_approve);
    when 'talent' then
      return ap_talent_decide((p ->> 'user_id')::uuid, case when p_approve then 'approve' else coalesce(p ->> 'decision', 'not_now') end,
        array(select jsonb_array_elements_text(coalesce(p -> 'mission_ids', '[]')))::uuid[], (p ->> 'group_id')::uuid, (p ->> 'until')::date);
    when 'collab_end' then return ap_collaborator_end((p ->> 'collaborator_id')::uuid, case when p_approve then coalesce(p ->> 'action', 'extend') else 'end' end, (p ->> 'until')::date);
    when 'project_support' then return ap_project_support_decide((p ->> 'request_id')::uuid, p_approve, coalesce((p ->> 'public')::boolean, false));
    when 'pitch' then
      if not p_approve then return ap_pitch_decline((p ->> 'pitch_id')::uuid, p ->> 'reason'); end if;
      if p ->> 'playbook_id' is null or p ->> 'date' is null then raise exception 'Choose a playbook and a date (Edit).'; end if;
      perform ap_pitch_approve((p ->> 'pitch_id')::uuid, (p ->> 'playbook_id')::uuid, p ->> 'variation_key', (p ->> 'date')::date,
        array(select jsonb_array_elements_text(coalesce(p -> 'hubs', '[]'))));
      return 'Mission created from the pitch.';
    else return ap_queue_decide(p_item, p_approve, p_edit);
  end case;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Recruitment: the read-only "FusionX contributions" box (admins only)
-- ════════════════════════════════════════════════════════════════════════

create or replace function ap_applicant_contributions(p_user uuid)
returns table (title text, mission text, contributed_on date, recommended boolean)
language sql stable security definer set search_path = public as $$
  select c.title, m.title, c.contributed_on, exists (select 1 from collaborators x where x.user_id = p_user and x.shortlisted)
  from contributions c left join missions m on m.id = c.mission_id
  where c.user_id = p_user and c.counts and is_admin()
  order by c.contributed_on desc limit 30;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════

alter table community_settings enable row level security;
alter table open_seats enable row level security;
alter table seat_applications enable row level security;
alter table mission_guests enable row level security;
alter table pitches enable row level security;
alter table pitch_variations enable row level security;
alter table pitch_votes enable row level security;
alter table talent_suggestions enable row level security;
alter table collaborators enable row level security;
alter table project_milestones enable row level security;
alter table project_tasks enable row level security;
alter table project_activity enable row level security;
alter table project_support_requests enable row level security;

drop policy if exists "read community settings" on community_settings;
create policy "read community settings" on community_settings for select to authenticated using (true);
drop policy if exists "center reads seats" on open_seats;
create policy "center reads seats" on open_seats for select using (ap_full_view(mission_id));
drop policy if exists "applications: own and deciders" on seat_applications;
create policy "applications: own and deciders" on seat_applications for select using (
  user_id = auth.uid() or exists (select 1 from open_seats s where s.id = seat_id and ap_full_view(s.mission_id)));
drop policy if exists "guests: own and center" on mission_guests;
create policy "guests: own and center" on mission_guests for select using (user_id = auth.uid() or ap_can_open_center());
drop policy if exists "pitches: own and center" on pitches;
create policy "pitches: own and center" on pitches for select using (pitched_by = auth.uid() or ap_can_open_center());
drop policy if exists "pitch options: with the pitch" on pitch_variations;
create policy "pitch options: with the pitch" on pitch_variations for select using (exists (select 1 from pitches p where p.id = pitch_id and (p.pitched_by = auth.uid() or ap_can_open_center())));
drop policy if exists "votes: own and center" on pitch_votes;
create policy "votes: own and center" on pitch_votes for select using (user_id = auth.uid() or ap_can_open_center());
-- Members never see Rising Talent suggestions.
drop policy if exists "talent: operators" on talent_suggestions;
create policy "talent: operators" on talent_suggestions for select using (ap_is_operator());
drop policy if exists "collaborators: own and operators" on collaborators;
create policy "collaborators: own and operators" on collaborators for select using (user_id = auth.uid() or ap_is_operator());
drop policy if exists "milestones: team, center" on project_milestones;
create policy "milestones: team, center" on project_milestones for select using (ap_project_member(project_id) or ap_can_open_center());
drop policy if exists "project tasks: team, center" on project_tasks;
create policy "project tasks: team, center" on project_tasks for select using (ap_project_member(project_id) or ap_can_open_center());
drop policy if exists "project activity: team, center" on project_activity;
create policy "project activity: team, center" on project_activity for select using (ap_project_member(project_id) or ap_can_open_center());
drop policy if exists "support requests: owner, center" on project_support_requests;
create policy "support requests: owner, center" on project_support_requests for select using (requested_by = auth.uid() or ap_can_open_center());

revoke insert, update, delete on community_settings, open_seats, seat_applications, mission_guests, pitches, pitch_variations, pitch_votes,
  talent_suggestions, collaborators, project_milestones, project_tasks, project_activity, project_support_requests from anon, authenticated;
grant update on community_settings to authenticated;
drop policy if exists "super admin edits community settings" on community_settings;
create policy "super admin edits community settings" on community_settings for update using (is_super_admin()) with check (is_super_admin());

-- Execute rights, for 0042's functions and these: nothing for the public, then the checked entry points.
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
