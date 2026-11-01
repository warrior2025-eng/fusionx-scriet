-- More people for a meeting: the website sections of Core (org_people), single members of
-- any group, and anyone by email. Still one pass per person: everything here ends up in
-- meeting_invites (meeting_id + user_id unique), through meeting_audience_users.
--
-- A pending email invite grants nothing. It turns into a pass only when an account with
-- that exact email exists and the email is confirmed.

-- ── the audience ───────────────────────────────────────────────────────
alter table meeting_audience add column org_category text
  check (org_category in ('founder', 'faculty_guide', 'senior_mentor', 'core_team', 'advisor'));
alter table meeting_audience drop constraint meeting_audience_kind_check;
alter table meeting_audience drop constraint meeting_audience_check;
alter table meeting_audience add constraint meeting_audience_kind_check
  check (kind in ('core_group', 'role', 'team', 'person', 'org_category'));
alter table meeting_audience add constraint meeting_audience_check
  check ((kind = 'core_group') = (core_group_id is not null) and (kind = 'role') = (role is not null)
     and (kind = 'team') = (team_id is not null) and (kind = 'person') = (user_id is not null)
     and (kind = 'org_category') = (org_category is not null));
drop index if exists ux_meeting_audience_once;
create unique index ux_meeting_audience_once on meeting_audience (meeting_id, kind, coalesce(core_group_id::text, role, team_id::text, user_id::text, org_category));

create table meeting_email_invites (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  invited_by uuid references auth.users(id) on delete set null,
  -- 'group': someone from a website section with no account yet, kept in line with the section.
  source text not null default 'manual' check (source in ('manual', 'group')),
  created_at timestamptz not null default now(),
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  -- The email waiting to go out, if any.
  notice text check (notice in ('invite', 'rescheduled', 'cancelled')),
  notice_tries integer not null default 0,
  notice_tried_at timestamptz,
  last_sent_at timestamptz
);
create unique index ux_meeting_email_invites on meeting_email_invites (meeting_id, lower(email));
create index idx_meeting_email_invites_email on meeting_email_invites (lower(email)) where accepted_user_id is null;
create index idx_meeting_email_invites_notice on meeting_email_invites (created_at) where notice is not null;

alter table meeting_email_invites enable row level security;
create policy "admins read email invites" on meeting_email_invites for select using (is_admin());
-- No write policies: every write goes through the functions below.
revoke all on meeting_email_invites from anon;

-- ── helpers ────────────────────────────────────────────────────────────
create function meeting_org_label(p_category text)
returns text language sql immutable as $$
  select case p_category
    when 'founder' then 'Founding team'
    when 'faculty_guide' then 'Faculty guides'
    when 'senior_mentor' then 'Senior mentors'
    when 'core_team' then 'Core team (website section)'
    when 'advisor' then 'Advisors' end;
$$;

-- The account of someone in a website section: the linked one, else a confirmed email match.
create function meeting_org_person_user(p_linked uuid, p_email text)
returns uuid language sql security definer stable set search_path = public as $$
  select coalesce(p_linked, (select u.id from auth.users u
    where p_email is not null and lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null limit 1));
$$;

