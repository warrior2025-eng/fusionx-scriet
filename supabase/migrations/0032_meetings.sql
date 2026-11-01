-- Meetings: a room for FusionX discussion meetings, joined with a personal
-- FusionX Meeting Pass. There is no meeting code and no shareable link: you
-- enter because you are invited, from your own account.
--
-- Separate from the recruitment interview room: its own tables, its own rooms
-- (fx-meet-<id>) and its own token kind. Nothing of recruitment changes. The only
-- thing added to Core teams is a trigger that gives a person added to a team the
-- pass for that team's upcoming meetings.
--
-- Every table has RLS on, and writes go only through the functions below, which
-- check the caller on the server. is_admin() is the database side of the
-- "meetings" capability, as on the other admin tables.
--
-- Run once, as one piece.

begin;

-- ── tables ─────────────────────────────────────────────────────────────
create table meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min between 15 and 180),
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'ended', 'cancelled')),
  instant boolean not null default false,
  series_id uuid,
  lobby_on boolean not null default false,
  join_muted boolean not null default true,
  -- null: automatic, on once 15 or more people are invited.
  join_camera_off boolean,
  screen_share_all boolean not null default true,
  chat_on boolean not null default true,
  locked boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  current_agenda_id uuid,
  agenda_item_at timestamptz,
  -- The start time the 10 minute reminder went out for, so a reschedule reminds again.
  reminder_sent_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_meetings_starts on meetings (starts_at);
create trigger trg_meetings_updated_at before update on meetings for each row execute function set_updated_at();

create table meeting_audience (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  kind text not null check (kind in ('core_group', 'role', 'team', 'person')),
  core_group_id uuid references core_groups(id) on delete cascade,
  role text check (role in ('admins', 'reviewers')),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  check ((kind = 'core_group') = (core_group_id is not null) and (kind = 'role') = (role is not null)
     and (kind = 'team') = (team_id is not null) and (kind = 'person') = (user_id is not null))
);
create index idx_meeting_audience_meeting on meeting_audience (meeting_id);
create index idx_meeting_audience_group on meeting_audience (core_group_id) where core_group_id is not null;

create table meeting_invites (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'audience' check (source in ('audience', 'knock')),
  cant_reason text check (cant_reason is null or char_length(cant_reason) <= 200),
  cant_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index idx_meeting_invites_user on meeting_invites (user_id);

create table meeting_cohosts (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('chosen', 'hub_lead', 'made_live')),
  made_by uuid references auth.users(id) on delete set null,
  made_at timestamptz not null default now(),
  -- A host took this away. Kept so that an edit does not hand a hub lead's rights back.
  removed_at timestamptz,
  primary key (meeting_id, user_id)
);

create table meeting_agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  position integer not null,
  title text not null check (char_length(title) between 1 and 200),
  minutes integer check (minutes is null or minutes between 1 and 180)
);
create index idx_meeting_agenda_meeting on meeting_agenda_items (meeting_id, position);

create table meeting_knocks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text check (note is null or char_length(note) <= 140),
  status text not null default 'pending' check (status in ('pending', 'let_in', 'not_now')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_meeting_knocks_meeting on meeting_knocks (meeting_id, status);

create table meeting_rings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rung_by uuid references auth.users(id) on delete set null,
  answer text check (answer in ('join', 'cant')),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_meeting_rings_user on meeting_rings (user_id, created_at desc);

-- Only the hash is kept. Nobody reads this table; two functions use it.
create table meeting_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('join', 'move')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table meeting_chat_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_meeting_chat_meeting on meeting_chat_messages (meeting_id, created_at);

create table meeting_notes (
  meeting_id uuid primary key references meetings(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 50000),
  decisions jsonb not null default '[]'::jsonb,
  version integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  task text not null check (char_length(task) between 1 and 300),
  owner_id uuid references auth.users(id) on delete set null,
  due_on date,
  done_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_meeting_actions_owner on meeting_action_items (owner_id);
create index idx_meeting_actions_meeting on meeting_action_items (meeting_id);

-- One row per person. Time is added from the room's regular check-in, so a closed
-- laptop stops counting. The lobby and "removed" live here too.
create table meeting_attendance (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_joined_at timestamptz,
  last_seen_at timestamptz,
  left_at timestamptz,
  total_seconds integer not null default 0,
  hand_raised_at timestamptz,
  lobby_status text check (lobby_status in ('waiting', 'admitted', 'denied')),
  lobby_at timestamptz,
  removed_at timestamptz,
  primary key (meeting_id, user_id)
);

-- ── small helpers ──────────────────────────────────────────────────────
create function meeting_is_admin_user(p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from user_roles r join profiles p on p.id = r.user_id
                 where r.user_id = p_user and r.role in ('admin', 'super_admin') and p.is_active);
$$;

-- 'creator' | 'admin' | 'chosen' | 'hub_lead' | 'made_live', or null. The first two can never be taken away.
create function meeting_host_kind(p_meeting uuid, p_user uuid)
returns text language sql security definer stable set search_path = public as $$
  select case
    when exists (select 1 from meetings m where m.id = p_meeting and m.created_by = p_user) then 'creator'
    when meeting_is_admin_user(p_user) then 'admin'
    else (select c.source from meeting_cohosts c where c.meeting_id = p_meeting and c.user_id = p_user and c.removed_at is null)
  end;
$$;

create function meeting_is_host(p_meeting uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select meeting_host_kind(p_meeting, p_user) is not null;
$$;

create function meeting_is_invited(p_meeting uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from meeting_invites i where i.meeting_id = p_meeting and i.user_id = p_user);
$$;

create function meeting_close_at(m meetings)
returns timestamptz language sql immutable as $$
  select m.starts_at + make_interval(mins => m.duration_min + 60);
$$;

-- upcoming → doors (10 minutes before) → live (someone went in) → ended. Or cancelled.
-- By the clock, so a meeting nobody ended closes an hour after its planned end.
create function meeting_phase(m meetings)
returns text language sql stable as $$
  select case
    when m.status = 'cancelled' then 'cancelled'
    when m.status = 'ended' or now() >= meeting_close_at(m) then 'ended'
    when m.started_at is not null then 'live'
    when now() >= m.starts_at - interval '10 minutes' then 'doors'
    else 'upcoming'
  end;
$$;

create function meeting_inside_count(p_meeting uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from meeting_attendance a
  where a.meeting_id = p_meeting and a.left_at is null and a.last_seen_at > now() - interval '30 seconds';
$$;

create function meeting_when(p_at timestamptz)
returns text language sql immutable as $$
  select to_char(p_at at time zone 'Asia/Kolkata', 'FMDD Mon YYYY, FMHH12:MI am') || ' IST';
$$;

-- The address in a person's own notifications. `for` lets the page say "this pass
-- belongs to another account"; it opens nothing by itself.
create function meeting_pass_tag(p_meeting uuid, p_user uuid)
returns text language sql immutable as $$
  select left(md5(p_user::text || ':' || p_meeting::text), 12);
$$;

create function meeting_pass_link(p_meeting uuid, p_user uuid)
returns text language sql immutable as $$
  select '/meetings/' || p_meeting::text || '?for=' || meeting_pass_tag(p_meeting, p_user);
$$;

-- The seat on a pass and a tile: "FusionX Core · Head of Execution", "Design & Branding · Lead", or "Guest".
create function meeting_seat(p_user uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'label', g.name || ' · ' || case when m.is_lead and m.title = 'Member' then 'Lead' else m.title end,
       'group', g.name, 'order', g.display_order, 'lead', m.is_lead)
     from core_group_members m join core_groups g on g.id = m.group_id
     where m.user_id = p_user
     order by (g.kind = 'core') desc, g.display_order limit 1),
    jsonb_build_object('label', 'Guest', 'group', 'Others', 'order', 100000, 'lead', false));
$$;

create function meeting_audit(p_action text, p_meeting uuid, p_note text)
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), p_action, 'meetings', p_meeting::text, jsonb_build_object('note', p_note));
$$;

