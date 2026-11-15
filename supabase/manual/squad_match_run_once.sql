-- Squad Match: run ONCE in the Supabase SQL Editor (the same as supabase/migrations/0047_squad_match.sql).
-- Safe to run again: it only adds tables and functions. Then merge the pull request.
begin;
-- Squad Match: members find teammates for a hackathon or competition, by role, without codes.
--   * Start a squad: a one-line idea, your role, the roles you still need (open slots).
--   * Or join the pool: "I can do Backend, I need a team".
--   * Leads see smart picks for each open slot and invite with one tap; pool members see squads that need
--     their role and ask to join; anyone in the pool can start a squad with complementary pool members.
--   * Invites and requests are answered with Accept / Decline (notifications); the lead marks the squad
--     Registered once it has signed up on the official site.
-- Additive only. Tables are read only by signed-in members, and only for published, open opportunities;
-- every change goes through the functions below, which check the caller. Members see each other's name,
-- department, year and skills only: never an email or phone number.

create table if not exists opp_squads (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  lead_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  idea text check (char_length(idea) <= 200),
  roles_needed text[] not null default '{}',
  size_max integer not null default 4 check (size_max between 2 and 8),
  status text not null default 'forming' check (status in ('forming', 'full', 'registered', 'closed')),
  registered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists opp_squads_opp_idx on opp_squads (opportunity_id, status);

create table if not exists opp_squad_members (
  squad_id uuid not null references opp_squads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (char_length(role) between 2 and 40),
  -- member: in the squad · invited: the lead asked them · asked: they asked the lead · declined / left: history
  state text not null check (state in ('member', 'invited', 'asked', 'declined', 'left')),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (squad_id, user_id)
);
create index if not exists opp_squad_members_user_idx on opp_squad_members (user_id, state);

create table if not exists opp_squad_pool (
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (char_length(role) between 2 and 40),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);

alter table opp_squads enable row level security;
alter table opp_squad_members enable row level security;
alter table opp_squad_pool enable row level security;

-- An active member, signed in.
create or replace function ap_squad_member_ok(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from profiles p where p.id = p_user and p.is_active);
$$;

-- A published opportunity whose deadline has not passed (rolling ones stay open).
create or replace function ap_squad_opp_open(p_opp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from opportunities o where o.id = p_opp and o.is_published and o.deleted_at is null
                 and (o.deadline is null or o.deadline >= ap_today() or coalesce(o.rolling, false)));
$$;

drop policy if exists "squads: members read" on opp_squads;
create policy "squads: members read" on opp_squads for select to authenticated using (ap_squad_member_ok() and ap_squad_opp_open(opportunity_id));
drop policy if exists "squad members: members read" on opp_squad_members;
-- Members of a squad are visible to every member; an invite or a request only to that person and the squad's lead.
create policy "squad members: members read" on opp_squad_members for select to authenticated
  using (ap_squad_member_ok() and exists (select 1 from opp_squads s where s.id = squad_id and ap_squad_opp_open(s.opportunity_id)
         and (opp_squad_members.state = 'member' or opp_squad_members.user_id = auth.uid() or s.lead_id = auth.uid())));
drop policy if exists "squad pool: members read" on opp_squad_pool;
create policy "squad pool: members read" on opp_squad_pool for select to authenticated using (ap_squad_member_ok() and ap_squad_opp_open(opportunity_id));

-- The roles a squad can need (the UI offers these; any short text is accepted).
create or replace function ap_squad_roles() returns text[]
language sql immutable as $$
  select array['Frontend', 'Backend', 'AI / ML', 'Design (UI/UX)', 'Data', 'Hardware / IoT', 'Pitch & business', 'Research', 'Video & content', 'Any role'];
$$;

-- The caller's squad (as member or lead) for this opportunity, if any.
create or replace function ap_squad_mine(p_opp uuid, p_user uuid default auth.uid()) returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from opp_squads s join opp_squad_members m on m.squad_id = s.id
  where s.opportunity_id = p_opp and m.user_id = p_user and m.state = 'member' and s.status <> 'closed' limit 1;
$$;

create or replace function ap_squad_refresh(p_squad uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s opp_squads; n integer;
begin
  select * into s from opp_squads where id = p_squad;
  if s.id is null or s.status in ('registered', 'closed') then return; end if;
  select count(*) into n from opp_squad_members where squad_id = p_squad and state = 'member';
  update opp_squads set status = case when n >= s.size_max then 'full' else 'forming' end where id = p_squad;
  if n >= s.size_max then
    -- Full: open invites and requests are closed.
    update opp_squad_members set state = 'declined', decided_at = now() where squad_id = p_squad and state in ('invited', 'asked');
  end if;
end;
$$;

-- Start a squad. The caller becomes its lead and leaves the pool.
create or replace function ap_squad_create(p_opp uuid, p_name text, p_idea text, p_my_role text, p_roles text[], p_size integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; roles text[];
begin
  if not ap_squad_member_ok() then raise exception 'Please sign in as a member.'; end if;
  if not ap_squad_opp_open(p_opp) then raise exception 'This opportunity is closed.'; end if;
  if ap_squad_mine(p_opp) is not null then raise exception 'You are already in a squad for this.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give your squad a name.'; end if;
  if coalesce(trim(p_my_role), '') = '' then raise exception 'Pick your role.'; end if;
  select coalesce(array_agg(distinct left(trim(r), 40)) filter (where trim(r) <> ''), '{}') into roles from unnest(coalesce(p_roles, '{}')) r;
  insert into opp_squads (opportunity_id, lead_id, name, idea, roles_needed, size_max)
  values (p_opp, auth.uid(), left(trim(p_name), 60), nullif(left(trim(coalesce(p_idea, '')), 200), ''), roles, greatest(2, least(coalesce(p_size, 4), 8)))
  returning id into sid;
  insert into opp_squad_members (squad_id, user_id, role, state, decided_at) values (sid, auth.uid(), left(trim(p_my_role), 40), 'member', now());
  delete from opp_squad_pool where opportunity_id = p_opp and user_id = auth.uid();
  return sid;
end;
$$;

-- Join or leave the pool ("I can do this role, I need a team").
create or replace function ap_squad_pool_join(p_opp uuid, p_role text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not ap_squad_member_ok() then raise exception 'Please sign in as a member.'; end if;
  if not ap_squad_opp_open(p_opp) then raise exception 'This opportunity is closed.'; end if;
  if ap_squad_mine(p_opp) is not null then raise exception 'You are already in a squad for this.'; end if;
  if coalesce(trim(p_role), '') = '' then raise exception 'Pick your role.'; end if;
  insert into opp_squad_pool (opportunity_id, user_id, role, note) values (p_opp, auth.uid(), left(trim(p_role), 40), nullif(left(trim(coalesce(p_note, '')), 200), ''))
  on conflict (opportunity_id, user_id) do update set role = excluded.role, note = excluded.note;
  return 'You are in the pool. Squads that need you will see you.';
end;
$$;

create or replace function ap_squad_pool_leave(p_opp uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  delete from opp_squad_pool where opportunity_id = p_opp and user_id = auth.uid();
  return 'You left the pool.';
end;
$$;

-- The lead invites someone for a role.
create or replace function ap_squad_invite(p_squad uuid, p_user uuid, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare s opp_squads;
begin
  select * into s from opp_squads where id = p_squad;
  if s.id is null or s.lead_id <> auth.uid() then raise exception 'Only the squad lead can invite.'; end if;
  if s.status <> 'forming' or not ap_squad_opp_open(s.opportunity_id) then raise exception 'This squad is not taking people now.'; end if;
  if not ap_squad_member_ok(p_user) or p_user = auth.uid() then raise exception 'That person cannot be invited.'; end if;
  if ap_squad_mine(s.opportunity_id, p_user) is not null then raise exception 'They are already in a squad for this.'; end if;
  if exists (select 1 from opp_squad_members where squad_id = p_squad and user_id = p_user and state = 'invited') then return 'Already invited.'; end if;
  insert into opp_squad_members (squad_id, user_id, role, state) values (p_squad, p_user, left(trim(coalesce(p_role, 'Any role')), 40), 'invited')
  on conflict (squad_id, user_id) do update set state = 'invited', role = excluded.role, created_at = now(), decided_at = null
    where opp_squad_members.state in ('declined', 'left', 'asked');
  perform ap_notify(p_user, ap_name(auth.uid()) || ' invited you to the squad ' || s.name,
    'Role: ' || left(trim(coalesce(p_role, 'Any role')), 40) || ' · ' || coalesce((select o.title from opportunities o where o.id = s.opportunity_id), ''), '/opportunities/squad/' || s.opportunity_id);
  return 'Invited. They will get a notification.';
end;
$$;

-- A member asks to join a squad for a role.
create or replace function ap_squad_ask(p_squad uuid, p_role text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare s opp_squads;
begin
  if not ap_squad_member_ok() then raise exception 'Please sign in as a member.'; end if;
  select * into s from opp_squads where id = p_squad;
  if s.id is null or s.status <> 'forming' or not ap_squad_opp_open(s.opportunity_id) then raise exception 'This squad is not taking people now.'; end if;
  if ap_squad_mine(s.opportunity_id) is not null then raise exception 'You are already in a squad for this.'; end if;
  insert into opp_squad_members (squad_id, user_id, role, state, note) values (p_squad, auth.uid(), left(trim(coalesce(p_role, 'Any role')), 40), 'asked', nullif(left(trim(coalesce(p_note, '')), 200), ''))
  on conflict (squad_id, user_id) do update set state = 'asked', role = excluded.role, note = excluded.note, created_at = now(), decided_at = null
    where opp_squad_members.state in ('declined', 'left');
  perform ap_notify(s.lead_id, ap_name(auth.uid()) || ' wants to join your squad ' || s.name, 'Role: ' || left(trim(coalesce(p_role, 'Any role')), 40), '/opportunities/squad/' || s.opportunity_id);
  return 'Request sent to the squad lead.';
end;
$$;

-- Answer an invite (the invited person) or a request (the lead).
create or replace function ap_squad_respond(p_squad uuid, p_user uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare s opp_squads; m opp_squad_members;
begin
  select * into s from opp_squads where id = p_squad;
  select * into m from opp_squad_members where squad_id = p_squad and user_id = p_user;
  if s.id is null or m.user_id is null then raise exception 'Not found.'; end if;
  if m.state = 'invited' and p_user <> auth.uid() then raise exception 'Only the invited person can answer.'; end if;
  if m.state = 'asked' and s.lead_id <> auth.uid() then raise exception 'Only the squad lead can answer.'; end if;
  if m.state not in ('invited', 'asked') then raise exception 'Already answered.'; end if;
  if p_accept then
    if s.status <> 'forming' or not ap_squad_opp_open(s.opportunity_id) then raise exception 'This squad is not taking people now.'; end if;
    if ap_squad_mine(s.opportunity_id, p_user) is not null then raise exception 'Already in a squad for this.'; end if;
    update opp_squad_members set state = 'member', decided_at = now() where squad_id = p_squad and user_id = p_user;
    delete from opp_squad_pool where opportunity_id = s.opportunity_id and user_id = p_user;
    -- One squad per opportunity: other open invites and requests for this person end.
    update opp_squad_members x set state = 'declined', decided_at = now()
      from opp_squads y where y.id = x.squad_id and y.opportunity_id = s.opportunity_id and x.user_id = p_user and x.squad_id <> p_squad and x.state in ('invited', 'asked');
    perform ap_squad_refresh(p_squad);
    perform ap_notify(case when m.state = 'invited' then s.lead_id else p_user end,
      case when m.state = 'invited' then ap_name(p_user) || ' joined your squad ' || s.name else 'You are in the squad ' || s.name end,
      'Role: ' || m.role, '/opportunities/squad/' || s.opportunity_id);
    return 'Welcome to the squad.';
  end if;
  update opp_squad_members set state = 'declined', decided_at = now() where squad_id = p_squad and user_id = p_user;
  return 'Declined.';
end;
$$;

-- Leave a squad. If the lead leaves, the longest-standing member leads; an empty squad closes.
create or replace function ap_squad_leave(p_squad uuid) returns text
language plpgsql security definer set search_path = public as $$
declare s opp_squads; next_lead uuid;
begin
  select * into s from opp_squads where id = p_squad;
  if s.id is null or not exists (select 1 from opp_squad_members where squad_id = p_squad and user_id = auth.uid() and state = 'member') then raise exception 'You are not in this squad.'; end if;
  update opp_squad_members set state = 'left', decided_at = now() where squad_id = p_squad and user_id = auth.uid();
  if s.lead_id = auth.uid() then
    select user_id into next_lead from opp_squad_members where squad_id = p_squad and state = 'member' order by decided_at nulls last, created_at limit 1;
    if next_lead is null then
      update opp_squads set status = 'closed' where id = p_squad;
      update opp_squad_members set state = 'declined', decided_at = now() where squad_id = p_squad and state in ('invited', 'asked');
      return 'You left; the squad is closed.';
    end if;
    update opp_squads set lead_id = next_lead where id = p_squad;
    perform ap_notify(next_lead, 'You now lead the squad ' || s.name, ap_name(auth.uid()) || ' left the squad.', '/opportunities/squad/' || s.opportunity_id);
  end if;
  update opp_squads set status = 'forming' where id = p_squad and status = 'full';
  perform ap_squad_refresh(p_squad);
  return 'You left the squad.';
end;
$$;

-- The lead: Registered on the official site (or back), or close the squad. Roles still needed can change.
create or replace function ap_squad_set(p_squad uuid, p_status text, p_roles text[]) returns text
language plpgsql security definer set search_path = public as $$
declare s opp_squads;
begin
  select * into s from opp_squads where id = p_squad;
  if s.id is null or s.lead_id <> auth.uid() then raise exception 'Only the squad lead can change this.'; end if;
  if p_roles is not null then
    update opp_squads set roles_needed = (select coalesce(array_agg(distinct left(trim(r), 40)) filter (where trim(r) <> ''), '{}') from unnest(p_roles) r) where id = p_squad;
  end if;
  if p_status = 'registered' then
    update opp_squads set status = 'registered', registered_at = now() where id = p_squad;
    update opp_squad_members set state = 'declined', decided_at = now() where squad_id = p_squad and state in ('invited', 'asked');
    perform ap_notify(m.user_id, 'Your squad ' || s.name || ' is registered', 'All the best!', '/opportunities/squad/' || s.opportunity_id)
      from opp_squad_members m where m.squad_id = p_squad and m.state = 'member' and m.user_id <> auth.uid();
    return 'Marked as registered. All the best!';
  elsif p_status = 'forming' then
    update opp_squads set status = 'forming', registered_at = null where id = p_squad and status in ('registered', 'full');
    perform ap_squad_refresh(p_squad);
  elsif p_status = 'closed' then
    update opp_squads set status = 'closed' where id = p_squad;
    update opp_squad_members set state = 'declined', decided_at = now() where squad_id = p_squad and state in ('invited', 'asked');
    return 'Squad closed.';
  end if;
  return 'Saved.';
end;
$$;

-- Everything the squad page shows, in one call: squads with members and open slots, the pool, the caller's
-- state, and smart picks. Ranking: the role fits the slot, shared skills, same department or year, and having
-- worked together before (a shared project). Only name, department, year and skills are returned.
create or replace function ap_squad_board(p_opp uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); mine uuid; my_role text; my_skills text[]; my_dept text; my_year text; out jsonb;
begin
  if not ap_squad_member_ok() or not ap_squad_opp_open(p_opp) then return null; end if;
  mine := ap_squad_mine(p_opp);
  select coalesce(p.skills, '{}'), p.department, p.year into my_skills, my_dept, my_year from profiles p where p.id = me;
  select role into my_role from opp_squad_pool where opportunity_id = p_opp and user_id = me;

  with person as (
    select p.id, p.full_name as name, p.department, p.year, coalesce(p.skills, '{}') as skills, p.avatar_url from profiles p where p.is_active
  ),
  squads as (
    select s.*, (select count(*) from opp_squad_members m where m.squad_id = s.id and m.state = 'member') as size
    from opp_squads s where s.opportunity_id = p_opp and s.status <> 'closed'
  ),
  together as (
    select b.user_id from project_members a join project_members b on b.project_id = a.project_id and b.user_id <> a.user_id where a.user_id = me
  ),
  pool as (
    select q.user_id, q.role, q.note, q.created_at, x.name, x.department, x.year, x.skills, x.avatar_url
    from opp_squad_pool q join person x on x.id = q.user_id where q.opportunity_id = p_opp
  ),
  -- Open slots of my squad (when I lead it): the roles needed that no member holds yet.
  my_open as (
    select r as role from squads s, unnest(s.roles_needed) r
    where s.id = mine and s.lead_id = me and s.status = 'forming'
      and not exists (select 1 from opp_squad_members m where m.squad_id = s.id and m.state = 'member' and lower(m.role) = lower(r))
  ),
  picks as (
    select q.user_id, q.name, q.department, q.year, q.skills, q.avatar_url, q.role, q.note, o.role as for_role,
      (case when lower(q.role) = lower(o.role) then 50 when q.role = 'Any role' or o.role = 'Any role' then 25 else 0 end)
      + 6 * (select count(*) from unnest(q.skills) k where lower(k) in (select lower(z) from unnest(my_skills) z))
      + (case when q.department is not null and q.department = my_dept then 8 else 0 end)
      + (case when q.year is not null and q.year = my_year then 5 else 0 end)
      + (case when q.user_id in (select user_id from together) then 12 else 0 end) as score
    from pool q cross join my_open o
    where not exists (select 1 from opp_squad_members m where m.squad_id = mine and m.user_id = q.user_id and m.state in ('invited', 'member'))
  )
  select jsonb_build_object(
    'me', me, 'my_squad', mine, 'my_pool_role', my_role, 'roles', to_jsonb(ap_squad_roles()),
    'squads', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'idea', s.idea, 'status', s.status, 'size', s.size, 'size_max', s.size_max, 'lead_id', s.lead_id,
        'roles_needed', to_jsonb(s.roles_needed),
        'open_roles', to_jsonb(array(select r from unnest(s.roles_needed) r where not exists (select 1 from opp_squad_members m where m.squad_id = s.id and m.state = 'member' and lower(m.role) = lower(r)))),
        'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'name', x.name, 'department', x.department, 'year', x.year, 'avatar_url', x.avatar_url, 'lead', m.user_id = s.lead_id) order by m.user_id = s.lead_id desc, m.decided_at)
                      from opp_squad_members m join person x on x.id = m.user_id where m.squad_id = s.id and m.state = 'member'), '[]'),
        -- Requests and invites: only for the lead of that squad (and the caller's own row).
        'pending', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'state', m.state, 'note', m.note, 'name', x.name, 'department', x.department, 'year', x.year, 'skills', to_jsonb(x.skills[1:6])))
                      from opp_squad_members m join person x on x.id = m.user_id where m.squad_id = s.id and m.state in ('invited', 'asked') and (s.lead_id = me or m.user_id = me)), '[]'),
        -- For pool members: does this squad need my role?
        'needs_me', my_role is not null and s.status = 'forming' and mine is null and (my_role = 'Any role' or exists (select 1 from unnest(s.roles_needed) r where lower(r) = lower(my_role) or r = 'Any role'))
      ) order by (s.id = mine) desc, s.status = 'forming' desc, s.created_at) from squads s), '[]'),
    'pool', coalesce((select jsonb_agg(jsonb_build_object('user_id', q.user_id, 'role', q.role, 'note', q.note, 'name', q.name, 'department', q.department, 'year', q.year, 'skills', to_jsonb(q.skills[1:6]), 'avatar_url', q.avatar_url) order by q.created_at) from pool q), '[]'),
    'picks', coalesce((select jsonb_agg(y.p order by y.score desc) from (
        select z.p, z.score from (
          select distinct on (user_id) jsonb_build_object('user_id', user_id, 'name', name, 'department', department, 'year', year, 'skills', to_jsonb(skills[1:6]), 'role', role, 'for_role', for_role, 'note', note, 'score', score) as p, score, user_id
          from picks where score >= 25 order by user_id, score desc) z
        order by z.score desc limit 8) y), '[]'),
    -- For a pool member without a squad: others in the pool whose role differs from mine (they complement me).
    'complements', case when my_role is null or mine is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('user_id', q.user_id, 'role', q.role, 'name', q.name, 'department', q.department, 'year', q.year)) from (
        select distinct on (lower(q.role)) q.* from pool q where q.user_id <> me and lower(q.role) <> lower(my_role) order by lower(q.role), q.created_at) q), '[]') end
  ) into out;
  return out;
