-- Test for migration 0024 (reviewers for all hubs; one interview room per day).
-- LOCAL / DEV DATABASE ONLY. Everything runs inside one transaction that is
-- rolled back at the end, so nothing is kept. Run it after the migrations:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/cycle_reviewers_and_day_room.sql
-- Each check prints "ok ..." as a NOTICE; the first failing check stops it with "FAIL ...".

begin;

do $$
declare
  cyc uuid; teams uuid[] := '{}'; t5 uuid; tid uuid; i integer; r jsonb; n integer; t text;
  admin_id uuid; ua uuid; ub uuid; unew uuid; ulate uuid; member uuid; hubrev uuid;
  day uuid; s1 uuid; s2 uuid; s3 uuid; c uuid[] := '{}'; bk uuid[] := '{}'; app uuid; uid uuid; tag text;
  ok boolean;
begin
  tag := substr(gen_random_uuid()::text, 1, 8);
  -- ── setup: a cycle with four hubs, an admin and two members with accounts ──
  insert into recruitment_cycles (title, status, opens_at, closes_at)
  values ('TEST cycle reviewers', 'open', now() - interval '2 days', now() + interval '2 days') returning id into cyc;
  for i in 1..4 loop
    insert into recruitment_teams (cycle_id, name, slug) values (cyc, 'Hub ' || i, 'hub-' || i) returning id into tid;
    teams := teams || tid;
  end loop;
  insert into auth.users (email) values ('admin-' || tag || '@example.com') returning id into admin_id;
  insert into user_roles (user_id, role) values (admin_id, 'admin');
  insert into auth.users (email) values ('ra-' || tag || '@example.com') returning id into ua;
  insert into auth.users (email) values ('rb-' || tag || '@example.com') returning id into ub;
  insert into auth.users (email) values ('member-' || tag || '@example.com') returning id into member;

  -- ── a member cannot manage the list ───────────────────────────────────
  perform set_config('request.jwt.claim.sub', member::text, true);
  begin
    perform add_cycle_reviewers(cyc, array['ra-' || tag || '@example.com']);
    raise exception 'FAIL a member could add reviewers';
  exception when others then
    if sqlerrm not like '%FORBIDDEN%' then raise; end if;
  end;
  raise notice 'ok   a member cannot add reviewers (FORBIDDEN)';

  -- ── add 3 emails (2 accounts, 1 new), plus a duplicate and an invalid one ──
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  r := add_cycle_reviewers(cyc, array[
    '  RA-' || tag || '@Example.com ', 'rb-' || tag || '@example.com', 'new-' || tag || '@example.com', 'abc@', 'ra-' || tag || '@example.com']);
  raise notice 'add: %', r;
  select string_agg(x ->> 'result', ',' order by ord) into t from jsonb_array_elements(r) with ordinality as e(x, ord);
  if t is distinct from 'added,added,invited,invalid' then raise exception 'FAIL add results: %', t; end if;
  raise notice 'ok   results: added, added, invited, invalid (the duplicate counted once)';
  select count(*) into n from recruitment_cycle_reviewers where cycle_id = cyc;
  if n <> 2 then raise exception 'FAIL expected 2 cycle reviewers, got %', n; end if;
  select count(*) into n from recruitment_team_reviewers where team_id = any(teams);
  if n <> 8 then raise exception 'FAIL expected 2 x 4 = 8 team rows, got %', n; end if;
  select count(*) into n from recruitment_cycle_reviewer_invites where cycle_id = cyc;
  if n <> 1 then raise exception 'FAIL expected 1 invite, got %', n; end if;
  raise notice 'ok   2 cycle reviewers x 4 hubs = 8 team rows, 1 invite';
  select count(*) into n from notifications where user_id in (ua, ub) and title = 'You are a recruitment reviewer';
  if n <> 2 then raise exception 'FAIL expected one notification each (2), got %', n; end if;
  select count(*) into n from audit_logs where resource_id = cyc::text and action in ('added_cycle_reviewer', 'invited_cycle_reviewer');
  if n <> 3 then raise exception 'FAIL expected 3 audit rows, got %', n; end if;
  raise notice 'ok   one notification per reviewer (not per hub), 3 audit entries';

  -- Adding again changes nothing and says so.
  r := add_cycle_reviewers(cyc, array['ra-' || tag || '@example.com']);
  if r -> 0 ->> 'result' <> 'already' then raise exception 'FAIL re-add: %', r; end if;
  select count(*) into n from notifications where user_id = ua;
  if n <> 1 then raise exception 'FAIL re-add sent another notification'; end if;
  raise notice 'ok   adding again: "already", no second notification';

  -- ── a 5th hub gets the reviewers too ──────────────────────────────────
  insert into recruitment_teams (cycle_id, name, slug) values (cyc, 'Hub 5', 'hub-5') returning id into t5;
  teams := teams || t5;
  select count(*) into n from recruitment_team_reviewers where team_id = t5;
  if n <> 2 then raise exception 'FAIL new hub: expected 2 reviewers, got %', n; end if;
  raise notice 'ok   a new hub gets both reviewers';

  -- ── the invited email signs up (confirmed, like Google sign-in) ───────
  insert into auth.users (email) values ('new-' || tag || '@example.com') returning id into unew;
  select count(*) into n from recruitment_team_reviewers where user_id = unew and team_id = any(teams);
  if n <> 5 then raise exception 'FAIL invited sign-up: expected 5 hubs, got %', n; end if;
  if exists (select 1 from recruitment_cycle_reviewer_invites where cycle_id = cyc) then raise exception 'FAIL invite not deleted'; end if;
  if not exists (select 1 from notifications where user_id = unew and title = 'You are a recruitment reviewer') then raise exception 'FAIL no notification on sign-up'; end if;
  if not exists (select 1 from profiles where id = unew) then raise exception 'FAIL the sign-up lost its profile'; end if;
  raise notice 'ok   invited email signs up: reviewer on all 5 hubs, invite gone, notified, profile made as usual';

  -- An email/password sign-up counts only once the email is confirmed.
  r := add_cycle_reviewers(cyc, array['late-' || tag || '@example.com']);
  insert into auth.users (email, email_confirmed_at) values ('late-' || tag || '@example.com', null) returning id into ulate;
  if exists (select 1 from recruitment_cycle_reviewers where user_id = ulate) then raise exception 'FAIL unconfirmed email became a reviewer'; end if;
  update auth.users set email_confirmed_at = now() where id = ulate;
  if not exists (select 1 from recruitment_cycle_reviewers where user_id = ulate and cycle_id = cyc) then raise exception 'FAIL confirmed email not applied'; end if;
  raise notice 'ok   unconfirmed sign-up waits; on confirming the email it becomes a reviewer';

  -- The existing checks now say yes for every hub, with no change to them.
  perform set_config('request.jwt.claim.sub', ub::text, true);
  if not is_team_reviewer(t5) or not is_team_reviewer(teams[1]) then raise exception 'FAIL is_team_reviewer'; end if;
  raise notice 'ok   is_team_reviewer is true on every hub for a cycle reviewer';

  -- ── remove one: their hub rows go, their reviews stay ─────────────────
  insert into auth.users (email) values ('cand-x-' || tag || '@example.com') returning id into uid;
  insert into recruitment_applications (cycle_id, user_id, full_name, status, submitted_at, preferences)
  values (cyc, uid, 'Cand X', 'submitted', now(), array[teams[1]]) returning id into app;
  insert into recruitment_reviews (application_id, team_id, reviewer_id, score) values (app, teams[1], ua, 4);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  if not remove_cycle_reviewer(cyc, ua) then raise exception 'FAIL remove returned false'; end if;
  select count(*) into n from recruitment_team_reviewers where user_id = ua and team_id = any(teams);
  if n <> 0 then raise exception 'FAIL removed reviewer still on % hubs', n; end if;
  if exists (select 1 from recruitment_cycle_reviewers where user_id = ua) then raise exception 'FAIL still on the list'; end if;
  if not exists (select 1 from recruitment_reviews where reviewer_id = ua and application_id = app and score = 4) then raise exception 'FAIL review lost'; end if;
  if not exists (select 1 from audit_logs where action = 'removed_cycle_reviewer' and resource_id = cyc::text) then raise exception 'FAIL no audit for removal'; end if;
  raise notice 'ok   removed: off all hubs and the list, old review kept, audit entry written';

  -- Cancel an invite.
  perform add_cycle_reviewers(cyc, array['nobody-' || tag || '@example.com']);
  if not remove_cycle_reviewer_invite(cyc, 'NOBODY-' || tag || '@example.com') then raise exception 'FAIL cancel invite'; end if;
  raise notice 'ok   an invite can be cancelled';

  -- ── the day room ──────────────────────────────────────────────────────
  -- Today, three 20-minute slots: one over, one on now, one later.
  insert into recruitment_slot_days (cycle_id, date, slot_minutes, capacity, mode)
  values (cyc, (now() at time zone 'Asia/Kolkata')::date, 20, 4, 'online_meet') returning id into day;
  insert into recruitment_slots (cycle_id, day_id, starts_at, ends_at) values (cyc, day, now() - interval '30 minutes', now() - interval '10 minutes') returning id into s1;
  insert into recruitment_slots (cycle_id, day_id, starts_at, ends_at) values (cyc, day, now() - interval '5 minutes', now() + interval '15 minutes') returning id into s2;
  insert into recruitment_slots (cycle_id, day_id, starts_at, ends_at) values (cyc, day, now() + interval '15 minutes', now() + interval '35 minutes') returning id into s3;
  for i in 1..3 loop
    insert into auth.users (email) values ('cand-' || i || '-' || tag || '@example.com') returning id into uid;
    insert into recruitment_applications (cycle_id, user_id, full_name, status, submitted_at, preferences)
    values (cyc, uid, 'Cand ' || i, 'submitted', now(), array[teams[i]]) returning id into app;
    insert into recruitment_team_status (application_id, team_id, rank) values (app, teams[i], 1);
    insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id)
    values ((array[s1, s2, s3])[i], cyc, app, uid) returning id into tid;
    c := c || uid; bk := bk || tid;
  end loop;
  r := set_interview_room_settings(day, true, 0, 0, true, 'optional');
  if (select early_join_minutes from recruitment_room_settings where day_id = day) <> 0 then raise exception 'FAIL settings'; end if;

  -- Who may open the day: the admin, a cycle reviewer, a hub's reviewer with a candidate that day; not a member.
  r := interview_day_access(day);
  if r ->> 'role' <> 'admin' or jsonb_array_length(r -> 'slots') <> 3 or r ->> 'room_name' <> 'fx-day-' || replace(day::text, '-', '') then
    raise exception 'FAIL admin day access: %', r;
  end if;
  perform set_config('request.jwt.claim.sub', ub::text, true);
  r := interview_day_access(day);
  if r ->> 'role' <> 'reviewer' or not (r ->> 'all_hubs')::boolean or jsonb_array_length(r -> 'teams') <> 5 then raise exception 'FAIL cycle reviewer access: %', r; end if;
  insert into auth.users (email) values ('hubrev-' || tag || '@example.com') returning id into hubrev;
  insert into recruitment_team_reviewers (team_id, user_id) values (teams[2], hubrev);
  perform set_config('request.jwt.claim.sub', hubrev::text, true);
  r := interview_day_access(day);
  if r ->> 'role' <> 'reviewer' or (r ->> 'all_hubs')::boolean or r -> 'teams' <> to_jsonb(array[teams[2]]) then raise exception 'FAIL hub reviewer access: %', r; end if;
  perform set_config('request.jwt.claim.sub', member::text, true);
  if interview_day_access(day) is not null then raise exception 'FAIL a member got day access'; end if;
  raise notice 'ok   day access: admin, cycle reviewer (all hubs), hub reviewer (own hub only); a member gets nothing';

  -- The candidates' view of the day.
  perform set_config('request.jwt.claim.sub', c[1]::text, true);
  r := my_interview_access(cyc);
  if r ->> 'state' <> 'ended' then raise exception 'FAIL slot 1 should be ended: %', r; end if;
  begin
    perform interview_join_info(bk[1]);
    raise exception 'FAIL slot 1 could still join';
  exception when others then
    if sqlerrm not like '%slot has ended%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', c[3]::text, true);
  r := my_interview_access(cyc);
  if r ->> 'state' <> 'too_early' or not (r ->> 'today')::boolean or r ->> 'day_id' <> day::text or r ->> 'now' is null then raise exception 'FAIL slot 3 waiting: %', r; end if;
  perform create_phone_link(bk[3], repeat('a', 64));
  raise notice 'ok   slot 3 (in 15 min) waits ("too_early", today) and may already make its phone link';
  perform set_config('request.jwt.claim.sub', c[2]::text, true);
  r := my_interview_access(cyc);
  if r ->> 'state' <> 'open' then raise exception 'FAIL slot 2 should be open: %', r; end if;
  perform give_interview_consent(bk[2], 'test');
  r := interview_join_info(bk[2]);
  if r ->> 'room_name' <> 'fx-day-' || replace(day::text, '-', '') or r ->> 'day_id' <> day::text then raise exception 'FAIL join info: %', r; end if;
  begin
    perform interview_join_info(bk[3]);
    raise exception 'FAIL a candidate got another booking''s join info';
  exception when others then
    if sqlerrm not like '%no interview for you%' then raise; end if;
  end;
  raise notice 'ok   slot 1 "ended" and refused; slot 2 open, joins the day room; nobody gets another booking''s token';

  -- Who must leave the room now.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  r := day_room_overdue(day, array[bk[1], bk[2], bk[3], gen_random_uuid()]);
  select string_agg(x ->> 'reason', ',' order by x ->> 'reason') into t from jsonb_array_elements(r) x;
  if t is distinct from 'no_booking,slot_ended,too_early' then raise exception 'FAIL overdue: %', r; end if;
  if r @> jsonb_build_array(jsonb_build_object('booking_id', bk[2])) then raise exception 'FAIL slot 2 marked to leave'; end if;
  raise notice 'ok   overdue: slot 1 ended, slot 3 too early, unknown booking; slot 2 stays';
  perform set_config('request.jwt.claim.sub', member::text, true);
  begin
    perform day_room_overdue(day, array[bk[1]]);
    raise exception 'FAIL a member ran the clean-up';
  exception when others then
    if sqlerrm not like '%FORBIDDEN%' then raise; end if;
  end;
  raise notice 'ok   a member cannot run the clean-up';

  -- Recording removals: only people whose time is really over, once.
  perform set_config('request.jwt.claim.sub', c[2]::text, true);
  n := record_day_room_removals(day, jsonb_build_array(jsonb_build_object('booking_id', bk[2], 'who', 'candidate')));
  if n <> 0 then raise exception 'FAIL a live candidate was recorded as removed'; end if;
  n := record_day_room_removals(day, jsonb_build_array(jsonb_build_object('booking_id', bk[1], 'who', 'candidate'), jsonb_build_object('booking_id', bk[1], 'who', 'phone')));
  if n <> 2 then raise exception 'FAIL expected 2 removals (candidate + phone), got %', n; end if;
  n := record_day_room_removals(day, jsonb_build_array(jsonb_build_object('booking_id', bk[1], 'who', 'candidate')));
  if n <> 0 then raise exception 'FAIL the same removal recorded twice'; end if;
  select count(*) into n from recruitment_integrity_events where booking_id = bk[1] and type = 'removed_slot_ended';
  if n <> 2 then raise exception 'FAIL expected 2 events, got %', n; end if;
  select count(*) into n from audit_logs where action = 'removed_from_interview_room' and resource_id = bk[1]::text;
  if n <> 2 then raise exception 'FAIL expected 2 audit rows, got %', n; end if;
  if (select removed_total from recruitment_interview_day_rooms where day_id = day) <> 2
     or (select last_enforced_at from recruitment_interview_day_rooms where day_id = day) is null then
    raise exception 'FAIL day room status';
  end if;
  raise notice 'ok   removals: live candidate refused, slot 1 candidate + phone logged once each, audit, last run time';

  -- A candidate cannot write the server's event themselves.
  n := log_interview_events(bk[2], jsonb_build_array(jsonb_build_object('type', 'removed_slot_ended', 'at', now())));
  if n <> 0 then raise exception 'FAIL a candidate wrote removed_slot_ended'; end if;
  raise notice 'ok   candidates cannot log "removed_slot_ended"';

  -- Back to Google Meet: everyone in the room must leave; the Meet flow answers.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_interview_room_settings(day, false, 0, 0, true, 'optional');
  r := day_room_overdue(day, array[bk[2]]);
  if r -> 0 ->> 'reason' <> 'room_off' then raise exception 'FAIL room off: %', r; end if;
  perform set_config('request.jwt.claim.sub', c[2]::text, true);
  if my_interview_access(cyc) ->> 'state' <> 'meet' then raise exception 'FAIL meet state'; end if;
  raise notice 'ok   switched back to Google Meet: the candidate sees "meet", the room must be emptied';

  raise notice 'ALL CHECKS PASSED';
end $$;

rollback;
