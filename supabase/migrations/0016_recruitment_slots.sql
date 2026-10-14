-- Recruitment interview slots and Google Meet links.
--
-- An admin adds interview days to a cycle; each day has sessions (by default
-- 10:00 to 13:00 and 15:00 to 18:00 IST), and generate_slots cuts them into
-- slots (10 minutes, 4 seats each by default). A candidate holds at most one
-- slot per cycle and books it through book_slot, which locks the slot row so
-- the seat count can never be exceeded, however many people click at once.
--
-- Bookings change only through the functions below. The Meet link sits in an
-- admin-only table; a candidate gets it through get_my_meet_link, and only on
-- the day of their interview, after an admin has published it, until an hour
-- after their slot ends.
--
-- All times are timestamptz; slot times are worked out in Asia/Kolkata.
--
-- Run once, as one piece.

begin;

-- ── cycle settings ─────────────────────────────────────────────────────
alter table recruitment_cycles
  add column slot_required boolean not null default true,
  add column cutoff_hours integer not null default 2 check (cutoff_hours between 0 and 72),
  add column interview_instructions text not null default
    'Your interview will be held online on Google Meet. The meeting link will be shared on the day of your interview. Please join on time with a stable internet connection, your camera on, and a working microphone.'
    check (char_length(interview_instructions) <= 1500),
  add column reporting_note text check (reporting_note is null or char_length(reporting_note) <= 1000);

-- ── tables ─────────────────────────────────────────────────────────────
create table recruitment_slot_days (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references recruitment_cycles(id) on delete cascade,
  date date not null,
  -- [{ "label": "Morning", "start": "10:00", "end": "13:00" }, …], IST clock times
  sessions jsonb not null default
    '[{"label": "Morning", "start": "10:00", "end": "13:00"}, {"label": "Afternoon", "start": "15:00", "end": "18:00"}]',
  slot_minutes integer not null default 10 check (slot_minutes between 5 and 120),
  capacity integer not null default 4 check (capacity between 1 and 50),
  mode text not null default 'online_meet' check (mode in ('online_meet', 'offline')),
  venue text check (venue is null or char_length(venue) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, date)
);