-- A repeating series tells people once, about its first meeting.
create function meeting_tells_by_email(p_meeting uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (select 1 from meetings m join meetings e on e.series_id = m.series_id and e.starts_at < m.starts_at where m.id = p_meeting);
$$;

-- ── who is invited ─────────────────────────────────────────────────────
-- Now also the website sections and the email invites that became accounts.
create or replace function meeting_audience_users(p_meeting uuid)
returns table (user_id uuid)
language sql security definer stable set search_path = public as $$
  select distinct t.u
  from (
    select m.user_id as u from meeting_audience a join core_group_members m on m.group_id = a.core_group_id
      where a.meeting_id = p_meeting and a.kind = 'core_group'
    union select r.user_id from user_roles r where r.role in ('admin', 'super_admin')
    union select r.user_id from meeting_audience a
      join recruitment_team_reviewers r on a.kind = 'role' and a.role = 'reviewers'
      where a.meeting_id = p_meeting
    union select r.user_id from meeting_audience a
      join recruitment_cycle_reviewers r on a.kind = 'role' and a.role = 'reviewers'
      where a.meeting_id = p_meeting
    union select tm.user_id from meeting_audience a join team_members tm on tm.team_id = a.team_id
      where a.meeting_id = p_meeting and a.kind = 'team'
    union select a.user_id from meeting_audience a where a.meeting_id = p_meeting and a.kind = 'person'
    union select meeting_org_person_user(o.linked_profile_id, o.email) from meeting_audience a
      join org_people o on o.category::text = a.org_category and o.is_visible
      where a.meeting_id = p_meeting and a.kind = 'org_category'
    union select e.accepted_user_id from meeting_email_invites e where e.meeting_id = p_meeting
    union select m.created_by from meetings m where m.id = p_meeting
    union select c.user_id from meeting_cohosts c where c.meeting_id = p_meeting and c.source = 'chosen' and c.removed_at is null
  ) t
  join profiles p on p.id = t.u
  where t.u is not null and p.is_active;
$$;

-- People of a chosen website section who have no account yet are invited by email.
-- Someone with no email known cannot be invited, and the picker says so.
create function meeting_sync_org_emails(p_meeting uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  mt meetings%rowtype;
  tell boolean := meeting_tells_by_email(p_meeting);
begin
  select * into mt from meetings where id = p_meeting;
  if not found or mt.started_at is not null then return; end if;

  delete from meeting_email_invites e
  where e.meeting_id = p_meeting and e.source = 'group' and not exists (
    select 1 from meeting_audience a join org_people o on o.category::text = a.org_category and o.is_visible
    where a.meeting_id = p_meeting and a.kind = 'org_category' and lower(btrim(o.email)) = e.email
      and (e.accepted_user_id is not null or meeting_org_person_user(o.linked_profile_id, o.email) is null));

  insert into meeting_email_invites (meeting_id, email, invited_by, source, notice, last_sent_at)
  select p_meeting, w.email, mt.created_by, 'group', case when tell then 'invite' end, case when tell then now() end
  from (
    select distinct lower(btrim(o.email)) as email
    from meeting_audience a join org_people o on o.category::text = a.org_category and o.is_visible
    where a.meeting_id = p_meeting and a.kind = 'org_category' and o.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
      and meeting_org_person_user(o.linked_profile_id, o.email) is null
    limit greatest(0, 200 - (select count(*) from meeting_email_invites x where x.meeting_id = p_meeting))
  ) w
  on conflict (meeting_id, lower(email)) do nothing;
end $$;

-- Someone added to a chosen website section or FusionX team before the start gets the pass too.
create function meeting_audience_source_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
begin
  for mid in
    select distinct m.id from meeting_audience a join meetings m on m.id = a.meeting_id
    where m.status = 'scheduled' and m.started_at is null and m.starts_at > now()
      and ((tg_table_name = 'team_members' and a.kind = 'team' and a.team_id::text = to_jsonb(new) ->> 'team_id')
        or (tg_table_name = 'org_people' and a.kind = 'org_category' and a.org_category = to_jsonb(new) ->> 'category'))
  loop
    perform meeting_sync_org_emails(mid);
    perform meeting_sync_invites(mid, true);
  end loop;
  return new;
end $$;
create trigger trg_meeting_team_member after insert on team_members
  for each row execute function meeting_audience_source_changed();
create trigger trg_meeting_org_person after insert or update of email, linked_profile_id, category, is_visible on org_people
  for each row execute function meeting_audience_source_changed();

-- ── saving a meeting ───────────────────────────────────────────────────
-- p.emails is the whole list of email invites typed by admins. An address with a confirmed
-- account becomes an ordinary person. Those who already became accounts stay until removed.
create or replace function meeting_apply_details(p_meeting uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  pos integer := 0;
  wanted text[];
  addr text;
  uid uuid;
  gone record;
begin
  delete from meeting_audience where meeting_id = p_meeting;
  for item in select * from jsonb_array_elements(coalesce(p -> 'audience', '[]'::jsonb)) loop
    insert into meeting_audience (meeting_id, kind, core_group_id, role, team_id, user_id, org_category)
    values (p_meeting, item ->> 'kind',
      case when item ->> 'kind' = 'core_group' then (item ->> 'id')::uuid end,
      case when item ->> 'kind' = 'role' then item ->> 'id' end,
      case when item ->> 'kind' = 'team' then (item ->> 'id')::uuid end,
      case when item ->> 'kind' = 'person' then (item ->> 'id')::uuid end,
      case when item ->> 'kind' = 'org_category' then item ->> 'id' end)
    on conflict do nothing;
  end loop;

  if p ? 'emails' then
    wanted := array(select distinct lower(btrim(v)) from jsonb_array_elements_text(p -> 'emails') v);
    for gone in
      delete from meeting_email_invites e
      where e.meeting_id = p_meeting and e.source = 'manual' and e.accepted_user_id is null and not (e.email = any (wanted))
      returning e.email
    loop
      perform meeting_audit('removed_meeting_email', p_meeting, gone.email);
    end loop;
    foreach addr in array wanted loop
      if addr !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'That is not a valid email address: %', addr; end if;
      select u.id into uid from auth.users u where lower(u.email) = addr and u.email_confirmed_at is not null limit 1;
      if uid is not null then
        insert into meeting_audience (meeting_id, kind, user_id) values (p_meeting, 'person', uid) on conflict do nothing;
      elsif exists (select 1 from meeting_email_invites e where e.meeting_id = p_meeting and e.email = addr) then
        update meeting_email_invites set source = 'manual' where meeting_id = p_meeting and email = addr;
      else
        insert into meeting_email_invites (meeting_id, email, invited_by, notice, last_sent_at)
        select p_meeting, addr, auth.uid(), case when t then 'invite' end, case when t then now() end from meeting_tells_by_email(p_meeting) t;
        perform meeting_audit('added_meeting_email', p_meeting, addr);
      end if;
    end loop;
    if (select count(*) from meeting_email_invites e where e.meeting_id = p_meeting) > 200 then
      raise exception 'At most 200 email invites per meeting';
    end if;
  end if;

  perform meeting_sync_org_emails(p_meeting);
  if not exists (select 1 from meeting_audience where meeting_id = p_meeting)
     and not exists (select 1 from meeting_email_invites where meeting_id = p_meeting) then
    raise exception 'Choose who the meeting is for';
  end if;

  delete from meeting_cohosts c where c.meeting_id = p_meeting and c.source = 'chosen'
    and not (c.user_id::text in (select jsonb_array_elements_text(coalesce(p -> 'cohosts', '[]'::jsonb))));
  insert into meeting_cohosts (meeting_id, user_id, source, made_by)
  select distinct p_meeting, v::uuid, 'chosen', auth.uid() from jsonb_array_elements_text(coalesce(p -> 'cohosts', '[]'::jsonb)) v
  on conflict (meeting_id, user_id) do update set source = 'chosen', removed_at = null, made_by = auth.uid(), made_at = now();

  delete from meeting_agenda_items where meeting_id = p_meeting;
  for item in select * from jsonb_array_elements(coalesce(p -> 'agenda', '[]'::jsonb)) loop
    pos := pos + 1;
    insert into meeting_agenda_items (meeting_id, position, title, minutes)
    values (p_meeting, pos, item ->> 'title', nullif(item ->> 'minutes', '')::integer);
  end loop;
  insert into meeting_notes (meeting_id) values (p_meeting) on conflict do nothing;
end $$;

-- A new time or a cancellation also reaches those still waiting to sign up, if they were told at all.
create function meeting_email_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update meeting_email_invites set notice = case when notice = 'invite' then null else 'cancelled' end, notice_tries = 0, notice_tried_at = null
    where meeting_id = new.id and accepted_user_id is null and last_sent_at is not null;
  elsif new.starts_at is distinct from old.starts_at then
    update meeting_email_invites set notice = case when notice = 'invite' then 'invite' else 'rescheduled' end, notice_tries = 0, notice_tried_at = null
    where meeting_id = new.id and accepted_user_id is null and last_sent_at is not null;
  end if;
  return new;
end $$;
create trigger trg_meeting_email_notice after update of starts_at, status on meetings
  for each row execute function meeting_email_notice();

-- ── the seat ───────────────────────────────────────────────────────────
-- As before, with the website sections. Someone ticked one by one shows their own first group.
create or replace function meeting_seat(p_meeting uuid, p_user uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  with invited as (
    select g.name, g.name || ' · ' || case when m.is_lead and m.title = 'Member' then 'Lead' else m.title end as label, m.is_lead as lead,
      g.display_order + case g.kind when 'core' then 0 when 'hub' then 1000 else 2000 end as rank
    from meeting_audience a join core_groups g on g.id = a.core_group_id
    join core_group_members m on m.group_id = g.id and m.user_id = p_user
    where a.meeting_id = p_meeting and a.kind = 'core_group'
    union all
    select meeting_org_label(o.category::text), meeting_org_label(o.category::text) || ' · ' || o.role_title, false,
      2500 + array_position(array['founder', 'faculty_guide', 'senior_mentor', 'core_team', 'advisor'], o.category::text)
    from meeting_audience a join org_people o on o.category::text = a.org_category and o.is_visible
    where a.meeting_id = p_meeting and a.kind = 'org_category' and meeting_org_person_user(o.linked_profile_id, o.email) = p_user
    union all
    select t.name, t.name || ' · ' || initcap(tm.role), false, 3000
    from meeting_audience a join teams t on t.id = a.team_id
    join team_members tm on tm.team_id = t.id and tm.user_id = p_user
    where a.meeting_id = p_meeting and a.kind = 'team'
  ), own as (
    select * from (
      select g.name, g.name || ' · ' || case when m.is_lead and m.title = 'Member' then 'Lead' else m.title end as label, m.is_lead as lead,
        g.display_order + case g.kind when 'core' then 0 when 'hub' then 1000 else 2000 end as rank
      from core_group_members m join core_groups g on g.id = m.group_id
      where m.user_id = p_user
      union all
      select meeting_org_label(o.category::text), meeting_org_label(o.category::text) || ' · ' || o.role_title, false,
        2500 + array_position(array['founder', 'faculty_guide', 'senior_mentor', 'core_team', 'advisor'], o.category::text)
      from org_people o where o.is_visible and meeting_org_person_user(o.linked_profile_id, o.email) = p_user
      union all
      select t.name, t.name || ' · ' || initcap(tm.role), false, 3000
      from team_members tm join teams t on t.id = tm.team_id where tm.user_id = p_user
    ) x where not exists (select 1 from invited)
    order by rank, name limit 1
  ), seats as (
    select * from invited union all select * from own
  )
  select case when count(*) = 0
    then jsonb_build_object('label', 'Guest', 'short', 'Guest', 'primary', 'Guest', 'group', 'Others', 'order', 100000, 'lead', false, 'teams', '[]'::jsonb)
    else jsonb_build_object(
      'label', string_agg(s.label, ' + ' order by s.rank, s.name),
      'short', case when count(*) > 1 then (array_agg(s.name order by s.rank, s.name))[1] || ' +' || (count(*) - 1) else min(s.label) end,
      'primary', (array_agg(s.label order by s.rank, s.name))[1],
      'group', (array_agg(s.name order by s.rank, s.name))[1],
      'order', min(s.rank), 'lead', bool_or(s.lead),
      'teams', jsonb_agg(jsonb_build_object('name', s.name, 'label', s.label) order by s.rank, s.name))
    end
  from seats s;
$$;

-- ── sign-up turns a pending invite into a pass ─────────────────────────
-- Only with that exact email, confirmed: at sign-up (Google and GitHub accounts arrive
-- confirmed) or when the email is confirmed. A problem here never blocks the sign-up.
create function meeting_apply_email_invites()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv record;
  told uuid[] := '{}';
begin
  if new.email is null or new.email_confirmed_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null and old.email is not distinct from new.email then return new; end if;
  begin
    for inv in
      select e.id, e.invited_by, m.id as meeting_id, m.title, m.starts_at, coalesce(m.series_id, m.id) as series
      from public.meeting_email_invites e join public.meetings m on m.id = e.meeting_id
      where lower(e.email) = lower(new.email) and e.accepted_user_id is null and public.meeting_phase(m) in ('upcoming', 'doors', 'live')
      order by m.starts_at
    loop
      update public.meeting_email_invites set accepted_user_id = new.id, accepted_at = now(), notice = null where id = inv.id;
      insert into public.meeting_invites (meeting_id, user_id) values (inv.meeting_id, new.id) on conflict do nothing;
      if found and not (inv.series = any (told)) then
        told := told || inv.series;
        insert into public.notifications (user_id, title, body, link)
        values (new.id, 'You''re invited: ' || inv.title, public.meeting_when(inv.starts_at) || '. Your FusionX Meeting Pass is ready.',
                public.meeting_pass_link(inv.meeting_id, new.id));
      end if;
      insert into public.audit_logs (user_id, action, resource_type, resource_id, metadata)
      values (inv.invited_by, 'accepted_meeting_email', 'meetings', inv.meeting_id::text, jsonb_build_object('note', lower(new.email), 'user', new.id));
    end loop;
  exception when others then
    raise warning 'meeting email invite for % not applied: %', new.id, sqlerrm;
  end;
  return new;
end $$;
-- Named so that it runs after on_auth_user_created (the profile is made first).
create trigger on_auth_user_meeting_email_invites after insert or update of email_confirmed_at, email on auth.users
  for each row execute function meeting_apply_email_invites();

-- ── the sign-up emails (no account, so not through notifications) ──────
create function claim_meeting_email_invites(p_limit integer default 50)
returns table (id uuid, email text, kind text, title text, at_time text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select e.id, e.notice
    from meeting_email_invites e join meetings m on m.id = e.meeting_id
    where e.notice is not null and e.accepted_user_id is null and e.notice_tries < 5
      and (case when e.notice = 'cancelled' then m.status = 'cancelled' else meeting_phase(m) in ('upcoming', 'doors', 'live') end)
      and (e.notice_tried_at is null or e.notice_tried_at < now() - case e.notice_tries
            when 1 then interval '15 minutes' when 2 then interval '6 hours' else interval '24 hours' end)
    order by e.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    for update of e skip locked
  ), claimed as (
    update meeting_email_invites e
    set notice = null, notice_tried_at = now(), notice_tries = e.notice_tries + 1
    from picked where e.id = picked.id
    returning e.id, e.email, e.meeting_id, picked.notice
  )
  select c.id, c.email, c.notice, m.title, meeting_when(m.starts_at)
  from claimed c join meetings m on m.id = c.meeting_id;
end $$;

-- Back in the queue after a failed send: p_items is [{ id, kind }].
create function release_meeting_email_invites(p_items jsonb)
returns void language sql security definer set search_path = public as $$
  update meeting_email_invites e set notice = i.kind
  from jsonb_to_recordset(p_items) as i(id uuid, kind text)
  where e.id = i.id and e.notice is null and e.accepted_user_id is null;
$$;

-- ── what admins do with an email invite ────────────────────────────────
create function meeting_email_resend(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e meeting_email_invites%rowtype;
  mt meetings%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into e from meeting_email_invites where id = p_id for update;
  if not found then raise exception 'That invite no longer exists'; end if;
  if e.accepted_user_id is not null then raise exception 'They already have a pass'; end if;
  select * into mt from meetings where id = e.meeting_id;
  if meeting_phase(mt) in ('ended', 'cancelled') then raise exception 'This meeting is over'; end if;
  if e.last_sent_at > now() - interval '1 hour' then raise exception 'You can resend this once an hour'; end if;
  update meeting_email_invites set notice = 'invite', notice_tries = 0, notice_tried_at = null, last_sent_at = now() where id = p_id;
  perform meeting_audit('resent_meeting_email', e.meeting_id, e.email);
end $$;

create function meeting_email_remove(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e meeting_email_invites%rowtype;
  mt meetings%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into e from meeting_email_invites where id = p_id for update;
  if not found then raise exception 'That invite no longer exists'; end if;
  if e.source = 'group' then raise exception 'They come from a website section. Untick them in the meeting''s audience'; end if;
  select * into mt from meetings where id = e.meeting_id;
  if meeting_phase(mt) in ('ended', 'cancelled') then raise exception 'This meeting is over'; end if;
  if e.accepted_user_id is not null and mt.started_at is not null then raise exception 'They have a pass and the meeting has started. Remove them from the room'; end if;
  delete from meeting_email_invites where id = p_id;
  perform meeting_audit('removed_meeting_email', e.meeting_id, e.email);
  if e.accepted_user_id is not null then perform meeting_sync_invites(e.meeting_id, false); end if;
end $$;

-- Which of these addresses already have a confirmed account.
create function meeting_resolve_emails(p_emails text[])
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('email', lower(u.email), 'id', u.id, 'name', p.full_name))
    from auth.users u join profiles p on p.id = u.id
    where u.email_confirmed_at is not null and lower(u.email) = any (select lower(btrim(v)) from unnest(p_emails) v)), '[]'::jsonb);
end $$;

-- ── what the picker and the admin panel read ───────────────────────────
-- Every group with its members, in the order the picker shows them. An address appears only for
-- someone with no account yet.
create function meeting_audience_members()
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind', g.kind, 'id', g.id, 'name', g.name, 'always', g.always, 'members', g.members) order by g.rank, g.name) from (
    select 'core_group' as kind, c.id::text as id, c.name, false as always,
      c.display_order + case c.kind when 'core' then 0 when 'hub' then 1000 else 2000 end as rank,
      coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.full_name, 'avatar_url', p.avatar_url, 'title', m.title, 'department', p.department, 'year', p.year, 'lead', m.is_lead)
          order by m.is_lead desc, p.full_name)
        from core_group_members m join profiles p on p.id = m.user_id where m.group_id = c.id and p.is_active), '[]'::jsonb) as members
    from core_groups c
    union all
    select 'org_category', x.key, meeting_org_label(x.key), false, 2500 + x.ord,
      coalesce((select jsonb_agg(jsonb_build_object(
            'org_id', o.id, 'user_id', w.uid, 'name', coalesce(p.full_name, o.full_name), 'avatar_url', coalesce(p.avatar_url, o.photo_path), 'title', o.role_title,
            'department', p.department, 'year', p.year,
            'email', case when w.uid is null and o.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then lower(btrim(o.email)) end)
          order by o.display_order, o.full_name)
        from org_people o cross join lateral (select meeting_org_person_user(o.linked_profile_id, o.email) as uid) w
        left join profiles p on p.id = w.uid
        where o.category::text = x.key and o.is_visible and coalesce(p.is_active, true)), '[]'::jsonb)
    from (values ('founder', 1), ('faculty_guide', 2), ('senior_mentor', 3), ('core_team', 4), ('advisor', 5)) as x(key, ord)
    union all
    select 'role', 'admins', 'All admins', true, 2600,
      coalesce((select jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'avatar_url', p.avatar_url, 'title', 'Admin', 'department', p.department, 'year', p.year) order by p.full_name)
        from profiles p where p.is_active and p.id in (select r.user_id from user_roles r where r.role in ('admin', 'super_admin'))), '[]'::jsonb)
    union all
    select 'role', 'reviewers', 'All reviewers', false, 2601,
      coalesce((select jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'avatar_url', p.avatar_url, 'title', 'Reviewer', 'department', p.department, 'year', p.year) order by p.full_name)
        from profiles p where p.is_active and p.id in (select r.user_id from recruitment_team_reviewers r union select r.user_id from recruitment_cycle_reviewers r)), '[]'::jsonb)
    union all
    select 'team', t.id::text, t.name, false, 3000,
      coalesce((select jsonb_agg(jsonb_build_object('user_id', tm.user_id, 'name', p.full_name, 'avatar_url', p.avatar_url, 'title', initcap(tm.role), 'department', p.department, 'year', p.year) order by p.full_name)
        from team_members tm join profiles p on p.id = tm.user_id where tm.team_id = t.id and p.is_active), '[]'::jsonb)
    from (select * from teams order by name limit 500) t
  ) g), '[]'::jsonb);
