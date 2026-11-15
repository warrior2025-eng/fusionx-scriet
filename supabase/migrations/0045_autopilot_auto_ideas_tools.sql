-- 0045: Autopilot, automatic (PR 4): 15 levelled project ideas every Sunday to everyone's My work, accepted ideas
-- become projects, daily opportunities in sections kept until their deadline, a public Tools Library that grows
-- by itself, a pause and a soft delete (7-day restore) for every automation, and FusionX AI refreshes.
--
-- Truth rule as before: nothing invented as fact; everything generated is labelled "auto"; links are checked
-- before anything is shown (in the website's code). Additive only; safe to run again. Needs 0042–0044.

-- ════════════════════════════════════════════════════════════════════════
-- Opportunity categories (new values only; used as text below, so this file runs in one transaction)
-- ════════════════════════════════════════════════════════════════════════
alter type opportunity_category add value if not exists 'fellowship';
alter type opportunity_category add value if not exists 'tech_fest';
alter type opportunity_category add value if not exists 'ideathon';

-- ════════════════════════════════════════════════════════════════════════
-- Control: defaults for the new areas (only where not set yet), numbers, per-feature pauses
-- ════════════════════════════════════════════════════════════════════════
alter table autopilot_settings add column if not exists feature_pauses jsonb not null default '{}'::jsonb;
update autopilot_settings set levels = jsonb_build_object('ideas_members', 'auto', 'opportunities_publish', 'auto', 'tools_daily', 'auto') || levels where id = 1;

insert into autopilot_permissions (action, label, allowed) values
  ('automations.pause', 'Pause automations and delete what they made', '{super_admin,admin}')
on conflict do nothing;

create or replace function ap_feature_paused(p_feature text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.feature_pauses ? p_feature from autopilot_settings s where s.id = 1), false);
$$;