end;
$$;

-- "Start a squad with these people": the caller (in the pool) starts a squad and invites the chosen pool members.
create or replace function ap_squad_from_pool(p_opp uuid, p_name text, p_idea text, p_people uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare my_role text; sid uuid; u record; roles text[];
begin
  select role into my_role from opp_squad_pool where opportunity_id = p_opp and user_id = auth.uid();
  if my_role is null then raise exception 'Join the pool first.'; end if;
  select coalesce(array_agg(q.role), '{}') into roles from opp_squad_pool q where q.opportunity_id = p_opp and q.user_id = any(coalesce(p_people, '{}')) and q.user_id <> auth.uid();
  sid := ap_squad_create(p_opp, p_name, p_idea, my_role, roles, greatest(2, least(1 + coalesce(array_length(p_people, 1), 0), 8)));
  for u in select q.user_id, q.role from opp_squad_pool q where q.opportunity_id = p_opp and q.user_id = any(coalesce(p_people, '{}')) and q.user_id <> auth.uid() loop
    perform ap_squad_invite(sid, u.user_id, u.role);
  end loop;
  return sid;
end;
$$;

-- How many FusionX squads are forming or going, per opportunity (counts only: safe for the public cards).
create or replace function ap_squad_counts(p_ids uuid[]) returns table (opportunity_id uuid, forming integer, going integer)
language sql stable security definer set search_path = public as $$
  select s.opportunity_id, count(*) filter (where s.status in ('forming', 'full'))::int, count(*) filter (where s.status = 'registered')::int
  from opp_squads s where s.opportunity_id = any(p_ids) and s.status <> 'closed' group by s.opportunity_id;
$$;

-- My work: invites waiting for me, and my squads.
create or replace function ap_squad_my() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invites', coalesce((select jsonb_agg(jsonb_build_object('squad_id', s.id, 'squad', s.name, 'role', m.role, 'lead', ap_name(s.lead_id), 'opportunity_id', o.id, 'opportunity', o.title, 'deadline', o.deadline) order by m.created_at desc)
      from opp_squad_members m join opp_squads s on s.id = m.squad_id join opportunities o on o.id = s.opportunity_id
      where m.user_id = auth.uid() and m.state = 'invited' and s.status = 'forming' and ap_squad_opp_open(o.id)), '[]'),
    'squads', coalesce((select jsonb_agg(jsonb_build_object('squad_id', s.id, 'squad', s.name, 'role', m.role, 'status', s.status, 'lead', s.lead_id = auth.uid(), 'opportunity_id', o.id, 'opportunity', o.title, 'deadline', o.deadline,
        'requests', (select count(*) from opp_squad_members r where r.squad_id = s.id and r.state = 'asked' and s.lead_id = auth.uid())) order by o.deadline nulls last)
      from opp_squad_members m join opp_squads s on s.id = m.squad_id join opportunities o on o.id = s.opportunity_id
      where m.user_id = auth.uid() and m.state = 'member' and s.status <> 'closed' and ap_squad_opp_open(o.id)), '[]'));
$$;

-- Execute rights: new functions are not callable by default; then exactly these.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ap\_squad\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
grant execute on function ap_squad_counts(uuid[]), ap_squad_roles() to anon, authenticated;
grant execute on function ap_squad_member_ok(uuid), ap_squad_opp_open(uuid) to authenticated;
grant execute on function ap_squad_create(uuid, text, text, text, text[], integer), ap_squad_pool_join(uuid, text, text), ap_squad_pool_leave(uuid),
  ap_squad_invite(uuid, uuid, text), ap_squad_ask(uuid, text, text), ap_squad_respond(uuid, uuid, boolean), ap_squad_leave(uuid),
  ap_squad_set(uuid, text, text[]), ap_squad_board(uuid), ap_squad_from_pool(uuid, text, text, uuid[]), ap_squad_my() to authenticated;

commit;
-- Check: select count(*) from opp_squads;  (0 rows at first is right)