-- ── who is invited ─────────────────────────────────────────────────────
-- Everyone the audience covers, plus every admin, the creator and the chosen co-hosts.
create function meeting_audience_users(p_meeting uuid)
returns table (user_id uuid)
language sql security definer stable set search_path = public as $$
  select distinct t.u
  from (
    select m.user_id as u from meeting_audience a join core_group_members m on m.group_id = a.core_group_id
      where a.meeting_id = p_meeting and a.kind = 'core_group'
    union select r.user_id from user_roles r where r.role in ('admin', 'super_admin')
    union select r.user_id from meeting_audience a
      join recruitment_team_reviewers r on a.kind = 'role' and a.role = 'reviewers'
      where a.meeting_id = p_meeting
    union select r.user_id from meeting_audience a
      join recruitment_cycle_reviewers r on a.kind = 'role' and a.role = 'reviewers'
      where a.meeting_id = p_meeting
    union select tm.user_id from meeting_audience a join team_members tm on tm.team_id = a.team_id
      where a.meeting_id = p_meeting and a.kind = 'team'
    union select a.user_id from meeting_audience a where a.meeting_id = p_meeting and a.kind = 'person'
    union select m.created_by from meetings m where m.id = p_meeting
    union select c.user_id from meeting_cohosts c where c.meeting_id = p_meeting and c.source = 'chosen' and c.removed_at is null
  ) t
  join profiles p on p.id = t.u
  where t.u is not null and p.is_active;
$$;

