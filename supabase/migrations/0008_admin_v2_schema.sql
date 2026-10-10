-- Admin v2, step 2 of 4: columns, tables, guards and row level security.
--
-- Nothing here loosens an existing policy. Existing policies are only ever
-- made stricter (see the last section), and every new table has RLS enabled
-- with explicit per-role policies.

begin;

-- ---------------------------------------------------------------------------
-- New columns on existing tables
-- ---------------------------------------------------------------------------

alter table organization_settings
  add column subtitle text not null default 'Student Innovation & Research Network',
  add column logo_path text,
  add column favicon_path text,
  add column og_image_path text,
  add column announcement_banner_link text,
  add column announcement_banner_starts_at timestamptz,
  add column announcement_banner_ends_at timestamptz,
  add column join_open boolean not null default true,
  add column join_closed_message text,
  add column signup_enabled boolean not null default true,
  add column maintenance_mode boolean not null default false,
  add column maintenance_message text;

alter table profiles
  add column is_active boolean not null default true,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references auth.users(id);

alter table projects add column is_featured boolean not null default false;
alter table events add column registration_open boolean not null default true;
alter table mentors add column display_order integer not null default 0;
alter table resources add column display_order integer not null default 0;

alter table contact_messages
  add column is_resolved boolean not null default false,
  add column resolved_at timestamptz,
  add column resolved_by uuid references auth.users(id);

create index idx_audit_logs_created on audit_logs (created_at desc);
create index idx_audit_logs_resource on audit_logs (resource_type, created_at desc);

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

-- The organization's people (founders, faculty guides, mentors, core team).
-- Not to be confused with teams / team_members, which are project teams.
create type org_person_category as enum
  ('founder', 'faculty_guide', 'senior_mentor', 'core_team', 'advisor');

create table org_people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  role_title text not null check (char_length(role_title) between 2 and 200),
  category org_person_category not null,
  about text check (char_length(about) <= 1200),
  photo_path text,
  email text,
  linkedin_url text,
  github_url text,
  portfolio_url text,
  display_order integer not null default 0,
  is_visible boolean not null default true,
  linked_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_org_people_order on org_people (category, display_order);

create table programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 160),
  summary text not null check (char_length(summary) <= 600),
  details text[] not null default '{}',
  icon_name text,
  display_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Editorial content, one row per key, validated by Zod in the app
-- (lib/data/site-content.ts). `scope` decides who may write a key:
-- 'content' keys are open to editors, 'settings' keys to admins only.
create table site_content (
  key text primary key,
  scope text not null check (scope in ('content', 'settings')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create trigger trg_org_people_updated_at before update on org_people
  for each row execute function set_updated_at();
create trigger trg_programs_updated_at before update on programs
  for each row execute function set_updated_at();
create trigger trg_site_content_updated_at before update on site_content
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select has_role('super_admin');
$$;

create or replace function account_active(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_active from profiles where id = uid), true);
$$;

-- Active super admins other than `excluding`.
create or replace function active_super_admin_count(excluding uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from user_roles r
  join profiles p on p.id = r.user_id
  where r.role = 'super_admin'
    and p.is_active
    and r.user_id <> excluding;
$$;

-- ---------------------------------------------------------------------------
-- Guards
--
-- Triggers enforce the rules that RLS cannot express per column or per row
-- count. A request with no JWT (the SQL editor, the service role) passes
-- through, so the dashboard can always repair a locked-out state.
-- ---------------------------------------------------------------------------

-- Nobody removes their own super_admin role, and the last one always stays.
create or replace function guard_role_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'super_admin' then
    if auth.uid() is not null and old.user_id = auth.uid() then
      raise exception 'You cannot remove your own super_admin role';
    end if;
    if active_super_admin_count(old.user_id) = 0 then
      raise exception 'The last super_admin cannot be removed';
    end if;
  end if;
  return old;
end;
$$;

create trigger trg_guard_role_removal before delete on user_roles
  for each row execute function guard_role_removal();

-- Account status and membership type are admin-only columns; an admin
-- account can only be deactivated by a super admin; nobody deactivates
-- themselves or the last super admin.
create or replace function guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_is_admin boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.is_active is distinct from old.is_active
      or new.deactivated_at is distinct from old.deactivated_at
      or new.deactivated_by is distinct from old.deactivated_by
      or new.membership_type is distinct from old.membership_type)
     and not is_admin() then
    raise exception 'Only admins can change account status or membership type';
  end if;

  if old.is_active and not new.is_active then
    if new.id = auth.uid() then
      raise exception 'You cannot deactivate your own account';
    end if;

    select exists (
      select 1 from user_roles
      where user_id = new.id and role in ('super_admin', 'admin')
    ) into target_is_admin;

    if target_is_admin and not is_super_admin() then
      raise exception 'Only a super admin can deactivate an admin account';
    end if;

    if exists (select 1 from user_roles where user_id = new.id and role = 'super_admin')
       and active_super_admin_count(new.id) = 0 then
      raise exception 'The last super_admin cannot be deactivated';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_guard_profile_columns before update on profiles
  for each row execute function guard_profile_columns();

-- Maintenance mode is a super admin switch.
create or replace function guard_org_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.maintenance_mode is distinct from old.maintenance_mode
          or new.maintenance_message is distinct from old.maintenance_message)
     and not is_super_admin() then
    raise exception 'Only a super admin can change maintenance mode';
  end if;
  return new;
