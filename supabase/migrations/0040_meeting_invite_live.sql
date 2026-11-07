-- Hosts invite people while the meeting is on (or about to start), from inside the room.
-- Still one pass per person (meeting_invites is unique per meeting and user). An email
-- invite still grants nothing until an account with that exact, confirmed email exists.

-- 'live': invited from the room. Kept when the audience changes, like 'knock'.
alter table meeting_invites drop constraint meeting_invites_source_check;
alter table meeting_invites add constraint meeting_invites_source_check check (source in ('audience', 'knock', 'live'));

-- Website users by name, or by their exact email, for a host of this meeting. Only names and
-- department/year come back, never an address.
create function meeting_invite_search(p_meeting uuid, p_q text)
returns table (id uuid, full_name text, avatar_url text, detail text, status text)
language plpgsql security definer stable set search_path = public as $$
declare
  q text := btrim(coalesce(p_q, ''));
  pat text;
begin
  if auth.uid() is null or not meeting_is_host(p_meeting, auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if char_length(q) < 2 then return; end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select p.id, p.full_name, case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end,
         nullif(concat_ws(' · ', p.department, p.year), ''),
         case
           when exists (select 1 from meeting_attendance a where a.meeting_id = p_meeting and a.user_id = p.id
                        and a.left_at is null and a.last_seen_at > now() - interval '30 seconds') then 'in_room'
           when meeting_is_invited(p_meeting, p.id) or meeting_is_host(p_meeting, p.id) then 'invited'
         end
  from profiles p join auth.users u on u.id = p.id
  where p.is_active and u.email_confirmed_at is not null
    and (p.full_name ilike pat or (position('@' in q) > 0 and lower(u.email) = lower(q)))
  order by left(lower(p.full_name), char_length(q)) = lower(q) desc, p.full_name
  limit 20;
end $$;

-- Website users get their pass now, a notification (also emailed) and, when asked, a ring.
-- Addresses of confirmed accounts count as those users; any other address becomes an email
-- invite, which turns into a pass when someone signs up with exactly that address.
create function meeting_invite_live(p_meeting uuid, p_users uuid[], p_emails text[], p_ring boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  uid uuid := auth.uid();
  host_name text;
  wanted uuid[] := '{}';
  addr text;
  found_user uuid;
  addrs text[] := '{}';
  who uuid;
  users integer := 0;
  by_email integer := 0;
  already integer := 0;
  rung integer := 0;
  recent integer;
begin
  if uid is null then raise exception 'FORBIDDEN'; end if;
  select * into mt from meetings where id = p_meeting for update;
  if not found then raise exception 'That meeting no longer exists'; end if;
  if not meeting_is_host(p_meeting, uid) then raise exception 'FORBIDDEN'; end if;
  if meeting_phase(mt) not in ('doors', 'live') then raise exception 'This meeting is not open'; end if;
  if coalesce(array_length(p_users, 1), 0) + coalesce(array_length(p_emails, 1), 0) = 0 then raise exception 'Choose who to invite'; end if;
  if coalesce(array_length(p_users, 1), 0) > 50 or coalesce(array_length(p_emails, 1), 0) > 50 then raise exception 'At most 50 invites at a time'; end if;
  select coalesce(full_name, 'A host') into host_name from profiles where id = uid;

  wanted := array(select distinct v from unnest(coalesce(p_users, '{}')) v);
  foreach addr in array array(select distinct lower(btrim(v)) from unnest(coalesce(p_emails, '{}')) v where btrim(v) <> '') loop
    if addr !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'That is not a valid email address: %', addr; end if;
    select u.id into found_user from auth.users u where lower(u.email) = addr and u.email_confirmed_at is not null limit 1;
    if found_user is not null then
      if not (found_user = any (wanted)) then wanted := wanted || found_user; end if;
    else
      addrs := addrs || addr;
    end if;
  end loop;

  -- 50 new invites per meeting per hour, from the room.
  select (select count(*) from meeting_invites i where i.meeting_id = p_meeting and i.source = 'live' and i.created_at > now() - interval '1 hour')
       + (select count(*) from meeting_email_invites e where e.meeting_id = p_meeting and e.created_at > now() - interval '1 hour')
  into recent;
  if recent
     + (select count(*) from unnest(wanted) w where not meeting_is_invited(p_meeting, w) and not meeting_is_host(p_meeting, w))
     + (select count(*) from unnest(addrs) a where not exists (select 1 from meeting_email_invites e where e.meeting_id = p_meeting and e.email = a)) > 50 then
    raise exception 'At most 50 invites per meeting in an hour. Try again later';
  end if;

  foreach who in array wanted loop
    if not exists (select 1 from profiles p where p.id = who and p.is_active) then raise exception 'That person was not found'; end if;
    if meeting_is_invited(p_meeting, who) or meeting_is_host(p_meeting, who) then
      already := already + 1;
    else
      insert into meeting_invites (meeting_id, user_id, source) values (p_meeting, who, 'live') on conflict do nothing;
      users := users + 1;
      insert into notifications (user_id, title, body, link)
      values (who, host_name || ' invited you to ''' || mt.title || ''', happening now', 'Open your pass to join.', meeting_pass_link(p_meeting, who));
    end if;
    if p_ring and who <> uid
       and not exists (select 1 from meeting_attendance a where a.meeting_id = p_meeting and a.user_id = who
                       and a.left_at is null and a.last_seen_at > now() - interval '30 seconds')
       and not exists (select 1 from meeting_rings r where r.meeting_id = p_meeting and r.user_id = who and r.created_at > now() - interval '1 minute') then
      insert into meeting_rings (meeting_id, user_id, rung_by) values (p_meeting, who, uid);
      rung := rung + 1;
    end if;
  end loop;

  foreach addr in array addrs loop
    if exists (select 1 from meeting_email_invites e where e.meeting_id = p_meeting and e.email = addr) then
      already := already + 1;
    else
      insert into meeting_email_invites (meeting_id, email, invited_by, notice, last_sent_at) values (p_meeting, addr, uid, 'invite', now());
      by_email := by_email + 1;
    end if;
  end loop;
  if (select count(*) from meeting_email_invites e where e.meeting_id = p_meeting) > 200 then
    raise exception 'At most 200 email invites per meeting';
  end if;

  perform meeting_audit('invited_during_meeting', p_meeting,
    (users + by_email) || ' invited (' || by_email || ' by email), ' || already || ' already invited, ' || rung || ' rung');
  return jsonb_build_object('users', users, 'emails', by_email, 'already', already, 'rung', rung);
end $$;

-- As in 0032, with one change: someone invited from the room while the meeting is locked
-- waits in the lobby for a host, instead of being turned away.
create or replace function meeting_enter(p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  uid uuid := auth.uid();
  host boolean;
  att meeting_attendance%rowtype;
  phase text;
  invitees integer;
  waits boolean;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'sign_in'); end if;
  select * into mt from meetings where id = p_meeting for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  host := meeting_is_host(p_meeting, uid);
  if not host and not meeting_is_invited(p_meeting, uid) then return jsonb_build_object('ok', false, 'reason', 'not_invited'); end if;
  if not exists (select 1 from profiles p where p.id = uid and p.is_active) then return jsonb_build_object('ok', false, 'reason', 'not_invited'); end if;
  phase := meeting_phase(mt);
  if phase = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'cancelled'); end if;
  if phase = 'ended' then return jsonb_build_object('ok', false, 'reason', 'ended'); end if;
  if phase = 'upcoming' then return jsonb_build_object('ok', false, 'reason', 'too_early', 'starts_at', mt.starts_at); end if;

  select * into att from meeting_attendance where meeting_id = p_meeting and user_id = uid;
  if att.removed_at is not null and not host then return jsonb_build_object('ok', false, 'reason', 'removed'); end if;
  waits := mt.locked and exists (select 1 from meeting_invites i where i.meeting_id = p_meeting and i.user_id = uid and i.source = 'live');
  -- Someone in the room a moment ago (a dropped connection) gets back in; nobody new does.
  if mt.locked and not host and not waits and not coalesce(att.last_seen_at > now() - interval '60 seconds', false) then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if (mt.lobby_on or waits) and not host and coalesce(att.lobby_status, '') <> 'admitted' then
    if att.lobby_status = 'denied' and att.lobby_at > now() - interval '2 minutes' then
      return jsonb_build_object('ok', false, 'reason', 'denied');
    end if;
    insert into meeting_attendance (meeting_id, user_id, lobby_status, lobby_at) values (p_meeting, uid, 'waiting', now())
    on conflict (meeting_id, user_id) do update
      set lobby_status = 'waiting', lobby_at = case when meeting_attendance.lobby_status = 'waiting' then meeting_attendance.lobby_at else now() end;
    return jsonb_build_object('ok', false, 'reason', 'lobby');
  end if;

  insert into meeting_attendance (meeting_id, user_id, first_joined_at, last_seen_at, left_at)
  values (p_meeting, uid, now(), now(), null)
  on conflict (meeting_id, user_id) do update set first_joined_at = coalesce(meeting_attendance.first_joined_at, now()), last_seen_at = now(), left_at = null;
  if mt.started_at is null then update meetings set started_at = now() where id = p_meeting; end if;

  select count(*) into invitees from meeting_invites where meeting_id = p_meeting;
  return jsonb_build_object('ok', true, 'is_host', host, 'user_id', uid,
    'name', coalesce((select p.full_name from profiles p where p.id = uid), 'Member'),
    'close_at', meeting_close_at(mt),
    'join_muted', mt.join_muted, 'join_camera_off', coalesce(mt.join_camera_off, invitees >= 15),
    'can_share', host or mt.screen_share_all);
end $$;

revoke execute on function meeting_invite_search(uuid, text), meeting_invite_live(uuid, uuid[], text[], boolean) from public, anon;
grant execute on function meeting_invite_search(uuid, text), meeting_invite_live(uuid, uuid[], text[], boolean) to authenticated;
