-- Interview slots: 20 minutes, afternoon until 8:00 PM, and re-cutting a day
-- without losing a booking.
--
-- New defaults for a new day: 20-minute slots, 10:00 to 13:00 and 15:00 to
-- 20:00 IST (lunch 13:00 to 15:00 stays free), still 4 seats each.
--
-- generate_slots(day) now re-cuts a day from its saved settings safely:
--   1. creates the slots of the new length (a slot that starts at a wanted
--      time is kept, so its bookings stay put);
--   2. puts every live booking, first booked first, into the new slot that
--      contains its old start; when that slot is full, into the nearest later
--      slot of the same session with a free seat, then the nearest free slot
--      that day; with no seat left, the booking is cancelled and the
--      candidate is asked to choose again;
--   3. tells everyone whose time changed, then removes the old slots.
-- One transaction; running it again changes nothing. preview_slot_timings(day)
-- runs exactly the same steps and rolls them back, returning the numbers.
--
-- Run once, as one piece. It changes no data by itself.

begin;

alter table recruitment_slot_days
  alter column slot_minutes set default 20,
  alter column sessions set default
    '[{"label": "Morning", "start": "10:00", "end": "13:00"}, {"label": "Afternoon", "start": "15:00", "end": "20:00"}]';

create or replace function recruitment_retime_day(p_day uuid, p_dry_run boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d recruitment_slot_days%rowtype; c recruitment_cycles%rowtype; sess jsonb; si integer := 0;
  first_min integer; last_min integer; m integer; starts timestamptz;
  b record; t record; target uuid;
  created integer := 0; kept integer := 0; removed integer := 0; total_b integer := 0;
  moved integer := 0; changed integer := 0; rebook integer := 0; over integer := 0;
  result jsonb;
begin
  -- Admins in the panel; the SQL editor (a direct postgres session) for the production steps.
  if not is_admin() and not (auth.uid() is null and session_user in ('postgres', 'supabase_admin')) then raise exception 'FORBIDDEN'; end if;

  begin  -- a dry run does everything below and is then rolled back to here
    select * into d from recruitment_slot_days where id = p_day for update;
    if not found then raise exception 'Day not found'; end if;
    select * into c from recruitment_cycles where id = d.cycle_id;
    if jsonb_typeof(d.sessions) <> 'array' or jsonb_array_length(d.sessions) = 0 then
      raise exception 'Add at least one session';
    end if;
    -- book_slot locks the slot row first, so nobody can book on this day meanwhile.
    perform 1 from recruitment_slots where day_id = d.id for update;

    create temp table if not exists fx_new (starts_at timestamptz primary key, ends_at timestamptz, session integer) on commit drop;
    create temp table if not exists fx_seat (slot_id uuid primary key, starts_at timestamptz, ends_at timestamptz, session integer, cap integer, blocked boolean, used integer) on commit drop;
    create temp table if not exists fx_plan (booking_id uuid, user_id uuid, application_id uuid, old_start timestamptz, old_end timestamptz, new_slot uuid) on commit drop;
    truncate fx_new, fx_seat, fx_plan;

    -- The wanted slots, session by session (IST clock times).
    for sess in select value from jsonb_array_elements(d.sessions) loop
      si := si + 1;
      if coalesce(sess ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(sess ->> 'end', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' then
        raise exception 'Session times must look like 10:00';
      end if;
      first_min := split_part(sess ->> 'start', ':', 1)::integer * 60 + split_part(sess ->> 'start', ':', 2)::integer;
      last_min := split_part(sess ->> 'end', ':', 1)::integer * 60 + split_part(sess ->> 'end', ':', 2)::integer;
      if last_min <= first_min then raise exception 'Each session must end after it starts'; end if;
      m := first_min;
      while m + d.slot_minutes <= last_min loop
        starts := (d.date::timestamp + make_interval(mins => m)) at time zone 'Asia/Kolkata';
        insert into fx_new values (starts, starts + make_interval(mins => d.slot_minutes), si) on conflict do nothing;
        m := m + d.slot_minutes;
      end loop;
    end loop;

    -- Keep the slots that start at a wanted time; add the rest.
    select count(*) into kept from recruitment_slots s join fx_new n on n.starts_at = s.starts_at where s.day_id = d.id;
    insert into recruitment_slots (cycle_id, day_id, starts_at, ends_at, capacity)
    select d.cycle_id, d.id, n.starts_at, n.ends_at, d.capacity from fx_new n
    where not exists (select 1 from recruitment_slots s where s.cycle_id = d.cycle_id and s.starts_at = n.starts_at);
    get diagnostics created = row_count;
    insert into fx_seat
    select s.id, s.starts_at, n.ends_at, n.session, s.capacity, s.is_blocked, 0
    from recruitment_slots s join fx_new n on n.starts_at = s.starts_at where s.day_id = d.id;

    -- Place every live booking, first booked first.
    for b in
      select bk.id, bk.user_id, bk.application_id, s.starts_at, s.ends_at
      from recruitment_slot_bookings bk join recruitment_slots s on s.id = bk.slot_id
      where s.day_id = d.id and bk.status <> 'cancelled'
      order by bk.created_at, bk.id
    loop
      total_b := total_b + 1;
      target := null;
      select * into t from fx_seat x where x.starts_at <= b.starts_at and b.starts_at < x.ends_at;
      if t.slot_id is not null and t.used < t.cap then
        target := t.slot_id;
      else
        select x.slot_id into target from fx_seat x
        where t.slot_id is not null and x.session = t.session and x.starts_at > t.starts_at and x.used < x.cap and not x.blocked
        order by x.starts_at limit 1;
        if target is null then
          select x.slot_id into target from fx_seat x
          where x.used < x.cap and not x.blocked
          order by abs(extract(epoch from x.starts_at - b.starts_at)), x.starts_at limit 1;
        end if;
      end if;
      if target is not null then update fx_seat set used = used + 1 where slot_id = target; end if;
      insert into fx_plan values (b.id, b.user_id, b.application_id, b.starts_at, b.ends_at, target);
    end loop;

    -- Kept slots take the new length now (the plan above saw their old end, so those candidates are told too).
    update recruitment_slots s set ends_at = n.ends_at from fx_new n
    where s.day_id = d.id and s.starts_at = n.starts_at and s.ends_at <> n.ends_at;
    update recruitment_slot_bookings bk set slot_id = p.new_slot
    from fx_plan p where bk.id = p.booking_id and p.new_slot is not null and bk.slot_id <> p.new_slot;
    get diagnostics moved = row_count;
    update recruitment_slot_bookings bk set status = 'cancelled'
    from fx_plan p where bk.id = p.booking_id and p.new_slot is null;
    get diagnostics rebook = row_count;
    perform recruitment_sync_interview(p.application_id) from fx_plan p;

    insert into notifications (user_id, title, body, link)
    select p.user_id, 'Interview slot updated',
           'Your interview slot has been updated to '
             || to_char(x.starts_at at time zone 'Asia/Kolkata', 'FMHH12:MI AM') || ' to '
             || to_char(x.ends_at at time zone 'Asia/Kolkata', 'FMHH12:MI AM') || ' on ' || to_char(d.date, 'FMDD FMMonth') || '.'
             || case when c.closes_at is not null
                     then ' You can change it until ' || to_char(c.closes_at at time zone 'Asia/Kolkata', 'FMDD FMMonth') || '.' else '' end,
           '/recruitment/status'
    from fx_plan p join fx_seat x on x.slot_id = p.new_slot
    where (x.starts_at, x.ends_at) is distinct from (p.old_start, p.old_end);
    get diagnostics changed = row_count;
    insert into notifications (user_id, title, body, link)
    select p.user_id, 'Please choose a new interview slot',
           'The interview times on ' || to_char(d.date, 'FMDD FMMonth') || ' have changed and there was no free seat near your slot. Please choose a new slot.',
           '/recruitment/slot'
    from fx_plan p where p.new_slot is null;

    -- Old slots go last. Cancelled bookings in them move along (so their history stays) when a new slot covers that time.
    update recruitment_slot_bookings bk set slot_id = x.slot_id
    from recruitment_slots s, fx_seat x
    where bk.slot_id = s.id and s.day_id = d.id and bk.status = 'cancelled'
      and not exists (select 1 from fx_new n where n.starts_at = s.starts_at)
      and x.starts_at <= s.starts_at and s.starts_at < x.ends_at;
    delete from recruitment_slots s
    where s.day_id = d.id and not exists (select 1 from fx_new n where n.starts_at = s.starts_at)
      and not exists (select 1 from recruitment_slot_bookings bk where bk.slot_id = s.id and bk.status <> 'cancelled');
    get diagnostics removed = row_count;

    select count(*) into over from recruitment_slots s
    where s.day_id = d.id and (select count(*) from recruitment_slot_bookings bk where bk.slot_id = s.id and bk.status <> 'cancelled') > s.capacity;

    result := jsonb_build_object(
      'total', (select count(*) from recruitment_slots where day_id = d.id),
      'created', created, 'kept', kept, 'removed', removed, 'conflicts', '[]'::jsonb,
      'bookings', total_b, 'moved', moved, 'changed', changed, 'rebook', rebook, 'over_capacity', over,
      'dry_run', p_dry_run);
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (auth.uid(), 'generated_slots', 'recruitment_slot_days', d.id::text,
            jsonb_build_object('note', created || ' created, ' || kept || ' kept, ' || removed || ' removed; '
              || total_b || ' booking(s): ' || moved || ' moved, ' || changed || ' time(s) changed, ' || rebook || ' need rebooking'));

    if p_dry_run then raise exception 'dry run' using errcode = 'FXDRY'; end if;
  exception when sqlstate 'FXDRY' then
    null;  -- everything in the block is undone; the numbers in `result` stay
  end;
  return result;
end $$;

-- "Generate slots" in the panel: re-cuts the day from its saved settings, keeping every booking.
create or replace function generate_slots(p_day uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return recruitment_retime_day(p_day, false);
end $$;

-- The same, rolled back: what Generate would do.
create or replace function preview_slot_timings(p_day uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return recruitment_retime_day(p_day, true);
end $$;

revoke all on function recruitment_retime_day(uuid, boolean), preview_slot_timings(uuid) from public, anon, authenticated;
grant execute on function preview_slot_timings(uuid) to authenticated;

commit;
