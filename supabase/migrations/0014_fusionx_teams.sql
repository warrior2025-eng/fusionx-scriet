-- FusionX Teams: student teams register on the site and staff verify them.
--
-- Extends the existing teams / team_members tables. Joining now always goes
-- through the functions below (an invite, or a request the leader approves),
-- which check the size limit, the team's status, and how many teams one
-- student may be in. The old direct-insert policies on team_members are
-- removed. The limits live in site_content ('teams.settings'), so admins
-- change them from the panel.
--
-- Also: the Join form gets a deadline ('join.settings').
--
-- Run once, as one piece.

begin;

create type team_verification as enum ('pending', 'verified', 'rejected');

alter table teams
  add column team_type text not null default 'new' check (team_type in ('existing', 'new')),
  add column focus text,
  add column project_title text,
  add column project_summary text,
  add column github_url text,
  add column demo_url text,
  add column looking_for_members boolean not null default false,
  add column max_size integer check (max_size is null or max_size between 1 and 50),
  add column verification_status team_verification not null default 'pending',
  add column verified_by uuid references auth.users(id) on delete set null,
  add column verified_at timestamptz,
  add column leader_id uuid references auth.users(id),
  add column is_featured boolean not null default false;

-- Teams that already exist keep showing: they were listed before this change.
update teams set leader_id = created_by, verification_status = 'verified';
alter table teams alter column leader_id set not null;
create index idx_teams_verification on teams (verification_status, status);

-- Staff-only note about a team (kept off the team row, which members can read).
create table team_admin_notes (
  team_id uuid primary key references teams(id) on delete cascade,
  note text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Private links (the FusionX Teams WhatsApp group). Admins only; members of a
-- verified team read it through fusionx_teams_whatsapp().
create table private_links (
  key text primary key,
  url text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users(id) on delete set null,
  -- 244 random bits; the link is the only way to use an invite
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index idx_team_invites_team on team_invites (team_id, status);
create index idx_team_invites_email on team_invites (lower(email));

create table team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now()
);
create unique index idx_team_join_requests_one_pending on team_join_requests (team_id, user_id) where status = 'pending';

create table team_focus_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 60),
  display_order integer not null default 0,
  is_visible boolean not null default true
);
insert into team_focus_categories (name, display_order) values
  ('Project', 1), ('Research', 2), ('Hackathon/Competition', 3), ('Startup', 4), ('Other', 5);

-- ── settings (site_content 'teams.settings') ───────────────────────────
create or replace function team_setting_int(p_key text, p_default integer)
returns integer language sql security definer stable set search_path = public as $$
  select coalesce((
    select case when value ->> p_key ~ '^[0-9]{1,4}$' then (value ->> p_key)::integer end
    from site_content where key = 'teams.settings'), p_default);
$$;

create or replace function teams_registration_open()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select coalesce((value ->> 'registrationOpen')::boolean, true)
       and (coalesce(value ->> 'deadline', '') = '' or now() < (value ->> 'deadline')::timestamptz)
    from site_content where key = 'teams.settings'), true);
$$;

-- ── helpers used by the policies (definer, so the policies cannot loop) ─
create or replace function is_team_member(p_team uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from team_members m where m.team_id = p_team and m.user_id = auth.uid());
$$;

create or replace function is_team_leader(p_team uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from teams t where t.id = p_team and t.leader_id = auth.uid());
$$;