end;
$$;

create trigger trg_guard_org_settings before update on organization_settings
  for each row execute function guard_org_settings();

-- Owners edit their own projects, but only staff decide what is featured.
create or replace function guard_project_featured()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_staff()
     and ((tg_op = 'INSERT' and new.is_featured)
          or (tg_op = 'UPDATE' and new.is_featured is distinct from old.is_featured)) then
    raise exception 'Only staff can feature a project';
  end if;
  return new;
end;
$$;

create trigger trg_guard_project_featured before insert or update on projects
  for each row execute function guard_project_featured();

-- Registration respects the event's open switch, status and capacity. The
-- event row is locked so two people cannot take the last seat.
create or replace function guard_event_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
begin
  select status::text as status, is_published, registration_open, registration_capacity
    into ev
    from events
    where id = new.event_id
    for update;

  if not found or not ev.is_published then
    raise exception 'Event not found';
  end if;
  if not ev.registration_open or ev.status not in ('upcoming', 'live') then
    raise exception 'Registration for this event is closed';
  end if;
  if ev.registration_capacity is not null
     and (select count(*) from event_registrations where event_id = new.event_id)
         >= ev.registration_capacity then
    raise exception 'This event is full';
  end if;
  return new;
end;
$$;

create trigger trg_guard_event_registration before insert on event_registrations
  for each row execute function guard_event_registration();

-- The Join form can be closed from the admin panel.
create or replace function guard_application_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_staff()
     and not coalesce((select join_open from organization_settings where id), true) then
    raise exception 'Applications are currently closed';
  end if;
  return new;
end;
$$;

create trigger trg_guard_application_open before insert on applications
  for each row execute function guard_application_open();

-- The sign-up switch, enforced where accounts are created. While sign-up is
-- closed this also stops accounts being created from the Supabase dashboard.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select signup_enabled from public.organization_settings where id), true) then
    raise exception 'Sign-up is currently closed';
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));

  insert into public.user_roles (user_id, role)
  values (new.id, 'member');

  return new;
end;
$$;

-- Deactivated accounts do not count as members.
create or replace function public.get_member_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email_confirmed_at is not null
    and p.is_active
    and not exists (
      select 1
      from public.user_roles r
      where r.user_id = p.id
        and r.role in ('faculty', 'mentor')
    );
$$;

