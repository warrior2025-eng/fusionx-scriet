-- Interview room: any device, and a strict "don't leave the interview screen" rule.
--
-- Additive only:
--   * new day settings on recruitment_room_settings (their defaults also fill
--     the days already saved, e.g. 25 Oct: phones allowed, warn on each leave,
--     auto-remove off with 3 leaves / 30 seconds ready for when it is turned on,
--     and the candidates' checklist from the code when this is empty)
--   * new integrity events: left / returned to the interview screen (with how
--     long), the permission prompt and reconnects (shown, not counted), the
--     device a candidate joined on, fullscreen not available, and two removals
--   * recruitment_room_removals: a candidate removed for leaving the screen
--     (automatically, when the day allows it) or by the panel cannot rejoin
--     that slot
--
-- A website cannot see or block other apps or tabs; it can tell when its own
-- page stops being the one on screen. That is what is recorded here.
--
-- Run once, as one piece. Running it again changes nothing.

begin;

-- ── day settings ───────────────────────────────────────────────────────
alter table recruitment_room_settings
  add column if not exists allow_phones boolean not null default true,
  add column if not exists warn_on_leave boolean not null default true,
  add column if not exists auto_remove boolean not null default false,
  add column if not exists auto_remove_leaves integer not null default 3,
  add column if not exists auto_remove_seconds integer not null default 30,
  add column if not exists candidate_checklist text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recruitment_room_settings_rules_check') then
    alter table recruitment_room_settings add constraint recruitment_room_settings_rules_check check (
      auto_remove_leaves between 1 and 20 and auto_remove_seconds between 5 and 600
      and (candidate_checklist is null or char_length(candidate_checklist) <= 2000));
  end if;
end $$;

-- ── new integrity events ───────────────────────────────────────────────
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
  'left_room', 'rejoined', 'phone_camera_joined', 'phone_camera_left', 'removed_slot_ended',
  'left_screen', 'returned_screen', 'permission_prompt', 'reconnect', 'fullscreen_unsupported', 'device_info',
  'removed_left_screen', 'removed_by_panel'));

-- ── removals that block rejoining the slot ─────────────────────────────
create table if not exists recruitment_room_removals (
  booking_id uuid primary key references recruitment_slot_bookings(id) on delete cascade,
  reason text not null check (reason in ('left_screen', 'panel')),
  note text check (note is null or char_length(note) <= 300),
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz not null default now()
);
alter table recruitment_room_removals enable row level security;
drop policy if exists "admins and reviewers read room removals" on recruitment_room_removals;
create policy "admins and reviewers read room removals" on recruitment_room_removals for select
  using (is_admin() or exists (select 1 from recruitment_slot_bookings b where b.id = booking_id and reviews_application(b.application_id)));

-- The day's rules for a booking (defaults when the day has no settings row).
create or replace function recruitment_room_rules(p_day uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'allow_phones', coalesce(r.allow_phones, true), 'warn_on_leave', coalesce(r.warn_on_leave, true),
    'auto_remove', coalesce(r.auto_remove, false), 'auto_remove_leaves', coalesce(r.auto_remove_leaves, 3),
    'auto_remove_seconds', coalesce(r.auto_remove_seconds, 30), 'checklist', r.candidate_checklist)
  from (select 1) one left join recruitment_room_settings r on r.day_id = p_day;
$$;

-- Times away from the interview screen for a booking, in its slot: how many, and seconds in total
-- (an absence still going on counts up to now).
create or replace function recruitment_screen_leaves(p_booking uuid, p_since timestamptz)
returns table (leaves integer, seconds numeric) language sql security definer stable set search_path = public as $$
  with ev as (
    select type, occurred_at, detail from recruitment_integrity_events
    where booking_id = p_booking and occurred_at >= p_since and type in ('left_screen', 'returned_screen')
  ), lastev as (select type, occurred_at from ev order by occurred_at desc limit 1)
  select (select count(*)::integer from ev where type = 'left_screen'),
         coalesce((select sum(least(600, greatest(0, (detail ->> 'seconds')::numeric))) from ev
                   where type = 'returned_screen' and jsonb_typeof(detail -> 'seconds') = 'number'), 0)
         + coalesce((select extract(epoch from now() - occurred_at) from lastev where type = 'left_screen'), 0);
$$;

