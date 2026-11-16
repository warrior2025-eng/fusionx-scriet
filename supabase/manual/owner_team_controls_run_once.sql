-- Owner team controls (join requests, stop joins, remove a member): run ONCE in the Supabase SQL Editor (the same as supabase/migrations/0049_owner_team_controls.sql). Safe to run again.
begin;
-- The project owner manages their team: joining needs the owner's Accept, the owner can stop or allow new
-- joins, and can remove a member.
-- (Admins could already close joins from Command Center; now the owner can too, from the project's work page.)
-- A removed member's open tasks in the project become unassigned, the activity log says so, and they are told.
-- The owner cannot remove themselves. Additive only: one new table (join requests, read-only to the requester,
-- the owner and staff; written only by the functions below) and functions; ap_join_project now sends a request.

create or replace function ap_project_joins(p_project uuid, p_closed boolean) returns text
language plpgsql security definer set search_path = public as $$
declare p projects;
begin
  select * into p from projects where id = p_project;
  if p.id is null then raise exception 'Project not found.'; end if;
  if p.owner_id is distinct from auth.uid() and not is_staff() then raise exception 'Only the project owner can do this.'; end if;
  update projects set joins_closed = coalesce(p_closed, false), updated_at = now() where id = p.id;
  perform ap_project_log(p.id, case when p_closed then 'New joins stopped' else 'New joins allowed again' end);
  return case when p_closed then 'New joins stopped. The team stays as it is.' else 'New members can join again.' end;
end;
$$;

create or replace function ap_project_remove_member(p_project uuid, p_user uuid, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare p projects; n integer;
begin
  select * into p from projects where id = p_project;
  if p.id is null then raise exception 'Project not found.'; end if;
  if p.owner_id is distinct from auth.uid() and not is_staff() then raise exception 'Only the project owner can do this.'; end if;
  if p_user = p.owner_id then raise exception 'The owner cannot be removed.'; end if;
  delete from project_members where project_id = p.id and user_id = p_user;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'They are not in this team.'; end if;
  update project_tasks set assignee_id = null where project_id = p.id and assignee_id = p_user and done_at is null;
  perform ap_project_log(p.id, ap_name(p_user) || ' was removed from the team');
  perform ap_notify(p_user, 'You were removed from ' || p.title,
    coalesce(nullif(left(trim(coalesce(p_reason, '')), 300), ''), 'The project owner changed the team.'), '/projects');
  return ap_name(p_user) || ' was removed from the team.';
end;
$$;

-- Join requests: "Ask to join" asks the owner; the owner accepts or declines.
create table if not exists project_join_requests (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (project_id, user_id)
);
alter table project_join_requests enable row level security;
drop policy if exists "join requests: requester, owner, staff" on project_join_requests;
create policy "join requests: requester, owner, staff" on project_join_requests for select to authenticated
  using (user_id = auth.uid() or is_staff() or exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));

-- "Ask to join": now a request to the owner (it was an instant join).
create or replace function ap_join_project(p_project uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p projects;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into p from projects where id = p_project and deleted_at is null;
  if p.id is null or not p.is_published or not (p.open_for_team or p.idea_id is not null) then raise exception 'This project is not open for joining.'; end if;
  if p.owner_id = auth.uid() or exists (select 1 from project_members m where m.project_id = p.id and m.user_id = auth.uid()) then return 'You are already in this team.'; end if;
  if p.joins_closed then raise exception 'This project has stopped taking new members.'; end if;
  if exists (select 1 from project_join_requests r where r.project_id = p.id and r.user_id = auth.uid() and r.status = 'pending') then
    return 'Your request is waiting for the owner.';
  end if;
  if (select count(*) from project_members where project_id = p.id) + 1 >= ap_num('project_team_size') then raise exception 'The team is full.'; end if;
  insert into project_join_requests (project_id, user_id) values (p.id, auth.uid())
  on conflict (project_id, user_id) do update set status = 'pending', created_at = now(), decided_at = null;
  perform ap_project_log(p.id, ap_name(auth.uid()) || ' asked to join');
  perform ap_notify(p.owner_id, ap_name(auth.uid()) || ' wants to join ' || p.title, 'Accept or decline on the project page.', '/projects/' || p.id || '/work');
  return 'Request sent. You join when the owner accepts.';
end;
$$;

-- The owner (or staff) accepts or declines a request.
create or replace function ap_project_join_decide(p_project uuid, p_user uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare p projects;
begin
  select * into p from projects where id = p_project;
  if p.id is null then raise exception 'Project not found.'; end if;
  if p.owner_id is distinct from auth.uid() and not is_staff() then raise exception 'Only the project owner can do this.'; end if;
  if not exists (select 1 from project_join_requests where project_id = p.id and user_id = p_user and status = 'pending') then raise exception 'No request waiting from them.'; end if;
  if p_accept then
    if (select count(*) from project_members where project_id = p.id) + 1 >= ap_num('project_team_size') then raise exception 'The team is full.'; end if;
    insert into project_members (project_id, user_id, role) values (p.id, p_user, 'contributor') on conflict do nothing;
    update project_join_requests set status = 'accepted', decided_at = now() where project_id = p.id and user_id = p_user;
    perform ap_project_log(p.id, ap_name(p_user) || ' joined the team');
    perform ap_notify(p_user, 'You are in the team: ' || p.title, 'The owner accepted your request. It is in My projects.', '/projects/' || p.id || '/work');
    return ap_name(p_user) || ' is in the team now.';
  end if;
  update project_join_requests set status = 'declined', decided_at = now() where project_id = p.id and user_id = p_user;
  perform ap_notify(p_user, 'Your request to join ' || p.title || ' was declined', 'You can find other teams on the Projects page.', '/projects');
  return 'Declined.';
end;
$$;

-- The requester takes back a waiting request.
create or replace function ap_project_join_cancel(p_project uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  update project_join_requests set status = 'cancelled', decided_at = now() where project_id = p_project and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'No request waiting.'; end if;
  return 'Request cancelled.';
end;
$$;

revoke all on function ap_project_joins(uuid, boolean), ap_project_remove_member(uuid, uuid, text), ap_join_project(uuid), ap_project_join_decide(uuid, uuid, boolean), ap_project_join_cancel(uuid) from public, anon, authenticated;
grant execute on function ap_project_joins(uuid, boolean), ap_project_remove_member(uuid, uuid, text), ap_join_project(uuid), ap_project_join_decide(uuid, uuid, boolean), ap_project_join_cancel(uuid) to authenticated;
commit;