-- Brings the invites and the hub leads' rights in line with the audience. Each new
-- invitee is told once. Someone who no longer belongs loses the pass, until it starts.
create function meeting_sync_invites(p_meeting uuid, p_notify boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  who record;
  fresh integer := 0;
begin
  select * into mt from meetings where id = p_meeting;
  if not found then return 0; end if;

  insert into meeting_cohosts (meeting_id, user_id, source, made_by)
  select p_meeting, m.user_id, 'hub_lead', auth.uid()
  from meeting_audience a join core_group_members m on m.group_id = a.core_group_id
  where a.meeting_id = p_meeting and a.kind = 'core_group' and m.is_lead
  on conflict (meeting_id, user_id) do nothing;
  if mt.started_at is null then
    delete from meeting_cohosts c
    where c.meeting_id = p_meeting and c.source = 'hub_lead'
      and not exists (select 1 from meeting_audience a join core_group_members m on m.group_id = a.core_group_id
                      where a.meeting_id = p_meeting and a.kind = 'core_group' and m.is_lead and m.user_id = c.user_id);
  end if;

  for who in
    select u.user_id from meeting_audience_users(p_meeting) u
    where not exists (select 1 from meeting_invites i where i.meeting_id = p_meeting and i.user_id = u.user_id)
  loop
    insert into meeting_invites (meeting_id, user_id) values (p_meeting, who.user_id) on conflict do nothing;
    if not found then continue; end if;
    fresh := fresh + 1;
    if p_notify then
      insert into notifications (user_id, title, body, link)
      values (who.user_id, 'You''re invited: ' || mt.title,
              meeting_when(mt.starts_at) || '. Your FusionX Meeting Pass is ready.',
              meeting_pass_link(p_meeting, who.user_id));
    end if;
  end loop;

  if mt.started_at is null then
    delete from meeting_invites i
    where i.meeting_id = p_meeting and i.source = 'audience'
      and not exists (select 1 from meeting_audience_users(p_meeting) u where u.user_id = i.user_id);
  end if;
  return fresh;
end $$;

-- Someone added to a chosen team (or made its lead) before the meeting starts gets the pass too.
create function meeting_core_member_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
begin
  for mid in
    select distinct m.id from meeting_audience a join meetings m on m.id = a.meeting_id
    where a.core_group_id = new.group_id and m.status = 'scheduled' and m.started_at is null and m.starts_at > now()
  loop
    perform meeting_sync_invites(mid, true);
  end loop;
  return new;
end $$;
create trigger trg_meeting_core_member after insert or update of is_lead on core_group_members
  for each row execute function meeting_core_member_changed();

-- ── creating and changing a meeting ────────────────────────────────────
create function meeting_apply_details(p_meeting uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  pos integer := 0;
begin
  delete from meeting_audience where meeting_id = p_meeting;
  for item in select * from jsonb_array_elements(coalesce(p -> 'audience', '[]'::jsonb)) loop
    insert into meeting_audience (meeting_id, kind, core_group_id, role, team_id, user_id)
    values (p_meeting, item ->> 'kind',
      case when item ->> 'kind' = 'core_group' then (item ->> 'id')::uuid end,
      case when item ->> 'kind' = 'role' then item ->> 'id' end,
      case when item ->> 'kind' = 'team' then (item ->> 'id')::uuid end,
      case when item ->> 'kind' = 'person' then (item ->> 'id')::uuid end);
  end loop;
  if not exists (select 1 from meeting_audience where meeting_id = p_meeting) then
    raise exception 'Choose who the meeting is for';
  end if;

  delete from meeting_cohosts c where c.meeting_id = p_meeting and c.source = 'chosen'
    and not (c.user_id::text in (select jsonb_array_elements_text(coalesce(p -> 'cohosts', '[]'::jsonb))));
  insert into meeting_cohosts (meeting_id, user_id, source, made_by)
  select p_meeting, v::uuid, 'chosen', auth.uid() from jsonb_array_elements_text(coalesce(p -> 'cohosts', '[]'::jsonb)) v
  on conflict (meeting_id, user_id) do update set source = 'chosen', removed_at = null, made_by = auth.uid(), made_at = now();

  delete from meeting_agenda_items where meeting_id = p_meeting;
  for item in select * from jsonb_array_elements(coalesce(p -> 'agenda', '[]'::jsonb)) loop
    pos := pos + 1;
    insert into meeting_agenda_items (meeting_id, position, title, minutes)
    values (p_meeting, pos, item ->> 'title', nullif(item ->> 'minutes', '')::integer);
  end loop;
  insert into meeting_notes (meeting_id) values (p_meeting) on conflict do nothing;
end $$;

-- Creates (p_id null, once per repeating week) or edits. A repeating series tells people
-- once, about the first meeting; each later one still gets its pass and its reminder.
create function meeting_save(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  at_time timestamptz := (p ->> 'starts_at')::timestamptz;
  weeks integer := greatest(1, least(coalesce((p ->> 'repeat_weeks')::integer, 1), 26));
  series uuid := case when weeks > 1 then gen_random_uuid() end;
  ids uuid[] := '{}';
  new_id uuid;
  moved boolean;
  fresh integer := 0;
  who record;
  i integer;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if at_time is null then raise exception 'Choose the date and start time'; end if;

  if p_id is null then
    if at_time <= now() then raise exception 'Choose a start time in the future'; end if;
    for i in 0 .. weeks - 1 loop
      insert into meetings (title, description, starts_at, duration_min, created_by, series_id, lobby_on, join_muted, join_camera_off, screen_share_all, chat_on)
      values (p ->> 'title', nullif(p ->> 'description', ''), at_time + make_interval(weeks => i), (p ->> 'duration_min')::integer, auth.uid(), series,
        coalesce((p ->> 'lobby_on')::boolean, false), coalesce((p ->> 'join_muted')::boolean, true), (p ->> 'join_camera_off')::boolean,
        coalesce((p ->> 'screen_share_all')::boolean, true), coalesce((p ->> 'chat_on')::boolean, true))
      returning id into new_id;
      perform meeting_apply_details(new_id, p);
      fresh := fresh + meeting_sync_invites(new_id, i = 0);
      ids := ids || new_id;
      perform meeting_audit('created_meeting', new_id, (p ->> 'title') || ', ' || meeting_when(at_time + make_interval(weeks => i)));
    end loop;
    return jsonb_build_object('id', ids[1], 'ids', to_jsonb(ids), 'invited', (select count(*) from meeting_invites where meeting_id = ids[1]));
  end if;

  select * into mt from meetings where id = p_id for update;
  if not found then raise exception 'That meeting no longer exists'; end if;
  if mt.started_at is not null or meeting_phase(mt) in ('ended', 'cancelled') then
    raise exception 'A meeting that has started, ended or been cancelled cannot be edited';
  end if;
  moved := mt.starts_at is distinct from at_time;
  if moved and at_time <= now() then raise exception 'Choose a start time in the future'; end if;
  update meetings set title = p ->> 'title', description = nullif(p ->> 'description', ''), starts_at = at_time,
    duration_min = (p ->> 'duration_min')::integer, lobby_on = coalesce((p ->> 'lobby_on')::boolean, false),
    join_muted = coalesce((p ->> 'join_muted')::boolean, true), join_camera_off = (p ->> 'join_camera_off')::boolean,
    screen_share_all = coalesce((p ->> 'screen_share_all')::boolean, true), chat_on = coalesce((p ->> 'chat_on')::boolean, true)
  where id = p_id;
  perform meeting_apply_details(p_id, p);

  -- Those who stay are told about a new time; new people get their invitation, with the new time.
  if moved then
    for who in
      select i2.user_id from meeting_invites i2 where i2.meeting_id = p_id
        and (i2.source = 'knock' or exists (select 1 from meeting_audience_users(p_id) u where u.user_id = i2.user_id))
    loop
      insert into notifications (user_id, title, body, link)
      values (who.user_id, 'Rescheduled: ' || (p ->> 'title'), 'Now on ' || meeting_when(at_time) || '. Your pass is updated.', meeting_pass_link(p_id, who.user_id));
    end loop;
  end if;
  fresh := meeting_sync_invites(p_id, true);
  perform meeting_audit(case when moved then 'rescheduled_meeting' else 'updated_meeting' end, p_id, (p ->> 'title') || ', ' || meeting_when(at_time));
  return jsonb_build_object('id', p_id, 'ids', to_jsonb(array[p_id]), 'added', fresh, 'moved', moved,
    'invited', (select count(*) from meeting_invites where meeting_id = p_id));
end $$;

-- Starts now; every invitee gets the ring as well as the notification.
create function meeting_start_instant(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  insert into meetings (title, starts_at, duration_min, created_by, instant, reminder_sent_for, join_muted)
  values (p ->> 'title', now(), 60, auth.uid(), true, now(), true)
  returning id into new_id;
  perform meeting_apply_details(new_id, p);
  perform meeting_sync_invites(new_id, true);
  insert into meeting_rings (meeting_id, user_id, rung_by)
  select new_id, i.user_id, auth.uid() from meeting_invites i where i.meeting_id = new_id and i.user_id <> auth.uid();
  perform meeting_audit('started_instant_meeting', new_id, p ->> 'title');
  return jsonb_build_object('id', new_id, 'invited', (select count(*) from meeting_invites where meeting_id = new_id));
end $$;

create function meeting_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into mt from meetings where id = p_id for update;
  if not found then raise exception 'That meeting no longer exists'; end if;
  if meeting_phase(mt) in ('ended', 'cancelled') then raise exception 'This meeting has already ended or been cancelled'; end if;
  if mt.started_at is not null then raise exception 'This meeting is live. End it from the room'; end if;
  update meetings set status = 'cancelled' where id = p_id;
  insert into notifications (user_id, title, body, link)
  select i.user_id, 'Cancelled: ' || mt.title, 'The meeting on ' || meeting_when(mt.starts_at) || ' will not take place.', meeting_pass_link(p_id, i.user_id)
  from meeting_invites i where i.meeting_id = p_id;
  perform meeting_audit('cancelled_meeting', p_id, mt.title);
end $$;

-- Ends the meeting and closes everyone's time.
create function meeting_finish(p_id uuid, p_by uuid)
returns void language sql security definer set search_path = public as $$
  update meetings set status = 'ended', ended_at = coalesce(ended_at, now()), ended_by = p_by where id = p_id and status <> 'cancelled';
  update meeting_attendance set left_at = coalesce(left_at, last_seen_at), hand_raised_at = null
  where meeting_id = p_id and first_joined_at is not null;
$$;

-- The job (every minute): the reminder 10 minutes before, once per start time, and closing
-- meetings nobody ended.
create function send_meeting_reminders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  sent integer := 0;
  closed integer := 0;
  n integer;
begin
  for mt in
    select * from meetings m where m.status = 'scheduled' and m.started_at is null
      and m.starts_at > now() and m.starts_at <= now() + interval '10 minutes'
      and m.reminder_sent_for is distinct from m.starts_at
    for update skip locked
  loop
    insert into notifications (user_id, title, body, link)
    select i.user_id, 'Starting in 10 minutes: ' || mt.title, meeting_when(mt.starts_at) || '. Doors are open. Enter with your pass.', meeting_pass_link(mt.id, i.user_id)
    from meeting_invites i where i.meeting_id = mt.id and i.cant_reason is null;
    get diagnostics n = row_count;
    sent := sent + n;
    update meetings set reminder_sent_for = mt.starts_at where id = mt.id;
  end loop;
  for mt in select * from meetings m where m.status = 'scheduled' and now() >= meeting_close_at(m) for update skip locked loop
    perform meeting_finish(mt.id, null);
    closed := closed + 1;
  end loop;
  return jsonb_build_object('reminders', sent, 'closed', closed);
end $$;

-- ── what an invitee reads ──────────────────────────────────────────────
create function meeting_pass_json(mt meetings, p_user uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'id', mt.id, 'title', mt.title, 'description', mt.description, 'starts_at', mt.starts_at, 'duration_min', mt.duration_min,
    'phase', meeting_phase(mt), 'inside', meeting_inside_count(mt.id),
    'host', coalesce((select p.full_name from profiles p where p.id = mt.created_by), 'FusionX'),
    'agenda', coalesce((select jsonb_agg(a.title order by a.position) from meeting_agenda_items a where a.meeting_id = mt.id), '[]'::jsonb),
    'seat', meeting_seat(p_user),
    'cant_reason', (select i.cant_reason from meeting_invites i where i.meeting_id = mt.id and i.user_id = p_user),
    'is_host', meeting_is_host(mt.id, p_user),
    'join_muted', mt.join_muted,
    'join_camera_off', coalesce(mt.join_camera_off, (select count(*) from meeting_invites i where i.meeting_id = mt.id) >= 15));
$$;

create function my_meeting_passes()
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'now', now(),
    'me', (select jsonb_build_object('name', p.full_name, 'avatar_url', case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end) from profiles p where p.id = auth.uid()),
    'passes', coalesce((select jsonb_agg(meeting_pass_json(m, auth.uid()) order by m.starts_at)
      from meetings m join meeting_invites i on i.meeting_id = m.id and i.user_id = auth.uid()
      where meeting_phase(m) in ('upcoming', 'doors', 'live')), '[]'::jsonb),
    'past', coalesce((select jsonb_agg(x.j order by x.at desc) from (
      select meeting_pass_json(m, auth.uid()) as j, m.starts_at as at
      from meetings m join meeting_invites i on i.meeting_id = m.id and i.user_id = auth.uid()
      where meeting_phase(m) in ('ended', 'cancelled')
      order by m.starts_at desc limit 30) x), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'task', a.task, 'due_on', a.due_on, 'done', a.done_at is not null,
        'meeting_id', a.meeting_id, 'meeting', m.title) order by a.done_at is not null, a.due_on nulls last, a.created_at)
      from meeting_action_items a join meetings m on m.id = a.meeting_id where a.owner_id = auth.uid()), '[]'::jsonb));
