-- Test for migration 0027 (reminders, absences ended by leaving the room, new events, texts).
-- LOCAL / DEV DATABASE ONLY. One transaction, rolled back at the end.
-- Each check prints "ok ..." as a NOTICE; the first failing check stops it with "FAIL ...".

begin;

do $$
declare
  cyc uuid; team uuid; dayid uuid; s_soon uuid; s_late uuid; s_now uuid; adm uuid; u uuid[] := '{}'; app uuid[] := '{}'; bk uuid[] := '{}';
  uid uuid; aid uuid; i integer; n integer; t text; r record;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'polish-admin@example.com') returning id into adm;
  insert into user_roles (user_id, role) values (adm, 'admin');
  insert into recruitment_cycles (title, status, opens_at, closes_at, interview_instructions)
  values ('TEST postpone day', 'closed', now() - interval '3 days', now() - interval '1 hour',
          'Your interview with FusionX@SCRIET will be conducted online via Google Meet on 20 October 2026. The Google Meet link and further instructions will be shared with shortlisted candidates through official communication channels before their interview. Please join the meeting 5 minutes before your scheduled time.')
  returning id into cyc;
  insert into recruitment_teams (cycle_id, name, slug) values (cyc, 'Hub', 'hub') returning id into team;
  insert into recruitment_slot_days (cycle_id, date, sessions, slot_minutes, capacity, mode)
  values (cyc, (now() at time zone 'Asia/Kolkata')::date, '[]', 20, 4, 'online_meet') returning id into dayid;
  insert into recruitment_room_settings (day_id, room_enabled, early_join_minutes, grace_minutes) values (dayid, true, 0, 0);
  insert into recruitment_slots (cycle_id, day_id, starts_at, ends_at) values (cyc, dayid, date_trunc('minute', now()) + interval '4 minutes 30 seconds', date_trunc('minute', now()) + interval '24 minutes 30 seconds') returning id into s_soon;
  insert into recruitment_slots (cycle_id, day_id, starts_at, ends_at) values (cyc, dayid, date_trunc('minute', now()) + interval '40 minutes', date_trunc('minute', now()) + interval '60 minutes') returning id into s_late;
  insert into recruitment_slots (cycle_id, day_id, starts_at, ends_at) values (cyc, dayid, now() - interval '2 minutes', now() + interval '18 minutes') returning id into s_now;
  for i in 1..4 loop
    insert into auth.users (id, email) values (gen_random_uuid(), 'polish-' || i || '@example.com') returning id into uid;
    insert into recruitment_applications (cycle_id, user_id, full_name, status, submitted_at, preferences)
    values (cyc, uid, 'Polish ' || i, 'submitted', now(), array[team]) returning id into aid;
    u := u || uid; app := app || aid;
  end loop;
  -- 1, 2: in 4.5 minutes (one booked, one cancelled); 3: in 40 minutes; 4: on now.
  insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id) values (s_soon, cyc, app[1], u[1]) returning id into uid; bk := bk || uid;
  insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id, status) values (s_soon, cyc, app[2], u[2], 'cancelled') returning id into uid; bk := bk || uid;
  insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id) values (s_late, cyc, app[3], u[3]) returning id into uid; bk := bk || uid;
  insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id) values (s_now, cyc, app[4], u[4]) returning id into uid; bk := bk || uid;

  -- ── reminders ──
  n := send_interview_reminders();
  if n <> 1 then raise exception 'FAIL reminders: expected 1 (only the booked slot in 4.5 min), got %', n; end if;
  select body, link into r from notifications where user_id = u[1] and title like 'Your interview starts in 5 minutes';
  if r.body not like '%not Google Meet%' or r.link <> '/recruitment/interview' then raise exception 'FAIL reminder text: %', r; end if;
  if exists (select 1 from notifications where user_id in (u[2], u[3], u[4]) and title like 'Your interview starts%') then raise exception 'FAIL reminder sent to a cancelled / later / started booking'; end if;
  raise notice 'ok   one reminder, only for the booking starting in 5 minutes (not cancelled, later or started ones); says website, not Google Meet';
  n := send_interview_reminders();
  if n <> 0 then raise exception 'FAIL second run sent % more', n; end if;
  raise notice 'ok   running again sends nothing (exactly once)';
  -- Moved to the later slot, then that slot comes close: reminded again for the new time.
  update recruitment_slot_bookings set slot_id = s_late where id = bk[1];
  update recruitment_slots set starts_at = date_trunc('minute', now()) + interval '5 minutes', ends_at = date_trunc('minute', now()) + interval '25 minutes' where id = s_late;
  n := send_interview_reminders();
  if n <> 2 then raise exception 'FAIL after the move: expected 2 (the moved booking again, and booking 3), got %', n; end if;
  raise notice 'ok   a booking moved to another time is reminded again for the new time';
  update recruitment_room_settings set reminder_enabled = false where day_id = dayid;
  update recruitment_slot_bookings set reminder_for = null where id = bk[1];
  if send_interview_reminders() <> 0 then raise exception 'FAIL reminder sent with the day setting off'; end if;
  raise notice 'ok   the day setting "reminder off" sends nothing';

  -- ── absences ──
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  perform log_interview_events(bk[4], jsonb_build_array(
    jsonb_build_object('type', 'left_screen', 'at', now() - interval '60 seconds'),
    jsonb_build_object('type', 'returned_screen', 'at', now() - interval '50 seconds', 'detail', jsonb_build_object('seconds', 10)),
    jsonb_build_object('type', 'left_screen', 'at', now() - interval '40 seconds'),
    jsonb_build_object('type', 'left_room', 'at', now() - interval '38 seconds', 'detail', jsonb_build_object('reason', 'closed'))));
  select * into r from recruitment_screen_leaves(bk[4], now() - interval '1 hour');
  if r.leaves <> 1 or r.seconds <> 10 then raise exception 'FAIL closing the tab counted as away: %', r; end if;
  raise notice 'ok   closing the tab (leave then left the room) is not counted; the open absence stops: 1 leave, 10 s';
  perform log_interview_events(bk[4], jsonb_build_array(
    jsonb_build_object('type', 'device_error', 'detail', jsonb_build_object('kind', 'permission_denied', 'device', 'camera')),
    jsonb_build_object('type', 'devices_fixed')));
  if (select count(*) from recruitment_integrity_events where booking_id = bk[4] and type in ('device_error', 'devices_fixed')) <> 2 then
    raise exception 'FAIL new event types not stored';
  end if;
  raise notice 'ok   device_error and devices_fixed are stored';

  -- ── panel removal says who ──
  perform set_config('request.jwt.claim.sub', adm::text, true);
  update profiles set full_name = 'Test Panel' where id = adm;
  perform panel_remove_candidate(bk[4], 'test reason');
  select detail ->> 'by' into t from recruitment_integrity_events where booking_id = bk[4] and type = 'removed_by_panel';
  if t is distinct from 'Test Panel' then raise exception 'FAIL removal by: %', t; end if;
  raise notice 'ok   "Removed by the panel" names who removed them';

  -- ── texts ──
  select interview_instructions into t from recruitment_cycles where id = cyc;
  t := recruitment_fix_interview_text(t);
  raise notice 'fixed: %', t;
  if t ~* 'via google meet|meet link|20 october' or t not like '%25 October 2026%' or t not like '%not Google Meet%' then raise exception 'FAIL text fix: %', t; end if;
  raise notice 'ok   instructions: website (not Google Meet), 25 October 2026, no Meet link';
  if recruitment_fix_interview_text('Afternoon 3:00 PM to 8:00 PM, 18:00') <> 'Afternoon 3:00 PM to 6:00 PM, 18:00' then raise exception 'FAIL 8 PM'; end if;
  raise notice 'ok   8:00 PM becomes 6:00 PM (18:00 untouched)';
  select interview_location into t from recruitment_team_status where application_id = app[4];
  perform recruitment_sync_interview(app[1]);
  raise notice 'ALL CHECKS PASSED';
end $$;

rollback;
