-- 0039: tell Core members when their role changes, and keep mentors in one place.
--
-- A. A change of a Core member's title or lead writes one notification (which is also
--    emailed). Title and lead changed within a minute make one message; changing back
--    within that minute takes the message away. Notices wait a minute before the email
--    goes (notifications.email_after), so a combined message is sent only once.
-- C. Mentors live only in the mentors table. A mentor can be a website account: the
--    photo, name, department, year, bio and links then come from their own profile.
--    The website section "Senior mentors" (org_people) is copied in, backed up and
--    hidden. The /core page, /mentors and the meetings group "Senior mentors" all read
--    the mentors table.
--
-- Additive: new columns, one new table, one backup table, new and replaced functions.

-- ── A. Core role notices ────────────────────────────────────────────────────
alter table notifications add column if not exists email_after timestamptz;

-- The open notice of each member: what they were before the first change, and its
-- notification. Written only by the trigger below.
create table if not exists core_role_notices (
  member_id uuid primary key references core_group_members(id) on delete cascade,
  notification_id uuid not null references notifications(id) on delete cascade,
  old_title text not null,
  old_lead boolean not null,
  created_at timestamptz not null default now()
);
alter table core_role_notices enable row level security;
revoke all on core_role_notices from anon, authenticated;

create or replace function core_member_role_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  open_notice core_role_notices%rowtype;
  team text;
  was_title text := old.title;
  was_lead boolean := old.is_lead;
  new_title boolean;
  new_lead boolean;
  message text;
  nid uuid;
begin
  select g.name into team from core_groups g where g.id = new.group_id;
  -- A change within a minute of the last one, not emailed yet, joins its message.
  select r.* into open_notice from core_role_notices r
  where r.member_id = new.id and r.created_at > now() - interval '1 minute'
    and exists (select 1 from notifications n where n.id = r.notification_id and n.emailed_at is null);
  if found then
    was_title := open_notice.old_title;
    was_lead := open_notice.old_lead;
  else
    delete from core_role_notices where member_id = new.id;
  end if;

  new_title := new.title is distinct from was_title;
  new_lead := new.is_lead is distinct from was_lead;
  if not new_title and not new_lead then
    -- Back to how it was: nothing to tell.
    if open_notice.notification_id is not null then
      delete from notifications where id = open_notice.notification_id;
    end if;
    return null;
  end if;

  message := case
    when new_title and new_lead and new.is_lead then 'You are now a Lead of ' || team || ', as ' || new.title || '.'
    when new_title and new_lead then 'Your role in ' || team || ' is now ' || new.title || ', and you are no longer a Lead.'
    when new_title then 'Your role in ' || team || ' is now ' || new.title || '.'
    when new.is_lead then 'You are now a Lead of ' || team || '.'
    else 'You are no longer a Lead of ' || team || '.' end;

  if open_notice.notification_id is not null then
    update notifications set title = message, is_read = false where id = open_notice.notification_id;
  else
    insert into notifications (user_id, title, body, link, email_after)
    values (new.user_id, message, 'See it on the Core page.', '/core', now() + interval '1 minute')
    returning id into nid;
    insert into core_role_notices (member_id, notification_id, old_title, old_lead) values (new.id, nid, was_title, was_lead);
  end if;
  return null;
end $$;

drop trigger if exists trg_core_member_role_changed on core_group_members;
create trigger trg_core_member_role_changed after update of title, is_lead on core_group_members
  for each row when (old.title is distinct from new.title or old.is_lead is distinct from new.is_lead)
  execute function core_member_role_changed();

-- ── C. Mentors in one place ─────────────────────────────────────────────────
alter table mentors add column if not exists photo_path text;
alter table mentors add column if not exists show_on_core boolean not null default true;
-- The mentors copied from the website section may have nobody to name as creator.
alter table mentors alter column created_by drop not null;

-- The website section's senior mentors as they were, before they are hidden.
create table if not exists org_people_backup_0039 (like org_people);
alter table org_people_backup_0039 enable row level security;
drop policy if exists "admins read the people backup" on org_people_backup_0039;
create policy "admins read the people backup" on org_people_backup_0039 for select using (is_admin());
revoke all on org_people_backup_0039 from anon;

