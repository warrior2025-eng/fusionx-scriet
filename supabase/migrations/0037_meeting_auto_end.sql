-- A live meeting ends by itself 5 minutes after the room empties.
--
-- "Empty since" is the last time anyone who joined was seen in the room: their last
-- check-in or their leave (meeting_attendance), or the server seeing someone connected to
-- the call (occupied_at, written by the minute job after asking LiveKit, so a tab that
-- stopped checking in still counts). A room with anyone in it keeps that time fresh, so it
-- is never ended; someone coming back within the 5 minutes starts the count again.
--
-- Passes, the room and the admin list read it at once (meeting_phase). The minute job
-- (send_meeting_reminders) then records the end and the audit entry.

begin;

alter table meetings add column if not exists occupied_at timestamptz;

create function meeting_empty_since(m meetings)
returns timestamptz language sql stable security definer set search_path = public as $$
  select greatest(max(greatest(a.left_at, a.last_seen_at)), m.occupied_at)
  from meeting_attendance a where a.meeting_id = m.id and a.first_joined_at is not null;
$$;

create or replace function meeting_phase(m meetings)
returns text language sql stable as $$
  select case
    when m.status = 'cancelled' then 'cancelled'
    when m.status = 'ended' or now() >= meeting_close_at(m) then 'ended'
    when m.started_at is not null and meeting_empty_since(m) <= now() - interval '5 minutes' then 'ended'
    when m.started_at is not null then 'live'
    when now() >= m.starts_at - interval '10 minutes' then 'doors'
    else 'upcoming'
  end;
$$;

-- For the minute job, before it ends anything: live meetings nobody has checked in to for a
-- minute. The job asks LiveKit about each and marks the ones with someone connected.
create function meeting_rooms_to_check()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(m.id), '[]'::jsonb) from meetings m
  where m.status = 'scheduled' and m.started_at is not null and now() < meeting_close_at(m)
    and meeting_empty_since(m) <= now() - interval '1 minute';
$$;

create function meeting_mark_occupied(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update meetings set occupied_at = now() where id = any(p_ids) and status = 'scheduled';
$$;

-- The job (every minute): the reminder 10 minutes before, once per start time, and ending
-- meetings that are over: nobody ended them, or the room has been empty for 5 minutes.
create or replace function send_meeting_reminders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  sent integer := 0;
  closed integer := 0;
  emptied uuid[] := '{}';
  n integer;
begin
  for mt in
    select * from meetings m where m.status = 'scheduled' and m.started_at is null
      and m.starts_at > now() and m.starts_at <= now() + interval '10 minutes'
      and m.reminder_sent_for is distinct from m.starts_at
    for update skip locked
  loop
    insert into notifications (user_id, title, body, link)
    select i.user_id, 'Starting in 10 minutes: ' || mt.title, meeting_when(mt.starts_at) || '. Doors are open. Enter with your pass.', meeting_pass_link(mt.id, i.user_id)
    from meeting_invites i where i.meeting_id = mt.id and i.cant_reason is null;
    get diagnostics n = row_count;
    sent := sent + n;
    update meetings set reminder_sent_for = mt.starts_at where id = mt.id;
  end loop;
  for mt in select * from meetings m where m.status = 'scheduled' and meeting_phase(m) = 'ended' for update skip locked loop
    if now() < meeting_close_at(mt) then
      emptied := emptied || mt.id;
      perform meeting_audit('auto_ended_meeting', mt.id, mt.title || ': nobody in the room for 5 minutes');
    end if;
    perform meeting_finish(mt.id, null);
    closed := closed + 1;
  end loop;
  return jsonb_build_object('reminders', sent, 'closed', closed, 'emptied', to_jsonb(emptied));
end $$;

revoke all on function meeting_empty_since(meetings), meeting_rooms_to_check(), meeting_mark_occupied(uuid[]) from public, anon, authenticated;
grant execute on function meeting_rooms_to_check(), meeting_mark_occupied(uuid[]) to service_role;
-- meeting_phase is run as the caller and reads this.
grant execute on function meeting_empty_since(meetings) to authenticated, service_role;

commit;
