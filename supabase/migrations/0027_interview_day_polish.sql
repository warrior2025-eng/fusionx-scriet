-- Interview day polish (25 Oct 2026). Additive only.
--
-- 1. Camera and microphone: two new integrity events, "device_error" (the
--    camera or microphone could not start: its type only, never any media)
--    and "devices_fixed" (the candidate pressed "Fix audio/video"); and a day
--    setting "Join without camera" (off by default).
-- 2. Away status: leaving the room (the tab or browser closed, a disconnect,
--    a removal) ends an absence. A "leave" followed within 10 seconds by
--    "left the room" is the page closing, not an absence, so it is not counted
--    towards auto-removal; an absence still open counts only while it is the
--    candidate's last event. The panel's removal now says who removed them.
-- 3. A reminder before each slot (5 minutes by default; a day setting can
--    change it or turn it off): send_interview_reminders() writes one
--    notification per live booking (emailed too, when email is on), at most
--    once per booking and slot time; a booking moved to another time is
--    reminded again. Run it every minute with pg_cron (see
--    supabase/setup/interview_reminders_cron.sql).
-- 4. Texts: candidates read that the interview takes place on the
--    FusionX@SCRIET website, not on Google Meet, with the right dates.
--    Stored texts (message templates, the recruitment's interview
--    instructions and reporting note, site content) that mention Google Meet,
--    the Meet link, 20 October or 8:00 PM are corrected; every old text is
--    kept in recruitment_text_backup_0027 first.
--
-- Run once, as one piece. Running it again changes nothing.

begin;

-- ── 1 + 3: settings ────────────────────────────────────────────────────
alter table recruitment_room_settings
  add column if not exists allow_no_camera boolean not null default false,
  add column if not exists reminder_enabled boolean not null default true,
  add column if not exists reminder_minutes integer not null default 5;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recruitment_room_settings_reminder_check') then
    alter table recruitment_room_settings add constraint recruitment_room_settings_reminder_check check (reminder_minutes between 1 and 60);
  end if;
end $$;

alter table recruitment_slot_bookings
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists reminder_for timestamptz;

-- ── 1: new integrity events ────────────────────────────────────────────
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
  'removed_left_screen', 'removed_by_panel', 'device_error', 'devices_fixed'));

-- The day's rules for candidates, as in 0025, plus "join without camera" and the reminder.
create or replace function recruitment_room_rules(p_day uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'allow_phones', coalesce(r.allow_phones, true), 'warn_on_leave', coalesce(r.warn_on_leave, true),
    'auto_remove', coalesce(r.auto_remove, false), 'auto_remove_leaves', coalesce(r.auto_remove_leaves, 3),
    'auto_remove_seconds', coalesce(r.auto_remove_seconds, 30), 'checklist', r.candidate_checklist,
    'allow_no_camera', coalesce(r.allow_no_camera, false),
    'reminder_enabled', coalesce(r.reminder_enabled, true), 'reminder_minutes', coalesce(r.reminder_minutes, 5))
  from (select 1) one left join recruitment_room_settings r on r.day_id = p_day;
$$;

-- ── 2: absences end when the candidate leaves the room ─────────────────
create or replace function recruitment_screen_leaves(p_booking uuid, p_since timestamptz)
returns table (leaves integer, seconds numeric) language sql security definer stable set search_path = public as $$
  with ev as (
    select type, occurred_at, detail,
           lead(type) over (order by occurred_at, id) as next_type,
           lead(occurred_at) over (order by occurred_at, id) as next_at
    from recruitment_integrity_events
    where booking_id = p_booking and occurred_at >= p_since
      and type in ('left_screen', 'returned_screen', 'left_room', 'rejoined', 'removed_left_screen', 'removed_by_panel', 'removed_slot_ended')
  ), lastev as (select type, occurred_at from ev order by occurred_at desc limit 1)
  select
    -- a "leave" that ends in leaving the room within 10 seconds is the page closing
    (select count(*)::integer from ev
     where type = 'left_screen' and not (next_type = 'left_room' and next_at <= occurred_at + interval '10 seconds')),
    coalesce((select sum(least(600, greatest(0, (detail ->> 'seconds')::numeric))) from ev
              where type = 'returned_screen' and jsonb_typeof(detail -> 'seconds') = 'number'), 0)
    -- an absence still going on, only while it is the last thing that happened (not after leaving the room)
    + coalesce((select extract(epoch from now() - occurred_at) from lastev where type = 'left_screen'), 0);