create table recruitment_slots (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references recruitment_cycles(id) on delete cascade,
  day_id uuid not null references recruitment_slot_days(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 4 check (capacity between 0 and 50),
  is_blocked boolean not null default false,
  label text check (label is null or char_length(label) <= 80),
  created_at timestamptz not null default now(),
  unique (cycle_id, starts_at),
  check (ends_at > starts_at)
);
create index idx_recruitment_slots_day on recruitment_slots (day_id, starts_at);

create table recruitment_slot_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references recruitment_slots(id) on delete cascade,
  cycle_id uuid not null references recruitment_cycles(id) on delete cascade,
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'attended', 'no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One live booking per person per cycle.
create unique index idx_slot_bookings_one_per_person on recruitment_slot_bookings (cycle_id, user_id) where status <> 'cancelled';
create index idx_slot_bookings_slot on recruitment_slot_bookings (slot_id) where status <> 'cancelled';

-- Admin-only. A row with slot_id set overrides the day's link for that slot.
create table recruitment_meet_links (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references recruitment_slot_days(id) on delete cascade,
  slot_id uuid references recruitment_slots(id) on delete cascade,
  meet_url text not null check (meet_url ~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_meet_links_day on recruitment_meet_links (day_id) where slot_id is null;
create unique index idx_meet_links_slot on recruitment_meet_links (slot_id) where slot_id is not null;

create trigger trg_recruitment_slot_days_updated_at before update on recruitment_slot_days
  for each row execute function set_updated_at();
create trigger trg_recruitment_slot_bookings_updated_at before update on recruitment_slot_bookings
  for each row execute function set_updated_at();
create trigger trg_recruitment_meet_links_updated_at before update on recruitment_meet_links
  for each row execute function set_updated_at();

-- ── helpers ────────────────────────────────────────────────────────────
-- "Mon 20 Oct 2026, 10:00 AM to 10:10 AM IST"
create or replace function recruitment_slot_when(p_starts timestamptz, p_ends timestamptz)
returns text language sql immutable set search_path = public as $$
  select to_char(p_starts at time zone 'Asia/Kolkata', 'Dy FMDD Mon YYYY') || ', '
      || to_char(p_starts at time zone 'Asia/Kolkata', 'FMHH12:MI AM') || ' to '
      || to_char(p_ends at time zone 'Asia/Kolkata', 'FMHH12:MI AM') || ' IST';
$$;

-- The booked slot's time and place, written onto the application's team rows
-- so the existing status timeline and admin lists show it. Cleared when the
-- person has no live booking.
create or replace function recruitment_sync_interview(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare slot_start timestamptz; place text;
begin
  select s.starts_at, case when d.mode = 'online_meet' then 'Online (Google Meet)' else coalesce(nullif(trim(d.venue), ''), 'In person') end
    into slot_start, place
  from recruitment_slot_bookings b
  join recruitment_slots s on s.id = b.slot_id
  join recruitment_slot_days d on d.id = s.day_id
  where b.application_id = p_application and b.status <> 'cancelled'
  limit 1;
  update recruitment_team_status set interview_at = slot_start, interview_location = place
  where application_id = p_application;
end $$;

-- Does this cycle have slots a candidate could book (so one is required)?
create or replace function recruitment_cycle_has_slots(p_cycle uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from recruitment_slots s join recruitment_slot_days d on d.id = s.day_id
    where s.cycle_id = p_cycle and d.is_active and not s.is_blocked);
$$;

-- ── generating slots ───────────────────────────────────────────────────
-- Cuts each session of a day into slots. Safe to run again: existing slots
-- are kept (their end time follows the slot length), slots that no longer
-- fit the sessions are removed unless someone holds them, and those are
-- reported as conflicts instead.
create or replace function generate_slots(p_day uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d recruitment_slot_days%rowtype; sess jsonb; first_min integer; last_min integer; m integer;
  starts timestamptz; wanted timestamptz[] := '{}'; made integer := 0; kept integer := 0; removed integer := 0;
  conflicts jsonb := '[]'; r record;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into d from recruitment_slot_days where id = p_day for update;
  if not found then raise exception 'Day not found'; end if;
  if jsonb_typeof(d.sessions) <> 'array' or jsonb_array_length(d.sessions) = 0 then
    raise exception 'Add at least one session';
  end if;

  for sess in select value from jsonb_array_elements(d.sessions) loop
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
      if not (starts = any (wanted)) then
        wanted := wanted || starts;
        insert into recruitment_slots (cycle_id, day_id, starts_at, ends_at, capacity)
        values (d.cycle_id, d.id, starts, starts + make_interval(mins => d.slot_minutes), d.capacity)
        on conflict (cycle_id, starts_at) do nothing;
        if found then
          made := made + 1;
        else
          kept := kept + 1;
          update recruitment_slots set ends_at = starts + make_interval(mins => d.slot_minutes)
          where cycle_id = d.cycle_id and starts_at = starts;
        end if;
      end if;
      m := m + d.slot_minutes;
    end loop;
  end loop;

  for r in
    select s.id, s.starts_at,
           (select count(*) from recruitment_slot_bookings b where b.slot_id = s.id and b.status <> 'cancelled') as held
    from recruitment_slots s
    where s.day_id = d.id and not (s.starts_at = any (wanted))
  loop
    if r.held = 0 then
      delete from recruitment_slots where id = r.id;
      removed := removed + 1;
    else
      conflicts := conflicts || jsonb_build_object('starts_at', r.starts_at, 'bookings', r.held);
    end if;
  end loop;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'generated_slots', 'recruitment_slot_days', d.id::text,
          jsonb_build_object('note', made || ' created, ' || kept || ' kept, ' || removed || ' removed, '
                                     || jsonb_array_length(conflicts) || ' conflict(s)'));
  return jsonb_build_object('created', made, 'kept', kept, 'removed', removed, 'conflicts', conflicts,
    'total', (select count(*) from recruitment_slots where day_id = d.id));
end $$;

-- ── what anyone may see: times and seat counts, never who booked ───────
create or replace function recruitment_slot_availability(p_cycle uuid)
returns table (slot_id uuid, day_id uuid, day date, starts_at timestamptz, ends_at timestamptz, session_label text,
               capacity integer, booked integer, remaining integer, state text, mode text, venue text, mine boolean)
language sql security definer stable set search_path = public as $$
  select s.id, d.id, d.date, s.starts_at, s.ends_at,
         (select e ->> 'label' from jsonb_array_elements(d.sessions) e
          where to_char(s.starts_at at time zone 'Asia/Kolkata', 'HH24:MI') >= e ->> 'start'
            and to_char(s.starts_at at time zone 'Asia/Kolkata', 'HH24:MI') < e ->> 'end'
          limit 1),
         s.capacity, n.booked, greatest(s.capacity - n.booked, 0),
         case when s.is_blocked then 'blocked'
              when now() >= s.starts_at - make_interval(hours => c.cutoff_hours) then 'closed'
              when n.booked >= s.capacity then 'full'
              else 'available' end,
         d.mode, d.venue,
         exists (select 1 from recruitment_slot_bookings b
                 where b.slot_id = s.id and b.user_id = auth.uid() and b.status <> 'cancelled')
  from recruitment_slots s
  join recruitment_slot_days d on d.id = s.day_id and d.is_active
  join recruitment_cycles c on c.id = s.cycle_id and c.status <> 'draft'
  cross join lateral (
    select count(*)::integer as booked from recruitment_slot_bookings b where b.slot_id = s.id and b.status <> 'cancelled'
  ) n
  where s.cycle_id = p_cycle
  order by s.starts_at;
$$;

-- ── booking ────────────────────────────────────────────────────────────
-- Books a slot, or moves the caller's booking to it. The slot row is locked
-- first, so concurrent bookings of one slot are counted one after another.
create or replace function book_slot(p_slot uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); s recruitment_slots%rowtype; d recruitment_slot_days%rowtype; c recruitment_cycles%rowtype;
  app recruitment_applications%rowtype; cur recruitment_slot_bookings%rowtype; old_start timestamptz; taken integer;
begin
  if uid is null then raise exception 'Please sign in to choose a slot'; end if;
  if not account_active(uid) then raise exception 'This account is deactivated'; end if;

  select * into s from recruitment_slots where id = p_slot for update;
  if not found then raise exception 'Slot not found'; end if;
  select * into d from recruitment_slot_days where id = s.day_id;
  select * into c from recruitment_cycles where id = s.cycle_id;
  if not d.is_active or c.status not in ('open', 'closed') then raise exception 'Interview slots are not open'; end if;

  select * into app from recruitment_applications where cycle_id = c.id and user_id = uid;
  if not found or app.status = 'withdrawn' then raise exception 'Start your application first'; end if;
  if app.status = 'draft' and not recruitment_cycle_accepting(c.id) then raise exception 'Applications are closed'; end if;
  if s.is_blocked then raise exception 'This slot is not available'; end if;
  if now() >= s.starts_at - make_interval(hours => c.cutoff_hours) then raise exception 'Booking for this slot has closed'; end if;

  select * into cur from recruitment_slot_bookings
  where cycle_id = c.id and user_id = uid and status <> 'cancelled' for update;
  if cur.id is not null then
    if cur.slot_id = s.id then
      return jsonb_build_object('slot_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'moved', false,
        'remaining', s.capacity - (select count(*) from recruitment_slot_bookings where slot_id = s.id and status <> 'cancelled'));
    end if;
    if cur.status <> 'booked' then raise exception 'Your interview has already been marked and cannot be moved'; end if;
    select starts_at into old_start from recruitment_slots where id = cur.slot_id;
    if now() >= old_start - make_interval(hours => c.cutoff_hours) then
      raise exception 'Your current slot can no longer be changed';
    end if;
  end if;

  select count(*) into taken from recruitment_slot_bookings where slot_id = s.id and status <> 'cancelled';
  if taken >= s.capacity then raise exception 'Slot full'; end if;

  if cur.id is not null then
    update recruitment_slot_bookings set status = 'cancelled' where id = cur.id;
  end if;
  begin
    insert into recruitment_slot_bookings (slot_id, cycle_id, application_id, user_id)
    values (s.id, c.id, app.id, uid);
  exception when unique_violation then
    raise exception 'You already hold a slot. Refresh the page and try again';
  end;
  perform recruitment_sync_interview(app.id);

  insert into notifications (user_id, title, body, link)
  values (uid,
          case when cur.id is null then 'Interview slot booked' else 'Interview slot changed' end,
          'Your interview: ' || recruitment_slot_when(s.starts_at, s.ends_at) || '. '
            || case when d.mode = 'online_meet' then c.interview_instructions
                    else 'Venue: ' || coalesce(nullif(trim(d.venue), ''), 'to be announced') || '.' end,
          '/recruitment/status');

  return jsonb_build_object('slot_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
                            'moved', cur.id is not null, 'remaining', s.capacity - taken - 1);
end $$;

create or replace function cancel_slot_booking(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cur recruitment_slot_bookings%rowtype; s recruitment_slots%rowtype; cutoff integer;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  select * into cur from recruitment_slot_bookings
  where cycle_id = p_cycle and user_id = uid and status = 'booked' for update;
  if not found then return jsonb_build_object('status', 'none'); end if;
  select * into s from recruitment_slots where id = cur.slot_id;
  select cutoff_hours into cutoff from recruitment_cycles where id = p_cycle;
  if now() >= s.starts_at - make_interval(hours => cutoff) then raise exception 'It is too late to cancel this slot'; end if;
  update recruitment_slot_bookings set status = 'cancelled' where id = cur.id;
  perform recruitment_sync_interview(cur.application_id);
  insert into notifications (user_id, title, body, link)
  values (uid, 'Interview slot cancelled', 'You cancelled your interview slot (' || recruitment_slot_when(s.starts_at, s.ends_at) || '). Choose another on your status page.', '/recruitment/status');
  return jsonb_build_object('status', 'cancelled');
end $$;

-- The caller's own booking, with what the status page needs.
create or replace function my_slot_booking(p_cycle uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'booking_id', b.id, 'status', b.status, 'slot_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'day', d.date, 'mode', d.mode, 'venue', d.venue,
    'cutoff_at', s.starts_at - make_interval(hours => c.cutoff_hours),
    'can_change', b.status = 'booked' and now() < s.starts_at - make_interval(hours => c.cutoff_hours))
  from recruitment_slot_bookings b
  join recruitment_slots s on s.id = b.slot_id
  join recruitment_slot_days d on d.id = s.day_id
  join recruitment_cycles c on c.id = b.cycle_id
  where b.cycle_id = p_cycle and b.user_id = auth.uid() and b.status <> 'cancelled'
  limit 1;
$$;

-- ── the Meet link ──────────────────────────────────────────────────────
-- state: none | offline | before_day | not_published | available | ended.
-- The url is included only when the state is "available".
create or replace function get_my_meet_link(p_cycle uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  b record; link record; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select s.id as slot_id, s.starts_at, s.ends_at, d.id as day_id, d.date, d.mode into b
  from recruitment_slot_bookings bk
  join recruitment_slots s on s.id = bk.slot_id
  join recruitment_slot_days d on d.id = s.day_id
  where bk.cycle_id = p_cycle and bk.user_id = auth.uid() and bk.status in ('booked', 'attended')
  limit 1;
  if not found then return jsonb_build_object('state', 'none'); end if;
  if b.mode <> 'online_meet' then return jsonb_build_object('state', 'offline', 'day', b.date); end if;
  if now() >= b.ends_at + interval '1 hour' then
    return jsonb_build_object('state', 'ended', 'day', b.date, 'starts_at', b.starts_at, 'ends_at', b.ends_at);
  end if;
  if today < b.date then
    return jsonb_build_object('state', 'before_day', 'day', b.date, 'starts_at', b.starts_at, 'ends_at', b.ends_at);
  end if;
  -- The slot's own link if it has one, otherwise the day's.
  select l.meet_url, l.published_at into link
  from recruitment_meet_links l
  where (l.slot_id = b.slot_id) or (l.day_id = b.day_id and l.slot_id is null)
  order by (l.slot_id is not null) desc
  limit 1;
  if link.meet_url is null or link.published_at is null then
    return jsonb_build_object('state', 'not_published', 'day', b.date, 'starts_at', b.starts_at, 'ends_at', b.ends_at);
  end if;
  return jsonb_build_object('state', 'available', 'url', link.meet_url, 'day', b.date, 'starts_at', b.starts_at, 'ends_at', b.ends_at);
end $$;

-- Publishes a day's links (the day's own and any per-slot ones) and tells
-- everyone booked that day. Only on the day itself.
create or replace function publish_meet_links(p_day uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d recruitment_slot_days%rowtype; told integer; missing integer;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into d from recruitment_slot_days where id = p_day;
  if not found then raise exception 'Day not found'; end if;
  if d.date <> (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'A day''s link can be published on that day only';
  end if;
  if not exists (select 1 from recruitment_meet_links where day_id = p_day) then
    raise exception 'Add the Google Meet link first';
  end if;
  update recruitment_meet_links set published_at = now() where day_id = p_day and published_at is null;

  -- Booked slots that have neither their own link nor the day's.
  select count(distinct s.id) into missing
  from recruitment_slots s
  join recruitment_slot_bookings b on b.slot_id = s.id and b.status = 'booked'
  where s.day_id = p_day
    and not exists (select 1 from recruitment_meet_links l where l.slot_id = s.id)
    and not exists (select 1 from recruitment_meet_links l where l.day_id = p_day and l.slot_id is null);

  insert into notifications (user_id, title, body, link)
  select distinct b.user_id, 'Your interview link is ready',
         'Your Google Meet link for today''s interview is now available on your status page.', '/recruitment/status'
  from recruitment_slot_bookings b join recruitment_slots s on s.id = b.slot_id
  where s.day_id = p_day and b.status = 'booked';
  get diagnostics told = row_count;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'published_meet_links', 'recruitment_slot_days', p_day::text,
          jsonb_build_object('note', told || ' candidate(s) told'));
  return jsonb_build_object('notified', told, 'missing_links', missing);
end $$;

-- ── admin: bookings ────────────────────────────────────────────────────
-- Moves a booking to another slot of the same cycle. A full slot is refused
-- unless p_override is true.
create or replace function admin_move_booking(p_booking uuid, p_slot uuid, p_override boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare b recruitment_slot_bookings%rowtype; s recruitment_slots%rowtype; taken integer;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into s from recruitment_slots where id = p_slot for update;
  if not found then raise exception 'Slot not found'; end if;
  select * into b from recruitment_slot_bookings where id = p_booking for update;
  if not found or b.status = 'cancelled' then raise exception 'Booking not found'; end if;
  if b.cycle_id <> s.cycle_id then raise exception 'That slot belongs to another cycle'; end if;
  if b.slot_id = s.id then return; end if;
  select count(*) into taken from recruitment_slot_bookings where slot_id = s.id and status <> 'cancelled';
  if taken >= s.capacity and not coalesce(p_override, false) then raise exception 'Slot full'; end if;
  update recruitment_slot_bookings set slot_id = s.id where id = b.id;
  perform recruitment_sync_interview(b.application_id);
  insert into notifications (user_id, title, body, link)
  values (b.user_id, 'Interview slot changed', 'Your interview was moved to ' || recruitment_slot_when(s.starts_at, s.ends_at) || '.', '/recruitment/status');
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'moved_booking', 'recruitment_slot_bookings', b.id::text,
          jsonb_build_object('note', 'to ' || recruitment_slot_when(s.starts_at, s.ends_at) || case when taken >= s.capacity then ' (over capacity)' else '' end));
end $$;

create or replace function admin_cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b recruitment_slot_bookings%rowtype; s recruitment_slots%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into b from recruitment_slot_bookings where id = p_booking for update;
  if not found or b.status = 'cancelled' then return; end if;
  select * into s from recruitment_slots where id = b.slot_id;
  update recruitment_slot_bookings set status = 'cancelled' where id = b.id;
  perform recruitment_sync_interview(b.application_id);
  insert into notifications (user_id, title, body, link)
  values (b.user_id, 'Interview slot cancelled',
          'Your interview slot (' || recruitment_slot_when(s.starts_at, s.ends_at) || ') was cancelled. Please choose another on your status page.',
          '/recruitment/status');
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'cancelled_booking', 'recruitment_slot_bookings', b.id::text,
          jsonb_build_object('note', recruitment_slot_when(s.starts_at, s.ends_at)));
end $$;

create or replace function admin_set_booking_status(p_booking uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare b recruitment_slot_bookings%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('booked', 'attended', 'no_show') then raise exception 'Unknown status'; end if;
  select * into b from recruitment_slot_bookings where id = p_booking for update;
  if not found or b.status = 'cancelled' then raise exception 'Booking not found'; end if;
  update recruitment_slot_bookings set status = p_status where id = b.id;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'marked_' || p_status, 'recruitment_slot_bookings', b.id::text, jsonb_build_object('note', b.status || ' -> ' || p_status));
end $$;

-- Reminds everyone in the cycle (submitted or still a draft) who holds no slot.
create or replace function remind_unbooked(p_cycle uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare told integer;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  insert into notifications (user_id, title, body, link)
  select a.user_id, 'Choose your interview slot',
         'You have not chosen an interview slot yet. Please pick one on the recruitment page.',
         case when a.status = 'submitted' then '/recruitment/slot' else '/recruitment/apply' end
  from recruitment_applications a
  where a.cycle_id = p_cycle and a.status in ('draft', 'submitted')
    and not exists (select 1 from recruitment_slot_bookings b
                    where b.cycle_id = p_cycle and b.user_id = a.user_id and b.status <> 'cancelled');
  get diagnostics told = row_count;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'reminded_unbooked', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', told || ' reminded'));
  return told;
end $$;

-- Deletes a day, unless someone holds one of its slots.
create or replace function delete_slot_day(p_day uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d recruitment_slot_days%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into d from recruitment_slot_days where id = p_day for update;
  if not found then return; end if;
  if exists (select 1 from recruitment_slot_bookings b join recruitment_slots s on s.id = b.slot_id
             where s.day_id = p_day and b.status <> 'cancelled') then
    raise exception 'This day has bookings. Move or cancel them first';
  end if;
  delete from recruitment_slot_days where id = p_day;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'deleted', 'recruitment_slot_days', p_day::text, jsonb_build_object('note', d.date::text));
end $$;

-- ── submitting now needs a slot (when the cycle has any) ───────────────
-- Same as in 0013, plus: a slot is required when the cycle asks for one and
-- has bookable slots; and the booked time is copied onto the team rows.
create or replace function submit_recruitment_application(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); cyc recruitment_cycles%rowtype; app recruitment_applications%rowtype;
  q record; ans jsonb; team_names text; bad integer;
begin
  if uid is null then raise exception 'Please sign in to apply'; end if;
  if not account_active(uid) then raise exception 'This account is deactivated'; end if;
  select * into cyc from recruitment_cycles where id = p_cycle;
  if not found or not recruitment_cycle_accepting(p_cycle) then
    raise exception 'Applications are not open';
  end if;
  select * into app from recruitment_applications where cycle_id = p_cycle and user_id = uid for update;
  if not found then raise exception 'Start your application first'; end if;
  if app.status = 'submitted' then return jsonb_build_object('status', 'submitted'); end if;

  if coalesce(trim(app.full_name), '') = '' then raise exception 'Add your name'; end if;
  if cardinality(app.preferences) < 1 then raise exception 'Choose at least one team'; end if;
  if cardinality(app.preferences) > cyc.max_preferences then
    raise exception 'You can choose at most % team(s)', cyc.max_preferences;
  end if;
  select count(*) into bad from unnest(app.preferences) x
  where not exists (
    select 1 from recruitment_teams t
    where t.id = x and t.cycle_id = p_cycle and t.is_visible and t.accepting_applications);
  if bad > 0 then raise exception 'One of the chosen teams is not taking applications'; end if;

  if cardinality(cyc.allowed_years) > 0
     and not (lower(trim(coalesce(app.year, ''))) = any (select lower(trim(y)) from unnest(cyc.allowed_years) y)) then
    raise exception 'This recruitment is not open to your year';
  end if;
  if cardinality(cyc.allowed_departments) > 0
     and not (lower(trim(coalesce(app.department, ''))) = any (select lower(trim(d)) from unnest(cyc.allowed_departments) d)) then
    raise exception 'This recruitment is not open to your department';
  end if;

  for q in
    select id, label, type, required, max_length from recruitment_questions
    where cycle_id = p_cycle and (team_id is null or team_id = any (app.preferences))
  loop
    ans := app.answers -> q.id::text;
    if q.required and (
         ans is null or ans = 'null'::jsonb
         or (jsonb_typeof(ans) = 'string' and trim(ans #>> '{}') = '')
         or (jsonb_typeof(ans) = 'array' and jsonb_array_length(ans) = 0)) then
      raise exception 'Please answer: %', q.label;
    end if;
    if q.max_length is not null and jsonb_typeof(ans) = 'string' and char_length(ans #>> '{}') > q.max_length then
      raise exception 'Your answer to "%" is too long', q.label;
    end if;
  end loop;

  if cyc.slot_required and recruitment_cycle_has_slots(p_cycle)
     and not exists (select 1 from recruitment_slot_bookings b
                     where b.cycle_id = p_cycle and b.user_id = uid and b.status <> 'cancelled') then
    raise exception 'Choose your interview slot';
  end if;

  update recruitment_applications set status = 'submitted', submitted_at = now() where id = app.id;
  delete from recruitment_team_status where application_id = app.id;
  insert into recruitment_team_status (application_id, team_id, rank)
  select app.id, x, ord::smallint from unnest(app.preferences) with ordinality as t(x, ord);
  perform recruitment_sync_interview(app.id);

  select string_agg(t.name, ', ' order by ord) into team_names
  from unnest(app.preferences) with ordinality as p(x, ord) join recruitment_teams t on t.id = p.x;
  insert into notifications (user_id, title, body, link)
  values (uid, 'Application received', recruitment_message('submitted', app.full_name, team_names, cyc.title), '/recruitment/status');

  return jsonb_build_object('status', 'submitted');
end $$;

-- A withdrawn application gives its seat back.
create or replace function withdraw_recruitment_application(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cyc recruitment_cycles%rowtype; app recruitment_applications%rowtype;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  select * into cyc from recruitment_cycles where id = p_cycle;
  if not found then raise exception 'Recruitment not found'; end if;
  if cyc.status = 'results_published' then raise exception 'Results are already out'; end if;
  select * into app from recruitment_applications where cycle_id = p_cycle and user_id = uid for update;
  if not found or app.status <> 'submitted' then return jsonb_build_object('status', 'withdrawn'); end if;
  update recruitment_applications set status = 'withdrawn' where id = app.id;
  update recruitment_slot_bookings set status = 'cancelled' where application_id = app.id and status = 'booked';
  return jsonb_build_object('status', 'withdrawn');
end $$;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  recruitment_slot_when(timestamptz, timestamptz), recruitment_sync_interview(uuid), recruitment_cycle_has_slots(uuid),
  generate_slots(uuid), recruitment_slot_availability(uuid), book_slot(uuid), cancel_slot_booking(uuid),
  my_slot_booking(uuid), get_my_meet_link(uuid), publish_meet_links(uuid), admin_move_booking(uuid, uuid, boolean),
  admin_cancel_booking(uuid), admin_set_booking_status(uuid, text), remind_unbooked(uuid), delete_slot_day(uuid)
  from public, anon, authenticated;
grant execute on function recruitment_slot_availability(uuid), recruitment_cycle_has_slots(uuid) to anon, authenticated;
grant execute on function
  generate_slots(uuid), book_slot(uuid), cancel_slot_booking(uuid), my_slot_booking(uuid), get_my_meet_link(uuid),
  publish_meet_links(uuid), admin_move_booking(uuid, uuid, boolean), admin_cancel_booking(uuid),
  admin_set_booking_status(uuid, text), remind_unbooked(uuid), delete_slot_day(uuid)
  to authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table recruitment_slot_days enable row level security;
alter table recruitment_slots enable row level security;
alter table recruitment_slot_bookings enable row level security;
alter table recruitment_meet_links enable row level security;

create policy "slot days of public cycles are readable" on recruitment_slot_days for select
  using (recruitment_cycle_public(cycle_id) or is_staff());
create policy "admins add slot days" on recruitment_slot_days for insert with check (is_admin());
create policy "admins edit slot days" on recruitment_slot_days for update using (is_admin()) with check (is_admin());

create policy "slots of public cycles are readable" on recruitment_slots for select
  using (recruitment_cycle_public(cycle_id) or is_staff());
create policy "admins edit slots" on recruitment_slots for update using (is_admin()) with check (is_admin());

-- Bookings: your own, admins, and the reviewers of a team the application lists. No direct writes.
create policy "own bookings, admins and the application's reviewers read bookings" on recruitment_slot_bookings for select
  using (user_id = auth.uid() or is_admin() or reviews_application(application_id));

create policy "admins manage meet links" on recruitment_meet_links for all using (is_admin()) with check (is_admin());

commit;
