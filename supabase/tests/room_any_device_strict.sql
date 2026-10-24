-- Test for migration 0025 (any device; leaving the interview screen; removals).
-- LOCAL / DEV DATABASE ONLY. Everything runs inside one transaction that is
-- rolled back at the end, so nothing is kept. Run it after the migrations:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/room_any_device_strict.sql
-- Each check prints "ok ..." as a NOTICE; the first failing check stops it with "FAIL ...".

begin;

do $$
declare
  cyc uuid; team uuid; day uuid; slot uuid; admin_id uuid; member uuid; c uuid[] := '{}'; bk uuid[] := '{}';
  uid uuid; app uuid; tid uuid; i integer; r jsonb; n integer; tag text := substr(gen_random_uuid()::text, 1, 8);
begin
  insert into recruitment_cycles (title, status, opens_at, closes_at) values ('TEST strict room', 'open', now() - interval '2 days', now() + interval '2 days') returning id into cyc;
  insert into recruitment_teams (cycle_id, name, slug) values (cyc, 'Hub', 'hub') returning id into team;
  insert into auth.users (email) values ('admin-' || tag || '@example.com') returning id into admin_id;
  insert into user_roles (user_id, role) values (admin_id, 'admin');
  insert into auth.users (email) values ('member-' || tag || '@example.com') returning id into member;
  insert into recruitment_slot_days (cycle_id, date, slot_minutes, capacity, mode)
  values (cyc, (now() at time zone 'Asia/Kolkata')::date, 20, 4, 'online_meet') returning id into day;
  insert into recruitment_slots (cycle_id, day_id, starts_at, ends_at) values (cyc, day, now() - interval '5 minutes', now() + interval '15 minutes') returning id into slot;
  for i in 1..3 loop
    insert into auth.users (email) values ('cand-' || i || '-' || tag || '@example.com') returning id into uid;
    insert into recruitment_applications (cycle_id, user_id, full_name, status, submitted_at, preferences)
    values (cyc, uid, 'Cand ' || i, 'submitted', now(), array[team]) returning id into app;
    insert into recruitment_team_status (application_id, team_id, rank) values (app, team, 1);
    insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id) values (slot, cyc, app, uid) returning id into tid;
    c := c || uid; bk := bk || tid;
    insert into recruitment_interview_consents (booking_id, user_id) values (tid, uid);
  end loop;

  -- A day saved before this migration gets the new defaults.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_interview_room_settings(day, true, 0, 0, true, 'required');
  if (select allow_phones and warn_on_leave and not auto_remove and auto_remove_leaves = 3 and auto_remove_seconds = 30 and candidate_checklist is null
      from recruitment_room_settings where day_id = day) is not true then raise exception 'FAIL defaults'; end if;
  raise notice 'ok   a saved day gets: phones allowed, warn on, auto-remove off (3 leaves / 30 s ready)';

  -- The candidate sees the rules.
  perform set_config('request.jwt.claim.sub', c[1]::text, true);
  r := my_interview_access(cyc);
  if r ->> 'state' <> 'open' or not (r -> 'rules' ->> 'allow_phones')::boolean or (r -> 'rules' ->> 'auto_remove')::boolean then raise exception 'FAIL access rules: %', r; end if;
  raise notice 'ok   the candidate''s page gets the day''s rules';

  -- Auto-remove off: leaving many times only warns.
  for i in 1..4 loop
    perform log_interview_events(bk[1], jsonb_build_array(
      jsonb_build_object('type', 'left_screen', 'at', now(), 'detail', jsonb_build_object('cause', 'tab')),
      jsonb_build_object('type', 'returned_screen', 'at', now(), 'detail', jsonb_build_object('seconds', 20))));
  end loop;
  if exists (select 1 from recruitment_room_removals where booking_id = bk[1]) then raise exception 'FAIL removed while auto-remove is off'; end if;
  select leaves into n from recruitment_screen_leaves(bk[1], now() - interval '1 hour');
  if n <> 4 then raise exception 'FAIL leaves counted: %', n; end if;
  raise notice 'ok   auto-remove off: 4 leaves (80 s) recorded, nobody removed';

  -- Permission prompt and reconnect are recorded but not counted.
  perform set_config('request.jwt.claim.sub', c[2]::text, true);
  perform log_interview_events(bk[2], jsonb_build_array(jsonb_build_object('type', 'permission_prompt', 'at', now()), jsonb_build_object('type', 'reconnect', 'at', now())));
  select leaves into n from recruitment_screen_leaves(bk[2], now() - interval '1 hour');
  if n <> 0 then raise exception 'FAIL permission prompt counted'; end if;
  raise notice 'ok   permission prompt and reconnect are not counted as leaving';

  -- Auto-remove on at 2 leaves: the second leave removes, rejoin refused.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_interview_room_rules(day, true, true, true, 2, 30, null);
  perform set_config('request.jwt.claim.sub', c[2]::text, true);
  perform log_interview_events(bk[2], jsonb_build_array(jsonb_build_object('type', 'left_screen', 'at', now()), jsonb_build_object('type', 'returned_screen', 'at', now(), 'detail', jsonb_build_object('seconds', 3))));
  if my_room_removal(bk[2]) is not null then raise exception 'FAIL removed after one leave'; end if;
  perform log_interview_events(bk[2], jsonb_build_array(jsonb_build_object('type', 'left_screen', 'at', now())));
  r := my_room_removal(bk[2]);
  if r ->> 'reason' <> 'left_screen' or r ->> 'day_id' <> day::text then raise exception 'FAIL not removed on the second leave: %', r; end if;
  begin
    perform interview_join_info(bk[2]);
    raise exception 'FAIL a removed candidate got join info';
  exception when others then
    if sqlerrm not like '%removed for leaving the interview screen%' then raise; end if;
  end;
  if my_interview_access(cyc) ->> 'state' <> 'removed' then raise exception 'FAIL state not removed'; end if;
  if not exists (select 1 from recruitment_integrity_events where booking_id = bk[2] and type = 'removed_left_screen') then raise exception 'FAIL no removal event'; end if;
  if not exists (select 1 from audit_logs where action = 'auto_removed_from_interview_room' and resource_id = bk[2]::text) then raise exception 'FAIL no audit'; end if;
  raise notice 'ok   auto-remove at 2 leaves: removed on the 2nd, rejoin refused, event + audit written';

  -- Seconds away also trigger it (30 s limit), even while still away.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_interview_room_rules(day, true, true, true, 10, 30, null);
  perform set_config('request.jwt.claim.sub', c[3]::text, true);
  perform log_interview_events(bk[3], jsonb_build_array(jsonb_build_object('type', 'returned_screen', 'at', now(), 'detail', jsonb_build_object('seconds', 35))));
  if my_room_removal(bk[3]) is null then raise exception 'FAIL 35 s away did not remove'; end if;
  raise notice 'ok   35 s away in total removes at a 30 s limit';

  -- The clean-up treats a removed candidate as one who must leave, without a second event.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  r := day_room_overdue(day, array[bk[2]]);
  if r -> 0 ->> 'reason' <> 'removed' then raise exception 'FAIL overdue: %', r; end if;
  n := record_day_room_removals(day, jsonb_build_array(jsonb_build_object('booking_id', bk[2], 'who', 'candidate')));
  if n <> 0 then raise exception 'FAIL logged the removal twice'; end if;
  raise notice 'ok   the room clean-up removes them (reason "removed") without a second event';

  -- The panel removes by hand (with a reason); a member cannot.
  delete from recruitment_room_removals where booking_id = bk[1];
  perform set_config('request.jwt.claim.sub', member::text, true);
  begin
    perform panel_remove_candidate(bk[1], 'testing');
    raise exception 'FAIL a member removed a candidate';
  exception when others then
    if sqlerrm not like '%FORBIDDEN%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  if panel_remove_candidate(bk[1], 'Was reading from notes') <> day then raise exception 'FAIL panel remove'; end if;
  if not exists (select 1 from recruitment_integrity_events where booking_id = bk[1] and type = 'removed_by_panel')
     or not exists (select 1 from audit_logs where action = 'removed_candidate_from_room' and resource_id = bk[1]::text) then raise exception 'FAIL panel remove log'; end if;
  perform set_config('request.jwt.claim.sub', c[1]::text, true);
  begin
    perform interview_join_info(bk[1]);
    raise exception 'FAIL removed by panel could rejoin';
  exception when others then
    if sqlerrm not like '%removed from this interview by the panel%' then raise; end if;
  end;
  raise notice 'ok   the panel removes by hand with a reason (logged); a member cannot; no rejoin';

  -- Candidates cannot write the server's events.
  n := log_interview_events(bk[1], jsonb_build_array(jsonb_build_object('type', 'removed_by_panel', 'at', now()), jsonb_build_object('type', 'removed_left_screen', 'at', now())));
  if n <> 0 then raise exception 'FAIL a candidate wrote a removal event'; end if;
  raise notice 'ok   candidates cannot log removal events';

  raise notice 'ALL CHECKS PASSED';
end $$;

rollback;