$$;

-- For the page of one meeting: what this signed-in person may know and do.
create function meeting_view(p_meeting uuid, p_for text default null)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  mt meetings%rowtype;
  uid uuid := auth.uid();
  invited boolean;
  host boolean;
begin
  if uid is null then raise exception 'SIGN_IN'; end if;
  select * into mt from meetings where id = p_meeting;
  if not found then return jsonb_build_object('found', false); end if;
  invited := meeting_is_invited(p_meeting, uid);
  host := meeting_is_host(p_meeting, uid);
  -- Opened from someone else's notification: nothing about the meeting is shown.
  if p_for is not null and p_for <> meeting_pass_tag(p_meeting, uid) then
    return jsonb_build_object('found', true, 'wrong_account', true, 'now', now());
  end if;
  if invited or host then
    return jsonb_build_object('found', true, 'allowed', true, 'now', now(), 'pass', meeting_pass_json(mt, uid),
      'me', (select jsonb_build_object('name', p.full_name, 'avatar_url', case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end) from profiles p where p.id = uid));
  end if;
  return jsonb_build_object('found', true, 'allowed', false, 'now', now(), 'title', mt.title, 'phase', meeting_phase(mt),
    'knock', (select jsonb_build_object('status', k.status, 'at', k.created_at, 'count', (select count(*) from meeting_knocks k2 where k2.meeting_id = p_meeting and k2.user_id = uid))
              from meeting_knocks k where k.meeting_id = p_meeting and k.user_id = uid order by k.created_at desc limit 1));
end $$;

-- What the header and the ring banner need, for any page. Cheap: asked every few seconds.
create function my_meeting_signal()
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'now', now(),
    'has_upcoming', exists (select 1 from meeting_invites i join meetings m on m.id = i.meeting_id
                            where i.user_id = auth.uid() and meeting_phase(m) in ('upcoming', 'doors', 'live')),
    'soon', (select jsonb_build_object('id', m.id, 'title', m.title, 'phase', meeting_phase(m))
             from meeting_invites i join meetings m on m.id = i.meeting_id
             where i.user_id = auth.uid() and i.cant_reason is null and meeting_phase(m) in ('doors', 'live')
             order by m.starts_at desc limit 1),
    'ring', (select jsonb_build_object('id', r.id, 'meeting_id', m.id, 'title', m.title, 'host', coalesce(p.full_name, 'A host'))
             from meeting_rings r join meetings m on m.id = r.meeting_id left join profiles p on p.id = r.rung_by
             where r.user_id = auth.uid() and r.answer is null and r.created_at > now() - interval '60 seconds'
               and meeting_phase(m) in ('doors', 'live')
               and not exists (select 1 from meeting_attendance a where a.meeting_id = m.id and a.user_id = auth.uid()
                               and a.left_at is null and a.last_seen_at > now() - interval '30 seconds')
             order by r.created_at desc limit 1));
$$;

