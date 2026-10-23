-- 1. "Interview reviewers (all hubs)": one list of reviewers for a whole
--    recruitment. It does not add a new kind of access: each person on it is
--    kept in recruitment_team_reviewers for every team of the cycle, so the
--    existing checks (is_team_reviewer, reviews_application,
--    can_read_recruitment_files) and every existing policy work unchanged.
--    An email without an account waits as an invite and is applied when an
--    account with that (confirmed) email exists.
--
-- 2. One interview room for the whole day: the panel stays in one LiveKit
--    room ("fx-day-<day id without dashes>") all day; each slot's candidates
--    are let in for their own slot only and removed when it ends. The
--    functions here tell the server who must leave and record each removal.
--
-- Additive only: new tables and functions, a wider list of integrity event
-- types, and new defaults (0 minutes) for early join and grace. Nothing is
-- dropped or renamed; recruitment_interview_rooms stays as it is.
--
-- Run once, as one piece. Running it again changes nothing.

begin;

-- ── 1. reviewers for all hubs ──────────────────────────────────────────
create table if not exists recruitment_cycle_reviewers (
  cycle_id uuid not null references recruitment_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (cycle_id, user_id)
);

create table if not exists recruitment_cycle_reviewer_invites (
  cycle_id uuid not null references recruitment_cycles(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (cycle_id, email)
);

alter table recruitment_cycle_reviewers enable row level security;
alter table recruitment_cycle_reviewer_invites enable row level security;

drop policy if exists "admins and the reviewer read cycle reviewers" on recruitment_cycle_reviewers;
create policy "admins and the reviewer read cycle reviewers" on recruitment_cycle_reviewers for select
  using (is_admin() or user_id = auth.uid());
drop policy if exists "admins add cycle reviewers" on recruitment_cycle_reviewers;
create policy "admins add cycle reviewers" on recruitment_cycle_reviewers for insert with check (is_admin());
drop policy if exists "admins remove cycle reviewers" on recruitment_cycle_reviewers;
create policy "admins remove cycle reviewers" on recruitment_cycle_reviewers for delete using (is_admin());

drop policy if exists "admins read reviewer invites" on recruitment_cycle_reviewer_invites;
create policy "admins read reviewer invites" on recruitment_cycle_reviewer_invites for select using (is_admin());
drop policy if exists "admins add reviewer invites" on recruitment_cycle_reviewer_invites;
create policy "admins add reviewer invites" on recruitment_cycle_reviewer_invites for insert with check (is_admin());
drop policy if exists "admins cancel reviewer invites" on recruitment_cycle_reviewer_invites;
create policy "admins cancel reviewer invites" on recruitment_cycle_reviewer_invites for delete using (is_admin());

-- Makes one account a reviewer of every team of the cycle. Internal (no grant):
-- called by the functions and triggers below. True when they were not on the list yet.
create or replace function recruitment_sync_cycle_reviewer(p_cycle uuid, p_user uuid, p_by uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare fresh boolean;
begin
  insert into recruitment_cycle_reviewers (cycle_id, user_id, added_by) values (p_cycle, p_user, p_by)
  on conflict (cycle_id, user_id) do nothing;
  fresh := found;
  insert into recruitment_team_reviewers (team_id, user_id, added_by)
  select t.id, p_user, p_by from recruitment_teams t where t.cycle_id = p_cycle
  on conflict (team_id, user_id) do nothing;
  if fresh then
    -- One notification per person (not one per hub).
    insert into notifications (user_id, title, body, link)
    values (p_user, 'You are a recruitment reviewer',
            'You can now review applications for every hub and join the interview room for this recruitment.', '/review');
  end if;
  return fresh;
end $$;

-- Adds reviewers by email (trimmed, lower-cased, each once). An account with
-- that confirmed email is added at once; otherwise an invite waits for it.
-- Returns one row per distinct email: added / already / invited / deactivated / invalid.
create or replace function add_cycle_reviewers(p_cycle uuid, p_emails text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e text; seen text[] := '{}'; uid uuid; active boolean; who text; res text;
  results jsonb := '[]'::jsonb;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from recruitment_cycles where id = p_cycle) then raise exception 'Recruitment not found'; end if;
  if coalesce(array_length(p_emails, 1), 0) > 200 then raise exception 'Add at most 200 emails at a time'; end if;
  foreach e in array coalesce(p_emails, '{}'::text[]) loop
    e := lower(btrim(e));
    if e = '' or e = any(seen) then continue; end if;
    seen := seen || e;
    uid := null; who := null;
    if char_length(e) > 254 or e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      res := 'invalid';
    else
      select u.id, coalesce(p.is_active, true), p.full_name into uid, active, who
      from auth.users u left join profiles p on p.id = u.id
      where lower(u.email) = e and u.email_confirmed_at is not null
      limit 1;
      if uid is null then
        insert into recruitment_cycle_reviewer_invites (cycle_id, email, added_by) values (p_cycle, e, auth.uid())
        on conflict (cycle_id, email) do nothing;
        if found then
          insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
          values (auth.uid(), 'invited_cycle_reviewer', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', e));
        end if;
        res := 'invited';
      elsif not active then
        res := 'deactivated';
      elsif recruitment_sync_cycle_reviewer(p_cycle, uid, auth.uid()) then
        insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
        values (auth.uid(), 'added_cycle_reviewer', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', coalesce(who, e), 'reviewer', uid));
        res := 'added';
      else
        res := 'already';
      end if;
    end if;
    results := results || jsonb_build_object('email', e, 'result', res, 'name', who);
  end loop;
  return results;
end $$;

-- Takes someone off the list and off every team of the cycle. Their scores and notes stay.
create or replace function remove_cycle_reviewer(p_cycle uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare was boolean;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  delete from recruitment_cycle_reviewers where cycle_id = p_cycle and user_id = p_user;
  was := found;
  delete from recruitment_team_reviewers r using recruitment_teams t
  where r.team_id = t.id and t.cycle_id = p_cycle and r.user_id = p_user;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'removed_cycle_reviewer', 'recruitment_cycles', p_cycle::text,
          jsonb_build_object('note', coalesce((select full_name from profiles where id = p_user), p_user::text), 'reviewer', p_user));
  return was;
end $$;

create or replace function remove_cycle_reviewer_invite(p_cycle uuid, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare was boolean;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  delete from recruitment_cycle_reviewer_invites where cycle_id = p_cycle and email = lower(btrim(p_email));
  was := found;
  if was then
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (auth.uid(), 'cancelled_cycle_reviewer_invite', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', lower(btrim(p_email))));
  end if;
  return was;
end $$;

-- A team added later gets the cycle's reviewers too.
create or replace function recruitment_team_gets_cycle_reviewers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into recruitment_team_reviewers (team_id, user_id, added_by)
  select new.id, c.user_id, c.added_by from recruitment_cycle_reviewers c where c.cycle_id = new.cycle_id
  on conflict (team_id, user_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_recruitment_team_cycle_reviewers on recruitment_teams;
create trigger trg_recruitment_team_cycle_reviewers after insert on recruitment_teams
  for each row execute function recruitment_team_gets_cycle_reviewers();

-- An invite is applied once an account has that email, confirmed: at sign-up
-- (Google / GitHub accounts arrive confirmed) or when the email is confirmed.
-- A problem here never blocks the sign-up itself.
create or replace function recruitment_apply_reviewer_invites()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  if new.email is null or new.email_confirmed_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null and old.email is not distinct from new.email then return new; end if;
  begin
    for inv in
      delete from public.recruitment_cycle_reviewer_invites where email = lower(new.email) returning cycle_id, added_by
    loop
      if public.recruitment_sync_cycle_reviewer(inv.cycle_id, new.id, inv.added_by) then
        insert into public.audit_logs (user_id, action, resource_type, resource_id, metadata)
        values (inv.added_by, 'added_cycle_reviewer', 'recruitment_cycles', inv.cycle_id::text,
                jsonb_build_object('note', 'invite applied on sign-up: ' || lower(new.email), 'reviewer', new.id));
      end if;
    end loop;
  exception when others then
    raise warning 'reviewer invite for % not applied: %', new.id, sqlerrm;
  end;
  return new;
end $$;
-- Named so that it runs after on_auth_user_created (the profile is made first).
drop trigger if exists on_auth_user_reviewer_invites on auth.users;
create trigger on_auth_user_reviewer_invites after insert or update of email_confirmed_at, email on auth.users
  for each row execute function recruitment_apply_reviewer_invites();

-- People who were invited before they had an account, and already have one now.
do $$
declare inv record; uid uuid;
begin
  for inv in select * from recruitment_cycle_reviewer_invites loop
    select id into uid from auth.users where lower(email) = inv.email and email_confirmed_at is not null limit 1;
    if uid is not null then
      perform recruitment_sync_cycle_reviewer(inv.cycle_id, uid, inv.added_by);
      delete from recruitment_cycle_reviewer_invites where cycle_id = inv.cycle_id and email = inv.email;
    end if;
  end loop;
end $$;

-- ── 2. one interview room for the whole day ────────────────────────────
-- Candidates get no extra minutes in the day room unless an admin sets them.
alter table recruitment_room_settings alter column early_join_minutes set default 0;
alter table recruitment_room_settings alter column grace_minutes set default 0;

-- The day's room and its last clean-up (for the admin's "Room status" box).
create table if not exists recruitment_interview_day_rooms (
  day_id uuid primary key references recruitment_slot_days(id) on delete cascade,
  room_name text not null check (room_name ~ '^fx-day-[0-9a-f]{32}$'),
  last_enforced_at timestamptz,
  removed_total integer not null default 0,
  created_at timestamptz not null default now()
);
alter table recruitment_interview_day_rooms enable row level security;
drop policy if exists "admins read day rooms" on recruitment_interview_day_rooms;
create policy "admins read day rooms" on recruitment_interview_day_rooms for select using (is_admin());

-- A new integrity event: the server removed someone from the room (their slot was over).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'recruitment_integrity_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tab_hidden%'
  loop
    execute format('alter table recruitment_integrity_events drop constraint %I', c);
  end loop;
end $$;
alter table recruitment_integrity_events add constraint recruitment_integrity_events_type_check check (type in (
  'tab_hidden', 'tab_visible', 'window_blur', 'window_focus', 'fullscreen_exit',
  'copy', 'paste', 'cut', 'contextmenu', 'extra_screen', 'camera_off', 'mic_off',
  'left_room', 'rejoined', 'phone_camera_joined', 'phone_camera_left', 'removed_slot_ended'));

create or replace function interview_day_room_name(p_day uuid)
returns text language sql immutable set search_path = public as $$
  select 'fx-day-' || replace(p_day::text, '-', '');
$$;

-- The panel's access to a whole day: admins; the cycle's reviewers (all hubs);
-- a hub's reviewers when a candidate of their hub is booked that day. With
-- the day's slots, its room settings and the database's clock.
create or replace function interview_day_access(p_day uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare d recruitment_slot_days%rowtype; info jsonb; teams uuid[]; v_role text; all_hubs boolean := false;
begin
  if auth.uid() is null then return null; end if;
  select * into d from recruitment_slot_days where id = p_day;
  if not found then return null; end if;
  if is_admin() then
    v_role := 'admin'; all_hubs := true;
  elsif exists (select 1 from recruitment_cycle_reviewers c where c.cycle_id = d.cycle_id and c.user_id = auth.uid()) then
    v_role := 'reviewer'; all_hubs := true;
    select array_agg(t.id) into teams from recruitment_teams t where t.cycle_id = d.cycle_id;
  else
    select array_agg(distinct r.team_id) into teams
    from recruitment_slot_bookings b
    join recruitment_slots s on s.id = b.slot_id
    join recruitment_team_status ts on ts.application_id = b.application_id
    join recruitment_team_reviewers r on r.team_id = ts.team_id and r.user_id = auth.uid()
    where s.day_id = p_day and b.status in ('booked', 'attended', 'no_show');
    if teams is null then return null; end if;
    v_role := 'reviewer';
  end if;
  select jsonb_build_object(
    'day_id', d.id, 'cycle_id', d.cycle_id, 'day', d.date, 'mode', d.mode, 'role', v_role, 'all_hubs', all_hubs,
    'teams', to_jsonb(teams), 'now', now(), 'room_name', interview_day_room_name(d.id),
    'room_enabled', coalesce(r.room_enabled, false), 'early_join_minutes', coalesce(r.early_join_minutes, 0),
    'grace_minutes', coalesce(r.grace_minutes, 0), 'strict_fullscreen', coalesce(r.strict_fullscreen, true),
    'phone_camera', coalesce(r.phone_camera, 'optional'),
    'last_enforced_at', dr.last_enforced_at, 'removed_total', coalesce(dr.removed_total, 0),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
               'booked', (select count(*) from recruitment_slot_bookings b where b.slot_id = s.id and b.status in ('booked', 'attended', 'no_show')))
             order by s.starts_at)
      from recruitment_slots s where s.day_id = d.id), '[]'::jsonb))
  into info
  from (select 1) one
  left join recruitment_room_settings r on r.day_id = d.id
  left join recruitment_interview_day_rooms dr on dr.day_id = d.id;
  return info;
end $$;

-- Why a booking may not be in the day room right now (null: it may).
create or replace function recruitment_day_room_reason(p_day uuid, p_booking uuid)
returns text language plpgsql security definer stable set search_path = public as $$
declare k record;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.day_id is distinct from p_day then return 'no_booking'; end if;
  if k.mode <> 'online_meet' or not k.room_enabled then return 'room_off'; end if;
  if now() < k.starts_at - make_interval(mins => k.early_join_minutes) then return 'too_early'; end if;
  if now() > k.ends_at + make_interval(mins => k.grace_minutes) then return 'slot_ended'; end if;
  return null;
end $$;

-- May the caller run the day room's clean-up? The panel of the day, or a
-- candidate booked on it (their join starts one; it can only remove people
-- whose time is over).
create or replace function recruitment_day_room_caller(p_day uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select interview_day_access(p_day) is not null or exists (
    select 1 from recruitment_slot_bookings b join recruitment_slots s on s.id = b.slot_id
    where s.day_id = p_day and b.user_id = auth.uid() and b.status in ('booked', 'attended'));
$$;

-- Of the bookings now in the room, the ones that must leave, and why.
create or replace function day_room_overdue(p_day uuid, p_bookings uuid[])
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not recruitment_day_room_caller(p_day) then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('booking_id', x.id, 'reason', x.reason))
    from (select b as id, recruitment_day_room_reason(p_day, b) as reason
          from unnest(coalesce(p_bookings, '{}'::uuid[])) b) x
    where x.reason is not null), '[]'::jsonb);
end $$;

-- After the server has removed them: one integrity event and one audit entry
-- per person (checked again here, so nobody can be marked as removed while
-- their slot is still on), and the time of this clean-up.
create or replace function record_day_room_removals(p_day uuid, p_removed jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare item jsonb; bk uuid; why text; k record; n integer := 0;
begin
  if not recruitment_day_room_caller(p_day) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(coalesce(p_removed, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_removed, '[]'::jsonb)) > 60 then
    raise exception 'Too many';
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_removed, '[]'::jsonb)) loop
    begin
      bk := (item ->> 'booking_id')::uuid;
    exception when others then
      continue;
    end;
    why := recruitment_day_room_reason(p_day, bk);
    if why is null then continue; end if;
    select b.id, b.slot_id, b.application_id, b.user_id into k
    from recruitment_slot_bookings b join recruitment_slots s on s.id = b.slot_id
    where b.id = bk and s.day_id = p_day;
    if not found then continue; end if;
    -- Two panel screens may clean up at the same moment: note it once.
    if exists (select 1 from recruitment_integrity_events e where e.booking_id = bk and e.type = 'removed_slot_ended'
               and e.detail ->> 'who' is not distinct from (item ->> 'who') and e.created_at > now() - interval '2 minutes') then
      continue;
    end if;
    insert into recruitment_integrity_events (booking_id, slot_id, application_id, user_id, type, detail, occurred_at)
    values (bk, k.slot_id, k.application_id, k.user_id, 'removed_slot_ended',
            jsonb_build_object('reason', why, 'who', case when item ->> 'who' = 'phone' then 'phone' else 'candidate' end), now());
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (auth.uid(), 'removed_from_interview_room', 'recruitment_slot_bookings', bk::text,
            jsonb_build_object('note', why || case when item ->> 'who' = 'phone' then ' (phone camera)' else '' end));
    n := n + 1;
  end loop;
  insert into recruitment_interview_day_rooms (day_id, room_name, last_enforced_at, removed_total)
  values (p_day, interview_day_room_name(p_day), now(), n)
  on conflict (day_id) do update set last_enforced_at = now(), removed_total = recruitment_interview_day_rooms.removed_total + n;
  return n;