-- On / Paused per automation (ideas, research, opportunities, tools, ai_refresh). Admins (permissions matrix); audit-logged.
create or replace function ap_feature_pause(p_feature text, p_paused boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_feature not in ('ideas', 'research', 'opportunities', 'tools', 'ai_refresh') then raise exception 'Unknown automation.'; end if;
  if not ap_can('automations.pause') then raise exception 'Only admins can pause automations.'; end if;
  update autopilot_settings set feature_pauses = case when p_paused
      then feature_pauses || jsonb_build_object(p_feature, jsonb_build_object('by', auth.uid(), 'name', ap_name(auth.uid()), 'at', now()))
      else feature_pauses - p_feature end, updated_at = now()
  where id = 1;
  insert into audit_logs (user_id, action, resource_type, metadata) values (auth.uid(), 'autopilot.automation.' || case when p_paused then 'pause' else 'resume' end, 'autopilot_settings', jsonb_build_object('feature', p_feature));
  perform ap_log('control', initcap(case when p_paused then 'paused ' else 'resumed ' end) || p_feature, 'By ' || ap_name(auth.uid()));
  return case when p_paused then 'Paused.' else 'On.' end;
end;
$$;

-- FusionX AI re-reads its public knowledge at once (after a publish, hide or delete, and every morning).
create or replace function ap_ai_refresh() returns void
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.ai_settings') is not null then
    execute 'update ai_settings set knowledge_version = knowledge_version + 1 where id = true';
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Ideas: delivered to everyone, levelled, with each member's own choices
-- ════════════════════════════════════════════════════════════════════════
alter table idea_drafts add column if not exists level smallint check (level between 1 and 5);
alter table idea_drafts add column if not exists learn text;
alter table idea_drafts add column if not exists score numeric(3,1);
alter table idea_drafts add column if not exists batch_date date;
alter table idea_drafts add column if not exists published_at timestamptz;
alter table idea_drafts add column if not exists hidden boolean not null default false;
alter table idea_drafts add column if not exists deleted_at timestamptz;
alter table idea_drafts add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table idea_drafts add column if not exists delete_reason text;
-- "published": delivered to everyone's My work.
alter table idea_drafts drop constraint if exists idea_drafts_status_check;
alter table idea_drafts add constraint idea_drafts_status_check check (status in ('draft', 'published', 'saved', 'adopted', 'rejected'));
create index if not exists idx_idea_drafts_batch on idea_drafts (batch_date desc) where deleted_at is null;

create table if not exists idea_member_states (
  idea_id uuid not null references idea_drafts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null check (state in ('saved', 'hidden')),
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

-- Projects started from an idea, or opened by an admin for a team to join.
alter table projects add column if not exists idea_id uuid references idea_drafts(id) on delete set null;
alter table projects add column if not exists open_for_team boolean not null default false;
alter table projects add column if not exists joins_closed boolean not null default false;
alter table projects add column if not exists deleted_at timestamptz;

-- Everyone signed in sees the delivered ideas (never drafts, hidden or deleted ones).
drop policy if exists "members read delivered ideas" on idea_drafts;
create policy "members read delivered ideas" on idea_drafts for select to authenticated
  using (status in ('published', 'saved', 'adopted') and published_at is not null and not hidden and deleted_at is null);
alter table idea_member_states enable row level security;
drop policy if exists "own idea choices" on idea_member_states;
create policy "own idea choices" on idea_member_states for select using (user_id = auth.uid());
revoke insert, update, delete on idea_member_states from anon, authenticated;

create or replace function ap_idea_choice(p_idea uuid, p_state text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from idea_drafts d where d.id = p_idea and d.published_at is not null and d.deleted_at is null and not d.hidden) then raise exception 'This idea is no longer available.'; end if;
  if p_state = 'clear' then delete from idea_member_states where idea_id = p_idea and user_id = auth.uid(); return 'Back in your list.'; end if;
  if p_state not in ('saved', 'hidden') then raise exception 'Unknown choice.'; end if;
  insert into idea_member_states (idea_id, user_id, state) values (p_idea, auth.uid(), p_state)
  on conflict (idea_id, user_id) do update set state = excluded.state, created_at = now();
  return case when p_state = 'saved' then 'Saved for later.' else 'Hidden for you.' end;
end;
$$;

-- "Accept and start": a project owned by the member through the normal project table, published as
-- "In progress · Started by <name>" (the owner can make it private), with a plan from the chosen variation.
-- A research topic becomes the member's research draft and a mission that starts after a mentor approves.
create or replace function ap_idea_accept(p_idea uuid, p_variation text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d idea_drafts; pid uuid; mid uuid; weeks integer; techs text[];
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into d from idea_drafts where id = p_idea and published_at is not null and deleted_at is null and not hidden;
  if d.id is null then raise exception 'This idea is no longer available.'; end if;
  if d.kind = 'research' then
    insert into research (title, abstract, created_by, is_published) values (d.title, d.pitch || E'\n\n' || coalesce(d.data ->> 'question', ''), auth.uid(), false) returning id into pid;
    mid := ap_create_mission((select id from playbooks where slug = 'research-paper'), coalesce(nullif(p_variation, ''), 'paper'), ap_today() + 84, d.title, left(d.pitch, 300),
                             auth.uid(), '{projects-research-startups}', 'idea', null, d.id, 'members');
    update missions set mentor_id = coalesce(d.mentor_id, mentor_id) where id = mid;
    if d.mentor_id is not null then perform ap_notify(d.mentor_id, 'Mentor approval asked: ' || d.title, ap_name(auth.uid()) || ' wants to start this research topic.', '/command/missions?m=' || mid); end if;
    return pid;
  end if;
  techs := array(select btrim(x) from unnest(string_to_array(coalesce(d.data ->> 'stack', ''), ',')) x where btrim(x) <> '' limit 8);
  weeks := case coalesce(nullif(p_variation, ''), 'lite') when 'ambitious' then 12 when 'standard' then 8 else 4 end;
  insert into projects (title, slug, description, owner_id, status, technologies, is_published, idea_id)
  values (d.title, trim(both '-' from regexp_replace(lower(d.title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
          d.pitch || E'\n\n' || coalesce(d.data ->> 'problem', '') || E'\n\n' || coalesce(d.data ->> 'solution', ''), auth.uid(), 'building', techs, true, d.id)
  returning id into pid;
  perform ap_project_set_plan(pid, coalesce(nullif(p_variation, ''), 'lite'), ap_today() + 7 * weeks, true);
  update projects set status = 'building' where id = pid;
  delete from idea_member_states where idea_id = d.id and user_id = auth.uid();
  perform ap_log('idea_projects', ap_name(auth.uid()) || ' started "' || d.title || '"', 'Accepted from My work', 'project', pid);
  perform ap_ai_refresh();
  return pid;
end;
$$;

-- Join a project started from an idea, or an open project (the team limit applies).
create or replace function ap_join_project(p_project uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p projects; n integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into p from projects where id = p_project and deleted_at is null;
  if p.id is null or not p.is_published or not (p.open_for_team or p.idea_id is not null) then raise exception 'This project is not open for joining.'; end if;
  if p.joins_closed then raise exception 'This project has stopped taking new members.'; end if;
  if p.owner_id = auth.uid() or exists (select 1 from project_members m where m.project_id = p.id and m.user_id = auth.uid()) then return 'You are already in this team.'; end if;
  select count(*) into n from project_members where project_id = p.id;
  if n + 1 >= ap_num('project_team_size') then raise exception 'The team is full.'; end if;
  insert into project_members (project_id, user_id, role) values (p.id, auth.uid(), 'contributor');
  perform ap_project_log(p.id, ap_name(auth.uid()) || ' joined the team');
  perform ap_notify(p.owner_id, ap_name(auth.uid()) || ' joined ' || p.title, 'They are in your project team now.', '/projects/' || p.id || '/work');
  return 'You joined the team. It is in My projects.';
end;
$$;

-- Admins: publish an idea to Projects as "Open project · looking for a team" without anyone accepting it.
create or replace function ap_idea_publish_open(p_idea uuid, p_owner uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare d idea_drafts; pid uuid; owner uuid;
begin
  if not ap_can('ideas.adopt') then raise exception 'Only admins can publish ideas to Projects.'; end if;
  select * into d from idea_drafts where id = p_idea and deleted_at is null;
  if d.id is null or d.kind <> 'project' then raise exception 'Only project ideas.'; end if;
  owner := coalesce(p_owner, (select m.user_id from core_group_members m join core_groups g on g.id = m.group_id where g.slug = 'projects-research-startups' and m.is_lead limit 1), auth.uid());
  insert into projects (title, slug, description, owner_id, status, technologies, is_published, idea_id, open_for_team)
  values (d.title, trim(both '-' from regexp_replace(lower(d.title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
          d.pitch || E'\n\n' || coalesce(d.data ->> 'problem', ''), owner, 'idea',
          array(select btrim(x) from unnest(string_to_array(coalesce(d.data ->> 'stack', ''), ',')) x where btrim(x) <> '' limit 8), true, d.id, true)
  returning id into pid;
  update idea_drafts set published_at = coalesce(published_at, now()), status = case when status = 'draft' then 'published' else status end where id = d.id;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.idea.open_project', 'projects', pid, jsonb_build_object('idea', d.id));
  perform ap_ai_refresh();
  return pid;
end;
$$;

-- Public labels for the Projects section: started from an idea, open for a team, how many teams build the same idea.
drop function if exists ap_public_project_meta(uuid[]);
create or replace function ap_public_project_meta(p_ids uuid[])
returns table (project_id uuid, started_by text, from_idea boolean, open_for_team boolean, joins_closed boolean, teams integer)
language sql stable security definer set search_path = public as $$
  select p.id, split_part(coalesce(pr.full_name, ''), ' ', 1), p.idea_id is not null, p.open_for_team, p.joins_closed,
         case when p.idea_id is null then 1 else (select count(*)::int from projects x where x.idea_id = p.idea_id and x.is_published and x.deleted_at is null) end
  from projects p left join profiles pr on pr.id = p.owner_id
  where p.id = any(p_ids) and p.is_published and p.deleted_at is null;
$$;

-- What My work shows for an idea: who started it (public projects only) and the member's own choice.
create or replace function ap_idea_teams(p_ids uuid[])
returns table (idea_id uuid, project_id uuid, started_by text, joinable boolean)
language sql stable security definer set search_path = public as $$
  select p.idea_id, p.id, split_part(coalesce(pr.full_name, ''), ' ', 1), not p.joins_closed
  from projects p left join profiles pr on pr.id = p.owner_id
  where p.idea_id = any(p_ids) and p.is_published and p.deleted_at is null and auth.uid() is not null
  order by p.created_at;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Opportunities: sections, filter fields, kept until the deadline, past list
-- ════════════════════════════════════════════════════════════════════════
alter table opportunities add column if not exists section text;
alter table opportunities add column if not exists region text check (region is null or region in ('near', 'ncr', 'india', 'international'));
alter table opportunities add column if not exists cost text not null default 'not_stated' check (cost in ('free', 'paid', 'not_stated'));
alter table opportunities add column if not exists team_mode text not null default 'not_stated' check (team_mode in ('solo', 'team', 'either', 'not_stated'));
alter table opportunities add column if not exists eligibility_level text not null default 'not_stated' check (eligibility_level in ('first_year', 'any', 'pg', 'not_stated'));
alter table opportunities add column if not exists has_prize boolean not null default false;
alter table opportunities add column if not exists hubs text[] not null default '{}';
alter table opportunities add column if not exists source text not null default 'manual' check (source in ('auto', 'scriet', 'manual'));
alter table opportunities add column if not exists first_published_at timestamptz;
alter table opportunities add column if not exists run_id uuid;
alter table opportunities add column if not exists rolling boolean not null default false;
alter table opportunities add column if not exists closed_at timestamptz;
alter table opportunities add column if not exists hidden boolean not null default false;
alter table opportunities add column if not exists deleted_at timestamptz;
alter table opportunities add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table opportunities add column if not exists delete_reason text;
alter table opportunity_drafts add column if not exists section text;
alter table opportunity_drafts add column if not exists extra jsonb not null default '{}'::jsonb;

-- The section from the category (no mixing): At SCRIET for college ones.
create or replace function ap_opp_section(p_category text, p_source text) returns text
language sql immutable set search_path = public as $$
  select case when p_source = 'scriet' then 'scriet'
    when p_category = 'hackathon' then 'hackathons'
    when p_category = 'competition' then 'competitions'
    when p_category in ('innovation_challenge', 'ideathon') then 'ideathons'
    when p_category = 'internship' then 'internships'
    when p_category in ('scholarship', 'fellowship') then 'fellowships'
    when p_category in ('workshop', 'tech_fest') then 'fests'
    when p_category in ('research', 'conference') then 'research'
    else 'competitions' end;
$$;

create or replace function ap_opp_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.section := ap_opp_section(new.category::text, new.source);
  if new.is_published and new.first_published_at is null then new.first_published_at := now(); end if;
  if new.region is null and new.distance_km is not null then
    new.region := case when new.distance_km <= coalesce(ap_num('near_km'), 100) then 'near' when new.distance_km <= 200 then 'ncr' else 'india' end;
  end if;
  return new;
end $$;
drop trigger if exists trg_opp_fill on opportunities;
create trigger trg_opp_fill before insert or update on opportunities for each row execute function ap_opp_fill();
update opportunities set section = ap_opp_section(category::text, source) where section is null;
update opportunities set first_published_at = coalesce(first_published_at, created_at) where is_published and first_published_at is null;
create index if not exists idx_opportunities_live on opportunities (section, deadline) where is_published;

-- Past their deadline (after that day ends, IST): closed and unpublished. Never earlier, never without a deadline.
create or replace function ap_close_past_opportunities() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update opportunities set status = 'closed', is_published = false, closed_at = now(), updated_at = now()
  where is_published and not rolling and deadline is not null and deadline < (now() at time zone 'Asia/Kolkata')::date;
  get diagnostics n = row_count;
  if n > 0 then perform ap_log('opportunities_publish', 'Closed ' || n || ' opportunities after their deadline', 'Deadline passed'); perform ap_ai_refresh(); end if;
  return n;
end;
$$;

-- Past opportunities (public, collapsed on the page): closed after their deadline in the last 60 days.
create or replace function ap_past_opportunities()
returns table (id uuid, title text, organizer text, section text, deadline date, registration_url text)
language sql stable security definer set search_path = public as $$
  select o.id, o.title, o.organizer, o.section, o.deadline, o.registration_url from opportunities o
  where o.closed_at is not null and o.deleted_at is null and not o.hidden and o.deadline >= (now() at time zone 'Asia/Kolkata')::date - 60
  order by o.deadline desc limit 60;
$$;

-- The radar's checked item becomes a published opportunity (service only: the website checked the link first).
create or replace function ap_publish_radar_item(p_draft uuid, p_run uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare d opportunity_drafts; oid uuid; cat text;
begin
  select * into d from opportunity_drafts where id = p_draft;
  if d.id is null or d.status <> 'draft' or d.deadline < ap_today() then return null; end if;
  -- The same event (name and deadline) is merged, not published twice.
  if exists (select 1 from opportunities o where o.deleted_at is null and lower(regexp_replace(o.title, '[^a-zA-Z0-9]+', '', 'g')) = lower(regexp_replace(d.title, '[^a-zA-Z0-9]+', '', 'g')) and o.deadline = d.deadline) then
    update opportunity_drafts set status = 'published' where id = d.id;
    return null;
  end if;
  cat := coalesce(p ->> 'category', 'hackathon');
  if cat not in ('hackathon', 'competition', 'research', 'internship', 'workshop', 'scholarship', 'conference', 'innovation_challenge', 'fellowship', 'tech_fest', 'ideathon') then cat := 'competition'; end if;
  insert into opportunities (title, organizer, category, description, eligibility, deadline, registration_url, status, is_published, created_by, city, distance_km, mode,
                             value_score, source_checked_on, region, cost, team_mode, eligibility_level, has_prize, hubs, source, run_id)
  values (d.title, d.organiser, cat::opportunity_category,
          concat_ws(E'\n', nullif(d.dates, ''), nullif('Team: ' || d.team_size, 'Team: '), nullif('Fees: ' || d.fees, 'Fees: '), nullif('Prizes: ' || d.prizes, 'Prizes: '),
                    'Source checked automatically: ' || to_char(ap_today(), 'DD Mon YYYY') || ' · auto'),
          coalesce(d.eligibility, 'Not stated'), d.deadline, d.official_link, 'open', true,
          coalesce((select r.user_id from user_roles r where r.role = 'super_admin' order by r.user_id limit 1), (select id from auth.users order by created_at limit 1)),
          d.city, d.distance_km, coalesce(d.mode, 'online'), d.value_score, ap_today(), p ->> 'region',
          coalesce(nullif(p ->> 'cost', ''), 'not_stated'), coalesce(nullif(p ->> 'team_mode', ''), 'not_stated'), coalesce(nullif(p ->> 'eligibility_level', ''), 'not_stated'),
          coalesce((p ->> 'has_prize')::boolean, false), d.hubs, 'auto', p_run)
  returning id into oid;
  update opportunity_drafts set status = 'published', opportunity_id = oid, source_checked_on = ap_today() where id = d.id;
  return oid;
end;
$$;

-- Admins: a college opportunity, published at once in "At SCRIET".
create or replace function ap_add_college_opportunity(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  if not ap_is_operator() then raise exception 'Only admins can add college opportunities.'; end if;
  if coalesce(btrim(p ->> 'title'), '') = '' then raise exception 'Give it a title.'; end if;
  if nullif(p ->> 'deadline', '') is null and not coalesce((p ->> 'rolling')::boolean, false) then raise exception 'Add a deadline, or mark it Rolling.'; end if;
  insert into opportunities (title, organizer, category, description, eligibility, deadline, registration_url, status, is_published, created_by, city, distance_km, mode,
                             region, cost, team_mode, eligibility_level, has_prize, hubs, source, rolling, value_score)
  values (btrim(p ->> 'title'), coalesce(nullif(btrim(p ->> 'organizer'), ''), 'SCRIET'), coalesce(nullif(p ->> 'category', ''), 'workshop')::opportunity_category,
          coalesce(nullif(btrim(p ->> 'description'), ''), btrim(p ->> 'title')), coalesce(nullif(p ->> 'eligibility', ''), 'Not stated'),
          nullif(p ->> 'deadline', '')::date, nullif(p ->> 'link', ''), 'open', true, auth.uid(), 'Meerut', 0, coalesce(nullif(p ->> 'mode', ''), 'offline'),
          'near', coalesce(nullif(p ->> 'cost', ''), 'not_stated'), coalesce(nullif(p ->> 'team_mode', ''), 'not_stated'), coalesce(nullif(p ->> 'eligibility_level', ''), 'any'),
          coalesce((p ->> 'has_prize')::boolean, false), '{}', 'scriet', coalesce((p ->> 'rolling')::boolean, false), 100)
  returning id into oid;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.opportunity.college', 'opportunities', oid, p);
  perform ap_ai_refresh();
  return oid;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Tools Library (public), with a "do not add" list
-- ════════════════════════════════════════════════════════════════════════
create table if not exists tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('code', 'design', 'docs', 'collaboration', 'research', 'data', 'media', 'competitions')),
  what text not null,
  why text not null,
  uses text[] not null,
  steps text[] not null,
  tips text[] not null,
  free_label text not null check (free_label in ('Free', 'Free plan available', 'Check pricing on the official site')),
  official_url text not null check (official_url ~* '^https?://\S+$'),
  docs_url text not null check (docs_url ~* '^https?://\S+$'),
  related text[] not null default '{}',
  status text not null default 'published' check (status in ('published', 'hidden')),
  sort integer not null default 100,
  auto boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists tool_blocklist (
  slug text primary key,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table tools enable row level security;
alter table tool_blocklist enable row level security;
drop policy if exists "published tools are public" on tools;
create policy "published tools are public" on tools for select using ((status = 'published' and deleted_at is null) or ap_is_operator());
drop policy if exists "operators read the blocklist" on tool_blocklist;
create policy "operators read the blocklist" on tool_blocklist for select using (ap_is_operator());
revoke insert, update, delete on tools, tool_blocklist from anon, authenticated;

-- Admins edit, hide, reorder and add tools by hand.
create or replace function ap_tool_save(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare tid uuid := p_id;
begin
  if not ap_can('automations.pause') then raise exception 'Only admins can edit tools.'; end if;
  if tid is null then
    insert into tools (slug, name, category, what, why, uses, steps, tips, free_label, official_url, docs_url, related, auto, sort)
    values (p ->> 'slug', p ->> 'name', p ->> 'category', p ->> 'what', p ->> 'why',
            array(select jsonb_array_elements_text(p -> 'uses')), array(select jsonb_array_elements_text(p -> 'steps')), array(select jsonb_array_elements_text(p -> 'tips')),
            coalesce(p ->> 'free_label', 'Check pricing on the official site'), p ->> 'official_url', p ->> 'docs_url',
            array(select jsonb_array_elements_text(coalesce(p -> 'related', '[]'))), false, coalesce((p ->> 'sort')::int, 100))
    returning id into tid;
  else
    update tools set name = coalesce(p ->> 'name', name), category = coalesce(p ->> 'category', category), what = coalesce(p ->> 'what', what), why = coalesce(p ->> 'why', why),
      uses = case when p ? 'uses' then array(select jsonb_array_elements_text(p -> 'uses')) else uses end,
      steps = case when p ? 'steps' then array(select jsonb_array_elements_text(p -> 'steps')) else steps end,
      tips = case when p ? 'tips' then array(select jsonb_array_elements_text(p -> 'tips')) else tips end,
      free_label = coalesce(p ->> 'free_label', free_label), official_url = coalesce(p ->> 'official_url', official_url), docs_url = coalesce(p ->> 'docs_url', docs_url),
      status = coalesce(p ->> 'status', status), sort = coalesce((p ->> 'sort')::int, sort), auto = false, updated_at = now()
    where id = tid;
  end if;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata) values (auth.uid(), 'autopilot.tool.save', 'tools', tid, '{}');
  perform ap_ai_refresh();
  return tid;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Hide, soft delete (7-day restore) and purge, for ideas, opportunities, tools and open projects
-- ════════════════════════════════════════════════════════════════════════
create or replace function ap_content_action(p_kind text, p_ids uuid[], p_action text, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare closed integer := 0;
begin
  if not ap_can('automations.pause') then raise exception 'Only admins can hide or delete.'; end if;
  if p_kind = 'idea' then
    if p_action = 'delete' then update idea_drafts set deleted_at = now(), deleted_by = auth.uid(), delete_reason = p_reason where id = any(p_ids) and deleted_at is null;
    elsif p_action = 'restore' then update idea_drafts set deleted_at = null, deleted_by = null, delete_reason = null where id = any(p_ids) and deleted_at > now() - interval '7 days';
    elsif p_action = 'hide' then update idea_drafts set hidden = true where id = any(p_ids);
    elsif p_action = 'show' then update idea_drafts set hidden = false where id = any(p_ids);
    end if;
  elsif p_kind = 'opportunity' then
    if p_action = 'delete' then update opportunities set deleted_at = now(), deleted_by = auth.uid(), delete_reason = p_reason, is_published = false where id = any(p_ids) and deleted_at is null;
    elsif p_action = 'restore' then update opportunities set deleted_at = null, deleted_by = null, delete_reason = null, is_published = (deadline is null or deadline >= ap_today()) and not hidden where id = any(p_ids) and deleted_at > now() - interval '7 days';
    elsif p_action = 'hide' then update opportunities set hidden = true, is_published = false where id = any(p_ids);
    elsif p_action = 'show' then update opportunities set hidden = false, is_published = (deadline is null or deadline >= ap_today()) and deleted_at is null where id = any(p_ids);
    end if;
  elsif p_kind = 'tool' then
    if p_action = 'delete' then
      update tools set deleted_at = now(), deleted_by = auth.uid(), delete_reason = p_reason where id = any(p_ids) and deleted_at is null;
      insert into tool_blocklist (slug, added_by) select slug, auth.uid() from tools where id = any(p_ids) on conflict do nothing;
    elsif p_action = 'restore' then
      delete from tool_blocklist where slug in (select slug from tools where id = any(p_ids));
      update tools set deleted_at = null, deleted_by = null, delete_reason = null where id = any(p_ids) and deleted_at > now() - interval '7 days';
    elsif p_action = 'hide' then update tools set status = 'hidden' where id = any(p_ids);
    elsif p_action = 'show' then update tools set status = 'published' where id = any(p_ids);
    end if;
  elsif p_kind = 'project' then
    -- Open projects from ideas: deleted only while nobody joined; otherwise closed to new joins.
    if p_action = 'delete' then
      update projects p set deleted_at = now(), is_published = false where p.id = any(p_ids) and p.open_for_team and not exists (select 1 from project_members m where m.project_id = p.id);
      update projects p set joins_closed = true where p.id = any(p_ids) and p.open_for_team and exists (select 1 from project_members m where m.project_id = p.id);
      get diagnostics closed = row_count;
    elsif p_action = 'close' then update projects set joins_closed = true where id = any(p_ids);
    elsif p_action = 'restore' then update projects set deleted_at = null, is_published = true where id = any(p_ids) and deleted_at > now() - interval '7 days';
    end if;
  else raise exception 'Unknown kind.';
  end if;
  insert into audit_logs (user_id, action, resource_type, metadata) values (auth.uid(), 'autopilot.' || p_kind || '.' || p_action, p_kind, jsonb_build_object('ids', p_ids, 'reason', p_reason));
  perform ap_log('control', initcap(p_action) || ' ' || coalesce(array_length(p_ids, 1), 0) || ' ' || p_kind || '(s)', coalesce(p_reason, 'By ' || ap_name(auth.uid())));
  perform ap_ai_refresh();
  if p_action = 'delete' and closed > 0 then return 'People had already joined, so it is closed to new joins instead of deleted.'; end if;
  if p_action = 'delete' then return 'Deleted. You can restore it for 7 days.'; end if;
  return 'Done.';
end;
$$;

-- A whole Sunday batch of ideas, or every opportunity from one morning run.
create or replace function ap_delete_batch(p_kind text, p_key text, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'ideas' then
    return ap_content_action('idea', array(select id from idea_drafts where batch_date = p_key::date and deleted_at is null), 'delete', p_reason);
  elsif p_kind = 'opportunities' then
    return ap_content_action('opportunity', array(select id from opportunities where run_id = p_key::uuid and deleted_at is null), 'delete', p_reason);
  end if;
  raise exception 'Unknown batch.';
end;
$$;

-- After 7 days, deleted things go for good (started projects stay; their idea link shows "Idea removed").
create or replace function ap_purge_deleted() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; k integer;
begin
  delete from opportunities where deleted_at < now() - interval '7 days'; get diagnostics k = row_count; n := n + k;
  delete from tools where deleted_at < now() - interval '7 days'; get diagnostics k = row_count; n := n + k;
  delete from projects where deleted_at < now() - interval '7 days' and open_for_team and not exists (select 1 from project_members m where m.project_id = projects.id); get diagnostics k = row_count; n := n + k;
  delete from idea_drafts d where d.deleted_at < now() - interval '7 days'; get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;

-- Ideas: everyone signed in is told once when a batch is delivered (preferences respected).
create or replace function ap_notify_everyone(p_title text, p_body text, p_link text) returns integer
language plpgsql security definer set search_path = public as $$
declare u record; n integer := 0;
begin
  for u in select p.id from profiles p join auth.users a on a.id = p.id where p.is_active loop
    perform ap_notify(u.id, p_title, p_body, p_link);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Seed: the first 12 tools (hand-checked: official and learn links load; no prices)
-- ════════════════════════════════════════════════════════════════════════
insert into tools (slug, name, category, what, why, uses, steps, tips, free_label, official_url, docs_url, related, sort, auto) values
('github', 'GitHub', 'code', 'A website where code lives online, with its full history, so a team can work on it together.',
 'Almost every software team, hackathon and open-source project uses it; a GitHub profile is also how others see your work.',
 '{"Keeping your project code safe online","Working on the same code with teammates","Showing your projects in a portfolio"}',
 '{"Create a free account on github.com","Make a new repository for your project","Add your files (upload them, or push them with Git)","Write a README that says what the project does","Invite teammates as collaborators"}',
 '{"Commit small changes often, with clear messages","Never put passwords or API keys in a repository","Pin your best repositories on your profile"}',
 'Free plan available', 'https://github.com', 'https://docs.github.com', '{git,markdown,vs-code}', 1, false),
('git', 'Git', 'code', 'A tool on your computer that records every change to your files, so you can go back or work in parallel.',
 'It is the standard way to track code changes, and GitHub, GitLab and most teams are built around it.',
 '{"Saving versions of your work as you go","Trying ideas on a branch without breaking the main code","Merging teammates'' work"}',
 '{"Install Git from git-scm.com","Set your name and email with git config","Run git init in your project folder","Save a version with git add and git commit","Connect to GitHub and git push your work"}',
 '{"Read git status before every commit","Make one branch per feature","Learn git log to see what changed"}',
 'Free', 'https://git-scm.com', 'https://git-scm.com/doc', '{github,vs-code}', 2, false),
('markdown', 'Markdown', 'docs', 'A simple way to format text with symbols like # for headings and * for lists.',
 'README files, GitHub, Notion and many note apps use it, so one small skill works in many places.',
 '{"Writing README files","Formatting notes and documentation","Writing clear issue and pull request descriptions"}',
 '{"Open any .md file or a GitHub comment box","Write # Heading for a title","Use - or * at the start of a line for a list","Wrap words in **double stars** for bold","Add a link with [text](https://example.com)"}',
 '{"Leave an empty line between paragraphs","Use backticks for code","Preview before you publish"}',
 'Free', 'https://www.markdownguide.org', 'https://www.markdownguide.org/basic-syntax/', '{github,notion}', 3, false),
('vs-code', 'VS Code', 'code', 'A free code editor from Microsoft that works for almost every programming language.',
 'It is one of the most used editors, with extensions for every language and built-in Git.',
 '{"Writing and running code","Working with Git from the editor","Editing Markdown, HTML and config files"}',
 '{"Download it from code.visualstudio.com","Open your project folder with File → Open Folder","Install the extension for your language","Open the built-in terminal from the View menu","Use the Source Control panel to commit"}',
 '{"Learn Ctrl+P to open files fast","Turn on Format on Save","Keep only the extensions you use"}',
 'Free', 'https://code.visualstudio.com', 'https://code.visualstudio.com/docs', '{git,github}', 4, false),
('figma', 'Figma', 'design', 'A design tool in the browser for screens, posters and prototypes, made for working together.',
 'Most app and web design is done in Figma, and teams can comment on the same file at the same time.',
 '{"Designing app and website screens","Making clickable prototypes","Sharing designs for feedback"}',
 '{"Sign up on figma.com","Create a new design file","Add a frame for your screen size","Add text, shapes and images","Share the file link with your team"}',
 '{"Use Auto Layout for neat spacing","Keep colours and fonts as styles","Name your layers"}',
 'Free plan available', 'https://www.figma.com', 'https://help.figma.com', '{canva}', 5, false),
('canva', 'Canva', 'design', 'An easy online design tool with templates for posters, social posts and slides.',
 'It is the quickest way for anyone to make a good-looking poster or post without design training.',
 '{"Event posters","Social media posts","Simple presentations"}',
 '{"Sign up on canva.com","Search for a template (for example, poster)","Replace the text and images with yours","Keep the club colours and logo","Download as PNG or PDF"}',
 '{"Keep one main message per poster","Check text is readable on a phone","Use the same fonts every time"}',
 'Free plan available', 'https://www.canva.com', 'https://www.canva.com/designschool/', '{figma}', 6, false),
('notion', 'Notion', 'docs', 'An all-in-one workspace for notes, documents, task lists and simple databases.',
 'Teams use it to keep plans, meeting notes and project pages in one place.',
 '{"Meeting notes","Project plans and to-do lists","A shared team wiki"}',
 '{"Sign up on notion.com","Create a new page","Type / to add headings, lists or tables","Share the page with your team","Use a template for meeting notes"}',
 '{"Keep one page per project","Link related pages together","Use a database for task lists"}',
 'Free plan available', 'https://www.notion.com', 'https://www.notion.com/help', '{markdown,google-workspace}', 7, false),
('slack', 'Slack', 'collaboration', 'A team chat app with channels for topics, projects and teams.',
 'Many companies and open-source communities talk on Slack, so knowing it helps in internships.',
 '{"Team chat by topic","Sharing files and links","Joining community workspaces"}',
 '{"Download Slack or open it in the browser","Join a workspace from an invite link","Join the channels for your work","Use threads to reply to a message","Set your notification preferences"}',
 '{"Reply in threads to keep channels tidy","Use @mentions only when needed","Pin important messages"}',
 'Free plan available', 'https://slack.com', 'https://slack.com/help', '{notion}', 8, false),
('google-workspace', 'Google Workspace (Docs, Sheets, Forms, Drive)', 'docs', 'Google''s online apps for documents, spreadsheets, forms and file storage.',
 'Colleges, clubs and companies use them to write, collect responses and share files together.',
 '{"Writing documents together in Docs","Tracking lists and data in Sheets","Collecting registrations with Forms"}',
 '{"Sign in with a Google account","Open drive.google.com","Create a Doc, Sheet or Form with New","Click Share and add your team","Use comments for feedback"}',
 '{"Keep files in shared folders","Use version history to undo mistakes","Link a Form to a Sheet for responses"}',
 'Free plan available', 'https://workspace.google.com', 'https://support.google.com/docs', '{notion}', 9, false),
('postman', 'Postman', 'code', 'An app for sending requests to APIs and seeing their responses.',
 'It makes testing and understanding APIs easy, which almost every web or app project needs.',
 '{"Testing your own API","Trying public APIs before coding","Sharing API examples with a team"}',
 '{"Sign up on postman.com","Create a new request","Paste the API URL and choose GET or POST","Add headers or a body if the API needs them","Send and read the response"}',
 '{"Save requests in collections","Use environment variables for keys","Never share secret keys in shared collections"}',
 'Free plan available', 'https://www.postman.com', 'https://learning.postman.com', '{vs-code}', 10, false),
('overleaf', 'Overleaf', 'research', 'An online LaTeX editor for writing research papers and reports together.',
 'Most research papers and many conference templates use LaTeX, and Overleaf needs no installation.',
 '{"Writing research papers","Using conference templates","Writing with co-authors"}',
 '{"Sign up on overleaf.com","Start from a template (for example, a conference paper)","Write in the left pane and see the PDF on the right","Add references with a .bib file","Share the project with co-authors"}',
 '{"Compile often to catch errors early","Use the template the venue asks for","Keep figures in a folder"}',
 'Free plan available', 'https://www.overleaf.com', 'https://www.overleaf.com/learn', '{google-colab}', 11, false),
('google-colab', 'Google Colab', 'data', 'Free Python notebooks in the browser, run on Google''s computers.',
 'You can learn data science and machine learning without installing anything, and share notebooks easily.',
 '{"Learning Python","Data analysis and charts","Trying machine learning models"}',
 '{"Open colab.research.google.com with a Google account","Create a new notebook","Write Python in a cell and press Shift+Enter","Upload a data file or read it from Drive","Share the notebook link"}',
 '{"Save a copy to your Drive","Write notes in text cells","Restart the runtime if things get stuck"}',
 'Free plan available', 'https://colab.research.google.com', 'https://research.google.com/colaboratory/faq.html', '{github}', 12, false)
on conflict (slug) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Execute rights: as before for every Autopilot function, plus these
-- ════════════════════════════════════════════════════════════════════════
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
grant execute on function ap_public_project_meta(uuid[]), ap_past_opportunities(), ap_opp_section(text, text) to anon, authenticated;
grant execute on function ap_feature_pause(text, boolean), ap_feature_paused(text), ap_idea_choice(uuid, text), ap_idea_accept(uuid, text), ap_join_project(uuid),
  ap_idea_publish_open(uuid, uuid), ap_idea_teams(uuid[]), ap_add_college_opportunity(jsonb), ap_tool_save(uuid, jsonb), ap_content_action(text, uuid[], text, text),
  ap_delete_batch(text, text, text) to authenticated;
grant execute on function ap_close_past_opportunities(), ap_publish_radar_item(uuid, uuid, jsonb), ap_purge_deleted(), ap_notify_everyone(text, text, text), ap_ai_refresh() to service_role;
