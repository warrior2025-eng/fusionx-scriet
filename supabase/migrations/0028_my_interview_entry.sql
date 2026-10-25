-- "My Interview / My Result" for candidates and "Reviewer panel · Live" for reviewers: two read-only
-- functions, each one round trip, each about the caller only. Nothing else changes.
--
--   my_recruitment_entry(cycle)  the caller's own interview booking (slot, join window, day mode), whether the
--                                results are out (by the existing time lock), when, and when they answered their
--                                offer (to hide the entry 3 days later). No outcome: the result itself is still
--                                read only from get_my_result, after the publish time.
--   my_live_interview_day()      today's interview day (IST) the caller sits on the panel of, from 30 minutes
--                                before its first slot until its last one ends, with the slot on now.
--
-- Run once, as one piece. Running it again changes nothing.

begin;

create or replace function my_recruitment_entry(p_cycle uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare a record; k record; c recruitment_cycles%rowtype; answered timestamptz; visible boolean;
begin
  if auth.uid() is null then return null; end if;
  select id, status into a from recruitment_applications where cycle_id = p_cycle and user_id = auth.uid() and status = 'submitted';
  if not found then return null; end if;
  select b.status as booking_status, s.starts_at, s.ends_at, d.date as day, d.mode,
         coalesce(r.room_enabled, false) as room, coalesce(r.early_join_minutes, 0) as early, coalesce(r.grace_minutes, 0) as grace
    into k
  from recruitment_slot_bookings b
  join recruitment_slots s on s.id = b.slot_id
  join recruitment_slot_days d on d.id = s.day_id
  left join recruitment_room_settings r on r.day_id = d.id
  where b.cycle_id = p_cycle and b.user_id = auth.uid() and b.status <> 'cancelled'
  order by b.created_at desc limit 1;
  if not found then return null; end if;
  select * into c from recruitment_cycles where id = p_cycle;
  visible := recruitment_results_visible(p_cycle);
  -- When they answered an offer (only once the results are out).
  if visible then
    select max(ts.offer_responded_at) into answered from recruitment_team_status ts where ts.application_id = a.id;
  end if;
  return jsonb_build_object(
    'now', now(),
    'booking_status', k.booking_status,
    'day', k.day, 'starts_at', k.starts_at, 'ends_at', k.ends_at, 'mode', k.mode, 'room', k.room,
    'opens_at', k.starts_at - make_interval(mins => k.early),
    'closes_at', k.ends_at + make_interval(mins => k.grace),
    'results_at', case when c.results_scheduled or c.status = 'results_published' then coalesce(c.results_published_at, c.results_publish_at) end,
    'results_out', visible,
    'answered_at', answered);
end $$;

create or replace function my_live_interview_day()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare d record; first_start timestamptz; last_end timestamptz; cur record;
begin
  if auth.uid() is null then return null; end if;
  for d in
    select sd.id, sd.cycle_id, sd.date from recruitment_slot_days sd
    where sd.date = (now() at time zone 'Asia/Kolkata')::date
    order by sd.date
  loop
    select min(s.starts_at), max(s.ends_at) into first_start, last_end from recruitment_slots s where s.day_id = d.id;
    if first_start is null or now() < first_start - interval '30 minutes' or now() > last_end then continue; end if;
    if interview_day_access(d.id) is null then continue; end if;
    select s.starts_at, s.ends_at,
           (select count(*) from recruitment_slot_bookings b where b.slot_id = s.id and b.status in ('booked', 'attended', 'no_show')) as booked
      into cur
    from recruitment_slots s
    where s.day_id = d.id and s.ends_at > now()
    order by s.starts_at limit 1;
    return jsonb_build_object('day_id', d.id, 'admin', is_admin(), 'first_start', first_start, 'last_end', last_end, 'now', now(),
      'slot_starts_at', cur.starts_at, 'slot_ends_at', cur.ends_at, 'slot_booked', coalesce(cur.booked, 0));
  end loop;
  return null;
end $$;

revoke all on function my_recruitment_entry(uuid), my_live_interview_day() from public, anon;
grant execute on function my_recruitment_entry(uuid), my_live_interview_day() to authenticated;

commit;