end $$;

create or replace function admin_meetings()
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'title', m.title, 'starts_at', m.starts_at, 'duration_min', m.duration_min, 'phase', meeting_phase(m), 'instant', m.instant, 'series', m.series_id is not null,
      'host', (select p.full_name from profiles p where p.id = m.created_by),
      'invitees', (select count(*) from meeting_invites i where i.meeting_id = m.id),
      'attendees', (select count(*) from meeting_attendance a where a.meeting_id = m.id and a.first_joined_at is not null),
      'inside', meeting_inside_count(m.id),
      'emails', (select count(*) from meeting_email_invites e where e.meeting_id = m.id),
      'emails_waiting', (select count(*) from meeting_email_invites e where e.meeting_id = m.id and e.accepted_user_id is null),
      'chips', coalesce((select jsonb_agg(c.label order by c.label) from (
          select g.name as label from meeting_audience a join core_groups g on g.id = a.core_group_id where a.meeting_id = m.id
          union all select case a.role when 'admins' then 'All admins' else 'All reviewers' end from meeting_audience a where a.meeting_id = m.id and a.kind = 'role'
          union all select meeting_org_label(a.org_category) from meeting_audience a where a.meeting_id = m.id and a.kind = 'org_category'
          union all select t.name from meeting_audience a join teams t on t.id = a.team_id where a.meeting_id = m.id
          union all select p.full_name from meeting_audience a join profiles p on p.id = a.user_id where a.meeting_id = m.id) c), '[]'::jsonb))
    order by m.starts_at desc) from meetings m), '[]'::jsonb);
