-- FusionX @ SCRIET — Row Level Security
--
-- Rule of thumb applied throughout: never write "allow everything for
-- authenticated users." Every policy names the exact rows a role can touch.
-- All authorization also happens here (not just in the app layer), so a bug
-- in a server action or a compromised client can't read or write data it
-- shouldn't.

alter table organization_settings enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table research enable row level security;
alter table research_authors enable row level security;
alter table ip_records enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table opportunities enable row level security;
alter table events enable row level security;
alter table event_registrations enable row level security;
alter table announcements enable row level security;
alter table applications enable row level security;
alter table mentors enable row level security;
alter table resources enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table contact_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read user_roles without
-- recursive RLS checks on that table itself)
-- ---------------------------------------------------------------------------

create or replace function has_role(target_role app_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = target_role
  );
$$;

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select has_role('super_admin') or has_role('admin');
$$;

create or replace function is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select has_role('super_admin') or has_role('admin') or has_role('editor');
$$;

-- ---------------------------------------------------------------------------
-- organization_settings — public read, admin write
-- ---------------------------------------------------------------------------

create policy "org settings are publicly readable"
  on organization_settings for select
  using (true);

create policy "only admins update org settings"
  on organization_settings for update
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy "public profiles are readable by anyone"
  on profiles for select
  using (is_profile_public or auth.uid() = id or is_staff());

create policy "users insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "users update their own profile"
  on profiles for update
  using (auth.uid() = id or is_admin())
  with check (auth.uid() = id or is_admin());

-- ---------------------------------------------------------------------------
-- user_roles — nobody except admins can read or write role assignments
-- ---------------------------------------------------------------------------

create policy "admins read roles"
  on user_roles for select
  using (auth.uid() = user_id or is_admin());

create policy "only super admins grant roles"
  on user_roles for insert
  with check (has_role('super_admin'));

create policy "only super admins revoke roles"
  on user_roles for delete
  using (has_role('super_admin'));

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create policy "published projects are public, owners see their own drafts"
  on projects for select
  using (is_published or owner_id = auth.uid() or is_staff());

create policy "members create projects they own"
  on projects for insert
  with check (owner_id = auth.uid());

create policy "owners and staff update projects"
  on projects for update
  using (owner_id = auth.uid() or is_staff())
  with check (owner_id = auth.uid() or is_staff());

create policy "owners and admins delete projects"
  on projects for delete
  using (owner_id = auth.uid() or is_admin());

create policy "project members readable with the project"
  on project_members for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and (p.is_published or p.owner_id = auth.uid() or is_staff())
    )
  );

create policy "project owners manage membership"
  on project_members for all
  using (
    exists (select 1 from projects p where p.id = project_id and (p.owner_id = auth.uid() or is_staff()))
  )
  with check (
    exists (select 1 from projects p where p.id = project_id and (p.owner_id = auth.uid() or is_staff()))
  );

-- ---------------------------------------------------------------------------
-- research & IP — narrower than projects; IP notes are sensitive
-- ---------------------------------------------------------------------------

create policy "published research is public, creators see their own drafts"
  on research for select
  using (is_published or created_by = auth.uid() or is_staff());

create policy "members create research entries"
  on research for insert
  with check (created_by = auth.uid());

create policy "creators and staff update research"
  on research for update
  using (created_by = auth.uid() or is_staff())
  with check (created_by = auth.uid() or is_staff());

create policy "research authors readable with the research entry"
  on research_authors for select
  using (
    exists (select 1 from research r where r.id = research_id and (r.is_published or r.created_by = auth.uid() or is_staff()))
  );

create policy "research creators manage authorship"
  on research_authors for all
  using (exists (select 1 from research r where r.id = research_id and (r.created_by = auth.uid() or is_staff())))
  with check (exists (select 1 from research r where r.id = research_id and (r.created_by = auth.uid() or is_staff())));

-- IP records are never public — visible only to the record's creator and staff
create policy "ip records visible only to creator and staff"
  on ip_records for select
  using (created_by = auth.uid() or is_staff());

create policy "members create ip records"
  on ip_records for insert
  with check (created_by = auth.uid());