-- ── the candidate's side ───────────────────────────────────────────────
-- As in 0024, plus the day's rules (for the page) and whether they were removed from this slot.
create or replace function my_interview_access(p_cycle uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare bk uuid; k record; opens timestamptz; closes timestamptz; consented timestamptz; removed recruitment_room_removals%rowtype;
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
  select * into removed from recruitment_room_removals where booking_id = bk;
  return jsonb_build_object(
    'state', case when removed.booking_id is not null then 'removed' when now() < opens then 'too_early' when now() > closes then 'ended' else 'open' end,
    'removed_reason', removed.reason,
    'booking_id', bk, 'slot_id', k.slot_id, 'day_id', k.day_id, 'day', k.day, 'starts_at', k.starts_at, 'ends_at', k.ends_at,
    'opens_at', opens, 'closes_at', closes, 'strict_fullscreen', k.strict_fullscreen, 'phone_camera', k.phone_camera,
    'name', k.full_name, 'consented_at', consented,
    'today', k.day = (now() at time zone 'Asia/Kolkata')::date, 'now', now(),
    'rules', recruitment_room_rules(k.day_id));
end $$;

-- As in 0024, but someone removed from the slot cannot get a new token.
create or replace function interview_join_info(p_booking uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare k record; opens timestamptz; closes timestamptz; why text;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() then raise exception 'There is no interview for you here'; end if;
  if k.mode <> 'online_meet' or not k.room_enabled then raise exception 'This interview is not in the website room'; end if;
  select reason into why from recruitment_room_removals where booking_id = p_booking;
  if why = 'left_screen' then raise exception 'You were removed for leaving the interview screen'; end if;
  if why is not null then raise exception 'You were removed from this interview by the panel'; end if;
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

-- As in 0023, with the new event types; and, when the day turns it on, the
-- automatic removal once the leaves or the seconds away reach the day's limit.
create or replace function log_interview_events(p_booking uuid, p_events jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare k record; n integer; recent integer; rules jsonb; s record; since timestamptz;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() then raise exception 'There is no interview for you here'; end if;
  if not k.room_enabled then return 0; end if;
  since := k.starts_at - make_interval(mins => k.early_join_minutes);
  if now() < since or now() > k.ends_at + make_interval(mins => k.grace_minutes + 5) then
    return 0;
  end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then raise exception 'Too many events'; end if;
  select count(*) into recent from recruitment_integrity_events where user_id = auth.uid() and created_at > now() - interval '1 minute';
  if recent + jsonb_array_length(p_events) > 240 then raise exception 'Slow down'; end if;
  insert into recruitment_integrity_events (booking_id, slot_id, application_id, user_id, type, detail, occurred_at)
  select p_booking, k.slot_id, k.application_id, auth.uid(), e ->> 'type',
         case when jsonb_typeof(e -> 'detail') = 'object' and pg_column_size(e -> 'detail') <= 600 then e -> 'detail' end,
         -- the client's time, kept within the last 10 minutes and never in the future
         least(now(), greatest(now() - interval '10 minutes', coalesce((e ->> 'at')::timestamptz, now())))
  from jsonb_array_elements(p_events) e
  where e ->> 'type' in ('tab_hidden', 'tab_visible', 'window_blur', 'window_focus', 'fullscreen_exit',
    'copy', 'paste', 'cut', 'contextmenu', 'extra_screen', 'camera_off', 'mic_off',
    'left_room', 'rejoined', 'phone_camera_joined', 'phone_camera_left',
    'left_screen', 'returned_screen', 'permission_prompt', 'reconnect', 'fullscreen_unsupported', 'device_info');
  get diagnostics n = row_count;

  rules := recruitment_room_rules(k.day_id);
  if (rules ->> 'auto_remove')::boolean and now() <= k.ends_at + make_interval(mins => k.grace_minutes)
     and not exists (select 1 from recruitment_room_removals where booking_id = p_booking) then
    select * into s from recruitment_screen_leaves(p_booking, since);
    if s.leaves >= (rules ->> 'auto_remove_leaves')::integer or s.seconds >= (rules ->> 'auto_remove_seconds')::integer then
      insert into recruitment_room_removals (booking_id, reason, note, removed_by)
      values (p_booking, 'left_screen', s.leaves || ' leaves, ' || round(s.seconds) || ' s away', null)
      on conflict (booking_id) do nothing;
      insert into recruitment_integrity_events (booking_id, slot_id, application_id, user_id, type, detail, occurred_at)
      values (p_booking, k.slot_id, k.application_id, auth.uid(), 'removed_left_screen',
              jsonb_build_object('leaves', s.leaves, 'seconds', round(s.seconds)), now());
      insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
      values (auth.uid(), 'auto_removed_from_interview_room', 'recruitment_slot_bookings', p_booking::text,
              jsonb_build_object('note', s.leaves || ' leaves, ' || round(s.seconds) || ' s away (limit '
                || (rules ->> 'auto_remove_leaves') || ' / ' || (rules ->> 'auto_remove_seconds') || ' s)'));
    end if;
  end if;
  return n;
end $$;

-- Was the caller's own booking removed from the room? (the day too, for the clean-up)
create or replace function my_room_removal(p_booking uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare k record; why text;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() then return null; end if;
  select reason into why from recruitment_room_removals where booking_id = p_booking;
  if why is null then return null; end if;
  return jsonb_build_object('reason', why, 'day_id', k.day_id);
end $$;

-- ── the panel's side ───────────────────────────────────────────────────
-- The panel removes a candidate from the room for the rest of their slot (with a reason). Logged.
create or replace function panel_remove_candidate(p_booking uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select bk.id, bk.slot_id, bk.application_id, bk.user_id, s.day_id into b
  from recruitment_slot_bookings bk join recruitment_slots s on s.id = bk.slot_id where bk.id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
  if interview_day_access(b.day_id) is null then raise exception 'FORBIDDEN'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason'; end if;
  insert into recruitment_room_removals (booking_id, reason, note, removed_by)
  values (p_booking, 'panel', left(btrim(p_reason), 300), auth.uid())
  on conflict (booking_id) do nothing;
  if found then
    insert into recruitment_integrity_events (booking_id, slot_id, application_id, user_id, type, detail, occurred_at)
    values (p_booking, b.slot_id, b.application_id, b.user_id, 'removed_by_panel', jsonb_build_object('reason', left(btrim(p_reason), 200)), now());
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (auth.uid(), 'removed_candidate_from_room', 'recruitment_slot_bookings', p_booking::text, jsonb_build_object('note', left(btrim(p_reason), 300)));
  end if;
  return b.day_id;
end $$;

-- As in 0024: plus "removed" (removed for leaving the screen or by the panel).
create or replace function recruitment_day_room_reason(p_day uuid, p_booking uuid)
returns text language plpgsql security definer stable set search_path = public as $$
declare k record;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.day_id is distinct from p_day then return 'no_booking'; end if;
  if k.mode <> 'online_meet' or not k.room_enabled then return 'room_off'; end if;
  if exists (select 1 from recruitment_room_removals where booking_id = p_booking) then return 'removed'; end if;
  if now() < k.starts_at - make_interval(mins => k.early_join_minutes) then return 'too_early'; end if;
  if now() > k.ends_at + make_interval(mins => k.grace_minutes) then return 'slot_ended'; end if;
  return null;
end $$;

-- As in 0024; a removal already has its own event ("removed_left_screen" / "removed_by_panel"), so it is not noted again.
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
    if why is null or why = 'removed' then continue; end if;
    select b.id, b.slot_id, b.application_id, b.user_id into k
    from recruitment_slot_bookings b join recruitment_slots s on s.id = b.slot_id
    where b.id = bk and s.day_id = p_day;
    if not found then continue; end if;
    -- Two panel screens may clean up at the same moment: note it once (the lock makes the second wait for the first).
    perform pg_advisory_xact_lock(hashtextextended('day-room-removal:' || bk::text || ':' || coalesce(item ->> 'who', ''), 0));
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

-- The day's rules, by an admin (the other settings keep set_interview_room_settings). Logged.
create or replace function set_interview_room_rules(
  p_day uuid, p_allow_phones boolean, p_warn boolean, p_auto boolean, p_leaves integer, p_seconds integer, p_checklist text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from recruitment_slot_days where id = p_day) then raise exception 'Day not found'; end if;
  insert into recruitment_room_settings (day_id, allow_phones, warn_on_leave, auto_remove, auto_remove_leaves, auto_remove_seconds, candidate_checklist, updated_by)
  values (p_day, p_allow_phones, p_warn, p_auto, p_leaves, p_seconds, nullif(btrim(coalesce(p_checklist, '')), ''), auth.uid())
  on conflict (day_id) do update set allow_phones = excluded.allow_phones, warn_on_leave = excluded.warn_on_leave,
    auto_remove = excluded.auto_remove, auto_remove_leaves = excluded.auto_remove_leaves,
    auto_remove_seconds = excluded.auto_remove_seconds, candidate_checklist = excluded.candidate_checklist, updated_by = excluded.updated_by;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'updated_interview_rules', 'recruitment_slot_days', p_day::text,
          jsonb_build_object('note', 'phones ' || case when p_allow_phones then 'allowed' else 'not allowed' end
            || ', warn ' || case when p_warn then 'on' else 'off' end
            || ', auto-remove ' || case when p_auto then 'on (' || p_leaves || ' leaves / ' || p_seconds || ' s)' else 'off' end));
end $$;

-- ── grants ─────────────────────────────────────────────────────────────
revoke all on function recruitment_room_rules(uuid), recruitment_screen_leaves(uuid, timestamptz), my_room_removal(uuid),
  panel_remove_candidate(uuid, text), set_interview_room_rules(uuid, boolean, boolean, boolean, integer, integer, text)
  from public, anon;
revoke all on function recruitment_room_rules(uuid), recruitment_screen_leaves(uuid, timestamptz) from authenticated;
grant execute on function my_room_removal(uuid), panel_remove_candidate(uuid, text),
  set_interview_room_rules(uuid, boolean, boolean, boolean, integer, integer, text) to authenticated;

-- Live updates for the panel (removals show at once; Supabase Realtime respects the policy above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'recruitment_room_removals') then
    alter publication supabase_realtime add table recruitment_room_removals;
  end if;
end $$;

commit;