do $$
declare
  o record;
  uid uuid;
  existing uuid;
  copied integer := 0;
  maker uuid := (select r.user_id from user_roles r where r.role in ('super_admin', 'admin') order by r.role = 'super_admin' desc limit 1);
begin
  insert into org_people_backup_0039
  select * from org_people p where p.category = 'senior_mentor'
    and not exists (select 1 from org_people_backup_0039 b where b.id = p.id);

  -- The copies go first, in their order; the mentors already listed follow.
  update mentors set display_order = display_order + (select count(*) from org_people where category = 'senior_mentor' and is_visible);

  for o in select * from org_people where category = 'senior_mentor' and is_visible order by display_order, created_at loop
    uid := meeting_org_person_user(o.linked_profile_id, o.email);
    existing := null;
    select m.id into existing from mentors m
    where (uid is not null and m.user_id = uid) or lower(btrim(m.name)) = lower(btrim(o.full_name))
    order by (m.user_id = uid) desc nulls last limit 1;
    copied := copied + 1;
    if existing is not null then
      update mentors m set user_id = coalesce(m.user_id, uid), photo_path = coalesce(m.photo_path, o.photo_path),
        show_on_core = true, display_order = copied
      where m.id = existing;
    else
      insert into mentors (user_id, name, role_title, bio, linkedin_url, photo_path, is_published, show_on_core, display_order, created_by)
      values (uid, o.full_name, o.role_title, o.about, o.linkedin_url, o.photo_path, true, true, copied, coalesce(maker, uid));
    end if;
  end loop;

  update org_people set is_visible = false where category = 'senior_mentor' and is_visible;
end $$;

-- Mentors as the public sees them. With a website account, everything but the title,
-- expertise and availability comes from their profile; links only if they chose to
-- show their contact details (as on the Core teams, migration 0034).
create or replace function get_public_mentors()
returns table (id uuid, full_name text, avatar_url text, department text, year text, bio text, title text,
               expertise text[], availability text, show_on_core boolean,
               linkedin_url text, github_url text, portfolio_url text)
language sql security definer stable set search_path = public as $$
  select m.id,
         left(coalesce(p.full_name, m.name), 120),
         case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url
              when m.photo_path ~* '^https?://\S+$' then m.photo_path end,
         left(nullif(btrim(p.department), ''), 120),
         left(nullif(btrim(p.year), ''), 20),
         left(coalesce(nullif(btrim(p.bio), ''), nullif(btrim(m.bio), '')), 1000),
         m.role_title, m.expertise, m.availability, m.show_on_core,
         case when p.id is null then case when m.linkedin_url ~* '^https?://\S+$' then m.linkedin_url end
              when p.is_contact_public and p.linkedin_url ~* '^https?://\S+$' then p.linkedin_url end,
         case when p.is_contact_public and p.github_url ~* '^https?://\S+$' then p.github_url end,
         case when p.is_contact_public and p.portfolio_url ~* '^https?://\S+$' then p.portfolio_url end
  from mentors m
  left join profiles p on p.id = m.user_id
  where m.is_published and (m.user_id is null or p.is_active)
  order by m.display_order, m.created_at;
$$;

-- A website account made a mentor is told, once per account.
create or replace function mentor_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (tg_op = 'INSERT' or old.user_id is distinct from new.user_id) then
    insert into notifications (user_id, title, body, link)
    values (new.user_id, 'You''ve been added as ' || new.role_title,
            'Your mentor card on FusionX shows your own profile. Keep your photo and bio up to date.', '/profile');
  end if;
  return null;
end $$;
drop trigger if exists trg_mentor_added on mentors;
create trigger trg_mentor_added after insert or update of user_id on mentors
  for each row execute function mentor_added();