-- ── a person's own actions ─────────────────────────────────────────────
create function meeting_cant_make_it(p_meeting uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  why text := left(nullif(btrim(coalesce(p_reason, '')), ''), 200);
  who text;
begin
  select * into mt from meetings where id = p_meeting;
  if not found or not meeting_is_invited(p_meeting, auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if meeting_phase(mt) in ('ended', 'cancelled') then raise exception 'This meeting is over'; end if;
  update meeting_invites set cant_reason = why, cant_at = case when why is null then null else now() end
  where meeting_id = p_meeting and user_id = auth.uid();
  if why is not null and mt.created_by is not null and mt.created_by <> auth.uid() then
    select full_name into who from profiles where id = auth.uid();
    insert into notifications (user_id, title, body, link)
    values (mt.created_by, coalesce(who, 'Someone') || ' can''t make it to ' || mt.title, why, meeting_pass_link(p_meeting, mt.created_by));
  end if;
end $$;

-- Knock: at most once in 2 minutes, 3 times per meeting, and only while the doors are open.
create function meeting_knock(p_meeting uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SIGN_IN'; end if;
  select * into mt from meetings where id = p_meeting;
  if not found then raise exception 'That meeting no longer exists'; end if;
  if meeting_is_invited(p_meeting, uid) or meeting_is_host(p_meeting, uid) then return jsonb_build_object('ok', true, 'invited', true); end if;
  if meeting_phase(mt) not in ('doors', 'live') then raise exception 'You can knock once the doors are open'; end if;
  if mt.locked then raise exception 'This meeting is locked'; end if;
  if (select count(*) from meeting_knocks k where k.meeting_id = p_meeting and k.user_id = uid) >= 3 then
    raise exception 'You have already knocked 3 times for this meeting';
  end if;
  if exists (select 1 from meeting_knocks k where k.meeting_id = p_meeting and k.user_id = uid and k.created_at > now() - interval '2 minutes') then
    raise exception 'Please wait 2 minutes before knocking again';
  end if;
  insert into meeting_knocks (meeting_id, user_id, note) values (p_meeting, uid, left(nullif(btrim(coalesce(p_note, '')), ''), 140));
  return jsonb_build_object('ok', true);
end $$;

create function meeting_ring_answer(p_ring uuid, p_answer text)
returns void language sql security definer set search_path = public as $$
  update meeting_rings set answer = p_answer, answered_at = now()
  where id = p_ring and user_id = auth.uid() and answer is null and p_answer in ('join', 'cant');
$$;

-- The single check behind a LiveKit token. It is called as the signed-in person.
create function meeting_enter(p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  uid uuid := auth.uid();
  host boolean;
  att meeting_attendance%rowtype;
  phase text;
  invitees integer;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'sign_in'); end if;
  select * into mt from meetings where id = p_meeting for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  host := meeting_is_host(p_meeting, uid);
  if not host and not meeting_is_invited(p_meeting, uid) then return jsonb_build_object('ok', false, 'reason', 'not_invited'); end if;
  if not exists (select 1 from profiles p where p.id = uid and p.is_active) then return jsonb_build_object('ok', false, 'reason', 'not_invited'); end if;
  phase := meeting_phase(mt);
  if phase = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'cancelled'); end if;
  if phase = 'ended' then return jsonb_build_object('ok', false, 'reason', 'ended'); end if;
  if phase = 'upcoming' then return jsonb_build_object('ok', false, 'reason', 'too_early', 'starts_at', mt.starts_at); end if;

  select * into att from meeting_attendance where meeting_id = p_meeting and user_id = uid;
  if att.removed_at is not null and not host then return jsonb_build_object('ok', false, 'reason', 'removed'); end if;
  -- Someone in the room a moment ago (a dropped connection) gets back in; nobody new does.
  if mt.locked and not host and not coalesce(att.last_seen_at > now() - interval '60 seconds', false) then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if mt.lobby_on and not host and coalesce(att.lobby_status, '') <> 'admitted' then
    if att.lobby_status = 'denied' and att.lobby_at > now() - interval '2 minutes' then
      return jsonb_build_object('ok', false, 'reason', 'denied');
    end if;
    insert into meeting_attendance (meeting_id, user_id, lobby_status, lobby_at) values (p_meeting, uid, 'waiting', now())
    on conflict (meeting_id, user_id) do update
      set lobby_status = 'waiting', lobby_at = case when meeting_attendance.lobby_status = 'waiting' then meeting_attendance.lobby_at else now() end;
    return jsonb_build_object('ok', false, 'reason', 'lobby');
  end if;

  insert into meeting_attendance (meeting_id, user_id, first_joined_at, last_seen_at, left_at)
  values (p_meeting, uid, now(), now(), null)
  on conflict (meeting_id, user_id) do update set first_joined_at = coalesce(meeting_attendance.first_joined_at, now()), last_seen_at = now(), left_at = null;
  if mt.started_at is null then update meetings set started_at = now() where id = p_meeting; end if;

  select count(*) into invitees from meeting_invites where meeting_id = p_meeting;
  return jsonb_build_object('ok', true, 'is_host', host, 'user_id', uid,
    'name', coalesce((select p.full_name from profiles p where p.id = uid), 'Member'),
    'close_at', meeting_close_at(mt),
    'join_muted', mt.join_muted, 'join_camera_off', coalesce(mt.join_camera_off, invitees >= 15),
    'can_share', host or mt.screen_share_all);
end $$;

create function meeting_left(p_meeting uuid)
returns void language sql security definer set search_path = public as $$
  update meeting_attendance set left_at = now(), hand_raised_at = null
  where meeting_id = p_meeting and user_id = auth.uid() and first_joined_at is not null;
$$;

create function meeting_chat_send(p_meeting uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  body text := btrim(coalesce(p_body, ''));
begin
  select * into mt from meetings where id = p_meeting;
  if not found or meeting_phase(mt) <> 'live' then raise exception 'The chat is open while the meeting is live'; end if;
  if not mt.chat_on then raise exception 'Chat is off for this meeting'; end if;
  if not exists (select 1 from meeting_attendance a where a.meeting_id = p_meeting and a.user_id = auth.uid()
                 and a.first_joined_at is not null and a.left_at is null and a.removed_at is null and a.last_seen_at > now() - interval '30 seconds') then
    raise exception 'Only people in the room can use the chat';
  end if;
  if body = '' or char_length(body) > 1000 then raise exception 'Messages are 1 to 1000 characters'; end if;
  insert into meeting_chat_messages (meeting_id, user_id, body) values (p_meeting, auth.uid(), body);
end $$;

create function meeting_raise_hand(p_meeting uuid, p_up boolean)
returns void language sql security definer set search_path = public as $$
  update meeting_attendance set hand_raised_at = case when p_up then coalesce(hand_raised_at, now()) end
  where meeting_id = p_meeting and user_id = auth.uid() and first_joined_at is not null;
$$;

create function meeting_action_done(p_item uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  it meeting_action_items%rowtype;
begin
  select * into it from meeting_action_items where id = p_item;
  if not found then raise exception 'That item no longer exists'; end if;
  if it.owner_id is distinct from auth.uid() and not meeting_is_host(it.meeting_id, auth.uid()) then raise exception 'FORBIDDEN'; end if;
  update meeting_action_items set done_at = case when p_done then coalesce(done_at, now()) end where id = p_item;
end $$;

-- ── the room's one read ────────────────────────────────────────────────
-- Asked every few seconds from the room. With p_in_room it also counts as the check-in
-- that adds up attendance (a gap counts for at most 40 seconds).
create function meeting_room_state(p_meeting uuid, p_in_room boolean default false, p_chat_after timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  uid uuid := auth.uid();
  host_kind text;
  att meeting_attendance%rowtype;
begin
  if uid is null then raise exception 'SIGN_IN'; end if;
  select * into mt from meetings where id = p_meeting;
  if not found then raise exception 'That meeting no longer exists'; end if;
  host_kind := meeting_host_kind(p_meeting, uid);
  if host_kind is null and not meeting_is_invited(p_meeting, uid) then raise exception 'FORBIDDEN'; end if;

  if p_in_room and meeting_phase(mt) = 'live' then
    update meeting_attendance a
    set total_seconds = a.total_seconds + case when a.left_at is null and a.last_seen_at is not null
          then least(40, greatest(0, extract(epoch from now() - a.last_seen_at)))::integer else 0 end,
        last_seen_at = now(), left_at = null
    where a.meeting_id = p_meeting and a.user_id = uid and a.first_joined_at is not null and a.removed_at is null;
  end if;
  select * into att from meeting_attendance where meeting_id = p_meeting and user_id = uid;

  return jsonb_build_object(
    'now', now(),
    'meeting', jsonb_build_object('id', mt.id, 'title', mt.title, 'phase', meeting_phase(mt), 'locked', mt.locked, 'chat_on', mt.chat_on,
      'screen_share_all', mt.screen_share_all, 'starts_at', mt.starts_at, 'duration_min', mt.duration_min,
      'current_agenda_id', mt.current_agenda_id, 'agenda_item_at', mt.agenda_item_at),
    'me', jsonb_build_object('id', uid, 'host_kind', host_kind, 'is_host', host_kind is not null, 'removed', att.removed_at is not null,
      'lobby', att.lobby_status, 'hand', att.hand_raised_at),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.user_id, 'name', p.full_name, 'avatar_url', case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end,
        'detail', nullif(concat_ws(' · ', p.department, p.year), ''),
        'seat', meeting_seat(t.user_id), 'host_kind', meeting_host_kind(p_meeting, t.user_id),
        'in_room', a.first_joined_at is not null and a.left_at is null and a.last_seen_at > now() - interval '30 seconds',
        'hand', a.hand_raised_at, 'cant', i.cant_reason, 'joined', a.first_joined_at is not null,
        'ring_answer', (select r.answer from meeting_rings r where r.meeting_id = p_meeting and r.user_id = t.user_id order by r.created_at desc limit 1),
        'rung_at', (select max(r.created_at) from meeting_rings r where r.meeting_id = p_meeting and r.user_id = t.user_id)))
      from (select i2.user_id from meeting_invites i2 where i2.meeting_id = p_meeting
            union select a2.user_id from meeting_attendance a2 where a2.meeting_id = p_meeting and a2.first_joined_at is not null) t
      join profiles p on p.id = t.user_id
      left join meeting_attendance a on a.meeting_id = p_meeting and a.user_id = t.user_id
      left join meeting_invites i on i.meeting_id = p_meeting and i.user_id = t.user_id), '[]'::jsonb),
    'knocks', case when host_kind is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'user_id', k.user_id, 'name', p.full_name,
        'detail', nullif(concat_ws(' ', p.department, p.year), ''), 'note', k.note, 'at', k.created_at) order by k.created_at)
      from meeting_knocks k join profiles p on p.id = k.user_id where k.meeting_id = p_meeting and k.status = 'pending'), '[]'::jsonb) end,
    'lobby', case when host_kind is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', a.user_id, 'name', p.full_name, 'at', a.lobby_at) order by a.lobby_at)
      from meeting_attendance a join profiles p on p.id = a.user_id where a.meeting_id = p_meeting and a.lobby_status = 'waiting'), '[]'::jsonb) end,
    'chat', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'user_id', c.user_id, 'name', p.full_name, 'body', case when c.deleted_at is null then c.body end,
        'deleted', c.deleted_at is not null, 'at', c.created_at) order by c.created_at)
      from (select * from meeting_chat_messages c2 where c2.meeting_id = p_meeting
              and (p_chat_after is null or c2.created_at > p_chat_after or c2.deleted_at > p_chat_after)
            order by c2.created_at desc limit 300) c
      left join profiles p on p.id = c.user_id), '[]'::jsonb),
    'agenda', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'minutes', a.minutes) order by a.position)
      from meeting_agenda_items a where a.meeting_id = p_meeting), '[]'::jsonb),
    'notes', (select jsonb_build_object('body', n.body, 'decisions', n.decisions, 'version', n.version, 'updated_at', n.updated_at) from meeting_notes n where n.meeting_id = p_meeting),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'task', x.task, 'owner_id', x.owner_id, 'owner', p.full_name, 'due_on', x.due_on, 'done', x.done_at is not null) order by x.created_at)
      from meeting_action_items x left join profiles p on p.id = x.owner_id where x.meeting_id = p_meeting), '[]'::jsonb));
