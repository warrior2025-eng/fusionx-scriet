-- Leave a project team. A member who joined a project (project_members) can leave it themselves:
-- their open tasks in it become unassigned, the activity log says so, and the owner is told.
-- The owner cannot leave their own project (they can close it or hand it over instead).
-- Additive only: one function; no table or policy changes.

create or replace function ap_leave_project(p_project uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p projects; n integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into p from projects where id = p_project;
  if p.id is null then raise exception 'Project not found.'; end if;
  if p.owner_id = auth.uid() then raise exception 'You started this project, so you cannot leave it. You can close it instead.'; end if;
  delete from project_members where project_id = p.id and user_id = auth.uid();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'You are not in this team.'; end if;
  update project_tasks set assignee_id = null where project_id = p.id and assignee_id = auth.uid() and done_at is null;
  perform ap_project_log(p.id, ap_name(auth.uid()) || ' left the team');
  perform ap_notify(p.owner_id, ap_name(auth.uid()) || ' left ' || p.title, 'Their open tasks in it are unassigned now.', '/projects/' || p.id || '/work');
  return 'You left the team.';
end;
$$;

revoke all on function ap_leave_project(uuid) from public, anon, authenticated;
grant execute on function ap_leave_project(uuid) to authenticated;