$$;
revoke all on function recruitment_screen_leaves(uuid, timestamptz) from public, anon, authenticated;

-- As in 0025, with the two new event types.
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
    'left_screen', 'returned_screen', 'permission_prompt', 'reconnect', 'fullscreen_unsupported', 'device_info',
    'device_error', 'devices_fixed');
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

-- As in 0025, and the timeline says who removed them.
create or replace function panel_remove_candidate(p_booking uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b record; who text;
begin
  select bk.id, bk.slot_id, bk.application_id, bk.user_id, s.day_id into b
  from recruitment_slot_bookings bk join recruitment_slots s on s.id = bk.slot_id where bk.id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
  if interview_day_access(b.day_id) is null then raise exception 'FORBIDDEN'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason'; end if;
  select coalesce(nullif(btrim(full_name), ''), 'Panel') into who from profiles where id = auth.uid();
  insert into recruitment_room_removals (booking_id, reason, note, removed_by)
  values (p_booking, 'panel', left(btrim(p_reason), 300), auth.uid())
  on conflict (booking_id) do nothing;
  if found then
    insert into recruitment_integrity_events (booking_id, slot_id, application_id, user_id, type, detail, occurred_at)
    values (p_booking, b.slot_id, b.application_id, b.user_id, 'removed_by_panel',
            jsonb_build_object('reason', left(btrim(p_reason), 200), 'by', left(coalesce(who, 'Panel'), 80)), now());
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (auth.uid(), 'removed_candidate_from_room', 'recruitment_slot_bookings', p_booking::text, jsonb_build_object('note', left(btrim(p_reason), 300)));
  end if;
  return b.day_id;
end $$;

-- "Join without camera" and the reminder for a day, by an admin (the other settings keep their own functions). Logged.
create or replace function set_interview_room_extras(p_day uuid, p_no_camera boolean, p_reminder boolean, p_minutes integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from recruitment_slot_days where id = p_day) then raise exception 'Day not found'; end if;
  if p_minutes is null or p_minutes not between 1 and 60 then raise exception 'Reminder: 1 to 60 minutes'; end if;
  insert into recruitment_room_settings (day_id, allow_no_camera, reminder_enabled, reminder_minutes, updated_by)
  values (p_day, p_no_camera, p_reminder, p_minutes, auth.uid())
  on conflict (day_id) do update set allow_no_camera = excluded.allow_no_camera, reminder_enabled = excluded.reminder_enabled,
    reminder_minutes = excluded.reminder_minutes, updated_by = excluded.updated_by;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'updated_interview_extras', 'recruitment_slot_days', p_day::text,
          jsonb_build_object('note', 'join without camera ' || case when p_no_camera then 'allowed' else 'not allowed' end
            || ', reminder ' || case when p_reminder then p_minutes || ' min before' else 'off' end));
end $$;

