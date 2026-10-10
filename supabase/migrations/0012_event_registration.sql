-- Event registration, QR check-in and verifiable certificates.
--
-- Registrations change only through the security-definer functions below:
-- the direct insert policy is removed, so nobody can write their own status,
-- check-in or certificate fields. Existing columns are reused, not repeated:
-- events.registration_open, events.registration_capacity (the capacity) and
-- event_registrations.registered_at (the "created at" of a registration).
--
-- Run once, as one piece.

begin;

-- ── columns ────────────────────────────────────────────────────────────
create type registration_status as enum ('registered', 'waitlisted', 'cancelled', 'attended');

alter table events
  add column registration_deadline timestamptz,
  add column waitlist_enabled boolean not null default false,
  add column end_date timestamptz,
  add column certificate_enabled boolean not null default false,
  add column certificate_title text not null default 'Certificate of Participation',
  add column signatory_1_name text,
  add column signatory_1_title text,
  add column signatory_1_signature_path text,
  add column signatory_2_name text,
  add column signatory_2_title text,
  add column signatory_2_signature_path text;

alter table event_registrations
  add column status registration_status not null default 'registered',
  -- 244 random bits, never derived from any id
  add column check_in_token text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column checked_in_at timestamptz,
  add column checked_in_by uuid references auth.users(id) on delete set null,
  add column certificate_serial text,
  add column certificate_name text,
  add column certificate_issued_at timestamptz;

alter table event_registrations
  add constraint event_registrations_token_key unique (check_in_token),
  add constraint event_registrations_serial_key unique (certificate_serial);
create index idx_event_registrations_queue on event_registrations (event_id, status, registered_at);
create sequence certificate_serial_seq;