end $$;

-- ── what a host does ───────────────────────────────────────────────────
-- Every host action comes here first: the caller's rights are checked now, on the
-- server, whatever their screen showed. The website then does what LiveKit has to do
-- (from `live`), only after this has said yes.
create function meeting_host_action(p_meeting uuid, p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  uid uuid := auth.uid();
  target uuid := nullif(p ->> 'user', '')::uuid;
  target_name text;
  phase text;
  n integer := 0;
  skipped integer := 0;
  k meeting_knocks%rowtype;
  next_item uuid;
  who record;
  ver integer;
begin
  if uid is null then raise exception 'FORBIDDEN'; end if;
  select * into mt from meetings where id = p_meeting for update;
  if not found then raise exception 'That meeting no longer exists'; end if;
  if not meeting_is_host(p_meeting, uid) then raise exception 'FORBIDDEN'; end if;
  phase := meeting_phase(mt);
  if target is not null then select full_name into target_name from profiles where id = target; end if;

  -- Written after the meeting too: the minutes can be finished later.
  if p_action = 'set_notes' then
    if char_length(coalesce(p ->> 'body', '')) > 50000 then raise exception 'The notes are too long'; end if;
    insert into meeting_notes (meeting_id) values (p_meeting) on conflict do nothing;
    update meeting_notes set body = coalesce(p ->> 'body', body), decisions = coalesce(p -> 'decisions', decisions), version = version + 1,
      updated_by = uid, updated_at = now() where meeting_id = p_meeting returning version into ver;
    return jsonb_build_object('version', ver);
  elsif p_action = 'action_add' then
    if btrim(coalesce(p ->> 'task', '')) = '' then raise exception 'Write the task'; end if;
    if target is not null and not meeting_is_invited(p_meeting, target) and not meeting_is_host(p_meeting, target) then raise exception 'The owner must be invited'; end if;
    insert into meeting_action_items (meeting_id, task, owner_id, due_on, created_by)
    values (p_meeting, btrim(p ->> 'task'), target, nullif(p ->> 'due_on', '')::date, uid);
    return jsonb_build_object('ok', true);
  elsif p_action = 'action_delete' then
    delete from meeting_action_items where id = (p ->> 'id')::uuid and meeting_id = p_meeting;
    return jsonb_build_object('ok', true);
  elsif p_action = 'send_minutes' then
    insert into notifications (user_id, title, body, link)
    select i.user_id, 'Minutes: ' || mt.title, 'The minutes of the meeting on ' || meeting_when(mt.starts_at) || ' are ready.', '/meetings/' || p_meeting || '/minutes'
    from meeting_invites i where i.meeting_id = p_meeting;
    get diagnostics n = row_count;
    perform meeting_audit('sent_meeting_minutes', p_meeting, mt.title || ': ' || n || ' people');
    return jsonb_build_object('sent', n);
  end if;

  if phase not in ('doors', 'live') then raise exception 'This meeting is not open'; end if;

  case p_action
    when 'make_cohost' then
      if target is null or not exists (select 1 from profiles where id = target) then raise exception 'That person was not found'; end if;
      insert into meeting_invites (meeting_id, user_id, source) values (p_meeting, target, 'knock') on conflict do nothing;
      insert into meeting_cohosts (meeting_id, user_id, source, made_by) values (p_meeting, target, 'made_live', uid)
      on conflict (meeting_id, user_id) do update set removed_at = null, source = 'made_live', made_by = uid, made_at = now();
      perform meeting_audit('made_cohost', p_meeting, coalesce(target_name, target::text));
      return jsonb_build_object('live', 'permissions', 'user', target, 'host', true);
    when 'remove_cohost' then
      if meeting_host_kind(p_meeting, target) in ('creator', 'admin') then raise exception 'The creator and admins can''t be removed as hosts'; end if;
      update meeting_cohosts set removed_at = now(), made_by = uid where meeting_id = p_meeting and user_id = target and removed_at is null;
      perform meeting_audit('removed_cohost', p_meeting, coalesce(target_name, target::text));
      return jsonb_build_object('live', 'permissions', 'user', target, 'host', false, 'screen_share_all', mt.screen_share_all);
    when 'admit' then
      update meeting_attendance set lobby_status = 'admitted', lobby_at = now() where meeting_id = p_meeting and user_id = target and lobby_status = 'waiting';
      perform meeting_audit('admitted_from_lobby', p_meeting, coalesce(target_name, target::text));
      return jsonb_build_object('ok', true);
    when 'admit_all' then
      update meeting_attendance set lobby_status = 'admitted', lobby_at = now() where meeting_id = p_meeting and lobby_status = 'waiting';
      get diagnostics n = row_count;
      perform meeting_audit('admitted_all_from_lobby', p_meeting, n || ' people');
      return jsonb_build_object('admitted', n);
    when 'deny' then
      update meeting_attendance set lobby_status = 'denied', lobby_at = now() where meeting_id = p_meeting and user_id = target and lobby_status = 'waiting';
      perform meeting_audit('denied_from_lobby', p_meeting, coalesce(target_name, target::text));
      return jsonb_build_object('ok', true);
    when 'knock_let_in', 'knock_not_now' then
      select * into k from meeting_knocks where id = (p ->> 'id')::uuid and meeting_id = p_meeting for update;
      if not found or k.status <> 'pending' then raise exception 'That knock has already been answered'; end if;
      update meeting_knocks set status = case when p_action = 'knock_let_in' then 'let_in' else 'not_now' end, decided_by = uid, decided_at = now() where id = k.id;
      select full_name into target_name from profiles where id = k.user_id;
      if p_action = 'knock_let_in' then
        insert into meeting_invites (meeting_id, user_id, source) values (p_meeting, k.user_id, 'knock') on conflict do nothing;
        insert into meeting_attendance (meeting_id, user_id, lobby_status, lobby_at) values (p_meeting, k.user_id, 'admitted', now())
        on conflict (meeting_id, user_id) do update set lobby_status = 'admitted', lobby_at = now();
      end if;
      perform meeting_audit(p_action, p_meeting, coalesce(target_name, k.user_id::text));
      return jsonb_build_object('ok', true);
    when 'ring' then
      for who in
        select i.user_id from meeting_invites i
        where i.meeting_id = p_meeting and i.user_id <> uid and (target is null or i.user_id = target)
          and not exists (select 1 from meeting_attendance a where a.meeting_id = p_meeting and a.user_id = i.user_id
                          and a.left_at is null and a.last_seen_at > now() - interval '30 seconds')
      loop
        if exists (select 1 from meeting_rings r where r.meeting_id = p_meeting and r.user_id = who.user_id and r.created_at > now() - interval '1 minute') then
          skipped := skipped + 1;
        else
          insert into meeting_rings (meeting_id, user_id, rung_by) values (p_meeting, who.user_id, uid);
          n := n + 1;
        end if;
      end loop;
      perform meeting_audit('rang_invitees', p_meeting, coalesce(target_name, 'Everyone not joined') || ': ' || n || ' rung');
      return jsonb_build_object('rung', n, 'skipped', skipped);
    when 'lower_hand' then
      update meeting_attendance set hand_raised_at = null where meeting_id = p_meeting and user_id = target;
      return jsonb_build_object('ok', true);
    when 'lower_hands' then
      update meeting_attendance set hand_raised_at = null where meeting_id = p_meeting;
      return jsonb_build_object('ok', true);
    when 'lock' then
      update meetings set locked = coalesce((p ->> 'locked')::boolean, true) where id = p_meeting;
      perform meeting_audit(case when coalesce((p ->> 'locked')::boolean, true) then 'locked_meeting' else 'unlocked_meeting' end, p_meeting, mt.title);
      return jsonb_build_object('ok', true);
    when 'agenda' then
      select a.id into next_item from meeting_agenda_items a where a.meeting_id = p_meeting and a.id = (p ->> 'id')::uuid;
      update meetings set current_agenda_id = next_item, agenda_item_at = case when next_item is null then null else now() end where id = p_meeting;
      return jsonb_build_object('ok', true);
    when 'chat_delete' then
      update meeting_chat_messages set deleted_at = now(), deleted_by = uid where id = (p ->> 'id')::uuid and meeting_id = p_meeting;
      perform meeting_audit('deleted_meeting_chat', p_meeting, 'Message removed');
      return jsonb_build_object('ok', true);
    when 'mute_all' then
      perform meeting_audit('muted_all', p_meeting, mt.title);
      return jsonb_build_object('live', 'mute_all');
    when 'cameras_off' then
      perform meeting_audit('cameras_off_all', p_meeting, mt.title);
      return jsonb_build_object('live', 'cameras_off');
    when 'mute_person' then
      perform meeting_audit('muted_person', p_meeting, coalesce(target_name, target::text));
      return jsonb_build_object('live', 'mute_person', 'user', target);
    when 'remove_person' then
      if meeting_host_kind(p_meeting, target) in ('creator', 'admin') then raise exception 'The creator and admins can''t be removed'; end if;
      insert into meeting_attendance (meeting_id, user_id, removed_at) values (p_meeting, target, now())
      on conflict (meeting_id, user_id) do update set removed_at = now(), left_at = coalesce(meeting_attendance.left_at, now()), hand_raised_at = null;
      perform meeting_audit('removed_from_meeting', p_meeting, coalesce(target_name, target::text));
      return jsonb_build_object('live', 'remove', 'user', target);
    when 'end' then
      perform meeting_finish(p_meeting, uid);
      perform meeting_audit('ended_meeting', p_meeting, mt.title);
      return jsonb_build_object('live', 'end');
    else
      raise exception 'Unknown action';
  end case;
end $$;

-- ── the phone QR ───────────────────────────────────────────────────────
create function meeting_qr_create(p_meeting uuid, p_hash text, p_purpose text, p_expires timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not meeting_is_invited(p_meeting, auth.uid()) and not meeting_is_host(p_meeting, auth.uid()) then raise exception 'FORBIDDEN'; end if;
  delete from meeting_qr_tokens where meeting_id = p_meeting and user_id = auth.uid();
  insert into meeting_qr_tokens (meeting_id, user_id, token_hash, purpose, expires_at) values (p_meeting, auth.uid(), p_hash, p_purpose, p_expires);
end $$;

-- Single use. Someone else's account uses nothing up.
create function meeting_qr_use(p_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t meeting_qr_tokens%rowtype;
begin
  select * into t from meeting_qr_tokens where token_hash = p_hash for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if t.user_id is distinct from auth.uid() then return jsonb_build_object('ok', false, 'reason', 'other_account'); end if;
  if t.used_at is not null or t.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  update meeting_qr_tokens set used_at = now() where id = t.id;
  return jsonb_build_object('ok', true, 'meeting_id', t.meeting_id, 'purpose', t.purpose);
end $$;

-- ── what the admin panel and the minutes read ──────────────────────────
create function admin_meetings()
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'title', m.title, 'starts_at', m.starts_at, 'duration_min', m.duration_min, 'phase', meeting_phase(m), 'instant', m.instant, 'series', m.series_id is not null,
      'host', (select p.full_name from profiles p where p.id = m.created_by),
      'invitees', (select count(*) from meeting_invites i where i.meeting_id = m.id),
      'attendees', (select count(*) from meeting_attendance a where a.meeting_id = m.id and a.first_joined_at is not null),
      'inside', meeting_inside_count(m.id),
      'chips', coalesce((select jsonb_agg(c.label order by c.label) from (
          select g.name as label from meeting_audience a join core_groups g on g.id = a.core_group_id where a.meeting_id = m.id
          union all select case a.role when 'admins' then 'All admins' else 'All reviewers' end from meeting_audience a where a.meeting_id = m.id and a.kind = 'role'
          union all select t.name from meeting_audience a join teams t on t.id = a.team_id where a.meeting_id = m.id
          union all select p.full_name from meeting_audience a join profiles p on p.id = a.user_id where a.meeting_id = m.id) c), '[]'::jsonb))
    order by m.starts_at desc) from meetings m), '[]'::jsonb);