-- ── 3: the reminder ────────────────────────────────────────────────────
-- Every live booking whose slot starts within the day's reminder minutes (plus one, as this runs every
-- minute) gets one notification; booking rows are locked, so two runs at once never send it twice.
-- A booking moved to another time after its reminder (reminder_for <> the slot's start) is reminded again.
create or replace function send_interview_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  -- pg_cron and the SQL editor run without a signed-in user; in the site, admins only.
  if auth.uid() is not null and not is_admin() then raise exception 'FORBIDDEN'; end if;
  with due as (
    select b.id, b.user_id, s.starts_at, coalesce(r.room_enabled, false) as room, coalesce(r.reminder_minutes, 5) as mins
    from recruitment_slot_bookings b
    join recruitment_slots s on s.id = b.slot_id
    join recruitment_slot_days d on d.id = s.day_id
    left join recruitment_room_settings r on r.day_id = d.id
    where b.status = 'booked' and d.mode = 'online_meet' and coalesce(r.reminder_enabled, true)
      and s.starts_at > now() and s.starts_at <= now() + make_interval(mins => coalesce(r.reminder_minutes, 5) + 1)
      and (b.reminder_for is null or b.reminder_for is distinct from s.starts_at)
    for update of b skip locked
  ), marked as (
    update recruitment_slot_bookings b set reminder_sent_at = now(), reminder_for = due.starts_at
    from due where b.id = due.id
    returning due.user_id, due.starts_at, due.room, due.mins
  )
  insert into notifications (user_id, title, body, link)
  select m.user_id,
         'Your interview starts in ' || m.mins || ' minute' || case when m.mins = 1 then '' else 's' end,
         'Your FusionX@SCRIET interview starts in ' || m.mins || ' minute' || case when m.mins = 1 then '' else 's' end
           || ' (' || to_char(m.starts_at at time zone 'Asia/Kolkata', 'FMHH12:MI AM') || ' IST). '
           || case when m.room then 'Join on the FusionX@SCRIET website, not Google Meet: open your status page and press "Join interview room".'
                   else 'Open your status page for the joining details.' end,
         case when m.room then '/recruitment/interview' else '/recruitment/status' end
  from marked m;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 4: texts ───────────────────────────────────────────────────────────
-- The interview place written onto the application's team rows (status page timeline): the website room on room days.
create or replace function recruitment_sync_interview(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare slot_start timestamptz; place text;
begin
  select s.starts_at,
         case when d.mode = 'online_meet' and coalesce(r.room_enabled, false) then 'Online, on the FusionX@SCRIET website (interview room)'
              when d.mode = 'online_meet' then 'Online (Google Meet)'
              else coalesce(nullif(trim(d.venue), ''), 'In person') end
    into slot_start, place
  from recruitment_slot_bookings b
  join recruitment_slots s on s.id = b.slot_id
  join recruitment_slot_days d on d.id = s.day_id
  left join recruitment_room_settings r on r.day_id = d.id
  where b.application_id = p_application and b.status <> 'cancelled'
  limit 1;
  update recruitment_team_status set interview_at = slot_start, interview_location = place
  where application_id = p_application;
end $$;

-- Keeps every place in step when a day is switched between Meet and the website room.
create or replace function recruitment_room_settings_resync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.room_enabled is distinct from old.room_enabled then
    perform recruitment_sync_interview(b.application_id)
    from recruitment_slot_bookings b join recruitment_slots s on s.id = b.slot_id
    where s.day_id = new.day_id and b.status <> 'cancelled';
  end if;
  return new;
end $$;
drop trigger if exists trg_recruitment_room_settings_resync on recruitment_room_settings;
create trigger trg_recruitment_room_settings_resync after insert or update of room_enabled on recruitment_room_settings
  for each row execute function recruitment_room_settings_resync();

create table if not exists recruitment_text_backup_0027 (
  source text not null, row_key text not null, old_text text not null, new_text text not null,
  changed_at timestamptz not null default now()
);
alter table recruitment_text_backup_0027 enable row level security;
drop policy if exists "admins read the text backup" on recruitment_text_backup_0027;
create policy "admins read the text backup" on recruitment_text_backup_0027 for select using (is_admin());

-- The corrections, in order (phrases first, then the plain words). "§NOT§" keeps "not Google Meet" from being rewritten.
create or replace function recruitment_fix_interview_text(t text)
returns text language sql immutable set search_path = public as $$
  select replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      t,
      'The Google Meet link and further instructions will be shared with shortlisted candidates through official communication channels before their interview',
      'Your interview room opens on your status page on the day of your interview', 'gi'),
      'join your Google Meet interview', 'join your interview on the FusionX@SCRIET website', 'gi'),
      '(The )?(Google )?Meet link', '\1interview room link', 'gi'),
      '(via|on|through) Google Meet', 'on the FusionX@SCRIET website (in-website interview room, §NOT§)', 'gi'),
      'Google Meet', 'the FusionX@SCRIET website interview room', 'gi'),
      'join the meeting', 'join the interview room', 'gi'),
      '\m20 October 2026\M', '25 October 2026', 'g'),
      '\m20 October\M', '25 October', 'g'),
      '\m20 Oct\M', '25 Oct', 'g'),
      '2026-10-20', '2026-10-25', 'g'),
      '\m8:00 ?PM\M', '6:00 PM', 'gi'),
      '\m8 ?PM\M', '6 PM', 'gi'),
      '\m19 October\M', '24 October', 'g'),
      '\m19 Oct\M', '24 Oct', 'g'),
    '§NOT§', 'not Google Meet');