-- A signed-in person sees verified teams, and their own teams whatever the state.
create or replace function can_see_team(p_team uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select is_staff() or (auth.uid() is not null and exists (
    select 1 from teams t
    where t.id = p_team
      and (t.verification_status = 'verified' or t.leader_id = auth.uid() or t.created_by = auth.uid()
           or exists (select 1 from team_members m where m.team_id = t.id and m.user_id = auth.uid()))));
$$;

-- Teams a person counts against their limit: running ones that were not rejected.
create or replace function user_team_count(p_user uuid)
returns integer language sql security definer stable set search_path = public as $$
  select count(*)::integer
  from team_members m join teams t on t.id = m.team_id
  where m.user_id = p_user and t.status in ('forming', 'active') and t.verification_status <> 'rejected';
$$;

create or replace function team_capacity(p_team uuid)
returns integer language sql security definer stable set search_path = public as $$
  select least(coalesce(t.max_size, team_setting_int('maxSize', 6)), team_setting_int('maxSize', 6))
  from teams t where t.id = p_team;
$$;

-- Raises unless p_user can become a member of the team right now.
create or replace function assert_can_join_team(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t teams%rowtype;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if t.status in ('completed', 'archived') then raise exception 'This team is no longer taking members'; end if;
  if t.verification_status = 'rejected' then raise exception 'This team is not active'; end if;
  if exists (select 1 from team_members where team_id = p_team and user_id = p_user) then
    raise exception 'Already a member of this team';
  end if;
  if (select count(*) from team_members where team_id = p_team) >= team_capacity(p_team) then
    raise exception 'This team is full';
  end if;
  if user_team_count(p_user) >= team_setting_int('maxTeamsPerUser', 2) then
    raise exception 'A student can be in at most % teams at once', team_setting_int('maxTeamsPerUser', 2);
  end if;
end $$;

-- Creates one invite and tells the person if they already have an account. Internal.
create or replace function create_team_invite(p_team uuid, p_email text, p_inviter uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare mail text := lower(trim(p_email)); target uuid; invite_id uuid; tok text; team_name text;
begin
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(mail) > 254 then
    raise exception 'That does not look like an email address: %', left(p_email, 60);
  end if;
  select id into target from auth.users where lower(email) = mail limit 1;
  if target is not null and exists (select 1 from team_members where team_id = p_team and user_id = target) then
    return null;                                  -- already on the team
  end if;
  update team_invites set status = 'expired' where team_id = p_team and status = 'pending' and expires_at < now();
  select id into invite_id from team_invites where team_id = p_team and lower(email) = mail and status = 'pending';
  if invite_id is not null then return invite_id; end if;   -- already invited

  if (select count(*) from team_members where team_id = p_team)
     + (select count(*) from team_invites where team_id = p_team and status = 'pending') >= team_capacity(p_team) then
    raise exception 'This team has no room for more invites';
  end if;

  insert into team_invites (team_id, email, invited_by, expires_at)
  values (p_team, mail, p_inviter, now() + make_interval(days => team_setting_int('inviteExpiryDays', 7)))
  returning id, token into invite_id, tok;

  if target is not null then
    select name into team_name from teams where id = p_team;
    insert into notifications (user_id, title, body, link)
    values (target, 'Team invitation', 'You have been invited to join ' || team_name || '.', '/teams/invite/' || tok);
  end if;
  return invite_id;
end $$;

-- ── registering and editing ────────────────────────────────────────────
-- p: { name, team_type, focus, description, project_title, project_summary,
--      github_url, demo_url, skills_needed: [], looking_for_members, max_size,
--      invites: [emails] }
create or replace function register_team(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); new_team uuid; kind text := coalesce(p ->> 'team_type', 'new');
  min_size integer := team_setting_int('minSize', 2); cap integer := team_setting_int('maxSize', 6);
  size_wanted integer; mails text[]; mail text; skills text[];
begin
  if uid is null then raise exception 'Please sign in to register a team'; end if;
  if not account_active(uid) then raise exception 'This account is deactivated'; end if;
  if not teams_registration_open() then raise exception 'Team registration is closed'; end if;
  if kind not in ('existing', 'new') then raise exception 'Choose the kind of team'; end if;
  if char_length(trim(coalesce(p ->> 'name', ''))) not between 3 and 120 then
    raise exception 'The team name should be 3 to 120 characters';
  end if;
  if coalesce(p ->> 'focus', '') <> ''
     and not exists (select 1 from team_focus_categories where name = p ->> 'focus' and is_visible) then
    raise exception 'Choose a focus from the list';
  end if;
  if user_team_count(uid) >= team_setting_int('maxTeamsPerUser', 2) then
    raise exception 'A student can be in at most % teams at once', team_setting_int('maxTeamsPerUser', 2);
  end if;

  size_wanted := case when p ->> 'max_size' ~ '^[0-9]{1,3}$' then (p ->> 'max_size')::integer else cap end;
  if size_wanted < min_size or size_wanted > cap then
    raise exception 'Team size must be between % and %', min_size, cap;
  end if;

  select coalesce(array_agg(distinct lower(trim(v))), '{}') into mails
  from jsonb_array_elements_text(coalesce(p -> 'invites', '[]'::jsonb)) v
  where trim(v) <> '' and lower(trim(v)) <> (select lower(email) from auth.users where id = uid);
  if 1 + cardinality(mails) > size_wanted then
    raise exception 'That is more people than the team size (%)', size_wanted;
  end if;
  -- A team that already exists has its members; a new one may still be looking.
  if kind = 'existing' and 1 + cardinality(mails) < min_size then
    raise exception 'An existing team needs at least % members. Invite your teammates', min_size;
  end if;

  select coalesce(array_agg(left(trim(v), 40)), '{}') into skills
  from (select v from jsonb_array_elements_text(coalesce(p -> 'skills_needed', '[]'::jsonb)) v where trim(v) <> '' limit 12) s;

  insert into teams (name, description, skills_needed, status, created_by, leader_id, team_type, focus,
                     project_title, project_summary, github_url, demo_url, looking_for_members, max_size, verification_status)
  values (trim(p ->> 'name'), nullif(left(p ->> 'description', 1000), ''), skills,
          case when kind = 'existing' then 'active' else 'forming' end::team_status, uid, uid, kind,
          nullif(p ->> 'focus', ''), nullif(left(p ->> 'project_title', 160), ''),
          nullif(left(p ->> 'project_summary', 1500), ''), nullif(left(p ->> 'github_url', 300), ''),
          nullif(left(p ->> 'demo_url', 300), ''), coalesce((p ->> 'looking_for_members')::boolean, false),
          size_wanted, 'pending')
  returning id into new_team;
  insert into team_members (team_id, user_id, role) values (new_team, uid, 'lead');

  foreach mail in array mails loop
    perform create_team_invite(new_team, mail, uid);
  end loop;
  return new_team;
end $$;

-- The leader (or staff) edits the details a leader owns. The name, the
-- verification and the featured flag stay with staff.
create or replace function update_team(p_team uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); t teams%rowtype; cap integer := team_setting_int('maxSize', 6);
  size_wanted integer; members integer; skills text[]; new_status team_status;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if uid is null or not (t.leader_id = uid or is_staff()) then raise exception 'FORBIDDEN'; end if;
  if coalesce(p ->> 'focus', '') <> ''
     and not exists (select 1 from team_focus_categories where name = p ->> 'focus') then
    raise exception 'Choose a focus from the list';
  end if;
  select count(*) into members from team_members where team_id = p_team;
  size_wanted := case when p ->> 'max_size' ~ '^[0-9]{1,3}$' then (p ->> 'max_size')::integer else coalesce(t.max_size, cap) end;
  if size_wanted < members or size_wanted > cap then
    raise exception 'Team size must be between % (current members) and %', members, cap;
  end if;
  -- A leader may move between forming, active and completed; archiving is for staff.
  new_status := coalesce(nullif(p ->> 'status', ''), t.status::text)::team_status;
  if new_status = 'archived' and t.status <> 'archived' and not is_staff() then raise exception 'FORBIDDEN'; end if;

  select coalesce(array_agg(left(trim(v), 40)), '{}') into skills
  from (select v from jsonb_array_elements_text(coalesce(p -> 'skills_needed', '[]'::jsonb)) v where trim(v) <> '' limit 12) s;

  update teams set
    description = nullif(left(p ->> 'description', 1000), ''),
    focus = nullif(p ->> 'focus', ''),
    project_title = nullif(left(p ->> 'project_title', 160), ''),
    project_summary = nullif(left(p ->> 'project_summary', 1500), ''),
    github_url = nullif(left(p ->> 'github_url', 300), ''),
    demo_url = nullif(left(p ->> 'demo_url', 300), ''),
    skills_needed = skills,
    looking_for_members = coalesce((p ->> 'looking_for_members')::boolean, false),
    max_size = size_wanted,
    status = new_status
  where id = p_team;
end $$;

-- ── invites ────────────────────────────────────────────────────────────
create or replace function invite_to_team(p_team uuid, p_emails text[])
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t teams%rowtype; mail text; made integer := 0;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if uid is null or not (t.leader_id = uid or is_staff()) then raise exception 'FORBIDDEN'; end if;
  if t.status in ('completed', 'archived') then raise exception 'This team is no longer taking members'; end if;
  if cardinality(p_emails) > 20 then raise exception 'Invite at most 20 people at a time'; end if;
  foreach mail in array p_emails loop
    if trim(mail) <> '' and create_team_invite(p_team, mail, uid) is not null then made := made + 1; end if;
  end loop;
  return made;
end $$;

-- What the invite page shows. The token is the secret; nothing here is private.
create or replace function team_invite_info(p_token text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare i team_invites%rowtype; t teams%rowtype; mine text;
begin
  if p_token is null or length(p_token) not between 32 and 128 then return null; end if;
  select * into i from team_invites where token = p_token;
  if not found then return null; end if;
  select * into t from teams where id = i.team_id;
  select lower(email) into mine from auth.users where id = auth.uid();
  return jsonb_build_object(
    'team_id', t.id, 'team_name', t.name, 'focus', t.focus,
    'inviter', (select full_name from profiles where id = i.invited_by),
    'status', case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status end,
    'expires_at', i.expires_at,
    'signed_in', auth.uid() is not null,
    'email_matches', mine is not null and mine = lower(i.email));
end $$;

create or replace function accept_team_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); i team_invites%rowtype; mine text; t teams%rowtype; who text;
begin
  if uid is null then raise exception 'Please sign in to accept this invitation'; end if;
  if not account_active(uid) then raise exception 'This account is deactivated'; end if;
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'This invitation is not valid'; end if;
  select * into i from team_invites where token = p_token for update;
  if not found then raise exception 'This invitation is not valid'; end if;
  if i.status <> 'pending' then raise exception 'This invitation has already been used or withdrawn'; end if;
  if i.expires_at < now() then
    update team_invites set status = 'expired' where id = i.id;
    return null;
  end if;
  select lower(email) into mine from auth.users where id = uid;
  if mine is distinct from lower(i.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;
  perform assert_can_join_team(i.team_id, uid);

  insert into team_members (team_id, user_id, role) values (i.team_id, uid, 'member');
  update team_invites set status = 'accepted' where id = i.id;
  select * into t from teams where id = i.team_id;
  select full_name into who from profiles where id = uid;
  insert into notifications (user_id, title, body, link)
  values (t.leader_id, 'Invitation accepted', coalesce(who, 'Someone') || ' joined ' || t.name || '.', '/teams/' || t.id);
  return i.team_id;
end $$;

create or replace function decline_team_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); i team_invites%rowtype; mine text;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  select * into i from team_invites where token = p_token for update;
  if not found or i.status <> 'pending' then return; end if;
  select lower(email) into mine from auth.users where id = uid;
  if mine is distinct from lower(i.email) then raise exception 'This invitation was sent to a different email address'; end if;
  update team_invites set status = 'declined' where id = i.id;
end $$;

create or replace function revoke_team_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); i team_invites%rowtype;
begin
  select * into i from team_invites where id = p_invite for update;
  if not found then return; end if;
  if uid is null or not (is_team_leader(i.team_id) or is_staff()) then raise exception 'FORBIDDEN'; end if;
  if i.status = 'pending' then update team_invites set status = 'revoked' where id = i.id; end if;
end $$;

-- ── join requests ──────────────────────────────────────────────────────
create or replace function request_to_join(p_team uuid, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t teams%rowtype; req uuid; who text;
begin
  if uid is null then raise exception 'Please sign in to join a team'; end if;
  if not account_active(uid) then raise exception 'This account is deactivated'; end if;
  select * into t from teams where id = p_team;
  if not found or t.verification_status <> 'verified' then raise exception 'Team not found'; end if;
  if not t.looking_for_members then raise exception 'This team is not looking for members'; end if;
  perform assert_can_join_team(p_team, uid);
  if (select count(*) from team_join_requests where user_id = uid and status = 'pending') >= 5 then
    raise exception 'You have several requests waiting. Wait for an answer first';
  end if;
  select id into req from team_join_requests where team_id = p_team and user_id = uid and status = 'pending';
  if req is not null then return req; end if;

  insert into team_join_requests (team_id, user_id, message)
  values (p_team, uid, nullif(left(trim(coalesce(p_message, '')), 500), '')) returning id into req;
  select full_name into who from profiles where id = uid;
  insert into notifications (user_id, title, body, link)
  values (t.leader_id, 'Request to join your team', coalesce(who, 'Someone') || ' asked to join ' || t.name || '.', '/teams/' || t.id);
  return req;
end $$;

create or replace function respond_join_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r team_join_requests%rowtype; t teams%rowtype;
begin
  select * into r from team_join_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if uid is null or not (is_team_leader(r.team_id) or is_staff()) then raise exception 'FORBIDDEN'; end if;
  if r.status <> 'pending' then return; end if;
  select * into t from teams where id = r.team_id;
  if p_approve then
    perform assert_can_join_team(r.team_id, r.user_id);
    insert into team_members (team_id, user_id, role) values (r.team_id, r.user_id, 'member');
  end if;
  update team_join_requests set status = case when p_approve then 'approved' else 'declined' end where id = r.id;
  insert into notifications (user_id, title, body, link)
  values (r.user_id,
          case when p_approve then 'You are on the team' else 'Join request answered' end,
          case when p_approve then 'Your request to join ' || t.name || ' was approved.'
               else 'Your request to join ' || t.name || ' was not approved.' end,
          '/teams/' || t.id);
end $$;

-- The waiting requests for a team, with each requester's name, for its leader and staff.
create or replace function team_join_requests_for(p_team uuid)
returns table (id uuid, user_id uuid, full_name text, department text, year text, message text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select r.id, r.user_id, p.full_name, p.department, p.year, r.message, r.created_at
  from team_join_requests r join profiles p on p.id = r.user_id
  where r.team_id = p_team and r.status = 'pending' and (is_team_leader(p_team) or is_staff())
  order by r.created_at;
$$;

-- ── members ────────────────────────────────────────────────────────────
create or replace function remove_member(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t teams%rowtype;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if uid is null or not (t.leader_id = uid or is_staff()) then raise exception 'FORBIDDEN'; end if;
  if p_user = t.leader_id then raise exception 'Hand the team over before removing its leader'; end if;
  delete from team_members where team_id = p_team and user_id = p_user;
end $$;

create or replace function leave_team(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t teams%rowtype; others integer;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  select * into t from teams where id = p_team for update;
  if not found then return; end if;
  if t.leader_id = uid then
    select count(*) into others from team_members where team_id = p_team and user_id <> uid;
    if others > 0 then raise exception 'Hand the team over to another member before you leave'; end if;
    update teams set status = 'archived' where id = p_team;   -- the last person out closes the team
  end if;
  delete from team_members where team_id = p_team and user_id = uid;
end $$;

create or replace function transfer_leadership(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t teams%rowtype;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if uid is null or not (t.leader_id = uid or is_staff()) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from team_members where team_id = p_team and user_id = p_user) then
    raise exception 'The new leader must already be a member';
  end if;
  update team_members set role = 'member' where team_id = p_team and user_id = t.leader_id;
  update team_members set role = 'lead' where team_id = p_team and user_id = p_user;
  update teams set leader_id = p_user where id = p_team;
  insert into notifications (user_id, title, body, link)
  values (p_user, 'You now lead a team', 'You are now the leader of ' || t.name || '.', '/teams/' || t.id);
end $$;

-- Staff add a member directly, by email (the limits still apply).
create or replace function admin_add_team_member(p_team uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not is_staff() then raise exception 'FORBIDDEN'; end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if target is null then raise exception 'No account uses that email address'; end if;
  perform assert_can_join_team(p_team, target);
  insert into team_members (team_id, user_id, role) values (p_team, target, 'member');
end $$;

-- Names only: who is on a team, for anyone who may see the team. No emails.
create or replace function team_roster(p_team uuid)
returns table (user_id uuid, full_name text, department text, year text, role text, joined_at timestamptz)
language sql security definer stable set search_path = public as $$
  select m.user_id, p.full_name, p.department, p.year, m.role, m.joined_at
  from team_members m join profiles p on p.id = m.user_id
  where m.team_id = p_team and can_see_team(p_team)
  order by (m.role = 'lead') desc, m.joined_at;
$$;

-- ── verification (admins) ──────────────────────────────────────────────
create or replace function verify_team(p_team uuid, p_status team_verification, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t teams%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  update teams set verification_status = p_status,
    verified_by = case when p_status = 'verified' then uid end,
    verified_at = case when p_status = 'verified' then now() end
  where id = p_team;
  if p_status <> t.verification_status and p_status in ('verified', 'rejected') then
    insert into notifications (user_id, title, body, link)
    values (t.leader_id,
            case when p_status = 'verified' then 'Your team is verified' else 'Your team was not verified' end,
            case when p_status = 'verified' then t.name || ' is now a verified FusionX team.'
                 else t.name || ' was not verified.' end
              || coalesce(' ' || nullif(left(trim(p_note), 500), ''), ''),
            '/teams/' || t.id);
  end if;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (uid, 'verification_' || p_status::text, 'teams', p_team::text,
          jsonb_build_object('note', coalesce(nullif(trim(p_note), ''), t.name)));
end $$;

-- The FusionX Teams WhatsApp link: staff, and members of a verified team.
create or replace function fusionx_teams_whatsapp(p_team uuid)
returns text language sql security definer stable set search_path = public as $$
  select l.url from private_links l
  where l.key = 'fusionx_teams_whatsapp' and (
    is_staff()
    or exists (
      select 1 from teams t join team_members m on m.team_id = t.id
      where t.id = p_team and t.verification_status = 'verified' and m.user_id = auth.uid()));
$$;

-- ── the Join form: a deadline (site_content 'join.settings') ────────────
create or replace function guard_application_open()
returns trigger language plpgsql security definer set search_path = public as $$
declare deadline text;
begin
  if auth.uid() is null or is_staff() then return new; end if;
  if not coalesce((select join_open from organization_settings where id), true) then
    raise exception 'Applications are currently closed';
  end if;
  select value ->> 'deadline' into deadline from site_content where key = 'join.settings';
  if coalesce(deadline, '') <> '' and now() >= deadline::timestamptz then
    raise exception 'Applications are currently closed';
  end if;
  return new;
end $$;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  team_setting_int(text, integer), user_team_count(uuid), team_capacity(uuid), assert_can_join_team(uuid, uuid),
  create_team_invite(uuid, text, uuid), register_team(jsonb), update_team(uuid, jsonb), invite_to_team(uuid, text[]),
  team_invite_info(text), accept_team_invite(text), decline_team_invite(text), revoke_team_invite(uuid),
  request_to_join(uuid, text), respond_join_request(uuid, boolean), remove_member(uuid, uuid), leave_team(uuid),
  transfer_leadership(uuid, uuid), admin_add_team_member(uuid, text), team_roster(uuid),
  verify_team(uuid, team_verification, text), fusionx_teams_whatsapp(uuid), team_join_requests_for(uuid)
  from public, anon, authenticated;
grant execute on function
  register_team(jsonb), update_team(uuid, jsonb), invite_to_team(uuid, text[]), accept_team_invite(text),
  decline_team_invite(text), revoke_team_invite(uuid), request_to_join(uuid, text), respond_join_request(uuid, boolean),
  remove_member(uuid, uuid), leave_team(uuid), transfer_leadership(uuid, uuid), admin_add_team_member(uuid, text),
  team_roster(uuid), verify_team(uuid, team_verification, text), fusionx_teams_whatsapp(uuid),
  team_join_requests_for(uuid), team_setting_int(text, integer), team_capacity(uuid)
  to authenticated;
grant execute on function team_invite_info(text), teams_registration_open(),
  is_team_member(uuid), is_team_leader(uuid), can_see_team(uuid)
  to anon, authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────
-- teams: created and edited through the functions; staff may write directly.
drop policy "teams are readable by authenticated members" on teams;
drop policy "members create teams" on teams;
drop policy "team creators and staff update teams" on teams;
create policy "verified teams and your own teams are readable" on teams for select using (can_see_team(id));
create policy "staff create teams" on teams for insert with check (is_staff());
create policy "staff edit teams" on teams for update using (is_staff()) with check (is_staff());
create policy "admins delete teams" on teams for delete using (is_admin());

-- membership: joining and leaving go through the functions.
drop policy "team members readable by authenticated users" on team_members;
drop policy "team creators manage membership" on team_members;
drop policy "members join open teams themselves" on team_members;
drop policy "members leave teams themselves" on team_members;
create policy "members of teams you can see are readable" on team_members for select using (can_see_team(team_id));
create policy "staff manage membership" on team_members for all using (is_staff()) with check (is_staff());

alter table team_invites enable row level security;
create policy "the leader and staff read invites" on team_invites for select
  using (is_staff() or is_team_leader(team_id));

alter table team_join_requests enable row level security;
create policy "the requester, the leader and staff read requests" on team_join_requests for select
  using (user_id = auth.uid() or is_team_leader(team_id) or is_staff());

alter table team_focus_categories enable row level security;
create policy "visible focus categories are public" on team_focus_categories for select using (is_visible or is_staff());
create policy "admins manage focus categories" on team_focus_categories for all using (is_admin()) with check (is_admin());

alter table team_admin_notes enable row level security;
create policy "staff manage team notes" on team_admin_notes for all using (is_staff()) with check (is_staff());

alter table private_links enable row level security;
create policy "admins manage private links" on private_links for all using (is_admin()) with check (is_admin());

commit;