end $$;

create function admin_meeting_detail(p_meeting uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  mt meetings%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into mt from meetings where id = p_meeting;
  if not found then return null; end if;
  return to_jsonb(mt) || jsonb_build_object(
    'phase', meeting_phase(mt),
    'audience', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'id', coalesce(a.core_group_id::text, a.role, a.team_id::text, a.user_id::text),
        'label', case a.kind when 'person' then (select p.full_name from profiles p where p.id = a.user_id) end)) from meeting_audience a where a.meeting_id = p_meeting), '[]'::jsonb),
    'cohosts', coalesce((select jsonb_agg(jsonb_build_object('id', c.user_id, 'name', p.full_name)) from meeting_cohosts c join profiles p on p.id = c.user_id
      where c.meeting_id = p_meeting and c.source = 'chosen' and c.removed_at is null), '[]'::jsonb),
    'agenda', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'minutes', a.minutes) order by a.position) from meeting_agenda_items a where a.meeting_id = p_meeting), '[]'::jsonb),
    'invitees', (select count(*) from meeting_invites i where i.meeting_id = p_meeting));
end $$;

create function meeting_minutes(p_meeting uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  mt meetings%rowtype;
  uid uuid := auth.uid();
begin
  select * into mt from meetings where id = p_meeting;
  if not found then return null; end if;
  if uid is null or (not meeting_is_invited(p_meeting, uid) and not meeting_is_host(p_meeting, uid)) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'id', mt.id, 'title', mt.title, 'description', mt.description, 'starts_at', mt.starts_at, 'duration_min', mt.duration_min, 'phase', meeting_phase(mt),
    'started_at', mt.started_at, 'ended_at', mt.ended_at, 'is_host', meeting_is_host(p_meeting, uid), 'me', uid,
    'agenda', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'minutes', a.minutes) order by a.position) from meeting_agenda_items a where a.meeting_id = p_meeting), '[]'::jsonb),
    'notes', coalesce((select n.body from meeting_notes n where n.meeting_id = p_meeting), ''),
    'decisions', coalesce((select n.decisions from meeting_notes n where n.meeting_id = p_meeting), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'task', x.task, 'owner_id', x.owner_id, 'owner', p.full_name, 'due_on', x.due_on, 'done', x.done_at is not null) order by x.created_at)
      from meeting_action_items x left join profiles p on p.id = x.owner_id where x.meeting_id = p_meeting), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'seat', meeting_seat(a.user_id),
        'first_join', a.first_joined_at, 'last_leave', coalesce(a.left_at, a.last_seen_at), 'minutes', round(a.total_seconds / 60.0)::integer))
      from meeting_attendance a join profiles p on p.id = a.user_id where a.meeting_id = p_meeting and a.first_joined_at is not null), '[]'::jsonb),
    'cant', coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'reason', i.cant_reason))
      from meeting_invites i join profiles p on p.id = i.user_id where i.meeting_id = p_meeting and i.cant_reason is not null), '[]'::jsonb),
    'hosts', coalesce((select jsonb_agg(jsonb_build_object('name', h.name, 'kind', h.kind)) from (
        select p.full_name as name, 'Host' as kind from profiles p where p.id = mt.created_by
        union select p.full_name, 'Host' from meeting_attendance a join profiles p on p.id = a.user_id
          where a.meeting_id = p_meeting and a.first_joined_at is not null and meeting_is_admin_user(a.user_id)
        union select p.full_name, 'Co-host' from meeting_cohosts c join profiles p on p.id = c.user_id
          where c.meeting_id = p_meeting and c.removed_at is null and c.user_id is distinct from mt.created_by and not meeting_is_admin_user(c.user_id)) h), '[]'::jsonb));