$$;
revoke all on function recruitment_fix_interview_text(text) from public, anon, authenticated;

do $$
declare
  pat text := '(google meet|meet link|\m20 oct|2026-10-20|\m8:00 ?pm|\m8 ?pm\M|\m19 oct)';
  r record;
  fixed text;
begin
  -- Message templates (at most 1000 characters each).
  for r in select key, body from recruitment_message_templates where body ~* pat loop
    fixed := recruitment_fix_interview_text(r.body);
    if fixed <> r.body and char_length(fixed) <= 1000 then
      insert into recruitment_text_backup_0027 (source, row_key, old_text, new_text) values ('recruitment_message_templates', r.key, r.body, fixed);
      update recruitment_message_templates set body = fixed, updated_at = now() where key = r.key;
    end if;
  end loop;
  -- The recruitment's interview instructions and reporting note.
  for r in select id, interview_instructions as t from recruitment_cycles where interview_instructions ~* pat loop
    fixed := recruitment_fix_interview_text(r.t);
    if fixed <> r.t and char_length(fixed) <= 1500 then
      insert into recruitment_text_backup_0027 (source, row_key, old_text, new_text) values ('recruitment_cycles.interview_instructions', r.id::text, r.t, fixed);
      update recruitment_cycles set interview_instructions = fixed where id = r.id;
    end if;
  end loop;
  for r in select id, reporting_note as t from recruitment_cycles where reporting_note ~* pat loop
    fixed := recruitment_fix_interview_text(r.t);
    if fixed <> r.t and char_length(fixed) <= 1000 then
      insert into recruitment_text_backup_0027 (source, row_key, old_text, new_text) values ('recruitment_cycles.reporting_note', r.id::text, r.t, fixed);
      update recruitment_cycles set reporting_note = fixed where id = r.id;
    end if;
  end loop;
  -- Site content (announcement bar, recruitment page texts, …): only text values change, so the JSON stays valid.
  for r in select key, value::text as t from site_content where value::text ~* pat and key <> 'email.settings' loop
    fixed := recruitment_fix_interview_text(r.t);
    if fixed <> r.t then
      insert into recruitment_text_backup_0027 (source, row_key, old_text, new_text) values ('site_content', r.key, r.t, fixed);
      update site_content set value = fixed::jsonb, updated_at = now() where key = r.key;
    end if;
  end loop;
end $$;

-- New recruitments: the website room by default in the instructions.
alter table recruitment_cycles alter column interview_instructions set default
  'Your interview takes place on the FusionX@SCRIET website (in-website interview room), not on Google Meet. Open your status page a few minutes before your slot, allow your camera and microphone, and join from Chrome or Safari with a stable internet connection.';

-- Every live booking's place, as the status page shows it.
do $$
begin
  perform recruitment_sync_interview(b.application_id) from recruitment_slot_bookings b where b.status <> 'cancelled';
end $$;

-- ── grants ─────────────────────────────────────────────────────────────
revoke all on function recruitment_room_rules(uuid), set_interview_room_extras(uuid, boolean, boolean, integer),
  send_interview_reminders(), recruitment_room_settings_resync() from public, anon;
revoke all on function recruitment_room_rules(uuid), recruitment_room_settings_resync() from authenticated;
grant execute on function set_interview_room_extras(uuid, boolean, boolean, integer), send_interview_reminders() to authenticated;
-- The site's server runs the reminder job with its service key (the cron route).
grant execute on function send_interview_reminders() to service_role;

commit;
