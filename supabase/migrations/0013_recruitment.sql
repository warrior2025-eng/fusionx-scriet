-- Recruitment: students apply individually to FusionX's own teams.
--
-- A cycle has teams and questions. A student keeps one application per cycle
-- (a draft until submitted) with an ordered list of preferred teams. Each
-- preferred team gets its own stage. Team reviewers see only the applications
-- that list their team.
--
-- Applications change only through the functions below, so the deadline, the
-- eligibility rules and "is this team taking applications" are enforced here
-- and not only in the form. A team's WhatsApp link is kept in its own table
-- that only admins can read; a selected candidate gets it through a function.
--
-- Run once, as one piece.

begin;

create type recruitment_cycle_status as enum ('draft', 'open', 'closed', 'results_published');
create type recruitment_question_type as enum ('short_text', 'long_text', 'url', 'single_choice', 'multi_choice', 'file');
create type recruitment_application_status as enum ('draft', 'submitted', 'withdrawn');
create type recruitment_stage as enum ('applied', 'shortlisted', 'task', 'interview', 'selected', 'waitlisted', 'not_selected');

-- ── tables ─────────────────────────────────────────────────────────────
create table recruitment_cycles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text,
  opens_at timestamptz,
  closes_at timestamptz,
  status recruitment_cycle_status not null default 'draft',
  max_preferences integer not null default 2 check (max_preferences between 1 and 4),
  -- empty = open to everyone
  allowed_years text[] not null default '{}',
  allowed_departments text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recruitment_teams (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references recruitment_cycles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null,
  short_description text,
  responsibilities text,
  what_we_look_for text,
  seats integer check (seats is null or seats >= 0),
  emoji text,
  image_path text,
  display_order integer not null default 0,
  is_visible boolean not null default true,
  accepting_applications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, slug)
);

-- The WhatsApp group link, apart from the team row so that no query on
-- recruitment_teams can ever return it.
create table recruitment_team_links (
  team_id uuid primary key references recruitment_teams(id) on delete cascade,
  whatsapp_group_url text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table recruitment_questions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references recruitment_cycles(id) on delete cascade,
  -- null = asked of every applicant
  team_id uuid references recruitment_teams(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 300),
  help_text text,
  type recruitment_question_type not null default 'short_text',
  options jsonb not null default '[]',
  required boolean not null default false,
  max_length integer check (max_length is null or max_length between 1 and 5000),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table recruitment_applications (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references recruitment_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  department text,
  year text,
  preferences uuid[] not null default '{}',
  answers jsonb not null default '{}',
  links jsonb not null default '{}',
  resume_path text,
  status recruitment_application_status not null default 'draft',
  submitted_at timestamptz,
  -- draft-save rate limit
  window_started_at timestamptz not null default now(),
  saves_in_window integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, user_id)
);

create table recruitment_team_status (
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  team_id uuid not null references recruitment_teams(id) on delete cascade,
  rank smallint not null,
  stage recruitment_stage not null default 'applied',
  stage_updated_at timestamptz not null default now(),
  interview_at timestamptz,
  interview_location text,
  final_note text,
  primary key (application_id, team_id)
);
create index idx_recruitment_team_status_team on recruitment_team_status (team_id, stage);

create table recruitment_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  team_id uuid not null references recruitment_teams(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  score smallint check (score is null or score between 1 and 5),
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, team_id, reviewer_id)
);