end $$;

-- ── the candidate's side, for the day room ─────────────────────────────
-- As in 0023, plus the day's id, whether it is the interview date (IST) and
-- the database's clock (the page counts down from it, not the device's).
create or replace function my_interview_access(p_cycle uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare bk uuid; k record; opens timestamptz; closes timestamptz; consented timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('state', 'signed_out'); end if;
  select b.id into bk from recruitment_slot_bookings b
  where b.cycle_id = p_cycle and b.user_id = auth.uid() and b.status in ('booked', 'attended', 'no_show')
  order by b.created_at desc limit 1;
  if bk is null then return jsonb_build_object('state', 'none'); end if;
  select * into k from recruitment_room_booking(bk);
  if not found then
    -- A no-show booking: the slot has passed for them (no second chance).
    return jsonb_build_object('state', 'ended');
  end if;
  if k.mode <> 'online_meet' then return jsonb_build_object('state', 'offline', 'day', k.day); end if;
  if not k.room_enabled then return jsonb_build_object('state', 'meet', 'day', k.day); end if;
  opens := k.starts_at - make_interval(mins => k.early_join_minutes);
  closes := k.ends_at + make_interval(mins => k.grace_minutes);
  select c.consented_at into consented from recruitment_interview_consents c where c.booking_id = bk;
  return jsonb_build_object(
    'state', case when now() < opens then 'too_early' when now() > closes then 'ended' else 'open' end,
    'booking_id', bk, 'slot_id', k.slot_id, 'day_id', k.day_id, 'day', k.day, 'starts_at', k.starts_at, 'ends_at', k.ends_at,
    'opens_at', opens, 'closes_at', closes, 'strict_fullscreen', k.strict_fullscreen, 'phone_camera', k.phone_camera,
    'name', k.full_name, 'consented_at', consented,
    'today', k.day = (now() at time zone 'Asia/Kolkata')::date, 'now', now());
end $$;

-- As in 0023, with the day (its room) instead of a per-slot Daily room.
create or replace function interview_join_info(p_booking uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare k record; opens timestamptz; closes timestamptz;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() then raise exception 'There is no interview for you here'; end if;
  if k.mode <> 'online_meet' or not k.room_enabled then raise exception 'This interview is not in the website room'; end if;
  opens := k.starts_at - make_interval(mins => k.early_join_minutes);
  closes := k.ends_at + make_interval(mins => k.grace_minutes);
  if now() < opens then raise exception 'The room opens at %', to_char(opens at time zone 'Asia/Kolkata', 'FMHH12:MI AM'); end if;
  if now() > closes then raise exception 'Your slot has ended'; end if;
  if not exists (select 1 from recruitment_interview_consents where booking_id = p_booking) then
    raise exception 'Please agree to the interview rules first';
  end if;
  return jsonb_build_object('slot_id', k.slot_id, 'day_id', k.day_id, 'starts_at', k.starts_at, 'ends_at', k.ends_at,
    'opens_at', opens, 'closes_at', closes, 'name', k.full_name, 'phone_camera', k.phone_camera,
    'room_name', interview_day_room_name(k.day_id));
end $$;

-- As in 0023, but the link can be made up to 30 minutes before the room
-- opens, so the phone is ready while the candidate waits.
create or replace function create_phone_link(p_booking uuid, p_hash text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare k record; until timestamptz := now() + interval '10 minutes';
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() then raise exception 'There is no interview for you here'; end if;
  if not k.room_enabled or k.phone_camera = 'off' then raise exception 'The phone camera is not used for this interview'; end if;
  if now() < k.starts_at - make_interval(mins => k.early_join_minutes + 30) or now() > k.ends_at + make_interval(mins => k.grace_minutes) then
    raise exception 'The room is not open';
  end if;
  delete from recruitment_phone_links where booking_id = p_booking or expires_at < now() - interval '1 day';
  insert into recruitment_phone_links (token_hash, booking_id, expires_at) values (p_hash, p_booking, until);
  return until;
end $$;

-- As in 0023, plus the day and the database's clock.
create or replace function phone_link_info(p_hash text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare l recruitment_phone_links%rowtype; k record;
begin
  select * into l from recruitment_phone_links where token_hash = p_hash;
  if not found or l.expires_at < now() then return null; end if;
  select * into k from recruitment_room_booking(l.booking_id);
  if not found or not k.room_enabled or k.phone_camera = 'off' then return null; end if;
  if now() > k.ends_at + make_interval(mins => k.grace_minutes) then return null; end if;
  return jsonb_build_object('booking_id', k.booking_id, 'slot_id', k.slot_id, 'day_id', k.day_id, 'name', k.full_name,
    'starts_at', k.starts_at, 'ends_at', k.ends_at,
    'opens_at', k.starts_at - make_interval(mins => k.early_join_minutes),
    'closes_at', k.ends_at + make_interval(mins => k.grace_minutes),
    'open', now() >= k.starts_at - make_interval(mins => k.early_join_minutes),
    'room_name', interview_day_room_name(k.day_id), 'now', now());
end $$;

-- ── grants ─────────────────────────────────────────────────────────────
revoke all on function recruitment_sync_cycle_reviewer(uuid, uuid, uuid), add_cycle_reviewers(uuid, text[]),
  remove_cycle_reviewer(uuid, uuid), remove_cycle_reviewer_invite(uuid, text),
  recruitment_team_gets_cycle_reviewers(), recruitment_apply_reviewer_invites(),
  interview_day_room_name(uuid), interview_day_access(uuid), recruitment_day_room_reason(uuid, uuid),
  recruitment_day_room_caller(uuid), day_room_overdue(uuid, uuid[]), record_day_room_removals(uuid, jsonb)
  from public, anon;
revoke all on function recruitment_sync_cycle_reviewer(uuid, uuid, uuid), recruitment_team_gets_cycle_reviewers(),
  recruitment_apply_reviewer_invites(), recruitment_day_room_reason(uuid, uuid), recruitment_day_room_caller(uuid)
  from authenticated;
grant execute on function add_cycle_reviewers(uuid, text[]), remove_cycle_reviewer(uuid, uuid),
  remove_cycle_reviewer_invite(uuid, text), interview_day_room_name(uuid), interview_day_access(uuid),
  day_room_overdue(uuid, uuid[]), record_day_room_removals(uuid, jsonb) to authenticated;
-- The redefined functions keep the grants given in 0023 (create or replace does not change them).

commit;