end $$;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table meetings enable row level security;
alter table meeting_audience enable row level security;
alter table meeting_invites enable row level security;
alter table meeting_cohosts enable row level security;
alter table meeting_agenda_items enable row level security;
alter table meeting_knocks enable row level security;
alter table meeting_rings enable row level security;
alter table meeting_qr_tokens enable row level security;
alter table meeting_chat_messages enable row level security;
alter table meeting_notes enable row level security;
alter table meeting_action_items enable row level security;
alter table meeting_attendance enable row level security;

create policy "invitees and admins read meetings" on meetings for select using (is_admin() or meeting_is_invited(id, auth.uid()));
create policy "admins read the audience" on meeting_audience for select using (is_admin());
create policy "people read their invite, admins all" on meeting_invites for select using (is_admin() or user_id = auth.uid());
create policy "invitees read co-hosts" on meeting_cohosts for select using (is_admin() or meeting_is_invited(meeting_id, auth.uid()));
create policy "invitees read the agenda" on meeting_agenda_items for select using (is_admin() or meeting_is_invited(meeting_id, auth.uid()));
create policy "people read their knocks, hosts all" on meeting_knocks for select using (user_id = auth.uid() or meeting_is_host(meeting_id, auth.uid()));
create policy "people read their rings, hosts all" on meeting_rings for select using (user_id = auth.uid() or meeting_is_host(meeting_id, auth.uid()));
create policy "invitees read the chat" on meeting_chat_messages for select using (is_admin() or meeting_is_invited(meeting_id, auth.uid()));
create policy "invitees read the notes" on meeting_notes for select using (is_admin() or meeting_is_invited(meeting_id, auth.uid()));
create policy "invitees read action items" on meeting_action_items for select using (is_admin() or meeting_is_invited(meeting_id, auth.uid()));
create policy "people read their attendance, hosts all" on meeting_attendance for select using (user_id = auth.uid() or meeting_is_host(meeting_id, auth.uid()));
-- No write policies and none on meeting_qr_tokens: every write goes through the functions above.

revoke all on meetings, meeting_audience, meeting_invites, meeting_cohosts, meeting_agenda_items, meeting_knocks, meeting_rings,
  meeting_qr_tokens, meeting_chat_messages, meeting_notes, meeting_action_items, meeting_attendance from anon;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  meeting_is_admin_user(uuid), meeting_host_kind(uuid, uuid), meeting_is_host(uuid, uuid), meeting_is_invited(uuid, uuid),
  meeting_inside_count(uuid), meeting_pass_tag(uuid, uuid), meeting_pass_link(uuid, uuid), meeting_seat(uuid), meeting_audit(text, uuid, text),
  meeting_audience_users(uuid), meeting_sync_invites(uuid, boolean), meeting_core_member_changed(), meeting_apply_details(uuid, jsonb),
  meeting_save(uuid, jsonb), meeting_start_instant(jsonb), meeting_cancel(uuid), meeting_finish(uuid, uuid), send_meeting_reminders(),
  meeting_pass_json(meetings, uuid), my_meeting_passes(), meeting_view(uuid, text), my_meeting_signal(), meeting_cant_make_it(uuid, text),
  meeting_knock(uuid, text), meeting_ring_answer(uuid, text), meeting_enter(uuid), meeting_left(uuid), meeting_chat_send(uuid, text),
  meeting_raise_hand(uuid, boolean), meeting_action_done(uuid, boolean), meeting_room_state(uuid, boolean, timestamptz),
  meeting_host_action(uuid, text, jsonb), meeting_qr_create(uuid, text, text, timestamptz), meeting_qr_use(text),
  admin_meetings(), admin_meeting_detail(uuid), meeting_minutes(uuid)
  from public, anon, authenticated;

-- RLS policies above call these as the signed-in person.
grant execute on function meeting_is_invited(uuid, uuid), meeting_is_host(uuid, uuid) to authenticated;
grant execute on function
  meeting_save(uuid, jsonb), meeting_start_instant(jsonb), meeting_cancel(uuid),
  my_meeting_passes(), meeting_view(uuid, text), my_meeting_signal(), meeting_cant_make_it(uuid, text),
  meeting_knock(uuid, text), meeting_ring_answer(uuid, text), meeting_enter(uuid), meeting_left(uuid), meeting_chat_send(uuid, text),
  meeting_raise_hand(uuid, boolean), meeting_action_done(uuid, boolean), meeting_room_state(uuid, boolean, timestamptz),
  meeting_host_action(uuid, text, jsonb), meeting_qr_create(uuid, text, text, timestamptz), meeting_qr_use(text),
  admin_meetings(), admin_meeting_detail(uuid), meeting_minutes(uuid)
  to authenticated;
grant execute on function send_meeting_reminders() to service_role;

commit;
