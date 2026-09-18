-- FusionX @ SCRIET — Core schema
-- Run in order: 0001_core_schema.sql -> 0002_rls_policies.sql -> 0003_signup_trigger.sql
--
-- Design notes:
-- * auth.users (Supabase Auth) is the source of truth for identity. We keep a
--   thin `profiles` table (1:1 with auth.users) for everything app-specific.
-- * Roles are stored separately from profiles (`user_roles`) rather than as a
--   single column, so a user can hold more than one role (e.g. mentor + member)
--   and so role checks can be enforced entirely in SQL/RLS, not just in the app.
-- * `organization_settings` is a single-row table the admin UI edits, so
--   things like "institutional approval status" never require a code change
--   or a redeploy.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type app_role as enum (
  'super_admin', 'admin', 'editor', 'faculty', 'mentor', 'member'
);

create type membership_type as enum (
  'general', 'project', 'research', 'core_team', 'mentor', 'alumni'
);

create type project_status as enum (
  'idea', 'building', 'prototype', 'testing', 'completed', 'continued'
);

create type research_status as enum (
  'idea', 'researching', 'experimentation', 'draft', 'submitted', 'published'
);

create type ip_status as enum (
  'not_applicable', 'exploring', 'prior_art_review', 'documentation', 'filed', 'granted'
);

create type team_status as enum ('forming', 'active', 'completed', 'archived');

create type opportunity_category as enum (
  'hackathon', 'competition', 'research', 'internship', 'workshop',
  'scholarship', 'conference', 'innovation_challenge'
);

create type opportunity_status as enum ('open', 'closing_soon', 'closed');

create type event_status as enum ('upcoming', 'live', 'completed');

create type application_status as enum (
  'submitted', 'under_review', 'shortlisted', 'selected', 'rejected', 'archived'
);

create type announcement_status as enum ('draft', 'published', 'archived');

create type institutional_approval_status as enum (
  'faculty_guide_confirmed', 'director_review_pending', 'officially_approved'
);

-- ---------------------------------------------------------------------------
-- Organization settings (single row, admin-editable)
-- ---------------------------------------------------------------------------

create table organization_settings (
  id boolean primary key default true constraint single_row check (id),
  org_name text not null default 'FusionX',
  chapter_name text not null default 'FusionX @ SCRIET',
  tagline text not null default 'From Ideas to Impact.',
  secondary_tagline text not null default 'Don''t just participate. Build.',
  faculty_guide_name text not null default 'Manav Bansal',
  faculty_guide_title text not null default 'Faculty Guide, FusionX @ SCRIET · HOD, IT, SCRIET',
  institutional_approval institutional_approval_status not null default 'faculty_guide_confirmed',
  official_email text,
  instagram_url text,
  linkedin_url text,
  github_url text,
  announcement_banner text,
  announcement_banner_active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into organization_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  department text,
  year text,
  bio text,
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  portfolio_url text,
  github_url text,
  linkedin_url text,
  avatar_url text,
  membership_type membership_type not null default 'general',
  is_profile_public boolean not null default false,
  is_contact_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index idx_user_roles_user on user_roles(user_id);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null,
  domain text,
  status project_status not null default 'idea',
  technologies text[] not null default '{}',
  owner_id uuid not null references auth.users(id),
  github_url text,
  demo_url text,
  image_path text,
  research_status_note text,
  ip_status ip_status not null default 'not_applicable',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_status on projects(status);
create index idx_projects_domain on projects(domain);
create index idx_projects_published on projects(is_published);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'contributor',
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Research & IP
-- ---------------------------------------------------------------------------

create table research (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  abstract text not null,
  domain text,
  status research_status not null default 'idea',
  publication_info text,
  document_url text,
  project_id uuid references projects(id) on delete set null,
  created_by uuid not null references auth.users(id),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table research_authors (
  research_id uuid not null references research(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_order smallint not null default 1,
  primary key (research_id, user_id)
);

create table ip_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  research_id uuid references research(id) on delete set null,
  title text not null,
  category text not null,
  status ip_status not null default 'exploring',
  notes text,
  documentation_url text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  project_id uuid references projects(id) on delete set null,
  skills_needed text[] not null default '{}',
  status team_status not null default 'forming',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Opportunities, Events, Announcements
-- ---------------------------------------------------------------------------

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organizer text not null,
  category opportunity_category not null,
  description text not null,
  eligibility text,
  deadline date,
  registration_url text,
  status opportunity_status not null default 'open',
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_opportunities_published on opportunities(is_published, status);

create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  event_date date not null,
  event_time time,
  venue text,
  organizer text,
  registration_url text,
  registration_capacity integer,
  status event_status not null default 'upcoming',
  poster_path text,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_events_date on events(event_date);

create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  registered_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text,
  author_id uuid not null references auth.users(id),
  status announcement_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_announcements_status on announcements(status);

-- ---------------------------------------------------------------------------
-- Applications (Join FusionX)
-- ---------------------------------------------------------------------------

create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  college_email text not null,
  department text not null,
  year text not null,
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  portfolio_url text,
  github_url text,
  linkedin_url text,
  preferred_functional_area text not null,
  project_interests text,
  research_interests text,
  motivation text not null,
  status application_status not null default 'submitted',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);

create unique index idx_applications_unique_pending
  on applications (lower(college_email))
  where status in ('submitted', 'under_review', 'shortlisted');

create index idx_applications_status on applications(status);

-- ---------------------------------------------------------------------------
-- Mentors, Resources, Notifications, Audit logs, Contact messages
-- ---------------------------------------------------------------------------

create table mentors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text not null,
  role_title text not null,
  expertise text[] not null default '{}',
  experience text,
  linkedin_url text,
  availability text,
  bio text,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  url text,
  file_path text,
  author_id uuid references auth.users(id),
  visibility text not null default 'public' check (visibility in ('public', 'members')),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id, is_read);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  is_reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'projects', 'research', 'ip_records', 'teams',
    'opportunities', 'events', 'announcements', 'organization_settings'
  ]
  loop
    execute format(
      'create trigger trg_%I_updated_at before update on %I
       for each row execute function set_updated_at();', t, t
    );
  end loop;
end $$;