create table recruitment_team_reviewers (
  team_id uuid not null references recruitment_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table recruitment_message_templates (
  key text primary key check (key in ('submitted', 'shortlisted', 'task', 'interview', 'selected', 'waitlisted', 'not_selected')),
  body text not null check (char_length(body) between 1 and 1000),
  updated_at timestamptz not null default now()
);

-- Short neutral defaults; admins rewrite them in the panel.
-- {name}, {team} and {cycle} are filled in when the message is sent.
insert into recruitment_message_templates (key, body) values
  ('submitted', 'Hi {name}, we received your application for {team} in {cycle}.'),
  ('shortlisted', 'Hi {name}, you have been shortlisted for {team}.'),
  ('task', 'Hi {name}, your application for {team} has moved to the task round.'),
  ('interview', 'Hi {name}, an interview has been scheduled for {team}. The details are on your status page.'),
  ('selected', 'Hi {name}, you have been selected for {team} in {cycle}.'),
  ('waitlisted', 'Hi {name}, you are on the waitlist for {team}.'),
  ('not_selected', 'Hi {name}, thank you for applying to {team}. You were not selected this time.');

create trigger trg_recruitment_cycles_updated_at before update on recruitment_cycles
  for each row execute function set_updated_at();
create trigger trg_recruitment_teams_updated_at before update on recruitment_teams
  for each row execute function set_updated_at();
create trigger trg_recruitment_applications_updated_at before update on recruitment_applications
  for each row execute function set_updated_at();
create trigger trg_recruitment_reviews_updated_at before update on recruitment_reviews
  for each row execute function set_updated_at();

-- ── helpers used by the policies ───────────────────────────────────────
create or replace function is_team_reviewer(p_team uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from recruitment_team_reviewers r where r.team_id = p_team and r.user_id = auth.uid());
$$;

-- Does the caller review a team that this (submitted) application lists?
create or replace function reviews_application(p_application uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from recruitment_team_status s
    join recruitment_team_reviewers r on r.team_id = s.team_id
    join recruitment_applications a on a.id = s.application_id
    where s.application_id = p_application and r.user_id = auth.uid() and a.status = 'submitted'
  );
$$;

create or replace function recruitment_cycle_public(p_cycle uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from recruitment_cycles c where c.id = p_cycle and c.status <> 'draft');
$$;

-- Open for applications right now: status, and inside the window.
create or replace function recruitment_cycle_accepting(p_cycle uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from recruitment_cycles c
    where c.id = p_cycle and c.status = 'open'
      and (c.opens_at is null or now() >= c.opens_at)
      and (c.closes_at is null or now() < c.closes_at)
  );
$$;

-- May the caller read files in this applicant's folder for this cycle?
create or replace function can_read_recruitment_files(p_owner text, p_cycle text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from recruitment_applications a
    join recruitment_team_status s on s.application_id = a.id
    join recruitment_team_reviewers r on r.team_id = s.team_id
    where a.user_id::text = p_owner and a.cycle_id::text = p_cycle
      and a.status = 'submitted' and r.user_id = auth.uid()
  );
$$;

create or replace function recruitment_message(p_key text, p_name text, p_team text, p_cycle text)
returns text language sql security definer stable set search_path = public as $$
  select replace(replace(replace(t.body, '{name}', coalesce(p_name, '')), '{team}', coalesce(p_team, '')), '{cycle}', coalesce(p_cycle, ''))
  from recruitment_message_templates t where t.key = p_key;
$$;

-- Only an admin opens, closes or publishes a cycle; editors may edit its text.
create or replace function guard_recruitment_cycle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and new.status is distinct from old.status then
    raise exception 'Only an admin can open, close or publish a recruitment cycle';
  end if;
  return new;
end $$;
create trigger trg_guard_recruitment_cycle before update on recruitment_cycles
  for each row execute function guard_recruitment_cycle();

-- ── the applicant's own actions ────────────────────────────────────────
-- Saves the draft. p_data: { full_name, department, year, preferences: [team
-- ids in order], answers: { question id: value }, links: {…}, resume_path }.
create or replace function save_recruitment_draft(p_cycle uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); cyc recruitment_cycles%rowtype; app recruitment_applications%rowtype;
  prefs uuid[]; bad integer; path text;
begin
  if uid is null then raise exception 'Please sign in to apply'; end if;
  if not account_active(uid) then raise exception 'This account is deactivated'; end if;
  select * into cyc from recruitment_cycles where id = p_cycle;
  if not found or not recruitment_cycle_accepting(p_cycle) then
    raise exception 'Applications are not open';
  end if;
  if length(p_data::text) > 60000 then raise exception 'This application is too long'; end if;

  select * into app from recruitment_applications where cycle_id = p_cycle and user_id = uid for update;
  if found and app.status = 'submitted' then
    raise exception 'You have already submitted. Withdraw first to make changes';
  end if;
  if found and app.window_started_at > now() - interval '1 minute' and app.saves_in_window >= 40 then
    raise exception 'Too many saves. Wait a moment and try again';
  end if;

  select coalesce(array_agg(value::uuid order by ord), '{}') into prefs
  from jsonb_array_elements_text(coalesce(p_data->'preferences', '[]'::jsonb)) with ordinality as t(value, ord);
  if cardinality(prefs) > cyc.max_preferences then
    raise exception 'You can choose at most % team(s)', cyc.max_preferences;
  end if;
  if cardinality(prefs) <> (select count(distinct x) from unnest(prefs) x) then
    raise exception 'Choose each team only once';
  end if;
  select count(*) into bad from unnest(prefs) x
  where not exists (
    select 1 from recruitment_teams t
    where t.id = x and t.cycle_id = p_cycle and t.is_visible and t.accepting_applications);
  if bad > 0 then raise exception 'One of the chosen teams is not taking applications'; end if;

  -- A file may only point into the caller's own folder for this cycle.
  path := nullif(p_data->>'resume_path', '');
  if path is not null and path not like uid::text || '/' || p_cycle::text || '/%' then
    raise exception 'Invalid file';
  end if;

  insert into recruitment_applications
    (cycle_id, user_id, full_name, department, year, preferences, answers, links, resume_path, status, saves_in_window)
  values
    (p_cycle, uid, left(p_data->>'full_name', 160), left(p_data->>'department', 120), left(p_data->>'year', 40),
     prefs, coalesce(p_data->'answers', '{}'::jsonb), coalesce(p_data->'links', '{}'::jsonb), path, 'draft', 1)
  on conflict (cycle_id, user_id) do update set
    full_name = excluded.full_name, department = excluded.department, year = excluded.year,
    preferences = excluded.preferences, answers = excluded.answers, links = excluded.links,
    resume_path = excluded.resume_path, status = 'draft', submitted_at = null,
    window_started_at = case when recruitment_applications.window_started_at > now() - interval '1 minute'
                             then recruitment_applications.window_started_at else now() end,
    saves_in_window = case when recruitment_applications.window_started_at > now() - interval '1 minute'
                           then recruitment_applications.saves_in_window + 1 else 1 end
  returning * into app;

  -- A withdrawn application that is being edited again starts over.
  delete from recruitment_team_status where application_id = app.id;
  return app.id;
end $$;

create or replace function submit_recruitment_application(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); cyc recruitment_cycles%rowtype; app recruitment_applications%rowtype;
  q record; ans jsonb; team_names text; bad integer;
begin
  if uid is null then raise exception 'Please sign in to apply'; end if;
  if not account_active(uid) then raise exception 'This account is deactivated'; end if;
  select * into cyc from recruitment_cycles where id = p_cycle;
  if not found or not recruitment_cycle_accepting(p_cycle) then
    raise exception 'Applications are not open';
  end if;
  select * into app from recruitment_applications where cycle_id = p_cycle and user_id = uid for update;
  if not found then raise exception 'Start your application first'; end if;
  if app.status = 'submitted' then return jsonb_build_object('status', 'submitted'); end if;

  if coalesce(trim(app.full_name), '') = '' then raise exception 'Add your name'; end if;
  if cardinality(app.preferences) < 1 then raise exception 'Choose at least one team'; end if;
  if cardinality(app.preferences) > cyc.max_preferences then
    raise exception 'You can choose at most % team(s)', cyc.max_preferences;
  end if;
  select count(*) into bad from unnest(app.preferences) x
  where not exists (
    select 1 from recruitment_teams t
    where t.id = x and t.cycle_id = p_cycle and t.is_visible and t.accepting_applications);
  if bad > 0 then raise exception 'One of the chosen teams is not taking applications'; end if;

  -- Eligibility, when the cycle restricts it.
  if cardinality(cyc.allowed_years) > 0
     and not (lower(trim(coalesce(app.year, ''))) = any (select lower(trim(y)) from unnest(cyc.allowed_years) y)) then
    raise exception 'This recruitment is not open to your year';
  end if;
  if cardinality(cyc.allowed_departments) > 0
     and not (lower(trim(coalesce(app.department, ''))) = any (select lower(trim(d)) from unnest(cyc.allowed_departments) d)) then
    raise exception 'This recruitment is not open to your department';
  end if;

  -- Every required question that applies (common, or for a chosen team).
  for q in
    select id, label, type, required, max_length from recruitment_questions
    where cycle_id = p_cycle and (team_id is null or team_id = any (app.preferences))
  loop
    ans := app.answers -> q.id::text;
    if q.required and (
         ans is null or ans = 'null'::jsonb
         or (jsonb_typeof(ans) = 'string' and trim(ans #>> '{}') = '')
         or (jsonb_typeof(ans) = 'array' and jsonb_array_length(ans) = 0)) then
      raise exception 'Please answer: %', q.label;
    end if;
    if q.max_length is not null and jsonb_typeof(ans) = 'string' and char_length(ans #>> '{}') > q.max_length then
      raise exception 'Your answer to "%" is too long', q.label;
    end if;
  end loop;

  update recruitment_applications set status = 'submitted', submitted_at = now() where id = app.id;
  delete from recruitment_team_status where application_id = app.id;
  insert into recruitment_team_status (application_id, team_id, rank)
  select app.id, x, ord::smallint from unnest(app.preferences) with ordinality as t(x, ord);

  select string_agg(t.name, ', ' order by ord) into team_names
  from unnest(app.preferences) with ordinality as p(x, ord) join recruitment_teams t on t.id = p.x;
  insert into notifications (user_id, title, body, link)
  values (uid, 'Application received', recruitment_message('submitted', app.full_name, team_names, cyc.title), '/recruitment/status');

  return jsonb_build_object('status', 'submitted');
end $$;

-- Withdrawing is allowed until results are published.
create or replace function withdraw_recruitment_application(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cyc recruitment_cycles%rowtype; app recruitment_applications%rowtype;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  select * into cyc from recruitment_cycles where id = p_cycle;
  if not found then raise exception 'Recruitment not found'; end if;
  if cyc.status = 'results_published' then raise exception 'Results are already out'; end if;
  select * into app from recruitment_applications where cycle_id = p_cycle and user_id = uid for update;
  if not found or app.status <> 'submitted' then return jsonb_build_object('status', 'withdrawn'); end if;
  update recruitment_applications set status = 'withdrawn' where id = app.id;
  return jsonb_build_object('status', 'withdrawn');
end $$;

-- The applicant's own progress, team by team. A final outcome stays hidden
-- (shown as "in review") until the cycle's results are published.
create or replace function my_recruitment_status(p_cycle uuid)
returns table (team_id uuid, team_name text, rank smallint, stage text, stage_updated_at timestamptz,
               interview_at timestamptz, interview_location text, final_note text, results_out boolean)
language sql security definer stable set search_path = public as $$
  select s.team_id, t.name, s.rank,
         case when c.status <> 'results_published' and s.stage in ('selected', 'waitlisted', 'not_selected')
              then 'in_review' else s.stage::text end,
         s.stage_updated_at,
         case when s.stage = 'interview' or c.status = 'results_published' then s.interview_at end,
         case when s.stage = 'interview' or c.status = 'results_published' then s.interview_location end,
         case when c.status = 'results_published' then s.final_note end,
         c.status = 'results_published'
  from recruitment_applications a
  join recruitment_cycles c on c.id = a.cycle_id
  join recruitment_team_status s on s.application_id = a.id
  join recruitment_teams t on t.id = s.team_id
  where a.cycle_id = p_cycle and a.user_id = auth.uid() and a.status = 'submitted'
  order by s.rank;
$$;

-- ── reviewers and admins ───────────────────────────────────────────────
create or replace function set_recruitment_stage(
  p_application uuid, p_team uuid, p_stage recruitment_stage,
  p_interview_at timestamptz default null, p_interview_location text default null, p_final_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); app recruitment_applications%rowtype; cyc recruitment_cycles%rowtype;
  cur recruitment_team_status%rowtype; team_name text; msg_key text; changed boolean;
begin
  if uid is null or not (is_admin() or is_team_reviewer(p_team)) then raise exception 'FORBIDDEN'; end if;
  select * into cur from recruitment_team_status where application_id = p_application and team_id = p_team for update;
  if not found then raise exception 'This application does not list that team'; end if;
  select * into app from recruitment_applications where id = p_application;
  if app.status <> 'submitted' then raise exception 'This application is not submitted'; end if;
  select * into cyc from recruitment_cycles where id = app.cycle_id;
  select name into team_name from recruitment_teams where id = p_team;

  changed := cur.stage is distinct from p_stage
    or (p_stage = 'interview' and (cur.interview_at is distinct from p_interview_at
                                   or cur.interview_location is distinct from p_interview_location));
  update recruitment_team_status set
    stage = p_stage,
    stage_updated_at = case when cur.stage is distinct from p_stage then now() else stage_updated_at end,
    interview_at = p_interview_at,
    interview_location = nullif(left(p_interview_location, 300), ''),
    final_note = nullif(left(p_final_note, 1000), '')
  where application_id = p_application and team_id = p_team;

  -- A step forward is announced at once. A final outcome is announced when
  -- results are published (or at once, if they already have been).
  msg_key := case
    when p_stage in ('shortlisted', 'task', 'interview') then p_stage::text
    when p_stage in ('selected', 'waitlisted', 'not_selected') and cyc.status = 'results_published' then p_stage::text
  end;
  if changed and msg_key is not null then
    insert into notifications (user_id, title, body, link)
    values (app.user_id, 'Recruitment update', recruitment_message(msg_key, app.full_name, team_name, cyc.title), '/recruitment/status');
  end if;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (uid, 'set_stage', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', team_name || ': ' || cur.stage::text || ' -> ' || p_stage::text));
  return jsonb_build_object('stage', p_stage);
end $$;

create or replace function publish_recruitment_results(p_cycle uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cyc recruitment_cycles%rowtype; r record; sent integer := 0;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into cyc from recruitment_cycles where id = p_cycle for update;
  if not found then raise exception 'Recruitment not found'; end if;
  if cyc.status = 'results_published' then return 0; end if;
  if cyc.status = 'draft' then raise exception 'A draft cannot be published'; end if;
  update recruitment_cycles set status = 'results_published' where id = p_cycle;

  for r in
    select a.user_id, a.full_name, t.name as team_name, s.stage
    from recruitment_team_status s
    join recruitment_applications a on a.id = s.application_id
    join recruitment_teams t on t.id = s.team_id
    where a.cycle_id = p_cycle and a.status = 'submitted'
      and s.stage in ('selected', 'waitlisted', 'not_selected')
  loop
    insert into notifications (user_id, title, body, link)
    values (r.user_id, 'Results are out', recruitment_message(r.stage::text, r.full_name, r.team_name, cyc.title), '/recruitment/status');
    sent := sent + 1;
  end loop;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (uid, 'published_results', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', sent || ' result(s) sent'));
  return sent;
end $$;

-- The team's WhatsApp link: admins, and a candidate selected for that team
-- once results are published. Everyone else gets null.
create or replace function recruitment_whatsapp_link(p_team uuid)
returns text language sql security definer stable set search_path = public as $$
  select l.whatsapp_group_url
  from recruitment_team_links l
  where l.team_id = p_team and (
    is_admin()
    or exists (
      select 1
      from recruitment_team_status s
      join recruitment_applications a on a.id = s.application_id
      join recruitment_cycles c on c.id = a.cycle_id
      where s.team_id = p_team and s.stage = 'selected' and a.user_id = auth.uid()
        and a.status = 'submitted' and c.status = 'results_published'));
$$;

-- Counts for the dashboards (staff, and faculty read-only). Numbers only.
create or replace function recruitment_stats(p_cycle uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not (is_staff() or has_role('faculty')) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'submitted', (select count(*) from recruitment_applications where cycle_id = p_cycle and status = 'submitted'),
    'drafts', (select count(*) from recruitment_applications where cycle_id = p_cycle and status = 'draft'),
    'withdrawn', (select count(*) from recruitment_applications where cycle_id = p_cycle and status = 'withdrawn'),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d) from (
        select (submitted_at at time zone 'Asia/Kolkata')::date as d, count(*) as n
        from recruitment_applications where cycle_id = p_cycle and status = 'submitted' group by 1) x), '[]'::jsonb),
    'by_department', coalesce((select jsonb_agg(jsonb_build_object('label', d, 'count', n) order by n desc) from (
        select coalesce(nullif(trim(department), ''), 'Not given') as d, count(*) as n
        from recruitment_applications where cycle_id = p_cycle and status = 'submitted' group by 1) x), '[]'::jsonb),
    'by_year', coalesce((select jsonb_agg(jsonb_build_object('label', y, 'count', n) order by n desc) from (
        select coalesce(nullif(trim(year), ''), 'Not given') as y, count(*) as n
        from recruitment_applications where cycle_id = p_cycle and status = 'submitted' group by 1) x), '[]'::jsonb),
    'by_team', coalesce((select jsonb_agg(jsonb_build_object('team_id', team_id, 'team', name, 'seats', seats, 'stages', stages) order by display_order) from (
        select t.id as team_id, t.name, t.seats, t.display_order,
               coalesce((select jsonb_object_agg(stage, n) from (
                   select s.stage::text as stage, count(*) as n
                   from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
                   where s.team_id = t.id and a.status = 'submitted' group by 1) g), '{}'::jsonb) as stages
        from recruitment_teams t where t.cycle_id = p_cycle) x), '[]'::jsonb));
end $$;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  save_recruitment_draft(uuid, jsonb), submit_recruitment_application(uuid), withdraw_recruitment_application(uuid),
  my_recruitment_status(uuid), set_recruitment_stage(uuid, uuid, recruitment_stage, timestamptz, text, text),
  publish_recruitment_results(uuid), recruitment_whatsapp_link(uuid), recruitment_stats(uuid),
  recruitment_message(text, text, text, text), guard_recruitment_cycle()
  from public, anon, authenticated;
grant execute on function
  save_recruitment_draft(uuid, jsonb), submit_recruitment_application(uuid), withdraw_recruitment_application(uuid),
  my_recruitment_status(uuid), set_recruitment_stage(uuid, uuid, recruitment_stage, timestamptz, text, text),
  publish_recruitment_results(uuid), recruitment_whatsapp_link(uuid), recruitment_stats(uuid)
  to authenticated;
-- The policy helpers run for whoever is querying, signed in or not.
grant execute on function
  is_team_reviewer(uuid), reviews_application(uuid), recruitment_cycle_public(uuid),
  recruitment_cycle_accepting(uuid), can_read_recruitment_files(text, text)
  to anon, authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table recruitment_cycles enable row level security;
alter table recruitment_teams enable row level security;
alter table recruitment_team_links enable row level security;
alter table recruitment_questions enable row level security;
alter table recruitment_applications enable row level security;
alter table recruitment_team_status enable row level security;
alter table recruitment_reviews enable row level security;
alter table recruitment_team_reviewers enable row level security;
alter table recruitment_message_templates enable row level security;

-- cycles: the public sees everything but drafts; staff write, admins delete drafts
create policy "non-draft cycles are public" on recruitment_cycles for select
  using (status <> 'draft' or is_staff());
create policy "staff create cycles" on recruitment_cycles for insert with check (is_staff());
create policy "staff edit cycles" on recruitment_cycles for update using (is_staff()) with check (is_staff());
create policy "admins delete draft cycles" on recruitment_cycles for delete using (is_admin() and status = 'draft');

-- teams
create policy "visible teams of public cycles are public" on recruitment_teams for select
  using ((is_visible and recruitment_cycle_public(cycle_id)) or is_staff() or is_team_reviewer(id));
create policy "staff create recruitment teams" on recruitment_teams for insert with check (is_staff());
create policy "staff edit recruitment teams" on recruitment_teams for update using (is_staff()) with check (is_staff());
create policy "admins delete recruitment teams" on recruitment_teams for delete using (is_admin());

-- WhatsApp links: admins only (candidates go through recruitment_whatsapp_link)
create policy "admins manage whatsapp links" on recruitment_team_links for all
  using (is_admin()) with check (is_admin());

-- questions
create policy "questions of public cycles are public" on recruitment_questions for select
  using (recruitment_cycle_public(cycle_id) or is_staff());
create policy "staff create questions" on recruitment_questions for insert with check (is_staff());
create policy "staff edit questions" on recruitment_questions for update using (is_staff()) with check (is_staff());
create policy "admins delete questions" on recruitment_questions for delete using (is_admin());

-- applications: read your own; admins; reviewers of a listed team. No direct writes.
create policy "applicants, admins and the team's reviewers read applications" on recruitment_applications for select
  using (user_id = auth.uid() or is_admin() or reviews_application(id));
create policy "admins delete applications" on recruitment_applications for delete using (is_admin());

-- stages: admins, and a reviewer for their own team only. Applicants use my_recruitment_status.
create policy "admins and the team's reviewers read stages" on recruitment_team_status for select
  using (is_admin() or is_team_reviewer(team_id));

-- reviews
create policy "admins and the team's reviewers read reviews" on recruitment_reviews for select
  using (is_admin() or is_team_reviewer(team_id));
create policy "reviewers write their own review" on recruitment_reviews for insert
  with check (
    reviewer_id = auth.uid()
    and (is_admin() or is_team_reviewer(team_id))
    -- the application really lists that team (the stage row is only visible to its reviewers and admins)
    and exists (
      select 1 from recruitment_team_status s
      where s.application_id = recruitment_reviews.application_id and s.team_id = recruitment_reviews.team_id));
create policy "reviewers edit their own review" on recruitment_reviews for update
  using (reviewer_id = auth.uid() and (is_admin() or is_team_reviewer(team_id)))
  with check (reviewer_id = auth.uid() and (is_admin() or is_team_reviewer(team_id)));
create policy "admins delete reviews" on recruitment_reviews for delete using (is_admin());

-- reviewers list
create policy "admins and the reviewer read assignments" on recruitment_team_reviewers for select
  using (is_admin() or user_id = auth.uid());
create policy "admins assign reviewers" on recruitment_team_reviewers for insert with check (is_admin());
create policy "admins remove reviewers" on recruitment_team_reviewers for delete using (is_admin());

-- message templates
create policy "staff read templates" on recruitment_message_templates for select using (is_staff());
create policy "staff edit templates" on recruitment_message_templates for update using (is_staff()) with check (is_staff());

-- ── resumes: private bucket, PDF only, 3MB ─────────────────────────────
-- Path: <user id>/<cycle id>/<file>. An applicant writes only in their own
-- folder and only while that cycle is taking applications.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recruitment-resumes', 'recruitment-resumes', false, 3145728, array['application/pdf'])
on conflict (id) do nothing;

create policy "applicants add their own recruitment files" on storage.objects for insert
  with check (bucket_id = 'recruitment-resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and recruitment_cycle_accepting(nullif((storage.foldername(name))[2], '')::uuid));
create policy "applicants replace their own recruitment files" on storage.objects for update
  using (bucket_id = 'recruitment-resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recruitment-resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and recruitment_cycle_accepting(nullif((storage.foldername(name))[2], '')::uuid));
create policy "applicants and admins delete recruitment files" on storage.objects for delete
  using (bucket_id = 'recruitment-resumes'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
create policy "applicants, admins and the team's reviewers read recruitment files" on storage.objects for select
  using (bucket_id = 'recruitment-resumes'
    and ((storage.foldername(name))[1] = auth.uid()::text
      or is_admin()
      or can_read_recruitment_files((storage.foldername(name))[1], (storage.foldername(name))[2])));

commit;
