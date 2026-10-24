-- Test for migration 0026 (afternoon 15:00-20:00 shortened to 15:00-18:00).
-- LOCAL / DEV DATABASE ONLY. Everything runs inside one transaction that is
-- rolled back at the end, so nothing is kept. Run it after the migrations:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/shorten_afternoon_6pm.sql
-- Each check prints "ok ..." as a NOTICE; the first failing check stops it with "FAIL ...".

begin;

do $$
declare
  cyc uuid; team uuid; day uuid; day2 uuid; admin_id uuid; r jsonb; p jsonb; t text; n integer; i integer;
  who text[] := array['c1940', 'c1800a', 'c1740a', 'c1740b', 'c1740c', 'c1740d', 'c1800b', 'c1000', 'c1500'];
  at_time text[] := array['19:40', '18:00', '17:40', '17:40', '17:40', '17:40', '18:00', '10:00', '15:00'];
  u uuid[] := '{}'; uid uuid; app uuid; tag text := substr(gen_random_uuid()::text, 1, 8);
  fmt constant text := 'HH24:MI';
begin
  insert into recruitment_cycles (title, status, opens_at, closes_at) values ('TEST 6pm', 'open', now() - interval '2 days', now() + interval '2 days') returning id into cyc;
  insert into recruitment_teams (cycle_id, name, slug) values (cyc, 'Hub', 'hub') returning id into team;
  insert into auth.users (email) values ('admin-' || tag || '@example.com') returning id into admin_id;
  insert into user_roles (user_id, role) values (admin_id, 'admin');
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  -- 25 Oct: 10:00-13:00 and 15:00-20:00, 20 minutes, 4 seats.
  insert into recruitment_slot_days (cycle_id, date, sessions, slot_minutes, capacity, mode)
  values (cyc, '2026-10-25', '[{"label": "Morning", "start": "10:00", "end": "13:00"}, {"label": "Afternoon", "start": "15:00", "end": "20:00"}]', 20, 4, 'online_meet')
  returning id into day;
  r := generate_slots(day);
  if (r ->> 'total')::integer <> 24 then raise exception 'FAIL setup: expected 24 slots, got %', r; end if;

  -- Bookings in this order (first booked first): 19:40, 18:00, four at 17:40 (the slot is full), 18:00, 10:00, 15:00.
  for i in 1..array_length(who, 1) loop
    insert into auth.users (email) values (who[i] || '-' || tag || '@example.com') returning id into uid;
    insert into recruitment_applications (cycle_id, user_id, full_name, status, submitted_at, preferences)
    values (cyc, uid, who[i], 'submitted', now(), array[team]) returning id into app;
    insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id, created_at)
    select s.id, cyc, app, uid, now() + make_interval(secs => i)
    from recruitment_slots s where s.day_id = day and to_char(s.starts_at at time zone 'Asia/Kolkata', fmt) = at_time[i];
    u := u || uid;
  end loop;
  raise notice 'ok   setup: 24 slots, 9 bookings (19:40 and 18:00 booked before the four at 17:40)';

  -- The admin shortens the afternoon to 18:00.
  update recruitment_slot_days set sessions = '[{"label": "Morning", "start": "10:00", "end": "13:00"}, {"label": "Afternoon", "start": "15:00", "end": "18:00"}]' where id = day;
  p := preview_slot_timings(day);
  raise notice 'preview: %', p;
  if (select count(*) from recruitment_slots where day_id = day) <> 24 then raise exception 'FAIL preview changed data'; end if;
  if exists (select 1 from notifications where user_id = any(u)) then raise exception 'FAIL preview notified'; end if;

  r := generate_slots(day);
  raise notice 'generate: %', r;
  if (r ->> 'total')::integer <> 18 or (r ->> 'removed')::integer <> 6 then raise exception 'FAIL expected 18 slots (6 removed), got %', r; end if;
  if (r ->> 'bookings')::integer <> 9 or (r ->> 'moved')::integer <> 3 or (r ->> 'changed')::integer <> 3
     or (r ->> 'rebook')::integer <> 0 or (r ->> 'over_capacity')::integer <> 0 then
    raise exception 'FAIL numbers: %', r;
  end if;
  if (p - 'dry_run') <> (r - 'dry_run') then raise exception 'FAIL preview % <> generate %', p, r; end if;
  raise notice 'ok   18 slots (6 after 18:00 removed); 9 bookings, 3 moved, 3 told, 0 to rebook, 0 over; preview = result';

  -- Where everyone is now.
  select string_agg(a.full_name || '=' || to_char(s.starts_at at time zone 'Asia/Kolkata', fmt), ', ' order by bk.created_at) into t
  from recruitment_slot_bookings bk join recruitment_slots s on s.id = bk.slot_id join recruitment_applications a on a.id = bk.application_id
  where s.day_id = day and bk.status <> 'cancelled';
  raise notice 'now: %', t;
  if t is distinct from 'c1940=17:20, c1800a=17:20, c1740a=17:40, c1740b=17:40, c1740c=17:40, c1740d=17:40, c1800b=17:20, c1000=10:00, c1500=15:00' then
    raise exception 'FAIL placement: %', t;
  end if;
  raise notice 'ok   10:00, 15:00 and the full 17:40 slot kept; 19:40, 18:00, 18:00 moved to the nearest free slot (17:20), in booking order';
  if exists (select 1 from recruitment_slots s where s.day_id = day and s.starts_at at time zone 'Asia/Kolkata' >= '2026-10-25 18:00') then raise exception 'FAIL a slot at or after 18:00 remains'; end if;
  if exists (select 1 from recruitment_slots s where s.day_id = day and (select count(*) from recruitment_slot_bookings b where b.slot_id = s.id and b.status <> 'cancelled') > s.capacity) then
    raise exception 'FAIL over capacity';
  end if;
  raise notice 'ok   no slot at or after 6 PM, none over 4 seats';

  -- Notifications: one per moved candidate, with the new time; nobody else.
  select count(*) into n from notifications where user_id = any(u) and title = 'Interview slot updated' and body like 'Your interview slot has been updated to 5:20 PM to 5:40 PM on 25 October.%';
  if n <> 3 then raise exception 'FAIL expected 3 "updated" notifications at 5:20 PM, got %', n; end if;
  if exists (select 1 from notifications where user_id = any(u[3:6] || u[8:9])) then raise exception 'FAIL someone who kept their slot was notified'; end if;
  if exists (select 1 from notifications where user_id = any(u) and title = 'Please choose a new interview slot') then raise exception 'FAIL rebook notice'; end if;
  raise notice 'ok   3 "Interview slot updated" notifications (5:20 PM to 5:40 PM), none for anyone who kept their slot';

  -- Generate again: nothing changes.
  r := generate_slots(day);
  if (r ->> 'moved')::integer <> 0 or (r ->> 'changed')::integer <> 0 or (r ->> 'created')::integer <> 0 or (r ->> 'removed')::integer <> 0 then
    raise exception 'FAIL re-run changed something: %', r;
  end if;
  select count(*) into n from notifications where user_id = any(u);
  if n <> 3 then raise exception 'FAIL re-run notified again'; end if;
  raise notice 'ok   generating again changes nothing and notifies nobody';

  -- More bookings than seats: Preview says so (and the admin is asked before Generate, in the app).
  insert into recruitment_slot_days (cycle_id, date, sessions, slot_minutes, capacity, mode)
  values (cyc, '2026-10-26', '[{"label": "Morning", "start": "10:00", "end": "11:00"}]', 20, 1, 'online_meet') returning id into day2;
  perform generate_slots(day2);
  for i in 1..3 loop
    insert into auth.users (email) values ('extra' || i || '-' || tag || '@example.com') returning id into uid;
    insert into recruitment_applications (cycle_id, user_id, full_name, status, submitted_at, preferences)
    values (cyc, uid, 'extra' || i, 'submitted', now(), array[team]) returning id into app;
    insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id, created_at)
    select s.id, cyc, app, uid, now() + make_interval(secs => 100 + i)
    from recruitment_slots s where s.day_id = day2 and to_char(s.starts_at at time zone 'Asia/Kolkata', fmt) = (array['10:00', '10:20', '10:40'])[i];
  end loop;
  update recruitment_slot_days set sessions = '[{"label": "Morning", "start": "10:00", "end": "10:40"}]' where id = day2;
  p := preview_slot_timings(day2);
  if (p ->> 'rebook')::integer <> 1 then raise exception 'FAIL expected preview "need rebooking" 1, got %', p; end if;
  raise notice 'ok   more bookings than seats: Preview shows need rebooking = 1 (nothing changed)';

  raise notice 'ALL CHECKS PASSED';
end $$;

rollback;