-- Role notices wait a minute before they are emailed (see core_member_role_changed).
create or replace function claim_notification_emails(p_limit integer default 50, p_force boolean default false)
returns table (id uuid, email text, full_name text, title text, body text, link text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select n.id
    from notifications n
    where n.emailed_at is null and n.email_attempts < 5 and n.created_at > now() - interval '3 days'
      and (n.email_after is null or n.email_after <= now())
      and (coalesce(p_force, false) or n.email_tried_at is null
           or n.email_tried_at < now() - case n.email_attempts
                when 1 then interval '15 minutes' when 2 then interval '6 hours' else interval '24 hours' end)
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    for update skip locked
  ), claimed as (
    update notifications n
    set emailed_at = now(), email_tried_at = now(), email_attempts = n.email_attempts + 1
    from picked
    where n.id = picked.id
    returning n.id, n.user_id, n.title, n.body, n.link
  )
  select c.id, u.email::text, p.full_name, c.title, c.body, c.link
  from claimed c
  join auth.users u on u.id = c.user_id
  left join profiles p on p.id = c.user_id
  where u.email is not null and coalesce(p.is_active, true);
end $$;

-- ── meetings: "Senior mentors" now means the mentors table ─────────────────
-- As in 0033, with the published mentors who have a website account in place of the
-- website section, which is no longer shown.
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
    union select mn.user_id from meeting_audience a join mentors mn on mn.is_published and mn.user_id is not null
      where a.meeting_id = p_meeting and a.kind = 'org_category' and a.org_category = 'senior_mentor'
    union select e.accepted_user_id from meeting_email_invites e where e.meeting_id = p_meeting
    union select m.created_by from meetings m where m.id = p_meeting
    union select c.user_id from meeting_cohosts c where c.meeting_id = p_meeting and c.source = 'chosen' and c.removed_at is null
  ) t
  join profiles p on p.id = t.u
  where t.u is not null and p.is_active;
$$;

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
    select 'Senior mentors', 'Senior mentors · ' || mn.role_title, false, 2503
    from meeting_audience a join mentors mn on mn.is_published and mn.user_id = p_user
    where a.meeting_id = p_meeting and a.kind = 'org_category' and a.org_category = 'senior_mentor'
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
      select 'Senior mentors', 'Senior mentors · ' || mn.role_title, false, 2503
      from mentors mn where mn.is_published and mn.user_id = p_user
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

create or replace function meeting_audience_members()
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
    from (values ('founder', 1), ('faculty_guide', 2), ('core_team', 4), ('advisor', 5)) as x(key, ord)
    union all
    select 'org_category', 'senior_mentor', meeting_org_label('senior_mentor'), false, 2503,
      coalesce((select jsonb_agg(jsonb_build_object('org_id', mn.id, 'user_id', p.id, 'name', p.full_name, 'avatar_url', coalesce(p.avatar_url, mn.photo_path), 'title', mn.role_title,
            'department', p.department, 'year', p.year) order by mn.display_order, p.full_name)
        from mentors mn join profiles p on p.id = mn.user_id where mn.is_published and p.is_active), '[]'::jsonb)
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

-- Someone made a mentor before a meeting for "Senior mentors" gets the pass too.
create or replace function meeting_audience_source_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
begin
  for mid in
    select distinct m.id from meeting_audience a join meetings m on m.id = a.meeting_id
    where m.status = 'scheduled' and m.started_at is null and m.starts_at > now()
      and ((tg_table_name = 'team_members' and a.kind = 'team' and a.team_id::text = to_jsonb(new) ->> 'team_id')
        or (tg_table_name = 'org_people' and a.kind = 'org_category' and a.org_category = to_jsonb(new) ->> 'category')
        or (tg_table_name = 'mentors' and a.kind = 'org_category' and a.org_category = 'senior_mentor'))
  loop
    perform meeting_sync_org_emails(mid);
    perform meeting_sync_invites(mid, true);
  end loop;
  return new;
end $$;

drop trigger if exists trg_meeting_mentor on mentors;
create trigger trg_meeting_mentor after insert or update of user_id, is_published on mentors
  for each row execute function meeting_audience_source_changed();

-- ── who may call what ──────────────────────────────────────────────────────
revoke all on function core_member_role_changed(), mentor_added(), get_public_mentors() from public;
grant execute on function get_public_mentors() to anon, authenticated;
