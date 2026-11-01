-- Core teams: "FusionX Core", the four hubs and any custom team, whose members
-- are existing website users.
--
-- An admin only picks people and gives them a title. Everything else on their
-- card comes from their own profile, so a change there shows at once. The
-- org_people sections are not touched.
--
-- The two tables can be read only by admins. The public reads through
-- get_core_teams(), which returns public-safe fields and never an email or a
-- phone number. A member's links are returned only when their "contact links"
-- setting is on, and a member reads their own rows through my_core_teams().
--
-- Safe to run again: the seed adds nothing the second time, and no existing row
-- changes (the new profile setting starts on, and shows nobody until an admin
-- adds them to a team).

begin;

-- ── the member's own setting ───────────────────────────────────────────
alter table profiles add column if not exists show_on_core boolean not null default true;

-- ── tables ─────────────────────────────────────────────────────────────
create table if not exists core_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique,
  description text check (description is null or char_length(description) <= 300),
  kind text not null default 'custom' check (kind in ('core', 'hub', 'custom')),
  -- The hub's recruitment team, when there is one. A cycle being deleted only clears this.
  recruitment_team_id uuid references recruitment_teams(id) on delete set null,
  display_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references core_groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'Member' check (char_length(title) between 1 and 80),
  is_lead boolean not null default false,
  display_order integer not null default 0,
  is_visible boolean not null default true,
  added_by uuid references auth.users(id) on delete set null,
  -- Kept on all of a person's rows: the 24 hour limit is per person, not per team.
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create unique index if not exists idx_core_groups_name on core_groups (lower(name));
create index if not exists idx_core_group_members_group on core_group_members (group_id, display_order);
create index if not exists idx_core_group_members_user on core_group_members (user_id);

drop trigger if exists trg_core_groups_updated_at on core_groups;
create trigger trg_core_groups_updated_at before update on core_groups
  for each row execute function set_updated_at();

-- The seeded teams can be hidden but not deleted (see the delete policy), so a
-- team's kind never changes. A request with no JWT passes, as in the other guards.
create or replace function guard_core_group_kind()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.kind is distinct from old.kind then
    raise exception 'A team''s type cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_core_group_kind on core_groups;
create trigger trg_guard_core_group_kind before update on core_groups
  for each row execute function guard_core_group_kind();

-- ── seed ───────────────────────────────────────────────────────────────
-- By slug, so running this again adds nothing and keeps any rename.
insert into core_groups (name, slug, kind, recruitment_team_id, display_order)
select s.name, s.slug, s.kind,
       (select t.id from recruitment_teams t join recruitment_cycles c on c.id = t.cycle_id
        where s.kind = 'hub' and lower(t.name) = lower(s.name)
        order by c.created_at desc limit 1),
       s.ord
from (values
  ('FusionX Core', 'fusionx-core', 'core', 1),
  ('Design & Branding', 'design-branding', 'hub', 2),
  ('Competitions & Opportunities', 'competitions-opportunities', 'hub', 3),
  ('Projects, Research & Startups', 'projects-research-startups', 'hub', 4),
  ('FusionX Event Crew', 'event-crew', 'hub', 5)
) as s (name, slug, kind, ord)
on conflict do nothing;

-- ── RLS ────────────────────────────────────────────────────────────────
-- is_admin() is the database side of the "team" capability, as on org_people.
alter table core_groups enable row level security;
alter table core_group_members enable row level security;

drop policy if exists "admins read core groups" on core_groups;
create policy "admins read core groups" on core_groups for select using (is_admin());
drop policy if exists "admins add custom core groups" on core_groups;
create policy "admins add custom core groups" on core_groups for insert with check (is_admin() and kind = 'custom');
drop policy if exists "admins update core groups" on core_groups;
create policy "admins update core groups" on core_groups for update using (is_admin()) with check (is_admin());
drop policy if exists "admins delete custom core groups" on core_groups;
create policy "admins delete custom core groups" on core_groups for delete using (is_admin() and kind = 'custom');

drop policy if exists "admins read core members" on core_group_members;
create policy "admins read core members" on core_group_members for select using (is_admin());
drop policy if exists "admins add core members" on core_group_members;
create policy "admins add core members" on core_group_members for insert with check (is_admin());
drop policy if exists "admins update core members" on core_group_members;
create policy "admins update core members" on core_group_members for update using (is_admin()) with check (is_admin());
drop policy if exists "admins delete core members" on core_group_members;
create policy "admins delete core members" on core_group_members for delete using (is_admin());

revoke all on core_groups, core_group_members from anon;

