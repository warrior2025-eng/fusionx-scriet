-- FusionX Interview Room: online interviews inside the website (Daily video),
-- with integrity signals for the panel. Additive only: new tables, functions
-- and nullable rubric columns on recruitment_reviews. Nothing existing is
-- dropped, renamed or changed in meaning.
--
-- Off by default: a day keeps its Google Meet flow until an admin switches it
-- to "In-website room" (recruitment_room_settings.room_enabled), and one
-- switch turns it back at any time. The Meet link tables and functions are
-- untouched.
--
-- What candidates can reach, all through security definer functions that
-- check the caller's own live booking and the time window:
--   my_interview_access      where they stand (too early, open, ended, Meet day …)
--   interview_join_info      what the server needs to issue their video token
--   give_interview_consent   the "I agree" on the monitoring notice
--   log_interview_events     integrity events, validated and rate-limited
--   my_interview_questions   only the questions the panel has revealed to their slot
--   create_phone_link        a short-lived link for the phone camera (hash stored, not the token)
-- The phone page (no sign-in) uses phone_link_info with the hash of its token.
--
-- The panel (admins; and a hub's reviewers for slots with one of their
-- candidates, read-only integrity) uses interview_panel_access and
-- interview_slot_people; integrity events and question reveals are read
-- straight from their tables under RLS (also over Supabase Realtime).
--
-- The system detects and discourages cheating; it cannot fully prevent it.
-- Nothing is recorded: no video, screenshots or keystrokes are stored.
--
-- Run once, as one piece. Running it again changes nothing.

begin;

-- ── settings per interview day ─────────────────────────────────────────
create table if not exists recruitment_room_settings (
  day_id uuid primary key references recruitment_slot_days(id) on delete cascade,
  room_enabled boolean not null default false,
  early_join_minutes integer not null default 10 check (early_join_minutes between 0 and 60),
  grace_minutes integer not null default 10 check (grace_minutes between 0 and 60),
  strict_fullscreen boolean not null default true,
  phone_camera text not null default 'optional' check (phone_camera in ('off', 'optional', 'required')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- One private Daily room per slot (name "fx-<slot id without dashes>").
create table if not exists recruitment_interview_rooms (
  slot_id uuid primary key references recruitment_slots(id) on delete cascade,
  room_name text not null,
  room_url text not null check (room_url ~ '^https://[a-z0-9-]+\.daily\.co/[A-Za-z0-9_-]+$'),
  created_at timestamptz not null default now()
);

create table if not exists recruitment_interview_consents (
  booking_id uuid primary key references recruitment_slot_bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  consented_at timestamptz not null default now(),
  user_agent text check (char_length(user_agent) <= 300)
);

create table if not exists recruitment_integrity_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references recruitment_slot_bookings(id) on delete cascade,
  slot_id uuid not null references recruitment_slots(id) on delete cascade,
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'tab_hidden', 'tab_visible', 'window_blur', 'window_focus', 'fullscreen_exit',
    'copy', 'paste', 'cut', 'contextmenu', 'extra_screen', 'camera_off', 'mic_off',
    'left_room', 'rejoined', 'phone_camera_joined', 'phone_camera_left')),
  detail jsonb check (detail is null or pg_column_size(detail) <= 600),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_integrity_events_slot on recruitment_integrity_events (slot_id, occurred_at);
create index if not exists idx_integrity_events_user on recruitment_integrity_events (user_id, created_at);

-- The question bank, per hub. Candidates never read it; they get revealed questions only.
create table if not exists recruitment_interview_questions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references recruitment_teams(id) on delete cascade,
  body text not null check (char_length(body) between 3 and 1000),
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_interview_questions_team on recruitment_interview_questions (team_id, display_order);

create table if not exists recruitment_question_reveals (
  slot_id uuid not null references recruitment_slots(id) on delete cascade,
  question_id uuid not null references recruitment_interview_questions(id) on delete cascade,
  revealed_by uuid references auth.users(id) on delete set null,
  revealed_at timestamptz not null default now(),
  primary key (slot_id, question_id)
);

