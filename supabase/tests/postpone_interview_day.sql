-- Test for migration 0022 (postponing an interview day keeps everyone's IST time).
-- LOCAL / DEV DATABASE ONLY. Everything runs inside one transaction that is
-- rolled back at the end, so nothing is kept. Run it after the migrations:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/postpone_interview_day.sql
-- Each check prints "ok ..." as a NOTICE; the first failing check stops it with "FAIL ...".

begin;

do $$
declare
  cyc uuid; team uuid; day1 uuid; day2 uuid; r jsonb; n integer; t text;
  u uuid[] := '{}'; app uuid[] := '{}'; uid uuid; aid uuid; i integer;
  link record;
begin
  -- ── setup: a cycle, a hub, eight test candidates ─────────────────────
  insert into recruitment_cycles (title, status, opens_at, closes_at)
  values ('TEST postpone day', 'open', now() - interval '2 days', now() + interval '2 days') returning id into cyc;
  insert into recruitment_teams (cycle_id, name, slug) values (cyc, 'Test Hub', 'test-hub') returning id into team;
  for i in 1..8 loop
    insert into auth.users (id, email) values (gen_random_uuid(), 'postpone-test-' || i || '-' || substr(cyc::text, 1, 8) || '@example.com') returning id into uid;
    insert into recruitment_applications (cycle_id, user_id, full_name, status, submitted_at, preferences)
    values (cyc, uid, 'Test ' || i, 'submitted', now(), array[team]) returning id into aid;
    u := u || uid; app := app || aid;
  end loop;

  -- ── case 1: 20 Oct, 10:00-13:00 and 15:00-20:00, 20 minutes, 4 seats ──
  insert into recruitment_slot_days (cycle_id, date, sessions, slot_minutes, capacity, mode)
  values (cyc, '2026-10-20',
          '[{"label": "Morning", "start": "10:00", "end": "13:00"}, {"label": "Afternoon", "start": "15:00", "end": "20:00"}]',
          20, 4, 'online_meet')
  returning id into day1;
  r := generate_slots(day1);
  if (r ->> 'total')::integer <> 24 then raise exception 'FAIL generate: expected 24 slots, got %', r; end if;
  raise notice 'ok   20 Oct generated: 24 slots';

  -- Three bookings, at 10:00, 10:20 and 15:00 IST, booked in that order.
  for i in 1..3 loop
    insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id, created_at)
    select s.id, cyc, app[i], u[i], now() + make_interval(secs => i)
    from recruitment_slots s
    where s.day_id = day1 and to_char(s.starts_at at time zone 'Asia/Kolkata', 'HH24:MI') = (array['10:00', '10:20', '15:00'])[i];
  end loop;
  -- A published Google Meet link for the day.
  insert into recruitment_meet_links (day_id, meet_url, published_at) values (day1, 'https://meet.google.com/abc-defg-hij', now());
  -- And a published link of its own for the 15:00 slot.
  insert into recruitment_meet_links (day_id, slot_id, meet_url, published_at)
  select day1, s.id, 'https://meet.google.com/xyz-wxyz-xyz', now() from recruitment_slots s
  where s.day_id = day1 and to_char(s.starts_at at time zone 'Asia/Kolkata', 'HH24:MI') = '15:00';

  -- Postponed to 23 Oct.
  update recruitment_slot_days set date = '2026-10-23' where id = day1;

  r := preview_slot_timings(day1);
  raise notice 'preview: %', r;
  if (r ->> 'bookings')::integer <> 3 or (r ->> 'moved')::integer <> 3 or (r ->> 'rebook')::integer <> 0 or (r ->> 'over_capacity')::integer <> 0 then
    raise exception 'FAIL preview: expected bookings 3, moved 3, rebook 0, over_capacity 0, got %', r;
  end if;
  if (select count(*) from recruitment_slots s where s.day_id = day1 and (s.starts_at at time zone 'Asia/Kolkata')::date = '2026-10-23') <> 0 then
    raise exception 'FAIL preview changed data';
  end if;
  raise notice 'ok   preview: bookings 3, moved 3, rebook 0, over capacity 0, nothing changed';

  r := generate_slots(day1);
  raise notice 'generate: %', r;
  select string_agg(to_char(s.starts_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'), ', ' order by b.created_at) into t
  from recruitment_slot_bookings b join recruitment_slots s on s.id = b.slot_id
  where b.cycle_id = cyc and b.status <> 'cancelled';
  if t is distinct from '2026-10-23 10:00, 2026-10-23 10:20, 2026-10-23 15:00' then
    raise exception 'FAIL times: expected 23 Oct 10:00, 10:20, 15:00, got %', t;
  end if;
  raise notice 'ok   bookings now at %', t;

  select count(*) into n from notifications where title = 'Interview slot updated' and user_id = any(u[1:3]) and body like '%on 23 October%';
  if n <> 3 then raise exception 'FAIL notifications: expected 3 "Interview slot updated ... on 23 October", got %', n; end if;
  raise notice 'ok   3 "Interview slot updated" notifications for 23 October';

  if (select count(*) from recruitment_slots where day_id = day1 and (starts_at at time zone 'Asia/Kolkata')::date <> '2026-10-23') <> 0 then
    raise exception 'FAIL old 20 Oct slots still there';
  end if;
  raise notice 'ok   no 20 Oct slots left';

  select meet_url, published_at into link from recruitment_meet_links where day_id = day1 and slot_id is null;
  if link.meet_url is distinct from 'https://meet.google.com/abc-defg-hij' or link.published_at is not null then
    raise exception 'FAIL meet link: expected the same link with published_at null, got % / %', link.meet_url, link.published_at;
  end if;
  raise notice 'ok   Meet link kept (%), published_at reset to null', link.meet_url;
  select to_char(s.starts_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as at, l.published_at into link
  from recruitment_meet_links l join recruitment_slots s on s.id = l.slot_id where l.meet_url = 'https://meet.google.com/xyz-wxyz-xyz';
  if link.at is distinct from '2026-10-23 15:00' or link.published_at is not null then
    raise exception 'FAIL slot link: expected it on the 23 Oct 15:00 slot, unpublished, got % / %', link.at, link.published_at;
  end if;
  raise notice 'ok   the 15:00 slot link moved to 23 Oct 15:00, unpublished';

  -- Generating again with the date unchanged moves nothing.
  select count(*) into n from notifications where title = 'Interview slot updated' and user_id = any(u);
  r := generate_slots(day1);
  if (r ->> 'moved')::integer <> 0 or (r ->> 'changed')::integer <> 0 or (r ->> 'created')::integer <> 0 or (r ->> 'removed')::integer <> 0
     or (select count(*) from notifications where title = 'Interview slot updated' and user_id = any(u)) <> n then
    raise exception 'FAIL unchanged re-generate: %', r;
  end if;
  raise notice 'ok   unchanged date, generate again: 0 moved, 0 changed, 0 created, 0 removed, no new notification';

  -- ── case 2: capacity. 10-minute slots on 21 Oct, 3 booked at 10:00 and 2 at 10:10;
  --    moved to 24 Oct with 20-minute slots, all five fall into one 4-seat 10:00 slot ──
  insert into recruitment_slot_days (cycle_id, date, sessions, slot_minutes, capacity, mode)
  values (cyc, '2026-10-21', '[{"label": "Morning", "start": "10:00", "end": "13:00"}]', 10, 4, 'online_meet')
  returning id into day2;
  perform generate_slots(day2);
  for i in 4..8 loop
    insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id, created_at)
    select s.id, cyc, app[i], u[i], now() + make_interval(secs => i)
    from recruitment_slots s
    where s.day_id = day2 and to_char(s.starts_at at time zone 'Asia/Kolkata', 'HH24:MI') = case when i <= 6 then '10:00' else '10:10' end;
  end loop;
  update recruitment_slot_days set date = '2026-10-24', slot_minutes = 20 where id = day2;
  r := generate_slots(day2);
  raise notice 'generate (capacity case): %', r;
  select string_agg(to_char(s.starts_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'), ', ' order by b.created_at) into t
  from recruitment_slot_bookings b join recruitment_slots s on s.id = b.slot_id
  where b.application_id = any(app[4:8]) and b.status <> 'cancelled';
  if t is distinct from '2026-10-24 10:00, 2026-10-24 10:00, 2026-10-24 10:00, 2026-10-24 10:00, 2026-10-24 10:20' then
    raise exception 'FAIL capacity: expected four at 10:00 and the last booker at 10:20 on 24 Oct, got %', t;
  end if;
  if (r ->> 'rebook')::integer <> 0 or (r ->> 'over_capacity')::integer <> 0 then raise exception 'FAIL capacity: %', r; end if;
  raise notice 'ok   capacity: 4 at 10:00, the 5th (last booked) at 10:20, same session, 0 lost, 0 over capacity';

  raise notice 'ALL CHECKS PASSED';
end $$;

rollback;