-- Danger zone: sign a user out everywhere. Returns the number of sessions
-- ended. Access tokens already issued stay valid until they expire.
create or replace function public.admin_revoke_sessions(target uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n integer;
begin
  if not has_role('super_admin') then
    raise exception 'FORBIDDEN';
  end if;
  delete from auth.sessions where user_id = target;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.admin_revoke_sessions(uuid) from public;
grant execute on function public.admin_revoke_sessions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: new tables
-- ---------------------------------------------------------------------------

alter table org_people enable row level security;
alter table programs enable row level security;
alter table site_content enable row level security;

create policy "visible people are public, staff see all"
  on org_people for select
  using (is_visible or is_staff());

create policy "admins add people"
  on org_people for insert
  with check (is_admin());

create policy "admins update people"
  on org_people for update
  using (is_admin())
  with check (is_admin());

create policy "admins delete people"
  on org_people for delete
  using (is_admin());

create policy "visible programs are public, staff see all"
  on programs for select
  using (is_visible or is_staff());

create policy "staff add programs"
  on programs for insert
  with check (is_staff());

create policy "staff update programs"
  on programs for update
  using (is_staff())
  with check (is_staff());

create policy "admins delete programs"
  on programs for delete
  using (is_admin());

create policy "site content is publicly readable"
  on site_content for select
  using (true);

create policy "editors write content keys, admins write all"
  on site_content for insert
  with check (is_admin() or (is_staff() and scope = 'content'));

create policy "editors update content keys, admins update all"
  on site_content for update
  using (is_admin() or (is_staff() and scope = 'content'))
  with check (is_admin() or (is_staff() and scope = 'content'));

create policy "admins delete site content"
  on site_content for delete
  using (is_admin());

-- ---------------------------------------------------------------------------
-- RLS: additions to existing tables
-- ---------------------------------------------------------------------------

-- research had no delete policy at all, so deleting an entry silently did
-- nothing.
create policy "creators and admins delete research"
  on research for delete
  using (created_by = auth.uid() or is_admin());

create policy "admins update contact messages"
  on contact_messages for update
  using (is_admin())
  with check (is_admin());

create policy "admins delete contact messages"
  on contact_messages for delete
  using (is_admin());

-- Until now only a team's creator could add members, so the Join button on
-- /teams failed for everyone else. A signed-in member may add or remove
-- themselves, and only while the team is still forming or active.
create policy "members join open teams themselves"
  on team_members for insert
  with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (
      select 1 from teams t
      where t.id = team_id and t.status in ('forming', 'active')
    )
  );

create policy "members leave teams themselves"
  on team_members for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: existing policies made stricter
-- ---------------------------------------------------------------------------

-- Content of a deactivated account is hidden from the public.
alter policy "published projects are public, owners see their own drafts" on projects
  using ((is_published and account_active(owner_id)) or owner_id = auth.uid() or is_staff());

alter policy "published research is public, creators see their own drafts" on research
  using ((is_published and account_active(created_by)) or created_by = auth.uid() or is_staff());

alter policy "public profiles are readable by anyone" on profiles
  using ((is_profile_public and is_active) or auth.uid() = id or is_staff());

-- Editors may delete their drafts; deleting something published is admin-only.
alter policy "staff delete events" on events
  using (is_admin() or (is_staff() and not is_published));

alter policy "staff delete opportunities" on opportunities
  using (is_admin() or (is_staff() and not is_published));

alter policy "staff delete mentors" on mentors
  using (is_admin() or (is_staff() and not is_published));

alter policy "staff delete resources" on resources
  using (is_admin() or (is_staff() and not is_published));

alter policy "staff delete announcements" on announcements
  using (is_admin() or (is_staff() and status <> 'published'));

-- Applications and contact messages hold personal data: admins only.
alter policy "staff review applications" on applications
  using (is_admin())
  with check (is_admin());

alter policy "only staff read contact messages" on contact_messages
  using (is_admin());

-- The audit log can only be written by staff, under their own name.
alter policy "server inserts audit logs" on audit_logs
  with check (is_staff() and user_id = auth.uid());

commit;