create table event_volunteers (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table check_in_attempts (
  id bigint generated always as identity primary key,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index idx_check_in_attempts_recent on check_in_attempts (user_id, created_at desc);

-- ── the old insert guard is replaced by register_for_event ─────────────
drop trigger trg_guard_event_registration on event_registrations;
drop function guard_event_registration();

-- ── helpers ────────────────────────────────────────────────────────────
create or replace function is_event_checker(p_event uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select is_staff() or exists (
    select 1 from event_volunteers v where v.event_id = p_event and v.user_id = auth.uid()
  );
$$;

-- Moves waitlisted people into free seats, oldest first. Internal only.
create or replace function promote_waitlist(p_event uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare ev events%rowtype; taken integer; nxt record; moved integer := 0;
begin
  select * into ev from events where id = p_event for update;
  if not found or ev.status not in ('upcoming', 'live') then return 0; end if;
  loop
    select count(*) into taken from event_registrations
      where event_id = p_event and status in ('registered', 'attended');
    exit when ev.registration_capacity is not null and taken >= ev.registration_capacity;
    select id, user_id into nxt from event_registrations
      where event_id = p_event and status = 'waitlisted'
      order by registered_at, id limit 1 for update;
    exit when not found;
    update event_registrations set status = 'registered' where id = nxt.id;
    insert into notifications (user_id, title, body, link)
    values (nxt.user_id, 'A seat opened up',
            'You are now registered for ' || ev.title || '.', '/profile/events');
    moved := moved + 1;
  end loop;
  return moved;
end $$;

-- ── registering ────────────────────────────────────────────────────────
create or replace function register_for_event(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); ev events%rowtype; mine event_registrations%rowtype;
  taken integer; next_status registration_status; pos integer;
begin
  if uid is null then raise exception 'Please sign in to register'; end if;
  if not account_active(uid) then raise exception 'This account is deactivated'; end if;

  select * into ev from events where id = p_event for update;   -- one at a time per event
  if not found or not ev.is_published then raise exception 'Event not found'; end if;

  select * into mine from event_registrations where event_id = p_event and user_id = uid;
  if found and mine.status in ('registered', 'attended') then
    return jsonb_build_object('status', mine.status, 'position', null);
  end if;
  if found and mine.status = 'waitlisted' then
    select count(*) into pos from event_registrations
      where event_id = p_event and status = 'waitlisted'
        and (registered_at, id) <= (mine.registered_at, mine.id);
    return jsonb_build_object('status', 'waitlisted', 'position', pos);
  end if;

  if ev.registration_url is not null then
    raise exception 'Registration for this event is handled on another site';
  end if;
  if not ev.registration_open or ev.status not in ('upcoming', 'live')
     or (ev.registration_deadline is not null and now() > ev.registration_deadline) then
    raise exception 'Registration for this event is closed';
  end if;

  select count(*) into taken from event_registrations
    where event_id = p_event and status in ('registered', 'attended');
  if ev.registration_capacity is null or taken < ev.registration_capacity then
    next_status := 'registered';
  elsif ev.waitlist_enabled then
    next_status := 'waitlisted';
  else
    raise exception 'This event is full';
  end if;

  insert into event_registrations (event_id, user_id, status)
  values (p_event, uid, next_status)
  on conflict (event_id, user_id) do update
    set status = excluded.status, registered_at = now(),
        check_in_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        checked_in_at = null, checked_in_by = null
  returning * into mine;

  if next_status = 'waitlisted' then
    select count(*) into pos from event_registrations
      where event_id = p_event and status = 'waitlisted'
        and (registered_at, id) <= (mine.registered_at, mine.id);
  end if;

  insert into notifications (user_id, title, body, link)
  values (uid,
          case when next_status = 'registered' then 'You are registered' else 'You are on the waitlist' end,
          case when next_status = 'registered' then 'Your ticket for ' || ev.title || ' is ready.'
               else 'You are number ' || pos || ' on the waitlist for ' || ev.title || '.' end,
          '/profile/events');

  return jsonb_build_object('status', next_status, 'position', pos);
end $$;

create or replace function cancel_registration(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mine event_registrations%rowtype;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  perform 1 from events where id = p_event for update;
  select * into mine from event_registrations
    where event_id = p_event and user_id = uid for update;
  if not found or mine.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  end if;
  if mine.status = 'attended' then
    raise exception 'You have already attended this event';
  end if;
  update event_registrations set status = 'cancelled' where id = mine.id;
  if mine.status = 'registered' then perform promote_waitlist(p_event); end if;
  return jsonb_build_object('status', 'cancelled');
end $$;

-- Seats for the public event page: counts only, nobody's data.
create or replace function event_seats(p_event uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'capacity', e.registration_capacity,
    'registered', (select count(*) from event_registrations r
                   where r.event_id = e.id and r.status in ('registered', 'attended')),
    'waitlisted', (select count(*) from event_registrations r
                   where r.event_id = e.id and r.status = 'waitlisted'))
  from events e where e.id = p_event and e.is_published;
$$;

-- The caller's own place in an event's waitlist (0 when not on it).
create or replace function my_waitlist_position(p_event uuid)
returns integer language sql security definer stable set search_path = public as $$
  select count(*)::integer
  from event_registrations me
  join event_registrations other on other.event_id = me.event_id
  where me.event_id = p_event and me.user_id = auth.uid() and me.status = 'waitlisted'
    and other.status = 'waitlisted'
    and (other.registered_at, other.id) <= (me.registered_at, me.id);
$$;

-- ── check-in ───────────────────────────────────────────────────────────
-- An unknown token and a token from another event give the same answer.
create or replace function check_in(p_event uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); who text; recent integer;
  reg_id uuid; reg_status registration_status; reg_at timestamptz; reg_user uuid;
begin
  if uid is null or not is_event_checker(p_event) then raise exception 'FORBIDDEN'; end if;

  select count(*) into recent from check_in_attempts
    where user_id = uid and not succeeded and created_at > now() - interval '1 minute';
  if recent >= 20 then return jsonb_build_object('result', 'slow_down'); end if;

  if p_token is not null and length(p_token) between 32 and 128 then
    select r.id, r.status, r.checked_in_at, r.user_id into reg_id, reg_status, reg_at, reg_user
      from event_registrations r
      where r.check_in_token = p_token and r.event_id = p_event for update;
  end if;
  if reg_id is null then
    insert into check_in_attempts (event_id, user_id, succeeded) values (p_event, uid, false);
    return jsonb_build_object('result', 'invalid');
  end if;

  select full_name into who from profiles where id = reg_user;
  if reg_status = 'cancelled' then return jsonb_build_object('result', 'cancelled', 'name', who); end if;
  if reg_status = 'waitlisted' then return jsonb_build_object('result', 'waitlisted', 'name', who); end if;
  if reg_status = 'attended' then
    return jsonb_build_object('result', 'already', 'name', who, 'at', reg_at);
  end if;

  update event_registrations
    set status = 'attended', checked_in_at = now(), checked_in_by = uid where id = reg_id;
  insert into check_in_attempts (event_id, user_id, succeeded) values (p_event, uid, true);
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (uid, 'checked_in', 'event_registrations', reg_id::text,
          jsonb_build_object('note', 'QR scan', 'after', jsonb_build_object('event_id', p_event)));
  return jsonb_build_object('result', 'ok', 'name', who, 'at', now());
end $$;

-- Manual check-in (staff and volunteers) and undo (staff only).
create or replace function set_attendance(p_registration uuid, p_attended boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); reg event_registrations%rowtype;
begin
  select * into reg from event_registrations where id = p_registration for update;
  if not found then raise exception 'Registration not found'; end if;
  if uid is null or not is_event_checker(reg.event_id) then raise exception 'FORBIDDEN'; end if;

  if p_attended then
    if reg.status = 'attended' then
      return jsonb_build_object('result', 'already', 'at', reg.checked_in_at);
    end if;
    if reg.status <> 'registered' then
      raise exception 'Only a registered attendee can be checked in';
    end if;
    update event_registrations
      set status = 'attended', checked_in_at = now(), checked_in_by = uid where id = reg.id;
  else
    if not is_staff() then raise exception 'FORBIDDEN'; end if;
    if reg.status <> 'attended' then return jsonb_build_object('result', 'ok'); end if;
    if reg.certificate_serial is not null then
      raise exception 'A certificate has already been issued for this attendee';
    end if;
    update event_registrations
      set status = 'registered', checked_in_at = null, checked_in_by = null where id = reg.id;
  end if;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (uid, case when p_attended then 'checked_in' else 'undid_check_in' end,
          'event_registrations', reg.id::text, jsonb_build_object('note', 'manual'));
  return jsonb_build_object('result', 'ok');
end $$;

-- The list the check-in page searches: names only, no emails, no tokens.
create or replace function check_in_roster(p_event uuid)
returns table (id uuid, full_name text, department text, year text,
               status registration_status, checked_in_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if auth.uid() is null or not is_event_checker(p_event) then raise exception 'FORBIDDEN'; end if;
  return query
    select r.id, p.full_name, p.department, p.year, r.status, r.checked_in_at
    from event_registrations r join profiles p on p.id = r.user_id
    where r.event_id = p_event and r.status in ('registered', 'attended')
    order by p.full_name;
end $$;

-- ── certificates ───────────────────────────────────────────────────────
-- Everyone who attended and has none yet; or one person (also re-issues).
-- The serial ends in four random characters so serials cannot be walked.
create or replace function issue_certificates(p_event uuid, p_registration uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ev events%rowtype; r record; issued integer := 0;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into ev from events where id = p_event;
  if not found then raise exception 'Event not found'; end if;
  if not ev.certificate_enabled then
    raise exception 'Certificates are not enabled for this event';
  end if;

  for r in
    select reg.id, reg.user_id, p.full_name
    from event_registrations reg join profiles p on p.id = reg.user_id
    where reg.event_id = p_event and reg.status = 'attended'
      and ((p_registration is null and reg.certificate_serial is null) or reg.id = p_registration)
    for update of reg
  loop
    update event_registrations
      set certificate_serial = coalesce(certificate_serial,
            'FX-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-'
            || lpad(nextval('certificate_serial_seq')::text, 6, '0') || '-'
            || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))),
          certificate_name = r.full_name,
          certificate_issued_at = now()
      where id = r.id;
    insert into notifications (user_id, title, body, link)
    values (r.user_id, 'Your certificate is ready',
            'Download your certificate for ' || ev.title || '.', '/profile/events');
    issued := issued + 1;
  end loop;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (uid, 'issued_certificates', 'events', p_event::text,
          jsonb_build_object('note', issued || ' certificate(s)'));
  return issued;
end $$;

-- Public verification: a name, an event and dates. Nothing else.
create or replace function verify_certificate(p_serial text)
returns table (serial text, attendee text, certificate_title text, event_title text,
               event_date date, issued_at timestamptz)
language sql security definer stable set search_path = public as $$
  select r.certificate_serial, r.certificate_name, e.certificate_title, e.title,
         e.event_date, r.certificate_issued_at
  from event_registrations r join events e on e.id = r.event_id
  where r.certificate_serial = upper(trim(p_serial)) and r.status = 'attended';
$$;

-- ── event changes: cancelled → tell registrants; more seats → promote ───
create or replace function on_event_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    insert into notifications (user_id, title, body, link)
    select user_id, 'Event cancelled', new.title || ' has been cancelled.', '/events/' || new.id
    from event_registrations where event_id = new.id and status in ('registered', 'waitlisted');
  end if;
  if new.registration_capacity is distinct from old.registration_capacity then
    perform promote_waitlist(new.id);
  end if;
  return null;
end $$;
create trigger trg_event_changed after update on events
  for each row execute function on_event_changed();

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  promote_waitlist(uuid), on_event_changed(), register_for_event(uuid), cancel_registration(uuid),
  my_waitlist_position(uuid), check_in(uuid, text), set_attendance(uuid, boolean),
  check_in_roster(uuid), issue_certificates(uuid, uuid), is_event_checker(uuid),
  event_seats(uuid), verify_certificate(text)
  from public, anon, authenticated;

grant execute on function
  register_for_event(uuid), cancel_registration(uuid), my_waitlist_position(uuid),
  check_in(uuid, text), set_attendance(uuid, boolean), check_in_roster(uuid),
  issue_certificates(uuid, uuid), is_event_checker(uuid)
  to authenticated;

grant execute on function event_seats(uuid), verify_certificate(text) to anon, authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────
-- Registrations change only through the functions above.
drop policy "authenticated users register for events" on event_registrations;
alter policy "users cancel their own registration" on event_registrations using (is_admin());

alter table event_volunteers enable row level security;
create policy "volunteers see their own assignments, staff see all"
  on event_volunteers for select using (user_id = auth.uid() or is_staff());
create policy "admins assign volunteers"
  on event_volunteers for insert with check (is_admin());
create policy "admins remove volunteers"
  on event_volunteers for delete using (is_admin());

alter table check_in_attempts enable row level security;   -- no policies: functions only

-- ── signature images: private, admin only ──────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificate-assets', 'certificate-assets', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "admins read certificate assets" on storage.objects for select
  using (bucket_id = 'certificate-assets' and is_admin());
create policy "admins add certificate assets" on storage.objects for insert
  with check (bucket_id = 'certificate-assets' and is_admin());
create policy "admins replace certificate assets" on storage.objects for update
  using (bucket_id = 'certificate-assets' and is_admin())
  with check (bucket_id = 'certificate-assets' and is_admin());
create policy "admins delete certificate assets" on storage.objects for delete
  using (bucket_id = 'certificate-assets' and is_admin());

commit;