-- ── what the public reads ──────────────────────────────────────────────
-- Every member's own profile, right now. Anyone can write to their own profile
-- directly, so the values are made safe here: only web links, and a short bio.
create or replace function get_core_teams()
returns table (group_id uuid, group_name text, group_description text, group_kind text, member_id uuid,
               full_name text, avatar_url text, department text, year text, bio text, title text, is_lead boolean,
               linkedin_url text, github_url text, portfolio_url text)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.description, g.kind, m.id,
         left(p.full_name, 120),
         case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end,
         left(nullif(btrim(p.department), ''), 120),
         left(nullif(btrim(p.year), ''), 20),
         case when char_length(btrim(p.bio)) > 300 then rtrim(left(btrim(p.bio), 299)) || '…' else nullif(btrim(p.bio), '') end,
         m.title, m.is_lead,
         case when p.is_contact_public and p.linkedin_url ~* '^https?://\S+$' then p.linkedin_url end,
         case when p.is_contact_public and p.github_url ~* '^https?://\S+$' then p.github_url end,
         case when p.is_contact_public and p.portfolio_url ~* '^https?://\S+$' then p.portfolio_url end
  from core_groups g
  join core_group_members m on m.group_id = g.id
  join profiles p on p.id = m.user_id
  where g.is_visible and m.is_visible and p.show_on_core and p.is_active
  order by g.display_order, g.created_at, m.is_lead desc, m.display_order, m.created_at;
$$;

-- ── what a member reads ────────────────────────────────────────────────
-- on_page: an admin has not hidden the team or this person's place in it.
create or replace function my_core_teams()
returns table (group_name text, title text, is_lead boolean, on_page boolean)
language sql security definer stable set search_path = public as $$
  select g.name, m.title, m.is_lead, g.is_visible and m.is_visible
  from core_group_members m join core_groups g on g.id = m.group_id
  where m.user_id = auth.uid()
  order by g.display_order, g.created_at;
$$;

-- ── what an admin reads ────────────────────────────────────────────────
create or replace function core_profile_incomplete(p_avatar text, p_bio text)
returns boolean language sql immutable set search_path = public as $$
  -- A photo the public read would drop counts as no photo.
  select coalesce(p_avatar, '') !~* '^https?://\S+$' or coalesce(btrim(p_bio), '') = '';
$$;