-- Phone camera links: only the hash of the token is kept; each lasts minutes.
create table if not exists recruitment_phone_links (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  booking_id uuid not null references recruitment_slot_bookings(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- The scoring rubric, beside the existing 1–5 score (each 1–5, optional).
alter table recruitment_reviews
  add column if not exists rubric_skills smallint check (rubric_skills between 1 and 5),
  add column if not exists rubric_thinking smallint check (rubric_thinking between 1 and 5),
  add column if not exists rubric_communication smallint check (rubric_communication between 1 and 5),
  add column if not exists rubric_commitment smallint check (rubric_commitment between 1 and 5);

drop trigger if exists trg_recruitment_room_settings_updated_at on recruitment_room_settings;
create trigger trg_recruitment_room_settings_updated_at before update on recruitment_room_settings
  for each row execute function set_updated_at();
drop trigger if exists trg_recruitment_interview_questions_updated_at on recruitment_interview_questions;
create trigger trg_recruitment_interview_questions_updated_at before update on recruitment_interview_questions
  for each row execute function set_updated_at();

-- ── helpers ────────────────────────────────────────────────────────────
-- The caller's live booking (booked / attended) with its slot, day and room settings.
create or replace function recruitment_room_booking(p_booking uuid)
returns table (booking_id uuid, booking_status text, user_id uuid, application_id uuid, cycle_id uuid, slot_id uuid,
               starts_at timestamptz, ends_at timestamptz, day_id uuid, day date, mode text,
               room_enabled boolean, early_join_minutes integer, grace_minutes integer,
               strict_fullscreen boolean, phone_camera text, full_name text)
language sql security definer stable set search_path = public as $$
  select b.id, b.status, b.user_id, b.application_id, b.cycle_id, s.id, s.starts_at, s.ends_at, d.id, d.date, d.mode,
         coalesce(r.room_enabled, false), coalesce(r.early_join_minutes, 10), coalesce(r.grace_minutes, 10),
         coalesce(r.strict_fullscreen, true), coalesce(r.phone_camera, 'optional'),
         coalesce(nullif(btrim(a.full_name), ''), 'Candidate')
  from recruitment_slot_bookings b
  join recruitment_slots s on s.id = b.slot_id
  join recruitment_slot_days d on d.id = s.day_id
  join recruitment_applications a on a.id = b.application_id
  left join recruitment_room_settings r on r.day_id = d.id
  where b.id = p_booking and b.status in ('booked', 'attended');
$$;

-- Admin, or a reviewer of a team listed by a candidate with a live booking in
-- this slot; with the slot's times and its day's room settings.
create or replace function interview_panel_access(p_slot uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare teams uuid[]; info jsonb;
begin
  if auth.uid() is null then return null; end if;
  select jsonb_build_object('slot_id', s.id, 'cycle_id', s.cycle_id, 'day_id', d.id, 'day', d.date, 'mode', d.mode,
           'starts_at', s.starts_at, 'ends_at', s.ends_at,
           'room_enabled', coalesce(r.room_enabled, false), 'early_join_minutes', coalesce(r.early_join_minutes, 10),
           'grace_minutes', coalesce(r.grace_minutes, 10), 'strict_fullscreen', coalesce(r.strict_fullscreen, true),
           'phone_camera', coalesce(r.phone_camera, 'optional'))
    into info
  from recruitment_slots s join recruitment_slot_days d on d.id = s.day_id
  left join recruitment_room_settings r on r.day_id = d.id
  where s.id = p_slot;
  if info is null then return null; end if;
  if is_admin() then return info || jsonb_build_object('role', 'admin'); end if;
  select array_agg(distinct r.team_id) into teams
  from recruitment_slot_bookings b
  join recruitment_team_status ts on ts.application_id = b.application_id
  join recruitment_team_reviewers r on r.team_id = ts.team_id and r.user_id = auth.uid()
  where b.slot_id = p_slot and b.status in ('booked', 'attended', 'no_show');
  if teams is null then return null; end if;
  return info || jsonb_build_object('role', 'reviewer', 'teams', to_jsonb(teams));
end $$;

-- The slots a reviewer may open in the panel (those with one of their candidates), for the list.
create or replace function my_interview_panel_slots()
returns setof uuid language sql security definer stable set search_path = public as $$
  select distinct b.slot_id
  from recruitment_slot_bookings b
  join recruitment_team_status ts on ts.application_id = b.application_id
  join recruitment_team_reviewers r on r.team_id = ts.team_id and r.user_id = auth.uid()
  where b.status in ('booked', 'attended', 'no_show');
$$;

-- ── the candidate's side ───────────────────────────────────────────────
-- Where the signed-in candidate stands for this cycle's interview room.
create or replace function my_interview_access(p_cycle uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare bk uuid; k record; opens timestamptz; closes timestamptz; consented timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('state', 'signed_out'); end if;
  select b.id into bk from recruitment_slot_bookings b
  where b.cycle_id = p_cycle and b.user_id = auth.uid() and b.status in ('booked', 'attended', 'no_show')
  order by b.created_at desc limit 1;
  if bk is null then return jsonb_build_object('state', 'none'); end if;
  select * into k from recruitment_room_booking(bk);
  if not found then
    -- A no-show booking: the slot has passed for them (no second chance).
    return jsonb_build_object('state', 'ended');
  end if;
  if k.mode <> 'online_meet' then return jsonb_build_object('state', 'offline', 'day', k.day); end if;
  if not k.room_enabled then return jsonb_build_object('state', 'meet', 'day', k.day); end if;
  opens := k.starts_at - make_interval(mins => k.early_join_minutes);
  closes := k.ends_at + make_interval(mins => k.grace_minutes);
  select c.consented_at into consented from recruitment_interview_consents c where c.booking_id = bk;
  return jsonb_build_object(
    'state', case when now() < opens then 'too_early' when now() > closes then 'ended' else 'open' end,
    'booking_id', bk, 'slot_id', k.slot_id, 'day', k.day, 'starts_at', k.starts_at, 'ends_at', k.ends_at,
    'opens_at', opens, 'closes_at', closes, 'strict_fullscreen', k.strict_fullscreen, 'phone_camera', k.phone_camera,
    'name', k.full_name, 'consented_at', consented);
end $$;

-- What the server needs to issue the candidate's own video token. Refused outside the window or without consent.
create or replace function interview_join_info(p_booking uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare k record; opens timestamptz; closes timestamptz; room record;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() then raise exception 'There is no interview for you here'; end if;
  if k.mode <> 'online_meet' or not k.room_enabled then raise exception 'This interview is not in the website room'; end if;
  opens := k.starts_at - make_interval(mins => k.early_join_minutes);
  closes := k.ends_at + make_interval(mins => k.grace_minutes);
  if now() < opens then raise exception 'The room opens at %', to_char(opens at time zone 'Asia/Kolkata', 'FMHH12:MI AM'); end if;
  if now() > closes then raise exception 'Your slot has ended'; end if;
  if not exists (select 1 from recruitment_interview_consents where booking_id = p_booking) then
    raise exception 'Please agree to the interview rules first';
  end if;
  select * into room from recruitment_interview_rooms where slot_id = k.slot_id;
  return jsonb_build_object('slot_id', k.slot_id, 'starts_at', k.starts_at, 'ends_at', k.ends_at,
    'opens_at', opens, 'closes_at', closes, 'name', k.full_name, 'phone_camera', k.phone_camera,
    'room_name', room.room_name, 'room_url', room.room_url);
end $$;

create or replace function give_interview_consent(p_booking uuid, p_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k record;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() then raise exception 'There is no interview for you here'; end if;
  insert into recruitment_interview_consents (booking_id, user_id, user_agent)
  values (p_booking, auth.uid(), left(p_agent, 300))
  on conflict (booking_id) do nothing;
end $$;

-- Integrity events from the candidate's own page: batched, at most 50 a call,
-- 240 a minute, only while their room window is open (plus 5 minutes).
create or replace function log_interview_events(p_booking uuid, p_events jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare k record; n integer; recent integer;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() then raise exception 'There is no interview for you here'; end if;
  if not k.room_enabled then return 0; end if;
  if now() < k.starts_at - make_interval(mins => k.early_join_minutes)
     or now() > k.ends_at + make_interval(mins => k.grace_minutes + 5) then
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
    'left_room', 'rejoined', 'phone_camera_joined', 'phone_camera_left');
  get diagnostics n = row_count;
  return n;
end $$;

-- The questions revealed to the candidate's slot, while their window is open.
create or replace function my_interview_questions(p_booking uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare k record;
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() or not k.room_enabled then return '[]'::jsonb; end if;
  if now() < k.starts_at - make_interval(mins => k.early_join_minutes)
     or now() > k.ends_at + make_interval(mins => k.grace_minutes) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'body', q.body, 'hub', t.name, 'revealed_at', r.revealed_at) order by r.revealed_at)
    from recruitment_question_reveals r
    join recruitment_interview_questions q on q.id = r.question_id
    join recruitment_teams t on t.id = q.team_id
    where r.slot_id = k.slot_id), '[]'::jsonb);
end $$;

-- A phone-camera link for the caller's own booking: valid 10 minutes (the token itself is never stored).
create or replace function create_phone_link(p_booking uuid, p_hash text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare k record; until timestamptz := now() + interval '10 minutes';
begin
  select * into k from recruitment_room_booking(p_booking);
  if not found or k.user_id is distinct from auth.uid() then raise exception 'There is no interview for you here'; end if;
  if not k.room_enabled or k.phone_camera = 'off' then raise exception 'The phone camera is not used for this interview'; end if;
  if now() < k.starts_at - make_interval(mins => k.early_join_minutes) or now() > k.ends_at + make_interval(mins => k.grace_minutes) then
    raise exception 'The room is not open';
  end if;
  delete from recruitment_phone_links where booking_id = p_booking or expires_at < now() - interval '1 day';
  insert into recruitment_phone_links (token_hash, booking_id, expires_at) values (p_hash, p_booking, until);
  return until;
end $$;

-- For the phone page (no sign-in): the booking a valid, unexpired link belongs to.
create or replace function phone_link_info(p_hash text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare l recruitment_phone_links%rowtype; k record; room record;
begin
  select * into l from recruitment_phone_links where token_hash = p_hash;
  if not found or l.expires_at < now() then return null; end if;
  select * into k from recruitment_room_booking(l.booking_id);
  if not found or not k.room_enabled or k.phone_camera = 'off' then return null; end if;
  if now() > k.ends_at + make_interval(mins => k.grace_minutes) then return null; end if;
  select * into room from recruitment_interview_rooms where slot_id = k.slot_id;
  return jsonb_build_object('booking_id', k.booking_id, 'slot_id', k.slot_id, 'name', k.full_name,
    'starts_at', k.starts_at, 'ends_at', k.ends_at,
    'opens_at', k.starts_at - make_interval(mins => k.early_join_minutes),
    'closes_at', k.ends_at + make_interval(mins => k.grace_minutes),
    'open', now() >= k.starts_at - make_interval(mins => k.early_join_minutes),
    'room_name', room.room_name, 'room_url', room.room_url);
end $$;

-- The server records a slot's Daily room after creating it. The name is fixed
-- by the slot id, so a caller cannot point a slot at another room.
create or replace function record_interview_room(p_slot uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare expected text := 'fx-' || replace(p_slot::text, '-', '');
begin
  if not (is_admin() or interview_panel_access(p_slot) is not null or exists (
      select 1 from recruitment_slot_bookings b where b.slot_id = p_slot and b.user_id = auth.uid() and b.status in ('booked', 'attended'))) then
    raise exception 'FORBIDDEN';
  end if;
  if right(p_url, char_length(expected) + 1) <> '/' || expected then raise exception 'Unexpected room'; end if;
  insert into recruitment_interview_rooms (slot_id, room_name, room_url) values (p_slot, expected, p_url)
  on conflict (slot_id) do update set room_url = excluded.room_url;
end $$;

-- ── the panel's side ───────────────────────────────────────────────────
-- The candidates in a slot. A reviewer sees only the candidates who chose one of their teams.
create or replace function interview_slot_people(p_slot uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare acc jsonb := interview_panel_access(p_slot); teams uuid[];
begin
  if acc is null then raise exception 'FORBIDDEN'; end if;
  if acc ->> 'role' = 'reviewer' then
    select array_agg(value::uuid) into teams from jsonb_array_elements_text(acc -> 'teams');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'booking_id', b.id, 'status', b.status, 'application_id', a.id, 'user_id', b.user_id,
      'name', coalesce(nullif(btrim(a.full_name), ''), 'Candidate'), 'department', a.department, 'year', a.year,
      'consented_at', c.consented_at,
      'hubs', (select jsonb_agg(jsonb_build_object('team_id', ts.team_id, 'name', t.name, 'rank', ts.rank) order by ts.rank)
               from recruitment_team_status ts join recruitment_teams t on t.id = ts.team_id where ts.application_id = a.id))
      order by b.created_at)
    from recruitment_slot_bookings b
    join recruitment_applications a on a.id = b.application_id
    left join recruitment_interview_consents c on c.booking_id = b.id
    where b.slot_id = p_slot and b.status in ('booked', 'attended', 'no_show')
      and (teams is null or exists (select 1 from recruitment_team_status ts where ts.application_id = a.id and ts.team_id = any(teams)))), '[]'::jsonb);
end $$;

-- Settings for a day, by an admin. Booked candidates are told when the room is switched on or off.
create or replace function set_interview_room_settings(
  p_day uuid, p_enabled boolean, p_early integer, p_grace integer, p_strict boolean, p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare was boolean; d recruitment_slot_days%rowtype; told integer := 0;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into d from recruitment_slot_days where id = p_day;
  if not found then raise exception 'Day not found'; end if;
  if p_enabled and d.mode <> 'online_meet' then raise exception 'The interview room is for online days only'; end if;
  select room_enabled into was from recruitment_room_settings where day_id = p_day;
  insert into recruitment_room_settings (day_id, room_enabled, early_join_minutes, grace_minutes, strict_fullscreen, phone_camera, updated_by)
  values (p_day, p_enabled, p_early, p_grace, p_strict, p_phone, auth.uid())
  on conflict (day_id) do update set room_enabled = excluded.room_enabled, early_join_minutes = excluded.early_join_minutes,
    grace_minutes = excluded.grace_minutes, strict_fullscreen = excluded.strict_fullscreen,
    phone_camera = excluded.phone_camera, updated_by = excluded.updated_by;
  if coalesce(was, false) <> p_enabled then
    insert into notifications (user_id, title, body, link)
    select distinct b.user_id,
           case when p_enabled then 'Your interview is in the FusionX@SCRIET interview room' else 'Your interview is on Google Meet' end,
           case when p_enabled
                then 'Your interview on ' || to_char(d.date, 'FMDD FMMonth') || ' will be held in the interview room on the FusionX@SCRIET website, not on Google Meet. Open your status page a few minutes before your slot.'
                else 'Your interview on ' || to_char(d.date, 'FMDD FMMonth') || ' will be held on Google Meet. The link will be on your status page on the day.' end,
           '/recruitment/status'
    from recruitment_slot_bookings b join recruitment_slots s on s.id = b.slot_id
    where s.day_id = p_day and b.status = 'booked';
    get diagnostics told = row_count;
  end if;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'updated_interview_room', 'recruitment_slot_days', p_day::text,
          jsonb_build_object('note', case when p_enabled then 'In-website room' else 'Google Meet' end
            || '; early ' || p_early || ' min, grace ' || p_grace || ' min, fullscreen ' || case when p_strict then 'strict' else 'off' end
            || ', phone camera ' || p_phone || case when told > 0 then '; ' || told || ' candidate(s) told' else '' end));
  return jsonb_build_object('notified', told);
end $$;

-- ── row level security ─────────────────────────────────────────────────
alter table recruitment_room_settings enable row level security;
alter table recruitment_interview_rooms enable row level security;
alter table recruitment_interview_consents enable row level security;
alter table recruitment_integrity_events enable row level security;
alter table recruitment_interview_questions enable row level security;
alter table recruitment_question_reveals enable row level security;
alter table recruitment_phone_links enable row level security;

drop policy if exists "admins read room settings" on recruitment_room_settings;
create policy "admins read room settings" on recruitment_room_settings for select using (is_admin());

drop policy if exists "admins read interview rooms" on recruitment_interview_rooms;
create policy "admins read interview rooms" on recruitment_interview_rooms for select using (is_admin());

drop policy if exists "admins and reviewers read consents" on recruitment_interview_consents;
create policy "admins and reviewers read consents" on recruitment_interview_consents for select
  using (is_admin() or exists (select 1 from recruitment_slot_bookings b where b.id = booking_id and reviews_application(b.application_id)));

-- Integrity events: never the candidates; admins, and the reviewers of the candidate's teams.
drop policy if exists "admins and reviewers read integrity events" on recruitment_integrity_events;
create policy "admins and reviewers read integrity events" on recruitment_integrity_events for select
  using (is_admin() or reviews_application(application_id));

-- The bank: staff manage it ("recruitment.content"); a hub's reviewers read their hub's questions.
drop policy if exists "staff and the hub's reviewers read interview questions" on recruitment_interview_questions;
create policy "staff and the hub's reviewers read interview questions" on recruitment_interview_questions for select
  using (is_staff() or is_team_reviewer(team_id));
drop policy if exists "staff add interview questions" on recruitment_interview_questions;
create policy "staff add interview questions" on recruitment_interview_questions for insert with check (is_staff());
drop policy if exists "staff edit interview questions" on recruitment_interview_questions;
create policy "staff edit interview questions" on recruitment_interview_questions for update using (is_staff()) with check (is_staff());
drop policy if exists "staff delete interview questions" on recruitment_interview_questions;
create policy "staff delete interview questions" on recruitment_interview_questions for delete using (is_staff());

-- Reveals: admins write; the panel and the slot's own candidates read (ids only; the text comes from my_interview_questions).
drop policy if exists "admins reveal questions" on recruitment_question_reveals;
create policy "admins reveal questions" on recruitment_question_reveals for insert with check (is_admin());
drop policy if exists "admins hide revealed questions" on recruitment_question_reveals;
create policy "admins hide revealed questions" on recruitment_question_reveals for delete using (is_admin());
drop policy if exists "panel and the slot's candidates read reveals" on recruitment_question_reveals;
create policy "panel and the slot's candidates read reveals" on recruitment_question_reveals for select
  using (is_admin() or interview_panel_access(slot_id) is not null or exists (
    select 1 from recruitment_slot_bookings b where b.slot_id = recruitment_question_reveals.slot_id and b.user_id = auth.uid() and b.status in ('booked', 'attended')));

-- recruitment_phone_links: no policies at all; only the functions above touch it.

-- ── grants ─────────────────────────────────────────────────────────────
revoke all on function recruitment_room_booking(uuid), interview_panel_access(uuid), my_interview_access(uuid),
  interview_join_info(uuid), give_interview_consent(uuid, text), log_interview_events(uuid, jsonb),
  my_interview_questions(uuid), create_phone_link(uuid, text), phone_link_info(text), record_interview_room(uuid, text),
  interview_slot_people(uuid), set_interview_room_settings(uuid, boolean, integer, integer, boolean, text),
  my_interview_panel_slots()
  from public, anon;
revoke all on function recruitment_room_booking(uuid) from authenticated;
grant execute on function interview_panel_access(uuid), my_interview_access(uuid), interview_join_info(uuid),
  give_interview_consent(uuid, text), log_interview_events(uuid, jsonb), my_interview_questions(uuid),
  create_phone_link(uuid, text), record_interview_room(uuid, text), interview_slot_people(uuid),
  set_interview_room_settings(uuid, boolean, integer, integer, boolean, text), my_interview_panel_slots() to authenticated;
-- The phone page is opened without signing in; it holds only the hash of an unguessable, 10-minute token.
grant execute on function phone_link_info(text) to anon, authenticated;

-- Live updates for the panel and the candidates (Supabase Realtime respects the policies above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'recruitment_integrity_events') then
      alter publication supabase_realtime add table recruitment_integrity_events;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'recruitment_question_reveals') then
      alter publication supabase_realtime add table recruitment_question_reveals;
    end if;
  end if;
end $$;

commit;
