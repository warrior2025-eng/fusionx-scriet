-- Cancel a started idea (first 4 days): run ONCE in the Supabase SQL Editor (the same as supabase/migrations/0051_cancel_started_idea.sql). Safe to run again.
begin;
-- Cancel a project started from an idea, in its first 4 days. The owner of a project started with "Accept and start"
-- can cancel it within 4 days of starting (staff at any time):
-- it leaves Projects (soft delete: an admin can restore it for 7 days from Recently deleted), it no longer counts
-- toward the owner's active projects, team members are told and leave the team, waiting join requests end, and
-- the idea stays in Ideas for you so anyone can start it again.
-- Additive only: one function; no table or policy changes.

create or replace function ap_project_cancel(p_project uuid, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare p projects; m record;
begin
  select * into p from projects where id = p_project and deleted_at is null;
  if p.id is null then raise exception 'Project not found.'; end if;
  if p.owner_id is distinct from auth.uid() and not is_staff() then raise exception 'Only the project owner can cancel it.'; end if;
  if p.idea_id is null then raise exception 'Only projects started from an idea can be cancelled here.'; end if;
  if not is_staff() and p.created_at < now() - interval '4 days' then
    raise exception 'A project can be cancelled only in its first 4 days. Talk to the core team if it must stop now.';
  end if;
  for m in select user_id from project_members where project_id = p.id loop
    perform ap_notify(m.user_id, p.title || ' was cancelled',
      coalesce(nullif(left(trim(coalesce(p_reason, '')), 300), ''), 'The owner stopped this project.'), '/projects');
  end loop;
  delete from project_members where project_id = p.id;
  update project_join_requests set status = 'cancelled', decided_at = now() where project_id = p.id and status = 'pending';
  update projects set deleted_at = now(), is_published = false, tracked = false, updated_at = now() where id = p.id;
  perform ap_project_log(p.id, ap_name(auth.uid()) || ' cancelled the project');
  perform ap_log('idea_projects', ap_name(auth.uid()) || ' cancelled "' || p.title || '"', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Cancelled by the owner'), 'project', p.id);
  perform ap_ai_refresh();
  return 'Project cancelled. The idea is still in Ideas for you if you want to start it later.';
end;
$$;

revoke all on function ap_project_cancel(uuid, text) from public, anon, authenticated;
grant execute on function ap_project_cancel(uuid, text) to authenticated;
commit;