create or replace function admin_core_members()
returns table (member_id uuid, group_id uuid, user_id uuid, title text, is_lead boolean, is_visible boolean,
               full_name text, email text, avatar_url text, department text, year text,
               incomplete boolean, show_on_core boolean, is_active boolean, last_reminded_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select m.id, m.group_id, m.user_id, m.title, m.is_lead, m.is_visible,
         p.full_name, u.email::text, p.avatar_url, p.department, p.year,
         core_profile_incomplete(p.avatar_url, p.bio), p.show_on_core, p.is_active,
         (select max(o.last_reminded_at) from core_group_members o where o.user_id = m.user_id)
  from core_group_members m
  join profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  order by m.group_id, m.is_lead desc, m.display_order, m.created_at;
end $$;

-- Existing website users by name or email, at most 20.
create or replace function admin_search_core_users(p_group uuid, p_q text)
returns table (id uuid, full_name text, email text, avatar_url text, department text, year text, already_added boolean)
language plpgsql security definer stable set search_path = public as $$
declare
  q text := btrim(coalesce(p_q, ''));
  pat text;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if char_length(q) < 2 then return; end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select p.id, p.full_name, u.email::text, p.avatar_url, p.department, p.year,
         exists (select 1 from core_group_members m where m.group_id = p_group and m.user_id = p.id)
  from profiles p join auth.users u on u.id = p.id
  where p.is_active and u.email_confirmed_at is not null and (p.full_name ilike pat or u.email ilike pat)
  order by left(lower(p.full_name), char_length(q)) = lower(q) desc, p.full_name
  limit 20;
end $$;

-- People selected or accepted in this hub who are not members yet. Only once
-- that cycle's results are out: adding someone tells them, and a notification
-- must not give a decision away before the publish time.
create or replace function core_recruitment_candidates(p_group uuid)
returns table (user_id uuid, full_name text, email text, department text, year text, offer_status text)
language plpgsql security definer stable set search_path = public as $$
declare
  grp core_groups%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into grp from core_groups g where g.id = p_group;
  if not found or grp.kind <> 'hub' then return; end if;
  return query
  select x.user_id, x.full_name, x.email, x.department, x.year, x.offer_status
  from (
    select distinct on (a.user_id) a.user_id, p.full_name, u.email::text as email, p.department, p.year, s.offer_status
    from recruitment_team_status s
    join recruitment_teams t on t.id = s.team_id
    join recruitment_applications a on a.id = s.application_id
    join profiles p on p.id = a.user_id
    join auth.users u on u.id = a.user_id
    -- By name too: each cycle has its own row for the hub, so a later cycle is found as well.
    where (t.id = grp.recruitment_team_id or lower(t.name) = lower(grp.name))
      and s.stage = 'selected'
      and coalesce(s.offer_status, 'pending') in ('pending', 'accepted')
      and a.status = 'submitted'
      and p.is_active
      and recruitment_results_visible(t.cycle_id)
      and not exists (select 1 from core_group_members m where m.group_id = grp.id and m.user_id = a.user_id)
    order by a.user_id, (s.offer_status = 'accepted') desc nulls last
  ) x
  order by x.full_name;
end $$;

-- ── what an admin does ─────────────────────────────────────────────────
-- One notification (which also becomes the email) and one audit entry for each
-- person actually added. Someone already in the team is skipped and not told again.
create or replace function core_add_members(p_group uuid, p_users uuid[], p_title text default 'Member')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  grp core_groups%rowtype;
  label text := coalesce(nullif(btrim(coalesce(p_title, '')), ''), 'Member');
  who record;
  place integer;
  added integer := 0;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if char_length(label) > 80 then raise exception 'Keep the title under 80 characters'; end if;
  if coalesce(array_length(p_users, 1), 0) > 50 then raise exception 'Add at most 50 people at a time'; end if;
  select * into grp from core_groups g where g.id = p_group;
  if not found then raise exception 'That team no longer exists'; end if;
  select coalesce(max(m.display_order), 0) into place from core_group_members m where m.group_id = p_group;

  for who in
    select p.id, p.full_name from profiles p
    where p.id = any(coalesce(p_users, '{}'::uuid[])) and p.is_active
    order by array_position(p_users, p.id)
  loop
    place := place + 1;
    insert into core_group_members (group_id, user_id, title, display_order, added_by)
    values (p_group, who.id, label, place, auth.uid())
    on conflict (group_id, user_id) do nothing;
    if not found then continue; end if;
    added := added + 1;
    insert into notifications (user_id, title, body, link)
    values (who.id, 'You''ve been added to ' || grp.name || ' as ' || label,
            'Complete your profile so it shows well on the Core page.', '/profile');
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (auth.uid(), 'added_core_member', 'core_groups', p_group::text,
            jsonb_build_object('note', who.full_name || ' as ' || label || ' in ' || grp.name, 'member', who.id));
  end loop;
  return jsonb_build_object('added', added, 'skipped', greatest(coalesce(array_length(p_users, 1), 0) - added, 0));
end $$;

-- Reminds one member (p_user) or every member of the team whose profile has no
-- photo or no bio. At most once in 24 hours per person, whichever team asked.
create or replace function core_remind_members(p_group uuid, p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  who record;
  sent integer := 0;
  skipped integer := 0;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  -- Two admins pressing at once wait for each other, so nobody is told twice.
  perform pg_advisory_xact_lock(hashtextextended('core-remind', 0));
  for who in
    select p.id, p.full_name
    from core_group_members m join profiles p on p.id = m.user_id
    where m.group_id = p_group and (p_user is null or m.user_id = p_user)
      and p.is_active and core_profile_incomplete(p.avatar_url, p.bio)
    order by p.full_name
  loop
    if exists (select 1 from core_group_members o where o.user_id = who.id and o.last_reminded_at > now() - interval '24 hours') then
      skipped := skipped + 1;
      continue;
    end if;
    insert into notifications (user_id, title, body, link)
    values (who.id, 'Please complete your FusionX profile',
            'Add your photo and a short bio so your card shows well on the Core page.', '/profile');
    update core_group_members o set last_reminded_at = now() where o.user_id = who.id;
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (auth.uid(), 'reminded_core_member', 'core_groups', p_group::text,
            jsonb_build_object('note', who.full_name, 'member', who.id));
    sent := sent + 1;
  end loop;
  return jsonb_build_object('sent', sent, 'skipped', skipped);
end $$;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  guard_core_group_kind(),
  get_core_teams(),
  my_core_teams(),
  core_profile_incomplete(text, text),
  admin_core_members(),
  admin_search_core_users(uuid, text),
  core_recruitment_candidates(uuid),
  core_add_members(uuid, uuid[], text),
  core_remind_members(uuid, uuid)
  from public, anon, authenticated;
grant execute on function get_core_teams() to anon, authenticated;
grant execute on function
  my_core_teams(),
  admin_core_members(),
  admin_search_core_users(uuid, text),
  core_recruitment_candidates(uuid),
  core_add_members(uuid, uuid[], text),
  core_remind_members(uuid, uuid)
  to authenticated;

commit;