end $$;

create or replace function admin_meeting_detail(p_meeting uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  mt meetings%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into mt from meetings where id = p_meeting;
  if not found then return null; end if;
  return to_jsonb(mt) || jsonb_build_object(
    'phase', meeting_phase(mt),
    'audience', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'id', coalesce(a.core_group_id::text, a.role, a.team_id::text, a.user_id::text, a.org_category),
        'label', case a.kind when 'person' then (select p.full_name from profiles p where p.id = a.user_id) end)) from meeting_audience a where a.meeting_id = p_meeting), '[]'::jsonb),
    'cohosts', coalesce((select jsonb_agg(jsonb_build_object('id', c.user_id, 'name', p.full_name)) from meeting_cohosts c join profiles p on p.id = c.user_id
      where c.meeting_id = p_meeting and c.source = 'chosen' and c.removed_at is null), '[]'::jsonb),
    'agenda', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'minutes', a.minutes) order by a.position) from meeting_agenda_items a where a.meeting_id = p_meeting), '[]'::jsonb),
    'invitees', (select count(*) from meeting_invites i where i.meeting_id = p_meeting),
    'emails', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'email', e.email, 'source', e.source, 'can_resend', e.last_sent_at is null or e.last_sent_at <= now() - interval '1 hour',
        'user_id', e.accepted_user_id, 'name', (select p.full_name from profiles p where p.id = e.accepted_user_id),
        'status', case when e.accepted_user_id is null then 'waiting'
                       when exists (select 1 from meeting_attendance a where a.meeting_id = p_meeting and a.user_id = e.accepted_user_id and a.first_joined_at is not null) then 'joined'
                       else 'pass' end) order by e.created_at, e.email)
      from meeting_email_invites e where e.meeting_id = p_meeting), '[]'::jsonb));
end $$;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  meeting_org_label(text), meeting_org_person_user(uuid, text), meeting_tells_by_email(uuid), meeting_sync_org_emails(uuid),
  meeting_audience_source_changed(), meeting_email_notice(), meeting_apply_email_invites(),
  claim_meeting_email_invites(integer), release_meeting_email_invites(jsonb),
  meeting_email_resend(uuid), meeting_email_remove(uuid), meeting_resolve_emails(text[]), meeting_audience_members()
  from public, anon, authenticated;
grant execute on function meeting_email_resend(uuid), meeting_email_remove(uuid), meeting_resolve_emails(text[]), meeting_audience_members() to authenticated;
grant execute on function claim_meeting_email_invites(integer), release_meeting_email_invites(jsonb) to service_role;