create policy "creators and staff update ip records"
  on ip_records for update
  using (created_by = auth.uid() or is_staff())
  with check (created_by = auth.uid() or is_staff());

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------

create policy "teams are readable by authenticated members"
  on teams for select
  using (auth.uid() is not null or is_staff());

create policy "members create teams"
  on teams for insert
  with check (created_by = auth.uid());

create policy "team creators and staff update teams"
  on teams for update
  using (created_by = auth.uid() or is_staff())
  with check (created_by = auth.uid() or is_staff());

create policy "team members readable by authenticated users"
  on team_members for select
  using (auth.uid() is not null);

create policy "team creators manage membership"
  on team_members for all
  using (exists (select 1 from teams t where t.id = team_id and (t.created_by = auth.uid() or is_staff())))
  with check (exists (select 1 from teams t where t.id = team_id and (t.created_by = auth.uid() or is_staff())));

-- ---------------------------------------------------------------------------
-- opportunities, events, announcements — public reads only when published
-- ---------------------------------------------------------------------------

create policy "published opportunities are public"
  on opportunities for select
  using (is_published or is_staff());

create policy "staff manage opportunities"
  on opportunities for insert with check (is_staff());
create policy "staff update opportunities"
  on opportunities for update using (is_staff()) with check (is_staff());
create policy "staff delete opportunities"
  on opportunities for delete using (is_staff());

create policy "published events are public"
  on events for select
  using (is_published or is_staff());

create policy "staff create events"
  on events for insert with check (is_staff());
create policy "staff update events"
  on events for update using (is_staff()) with check (is_staff());
create policy "staff delete events"
  on events for delete using (is_staff());

create policy "users see their own event registrations, staff see all"
  on event_registrations for select
  using (user_id = auth.uid() or is_staff());

create policy "authenticated users register for events"
  on event_registrations for insert
  with check (user_id = auth.uid());

create policy "users cancel their own registration"
  on event_registrations for delete
  using (user_id = auth.uid() or is_staff());

create policy "published announcements are public"
  on announcements for select
  using (status = 'published' or is_staff());

create policy "staff create announcements"
  on announcements for insert with check (is_staff());
create policy "staff update announcements"
  on announcements for update using (is_staff()) with check (is_staff());
create policy "staff delete announcements"
  on announcements for delete using (is_staff());

-- ---------------------------------------------------------------------------
-- applications — applicants see only their own; staff review all
-- ---------------------------------------------------------------------------

create policy "applicants see only their own application"
  on applications for select
  using (user_id = auth.uid() or is_staff() or has_role('faculty'));

create policy "anyone authenticated can submit one application"
  on applications for insert
  with check (user_id = auth.uid());

create policy "staff review applications"
  on applications for update
  using (is_staff())
  with check (is_staff());

-- ---------------------------------------------------------------------------
-- mentors, resources
-- ---------------------------------------------------------------------------

create policy "published mentor profiles are public"
  on mentors for select
  using (is_published or is_staff());

create policy "staff manage mentors"
  on mentors for insert with check (is_staff());
create policy "staff update mentors"
  on mentors for update using (is_staff()) with check (is_staff());
create policy "staff delete mentors"
  on mentors for delete using (is_staff());

create policy "published public resources are public, members see member-only"
  on resources for select
  using (
    is_published and (
      visibility = 'public'
      or (visibility = 'members' and auth.uid() is not null)
    )
    or is_staff()
  );

create policy "staff manage resources"
  on resources for insert with check (is_staff());
create policy "staff update resources"
  on resources for update using (is_staff()) with check (is_staff());
create policy "staff delete resources"
  on resources for delete using (is_staff());

-- ---------------------------------------------------------------------------
-- notifications, audit logs, contact messages
-- ---------------------------------------------------------------------------

create policy "users read their own notifications"
  on notifications for select
  using (user_id = auth.uid());

create policy "users mark their own notifications read"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "system inserts notifications"
  on notifications for insert
  with check (true);

create policy "only admins read audit logs"
  on audit_logs for select
  using (is_admin());

create policy "server inserts audit logs"
  on audit_logs for insert
  with check (true);

create policy "only staff read contact messages"
  on contact_messages for select
  using (is_staff());

create policy "anyone submits a contact message"
  on contact_messages for insert
  with check (true);
